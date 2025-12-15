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
import { logger } from '@/lib/logger';
import { KpiQuerySchema, validateAndTransform } from '@/lib/validation';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';
import { initDbWithRLS, setRequestContext, clearRequestContext, sqlWithRLS } from '@/lib/db-rls';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { getQaDemoDashboardKpis, isQaDemoBypassEnabled } from '@/lib/qaDemo';

export interface DashboardKPIs {
  activeCases: number;
  recoveries: number; // click-through recoveries
  organicRecoveries: number;
  recoveryRate: number; // percentage (click-through / total cases)
  recoveredRevenueCents: number; // click-through revenue
  organicRevenueCents: number;
  totalCases: number;
  windowDays: number;
  calculatedAt: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    if (isQaDemoBypassEnabled(request)) {
      logger.info('QA demo bypass: returning mock dashboard KPIs');
      return NextResponse.json(getQaDemoDashboardKpis());
    }

    // Initialize database connection
    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json({ error: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }

    const { companyId, userId, isAuthenticated } = auth.context;
    if (!companyId) {
      logger.warn('Dashboard KPIs request missing companyId in auth context');
      return NextResponse.json({ error: 'Company context is required' }, { status: 400 });
    }

    // Apply rate limiting for dashboard reads (120/min per company)
    const rateLimitResult = await checkRateLimit(
      `api_read:dashboard_kpis_${companyId}`,
      RATE_LIMIT_CONFIGS.apiRead
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter, resetAt: rateLimitResult.resetAt.toISOString() },
        { status: 422 }
      );
    }

    // Validate query parameters using zod schema
    const queryValidation = validateAndTransform(KpiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    if (!queryValidation.success) {
      logger.warn('KPI query validation failed', { error: queryValidation.error });
      return NextResponse.json(
        { error: `Invalid query parameters: ${queryValidation.error}` },
        { status: 400 }
      );
    }

    const windowDays = queryValidation.data.window;

    logger.info('Calculating dashboard KPIs', { companyId, windowDays });

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    setRequestContext({
      companyId,
      userId: userId ?? undefined,
      isAuthenticated
    });

    // Query KPIs in parallel (filtered by company)
    const [activeCasesResult, recoveriesResult, organicResult, totalCasesResult, revenueResult, organicRevenueResult] = await Promise.all([
      // Active cases (open recovery cases within window)
      sqlWithRLS.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'open'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate],
        { companyId }
      ),

      // Click-through recoveries (attributed)
      sqlWithRLS.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'recovered'
         AND recovery_type = 'CLICK_THROUGH'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate],
        { companyId }
      ),

      // Organic recoveries (not attributed)
      sqlWithRLS.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'recovered'
         AND recovery_type = 'ORGANIC'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate],
        { companyId }
      ),

      // Total cases (all cases within window)
      sqlWithRLS.select<{ count: number }>(
        `SELECT COUNT(*) as count
         FROM recovery_cases
         WHERE company_id = $1
         AND first_failure_at >= $2
         AND status != 'expired'`,
        [companyId, cutoffDate],
        { companyId }
      ),

      // Click-through recovered revenue
      sqlWithRLS.select<{ total: number }>(
        `SELECT COALESCE(SUM(recovered_amount_cents), 0) as total
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'recovered'
         AND recovery_type = 'CLICK_THROUGH'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate],
        { companyId }
      ),

      // Organic revenue (for context)
      sqlWithRLS.select<{ total: number }>(
        `SELECT COALESCE(SUM(recovered_amount_cents), 0) as total
         FROM recovery_cases
         WHERE company_id = $1
         AND status = 'recovered'
         AND recovery_type = 'ORGANIC'
         AND first_failure_at >= $2`,
        [companyId, cutoffDate],
        { companyId }
      )
    ]);

    const activeCases = activeCasesResult[0]?.count || 0;
    const recoveries = recoveriesResult[0]?.count || 0;
    const organicRecoveries = organicResult[0]?.count || 0;
    const totalCases = totalCasesResult[0]?.count || 0;
    const recoveredRevenueCents = revenueResult[0]?.total || 0;
    const organicRevenueCents = organicRevenueResult[0]?.total || 0;

    // Recovery rate = click-through recoveries / total failed renewals in window
    const recoveryRate = totalCases > 0 ? Math.round((recoveries / totalCases) * 100 * 100) / 100 : 0; // percentage with 2 decimal places

    const kpis: DashboardKPIs = {
      activeCases,
      recoveries,
      organicRecoveries,
      recoveryRate,
      recoveredRevenueCents,
      organicRevenueCents,
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

    return NextResponse.json(
      { error: 'Failed to calculate KPIs' },
      { status: 500 }
    );
  } finally {
    clearRequestContext();
  }
}
