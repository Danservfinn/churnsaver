/**
 * Analytics Snapshot Job
 * Captures daily analytics snapshots for Pro/Max tier companies
 * Per churn-saver-monetization-spec-final.md
 */

import { sql } from '@/lib/db';
import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { ANALYTICS_RETENTION_DAYS } from '@/lib/tiers';

interface CompanySnapshot {
  company_id: string;
  snapshot_date: string;
  total_cases: number;
  active_cases: number;
  recovered_cases: number;
  closed_no_recovery: number;
  recovery_rate: number | null;
  avg_recovery_hours: number | null;
  recovered_revenue_cents: number;
  incentive_cost_cents: number;
  push_sent: number;
  push_delivered: number;
  dm_sent: number;
  dm_delivered: number;
}

/**
 * Get all companies with Pro or Max tier subscriptions
 */
async function getAnalyticsEligibleCompanies(): Promise<string[]> {
  const result = await sql.select<{ company_id: string }>(
    `SELECT company_id
     FROM company_subscriptions
     WHERE tier IN ('pro', 'max')
       AND status = 'active'`
  );

  return result.map((r) => r.company_id);
}

/**
 * Aggregate metrics for a single company for a given date
 */
async function aggregateCompanyMetrics(
  companyId: string,
  snapshotDate: Date
): Promise<CompanySnapshot | null> {
  try {
    // Calculate date range for the snapshot day
    const dateStr = snapshotDate.toISOString().split('T')[0];
    const startOfDay = new Date(dateStr + 'T00:00:00Z');
    const endOfDay = new Date(dateStr + 'T23:59:59Z');

    // Get case counts by status
    const caseStats = await sqlWithRLS.select<{
      status: string;
      count: string;
    }>(
      `SELECT status, COUNT(*)::TEXT as count
       FROM recovery_cases
       WHERE company_id = $1
       GROUP BY status`,
      [companyId],
      { companyId }
    );

    const statusCounts: Record<string, number> = {};
    for (const stat of caseStats) {
      statusCounts[stat.status] = parseInt(stat.count, 10);
    }

    const totalCases = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const activeCases = statusCounts['open'] || 0;
    const recoveredCases = statusCounts['recovered'] || 0;
    const closedNoRecovery = statusCounts['closed_no_recovery'] || 0;

    // Calculate recovery rate
    const closedCases = recoveredCases + closedNoRecovery;
    const recoveryRate = closedCases > 0
      ? Math.round((recoveredCases / closedCases) * 10000) / 100
      : null;

    // Get recovered revenue
    const revenueResult = await sqlWithRLS.select<{ sum: string }>(
      `SELECT COALESCE(SUM(recovered_amount_cents), 0)::TEXT as sum
       FROM recovery_cases
       WHERE company_id = $1
         AND status = 'recovered'`,
      [companyId],
      { companyId }
    );
    const recoveredRevenueCents = parseInt(revenueResult[0]?.sum || '0', 10);

    // Get incentive costs (estimated from incentive_days * estimated daily value)
    // This is a simplified estimation - in production, would track actual costs
    const incentiveResult = await sqlWithRLS.select<{ sum: string }>(
      `SELECT COALESCE(SUM(incentive_days * 100), 0)::TEXT as sum
       FROM recovery_cases
       WHERE company_id = $1
         AND incentive_days > 0`,
      [companyId],
      { companyId }
    );
    const incentiveCostCents = parseInt(incentiveResult[0]?.sum || '0', 10);

    // Get channel metrics from recovery_actions
    const channelStats = await sqlWithRLS.select<{
      channel: string;
      count: string;
    }>(
      `SELECT channel, COUNT(*)::TEXT as count
       FROM recovery_actions
       WHERE company_id = $1
         AND channel IS NOT NULL
         AND type IN ('push_sent', 'dm_sent', 'push_nudge', 'dm_nudge')
       GROUP BY channel`,
      [companyId],
      { companyId }
    );

    let pushSent = 0;
    let dmSent = 0;

    for (const stat of channelStats) {
      if (stat.channel === 'push') {
        pushSent = parseInt(stat.count, 10);
      } else if (stat.channel === 'dm') {
        dmSent = parseInt(stat.count, 10);
      }
    }

    // Get average recovery time (from first_failure_at to updated_at for recovered cases)
    const avgRecoveryResult = await sqlWithRLS.select<{ avg_hours: string }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - first_failure_at)) / 3600)::TEXT as avg_hours
       FROM recovery_cases
       WHERE company_id = $1
         AND status = 'recovered'`,
      [companyId],
      { companyId }
    );
    const avgRecoveryHours = avgRecoveryResult[0]?.avg_hours
      ? Math.round(parseFloat(avgRecoveryResult[0].avg_hours) * 100) / 100
      : null;

    return {
      company_id: companyId,
      snapshot_date: dateStr,
      total_cases: totalCases,
      active_cases: activeCases,
      recovered_cases: recoveredCases,
      closed_no_recovery: closedNoRecovery,
      recovery_rate: recoveryRate,
      avg_recovery_hours: avgRecoveryHours,
      recovered_revenue_cents: recoveredRevenueCents,
      incentive_cost_cents: incentiveCostCents,
      push_sent: pushSent,
      push_delivered: pushSent, // Simplified - assume sent = delivered
      dm_sent: dmSent,
      dm_delivered: dmSent, // Simplified - assume sent = delivered
    };
  } catch (error) {
    logger.error('Failed to aggregate metrics for company', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Upsert a snapshot to the database
 */
async function upsertSnapshot(snapshot: CompanySnapshot): Promise<boolean> {
  try {
    await sqlWithRLS.execute(
      `INSERT INTO analytics_snapshots (
         company_id, snapshot_date, snapshot_type,
         total_cases, active_cases, recovered_cases, closed_no_recovery,
         recovery_rate, avg_recovery_hours,
         recovered_revenue_cents, incentive_cost_cents,
         push_sent, push_delivered, dm_sent, dm_delivered
       ) VALUES ($1, $2, 'daily', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (company_id, snapshot_date, snapshot_type)
       DO UPDATE SET
         total_cases = EXCLUDED.total_cases,
         active_cases = EXCLUDED.active_cases,
         recovered_cases = EXCLUDED.recovered_cases,
         closed_no_recovery = EXCLUDED.closed_no_recovery,
         recovery_rate = EXCLUDED.recovery_rate,
         avg_recovery_hours = EXCLUDED.avg_recovery_hours,
         recovered_revenue_cents = EXCLUDED.recovered_revenue_cents,
         incentive_cost_cents = EXCLUDED.incentive_cost_cents,
         push_sent = EXCLUDED.push_sent,
         push_delivered = EXCLUDED.push_delivered,
         dm_sent = EXCLUDED.dm_sent,
         dm_delivered = EXCLUDED.dm_delivered`,
      [
        snapshot.company_id,
        snapshot.snapshot_date,
        snapshot.total_cases,
        snapshot.active_cases,
        snapshot.recovered_cases,
        snapshot.closed_no_recovery,
        snapshot.recovery_rate,
        snapshot.avg_recovery_hours,
        snapshot.recovered_revenue_cents,
        snapshot.incentive_cost_cents,
        snapshot.push_sent,
        snapshot.push_delivered,
        snapshot.dm_sent,
        snapshot.dm_delivered,
      ],
      { companyId: snapshot.company_id }
    );

    return true;
  } catch (error) {
    logger.error('Failed to upsert snapshot', {
      companyId: snapshot.company_id,
      snapshotDate: snapshot.snapshot_date,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Capture analytics snapshots for all eligible companies
 */
export async function captureAnalyticsSnapshots(
  snapshotDate?: Date
): Promise<{ processed: number; errors: number }> {
  const targetDate = snapshotDate || new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday by default

  logger.info('Starting analytics snapshot job', {
    snapshotDate: targetDate.toISOString().split('T')[0],
  });

  const companies = await getAnalyticsEligibleCompanies();
  logger.info('Found analytics-eligible companies', { count: companies.length });

  let processed = 0;
  let errors = 0;

  for (const companyId of companies) {
    const snapshot = await aggregateCompanyMetrics(companyId, targetDate);

    if (snapshot) {
      const success = await upsertSnapshot(snapshot);
      if (success) {
        processed++;
      } else {
        errors++;
      }
    } else {
      errors++;
    }
  }

  logger.info('Analytics snapshot job completed', {
    processed,
    errors,
    total: companies.length,
  });

  return { processed, errors };
}

/**
 * Clean up old analytics snapshots beyond retention period
 */
export async function cleanupOldSnapshots(
  retentionDays: number = ANALYTICS_RETENTION_DAYS
): Promise<number> {
  try {
    const result = await sql.execute(
      `DELETE FROM analytics_snapshots
       WHERE snapshot_date < CURRENT_DATE - INTERVAL '1 day' * $1`,
      [retentionDays]
    );

    logger.info('Analytics cleanup completed', {
      deleted: result.rowCount,
      retentionDays,
    });

    return result.rowCount;
  } catch (error) {
    logger.error('Analytics cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * Get analytics trends for a company
 */
export async function getAnalyticsTrends(
  companyId: string,
  days: number = 30
): Promise<CompanySnapshot[]> {
  try {
    const snapshots = await sqlWithRLS.select<CompanySnapshot>(
      `SELECT company_id, snapshot_date::TEXT, snapshot_type,
              total_cases, active_cases, recovered_cases, closed_no_recovery,
              recovery_rate, avg_recovery_hours,
              recovered_revenue_cents::INT, incentive_cost_cents::INT,
              push_sent, push_delivered, dm_sent, dm_delivered
       FROM analytics_snapshots
       WHERE company_id = $1
         AND snapshot_date >= CURRENT_DATE - INTERVAL '1 day' * $2
       ORDER BY snapshot_date DESC`,
      [companyId, days],
      { companyId }
    );

    return snapshots;
  } catch (error) {
    logger.error('Failed to get analytics trends', {
      companyId,
      days,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Get analytics summary for a company
 */
export async function getAnalyticsSummary(companyId: string): Promise<{
  totalRecovered: number;
  recoveryRate: number;
  totalRevenue: number;
  avgRecoveryHours: number;
}> {
  try {
    const result = await sqlWithRLS.select<{
      total_recovered: string;
      recovery_rate: string;
      total_revenue: string;
      avg_hours: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'recovered')::TEXT as total_recovered,
         CASE
           WHEN COUNT(*) FILTER (WHERE status IN ('recovered', 'closed_no_recovery')) > 0
           THEN (COUNT(*) FILTER (WHERE status = 'recovered') * 100.0 /
                 COUNT(*) FILTER (WHERE status IN ('recovered', 'closed_no_recovery')))::TEXT
           ELSE '0'
         END as recovery_rate,
         COALESCE(SUM(recovered_amount_cents), 0)::TEXT as total_revenue,
         COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - first_failure_at)) / 3600)
                  FILTER (WHERE status = 'recovered'), 0)::TEXT as avg_hours
       FROM recovery_cases
       WHERE company_id = $1`,
      [companyId],
      { companyId }
    );

    const data = result[0];
    return {
      totalRecovered: parseInt(data?.total_recovered || '0', 10),
      recoveryRate: Math.round(parseFloat(data?.recovery_rate || '0') * 100) / 100,
      totalRevenue: parseInt(data?.total_revenue || '0', 10),
      avgRecoveryHours: Math.round(parseFloat(data?.avg_hours || '0') * 100) / 100,
    };
  } catch (error) {
    logger.error('Failed to get analytics summary', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      totalRecovered: 0,
      recoveryRate: 0,
      totalRevenue: 0,
      avgRecoveryHours: 0,
    };
  }
}
