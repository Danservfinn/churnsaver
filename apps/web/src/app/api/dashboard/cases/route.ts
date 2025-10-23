// Dashboard Cases API
// GET /api/dashboard/cases?page=1&limit=50&status=open&startDate=2024-01-01&endDate=2024-12-31

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/auth/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';

export interface RecoveryCaseSummary {
  id: string;
  membership_id: string;
  user_id: string;
  company_id: string;
  status: string;
  attempts: number;
  incentive_days: number;
  recovered_amount_cents: number;
  failure_reason: string | null;
  first_failure_at: string;
  last_nudge_at: string | null;
  created_at: string;
}

export interface CasesResponse {
  cases: RecoveryCaseSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const context = await getRequestContextSDK(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to dashboard cases - missing valid auth token');
      return errors.unauthorized('Authentication required');
    }

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `case_action:dashboard_${companyId}`,
      RATE_LIMIT_CONFIGS.caseActions
    );

    if (!rateLimitResult.allowed) {
      return errors.unprocessableEntity('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    const { searchParams } = new URL(request.url);

    // Parse pagination parameters
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    // Parse filters
    const status = searchParams.get('status'); // 'open', 'recovered', 'closed_no_recovery'
    const startDate = searchParams.get('startDate'); // ISO date string
    const endDate = searchParams.get('endDate'); // ISO date string

    // Build WHERE clause conditions (always include company_id)
    const conditions: string[] = [];
    const params: (string | Date)[] = [];
    let paramIndex = 1;

    // Always filter by company
    conditions.push(`company_id = $${paramIndex}`);
    params.push(companyId);
    paramIndex++;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`first_failure_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`first_failure_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    logger.info('Fetching dashboard cases', {
      page,
      limit,
      offset,
      filters: { status, startDate, endDate }
    });

    // Query cases and total count in parallel
    const [casesResult, totalResult] = await Promise.all([
      // Get paginated cases
      sql.select<RecoveryCaseSummary>(
        `SELECT
          id, membership_id, user_id, company_id, status, attempts,
          incentive_days, recovered_amount_cents, failure_reason,
          first_failure_at, last_nudge_at, created_at
         FROM recovery_cases
         ${whereClause}
         ORDER BY first_failure_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),

      // Get total count
      sql.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM recovery_cases ${whereClause}`,
        params
      )
    ]);

    const total = totalResult[0]?.count || 0;
    const totalPages = Math.ceil(total / limit);

    const response: CasesResponse = {
      cases: casesResult,
      total,
      page,
      limit,
      totalPages,
      filters: {
        ...(status && { status }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      }
    };

    logger.info('Dashboard cases fetched', {
      total,
      returned: casesResult.length,
      page,
      totalPages,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(response);

  } catch (error) {
    logger.error('Failed to fetch dashboard cases', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errors.internalServerError('Failed to fetch cases');
  }
}
