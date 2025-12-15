// Settings API
// GET /api/settings - Get current settings for company
// PUT /api/settings - Update settings for company

import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS, sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { SettingsUpdateSchema, validateAndTransform } from '@/lib/validation';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { getQaDemoSettings, isQaDemoBypassEnabled } from '@/lib/qaDemo';

interface CreatorSettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  reminder_time: string;
  updated_at: string;
}

// Default settings
const DEFAULT_SETTINGS: Omit<CreatorSettings, 'company_id' | 'updated_at'> = {
  enable_push: true,
  enable_dm: true,
  incentive_days: 3,
  reminder_offsets_days: [0, 2, 4],
  reminder_time: '10:00'
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    if (isQaDemoBypassEnabled(request)) {
      logger.info('QA demo bypass: returning mock creator settings');
      return NextResponse.json(getQaDemoSettings());
    }

    // Initialize database connection
    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json({ error: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }
    const companyId = auth.context.companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'Company context required' }, { status: 400 });
    }

    logger.info('Fetching creator settings', { companyId });

    // Check if reminder_time column exists (migration 034 may not be applied yet)
    let hasReminderTimeColumn = false;
    try {
      const columnCheck = await sqlWithRLS.select(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns 
           WHERE table_name = 'creator_settings' AND column_name = 'reminder_time'
         ) as exists`,
        [],
        { companyId, enforceCompanyContext: false, skipRLS: true }
      );
      hasReminderTimeColumn = (columnCheck[0] as { exists: boolean })?.exists ?? false;
    } catch {
      hasReminderTimeColumn = false;
    }

    // Build SELECT columns based on available schema
    const selectColumns = hasReminderTimeColumn
      ? 'company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, reminder_time, updated_at'
      : 'company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at';

    // Try to get existing settings
    const existingSettings = await sqlWithRLS.select(
      `SELECT ${selectColumns} FROM creator_settings WHERE company_id = $1`,
      [companyId],
      { companyId, enforceCompanyContext: true }
    );

    let settings: CreatorSettings;

    if (existingSettings.length > 0) {
      // Use existing settings, adding default reminder_time if column doesn't exist
      const rawSettings = existingSettings[0] as CreatorSettings;
      settings = {
        ...rawSettings,
        reminder_time: rawSettings.reminder_time || DEFAULT_SETTINGS.reminder_time
      };
    } else {
      // Create default settings
      const defaultWithCompanyId = { ...DEFAULT_SETTINGS, company_id: companyId };
      
      // Use defensive INSERT based on column availability
      if (hasReminderTimeColumn) {
        await sqlWithRLS.execute(
          'INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, reminder_time) VALUES ($1, $2, $3, $4, $5, $6)',
          [
            companyId,
            defaultWithCompanyId.enable_push,
            defaultWithCompanyId.enable_dm,
            defaultWithCompanyId.incentive_days,
            defaultWithCompanyId.reminder_offsets_days,
            defaultWithCompanyId.reminder_time
          ],
          { companyId, enforceCompanyContext: true }
        );
      } else {
        await sqlWithRLS.execute(
          'INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days) VALUES ($1, $2, $3, $4, $5)',
          [
            companyId,
            defaultWithCompanyId.enable_push,
            defaultWithCompanyId.enable_dm,
            defaultWithCompanyId.incentive_days,
            defaultWithCompanyId.reminder_offsets_days
          ],
          { companyId, enforceCompanyContext: true }
        );
      }

      // Fetch the newly created settings
      const newSettings = await sqlWithRLS.select(
        `SELECT ${selectColumns} FROM creator_settings WHERE company_id = $1`,
        [companyId],
        { companyId, enforceCompanyContext: true }
      );

      const rawSettings = newSettings[0] as CreatorSettings;
      settings = {
        ...rawSettings,
        reminder_time: rawSettings.reminder_time || DEFAULT_SETTINGS.reminder_time
      };
    }

    logger.info('Creator settings fetched', {
      companyId,
      hasExistingSettings: existingSettings.length > 0,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(settings);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Failed to fetch creator settings', {
      error: errorMessage,
      stack: errorStack,
      processingTimeMs: Date.now() - startTime
    });

    // Provide more detailed error messages based on error type
    let userMessage = 'Failed to fetch settings';
    let statusCode = 500;

    if (errorMessage.includes('DATABASE_URL') || errorMessage.includes('not initialized')) {
      userMessage = 'Database connection error. Please check server configuration.';
      statusCode = 503; // Service Unavailable
    } else if (errorMessage.includes('companyId') || errorMessage.includes('context')) {
      userMessage = 'Authentication error. Please ensure you are properly authenticated.';
      statusCode = 401;
    } else if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
      userMessage = 'Database schema error. Please contact support.';
      statusCode = 500;
    }

    return NextResponse.json(
      { 
        error: userMessage,
        ...(process.env.NODE_ENV === 'development' && { details: errorMessage })
      },
      { status: statusCode }
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json({ error: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }
    const companyId = auth.context.companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'Company context required' }, { status: 400 });
    }

    // Apply rate limiting for creator-facing settings updates (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `case_action:settings_${companyId}`,
      RATE_LIMIT_CONFIGS.caseActions
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString(),
        },
        { status: 422 }
      );
    }

    // Parse and validate request body using zod schema
    const validation = validateAndTransform(SettingsUpdateSchema, await request.json());
    if (!validation.success) {
      logger.warn('Settings update validation failed', { error: validation.error });
      return NextResponse.json(
        { error: `Invalid input: ${validation.error}` },
        { status: 400 }
      );
    }

    const validatedInput = validation.data;

    if (isQaDemoBypassEnabled(request)) {
      const mock = {
        ...getQaDemoSettings(),
        ...validatedInput,
        updated_at: new Date().toISOString(),
      };
      logger.info('QA demo bypass: accepting mock settings update', { mock });
      return NextResponse.json(mock);
    }

    // Sort and deduplicate reminder offsets (business logic, not schema concern)
    const sortedUniqueOffsets = [...new Set(validatedInput.reminder_offsets_days)].sort((a, b) => a - b);

    logger.info('Updating creator settings', {
      companyId,
      updates: { ...validatedInput, reminder_offsets_days: sortedUniqueOffsets }
    });

    // Check if reminder_time column exists (migration 034 may not be applied yet)
    let hasReminderTimeColumn = false;
    try {
      const columnCheck = await sqlWithRLS.select(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns 
           WHERE table_name = 'creator_settings' AND column_name = 'reminder_time'
         ) as exists`,
        [],
        { companyId, enforceCompanyContext: false, skipRLS: true }
      );
      hasReminderTimeColumn = (columnCheck[0] as { exists: boolean })?.exists ?? false;
    } catch {
      hasReminderTimeColumn = false;
    }

    // Upsert settings with defensive column handling
    if (hasReminderTimeColumn) {
      await sqlWithRLS.execute(
        `INSERT INTO creator_settings (
          company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, reminder_time, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (company_id) DO UPDATE SET
          enable_push = EXCLUDED.enable_push,
          enable_dm = EXCLUDED.enable_dm,
          incentive_days = EXCLUDED.incentive_days,
          reminder_offsets_days = EXCLUDED.reminder_offsets_days,
          reminder_time = EXCLUDED.reminder_time,
          updated_at = now()`,
        [
          companyId,
          validatedInput.enable_push,
          validatedInput.enable_dm,
          validatedInput.incentive_days,
          sortedUniqueOffsets,
          validatedInput.reminder_time || DEFAULT_SETTINGS.reminder_time
        ],
        { companyId, enforceCompanyContext: true }
      );
    } else {
      await sqlWithRLS.execute(
        `INSERT INTO creator_settings (
          company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at
        ) VALUES ($1, $2, $3, $4, $5, now())
        ON CONFLICT (company_id) DO UPDATE SET
          enable_push = EXCLUDED.enable_push,
          enable_dm = EXCLUDED.enable_dm,
          incentive_days = EXCLUDED.incentive_days,
          reminder_offsets_days = EXCLUDED.reminder_offsets_days,
          updated_at = now()`,
        [
          companyId,
          validatedInput.enable_push,
          validatedInput.enable_dm,
          validatedInput.incentive_days,
          sortedUniqueOffsets
        ],
        { companyId, enforceCompanyContext: true }
      );
    }

    // Build SELECT columns based on available schema
    const selectColumns = hasReminderTimeColumn
      ? 'company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, reminder_time, updated_at'
      : 'company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at';

    // Fetch and return updated settings
    const updatedSettings = await sqlWithRLS.select(
      `SELECT ${selectColumns} FROM creator_settings WHERE company_id = $1`,
      [companyId],
      { companyId, enforceCompanyContext: true }
    );

    const rawSettings = updatedSettings[0] as CreatorSettings;
    const settings: CreatorSettings = {
      ...rawSettings,
      reminder_time: rawSettings.reminder_time || DEFAULT_SETTINGS.reminder_time
    };

    logger.info('Creator settings updated successfully', {
      companyId,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(settings);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Failed to update creator settings', {
      error: errorMessage,
      stack: errorStack,
      processingTimeMs: Date.now() - startTime
    });

    // Provide more detailed error messages based on error type
    let userMessage = 'Failed to update settings';
    let statusCode = 500;

    if (errorMessage.includes('DATABASE_URL') || errorMessage.includes('not initialized')) {
      userMessage = 'Database connection error. Please check server configuration.';
      statusCode = 503; // Service Unavailable
    } else if (errorMessage.includes('companyId') || errorMessage.includes('context')) {
      userMessage = 'Authentication error. Please ensure you are properly authenticated.';
      statusCode = 401;
    } else if (errorMessage.includes('validation') || errorMessage.includes('Invalid input')) {
      userMessage = errorMessage; // Already user-friendly
      statusCode = 400;
    } else if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
      userMessage = 'Database schema error. Please contact support.';
      statusCode = 500;
    }

    return NextResponse.json(
      { 
        error: userMessage,
        ...(process.env.NODE_ENV === 'development' && { details: errorMessage })
      },
      { status: statusCode }
    );
  }
}
