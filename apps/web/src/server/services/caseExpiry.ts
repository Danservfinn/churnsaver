import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { additionalEnv } from '@/lib/env';

/**
 * Marks open recovery cases older than the provided window as expired.
 *
 * Expiry is a data hygiene cleanup to prevent indefinitely-open cases.
 * It is NOT the primary attribution/KPI gate; attribution continues to use
 * KPI attribution window logic. Expired cases should be excluded from KPI totals.
 */
export async function expireOldCases(
  companyId: string,
  windowDays: number = additionalEnv.CASE_EXPIRY_WINDOW_DAYS
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const updated = await sqlWithRLS.execute(
    `UPDATE recovery_cases
     SET status = 'expired',
         updated_at = NOW()
     WHERE status = 'open'
       AND company_id = $1
       AND first_failure_at < $2`,
    [companyId, cutoff],
    { companyId }
  );

  logger.info('Expired old recovery cases', {
    companyId,
    windowDays,
    cutoff: cutoff.toISOString(),
    affectedRows: updated.rowCount,
  });

  return updated.rowCount;
}

