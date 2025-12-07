// Settings API
// GET /api/settings - Get current settings for company
// PUT /api/settings - Update settings for company

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContext } from '@/lib/auth/whop';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { SettingsUpdateSchema, validateAndTransform } from '@/lib/validation';

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
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
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
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString(),
        },
        { status: 422 }
      );
    }

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to settings - missing valid auth token');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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
