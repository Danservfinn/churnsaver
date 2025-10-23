// Dashboard KPIs API
// GET /api/dashboard/kpis?window=14 - Compute KPIs for specified window (days)
//
// KPI Semantics Decision (PR-011):
// - Active Cases: Recovery cases where first_failure_at >= cutoffDate
//   (Cases that failed within the specified time window)
// - Recoveries: Cases marked as "recovered" that also failed within the window
// - Total Cases: All cases (active + recovered) from the failure window
// - Recovery Rate: recoveries / active cases for this failure window
//
// This measures recovery effectiveness for cases that failed in a specific timeframe,
// which is the standard KPI approach for business analytics.

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContext } from '@/lib/auth/whop';
import { KpiQuerySchema, validateAndTransform } from '@/lib/validation';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';

export interface DashboardKPIs {
  activeCases: number;
  recoveries: number;
  recoveryRate: number; // percentage
  recoveredRevenueCents: number;
  totalCases: number;
  windowDays: number;
  calculatedAt: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const context = getRequestContext(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to dashboard KPIs - missing valid auth token');
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

    // Validate query parameters using zod schema
    const queryValidation = validateAndTransform(KpiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    if (!queryValidation.success) {
      logger.warn('KPI query validation failed', { error: queryValidation.error });
      return errors.badRequest(`Invalid query parameters: ${queryValidation.error}`);
    }

    const windowDays = queryValidation.data.window;

    logger.info('Calculating dashboard KPIs', { companyId, windowDays });

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    // Query KPIs in parallel (filtered by company)
    const [activeCasesResult, recoveriesResult, totalCasesResult, revenueResult] = await Promise.all([
      // Active cases (open recovery cases within window)
      sql.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'open'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate]
      ),

      // Recoveries (cases marked as recovered within window)
      sql.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'recovered'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate]
      ),

      // Total cases (all cases within window)
      sql.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND first_failure_at >= $2`,
        [companyId, cutoffDate]
      ),

      // Recovered revenue (sum of recovered amounts within window)
      sql.select<{ total: number }>(
        `SELECT COALESCE(SUM(recovered_amount_cents), 0) as total
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'recovered'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate]
      )
    ]);

    const activeCases = activeCasesResult[0]?.count || 0;
    const recoveries = recoveriesResult[0]?.count || 0;
    const totalCases = totalCasesResult[0]?.count || 0;
    const recoveredRevenueCents = revenueResult[0]?.total || 0;

    // Calculate recovery rate (Recoveries / Failures per PRD; Failures = active/open cases in window)
    // Use zero-division guard: if no active cases, recovery rate is 0 (not undefined)
    const recoveryRate = activeCases > 0 ? Math.round((recoveries / activeCases) * 100 * 100) / 100 : 0; // percentage with 2 decimal places

    const kpis: DashboardKPIs = {
      activeCases,
      recoveries,
      recoveryRate,
      recoveredRevenueCents,
      totalCases,
      windowDays,
      calculatedAt: new Date().toISOString()
    };

    logger.info('Dashboard KPIs calculated', {
      activeCases,
      recoveries,
      recoveryRate,
      recoveredRevenueCents,
      totalCases,
      windowDays,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(kpis);

  } catch (error) {
    logger.error('Failed to calculate dashboard KPIs', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errors.internalServerError('Failed to calculate KPIs');
  }
}
