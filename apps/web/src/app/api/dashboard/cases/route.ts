import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errorResponses, apiSuccess } from '@/lib/apiResponse';
import { requireAuthContext } from '@/lib/auth/requireAuth';

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
  recovery_type: string | null;
  attributed_click_id: string | null;
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
    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? errorResponses.unauthorizedResponse(auth.error || 'Authentication required');
    }

    const { companyId, userId, isAuthenticated } = auth.context;
    if (!companyId) {
      logger.warn('Dashboard cases request missing companyId in auth context');
      return errorResponses.badRequestResponse('Company context is required');
    }

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `case_action:dashboard_${companyId}`,
      RATE_LIMIT_CONFIGS.caseActions
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
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
    const status = searchParams.get('status') ?? undefined; // 'open', 'recovered', 'closed_no_recovery'
    const startDate = searchParams.get('startDate') ?? undefined; // ISO date string
    const endDate = searchParams.get('endDate') ?? undefined; // ISO date string

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
      companyId,
      userId,
      isAuthenticated,
      page,
      limit,
      offset,
      filters: { status, startDate, endDate }
    });

    setRequestContext({
      companyId,
      userId: userId ?? undefined,
      isAuthenticated
    });

    // Query cases and total count in parallel with enforced RLS
    const [casesResult, totalResult] = await Promise.all([
      sqlWithRLS.select<RecoveryCaseSummary>(
        `SELECT
          id, membership_id, user_id, company_id, status, attempts,
          incentive_days, recovered_amount_cents, failure_reason, recovery_type, attributed_click_id,
          first_failure_at, last_nudge_at, created_at
         FROM recovery_cases
         ${whereClause}
         ORDER BY first_failure_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
        { companyId }
      ),

      sqlWithRLS.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM recovery_cases ${whereClause}`,
        params,
        { companyId }
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
      companyId,
      total,
      returned: casesResult.length,
      page,
      totalPages,
      processingTimeMs: Date.now() - startTime
    });

    return apiSuccess(response);

  } catch (error) {
    logger.error('Failed to fetch dashboard cases', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errorResponses.internalServerErrorResponse('Failed to fetch cases');
  } finally {
    clearRequestContext();
  }
}
