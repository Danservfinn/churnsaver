import { additionalEnv } from '@/lib/env';
import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';

/**
 * Expire stale open recovery cases beyond CASE_EXPIRY_WINDOW_DAYS.
 * Returns number of cases marked expired for the company.
 */
export async function expireOldCases(companyId: string): Promise<number> {
  const expiryCutoff = new Date();
  expiryCutoff.setDate(expiryCutoff.getDate() - additionalEnv.CASE_EXPIRY_WINDOW_DAYS);

  const result = await sqlWithRLS.execute(
    `UPDATE recovery_cases
     SET status = 'expired',
         updated_at = NOW()
     WHERE company_id = $1
       AND status = 'open'
       AND first_failure_at < $2`,
    [companyId, expiryCutoff],
    { companyId }
  );

  logger.info('Expired stale recovery cases', {
    companyId,
    expired: result.rowCount,
    expiryCutoff: expiryCutoff.toISOString(),
  });

  return result.rowCount;
}

