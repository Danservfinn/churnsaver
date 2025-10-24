// Settings API
// GET /api/settings - Get current settings for company
// PUT /api/settings - Update settings for company

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContext } from '@/lib/auth/whop';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { SettingsUpdateSchema, validateAndTransform } from '@/lib/validation';
import { errors } from '@/lib/apiResponse';

interface CreatorSettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  updated_at: string;
}

// Default settings
const DEFAULT_SETTINGS: Omit<CreatorSettings, 'company_id' | 'updated_at'> = {
  enable_push: true,
  enable_dm: true,
  incentive_days: 3,
  reminder_offsets_days: [0, 2, 4]
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const context = await getRequestContext(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to settings - missing valid auth token');
      return errors.unauthorized('Authentication required');
    }

    logger.info('Fetching creator settings', { companyId });

    // Try to get existing settings
    const existingSettings = await sql.select(
      'SELECT company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at FROM creator_settings WHERE company_id = $1',
      [companyId]
    );

    let settings: CreatorSettings;

    if (existingSettings.length > 0) {
      // Use existing settings
      settings = existingSettings[0] as CreatorSettings;
    } else {
      // Create default settings
      const defaultWithCompanyId = { ...DEFAULT_SETTINGS, company_id: companyId };
      await sql.execute(
        'INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days) VALUES ($1, $2, $3, $4, $5)',
        [
          companyId,
          defaultWithCompanyId.enable_push,
          defaultWithCompanyId.enable_dm,
          defaultWithCompanyId.incentive_days,
          defaultWithCompanyId.reminder_offsets_days
        ]
      );

      // Fetch the newly created settings
      const newSettings = await sql.select(
        'SELECT company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at FROM creator_settings WHERE company_id = $1',
        [companyId]
      );

      settings = newSettings[0] as CreatorSettings;
    }

    logger.info('Creator settings fetched', {
      companyId,
      hasExistingSettings: existingSettings.length > 0,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(settings);

  } catch (error) {
    logger.error('Failed to fetch creator settings', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errors.internalServerError('Failed to fetch settings');
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const context = await getRequestContext(request);
    const companyId = context.companyId;

    // Apply rate limiting for creator-facing settings updates (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `case_action:settings_${companyId}`,
      RATE_LIMIT_CONFIGS.caseActions
    );

    if (!rateLimitResult.allowed) {
      return errors.unprocessableEntity('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to settings - missing valid auth token');
      return errors.unauthorized('Authentication required');
    }

    // Parse and validate request body using zod schema
    const validation = validateAndTransform(SettingsUpdateSchema, await request.json());
    if (!validation.success) {
      logger.warn('Settings update validation failed', { error: validation.error });
      return errors.badRequest(`Invalid input: ${validation.error}`);
    }

    const validatedInput = validation.data;

    // Sort and deduplicate reminder offsets (business logic, not schema concern)
    const sortedUniqueOffsets = [...new Set(validatedInput.reminder_offsets_days)].sort((a, b) => a - b);

    logger.info('Updating creator settings', {
      companyId,
      updates: { ...validatedInput, reminder_offsets_days: sortedUniqueOffsets }
    });

    // Upsert settings
    await sql.execute(
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
      ]
    );

    // Fetch and return updated settings
    const updatedSettings = await sql.select(
      'SELECT company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at FROM creator_settings WHERE company_id = $1',
      [companyId]
    );

    const settings = updatedSettings[0] as CreatorSettings;

    logger.info('Creator settings updated successfully', {
      companyId,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(settings);

  } catch (error) {
    logger.error('Failed to update creator settings', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errors.internalServerError('Failed to update settings');
  }
}
