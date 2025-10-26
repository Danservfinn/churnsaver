// Advisory lock helper for durable coordination across serverless instances
// Prevents concurrent processing of the same company

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createHash } from 'crypto';

/**
 * Acquire advisory lock for a company
 */
export async function acquireAdvisoryLock(companyId: string): Promise<boolean> {
  // Generate consistent lock key as hash of companyId + 'reminders'
  const keyString = companyId + 'reminders';
  const hash = createHash('sha256').update(keyString).digest('hex');
  const lockKey = BigInt('0x' + hash.substring(0, 16)); // Use first 16 hex chars for 64-bit key

  try {
    const result = await sql.query<{ pg_try_advisory_lock: boolean }>(
      'SELECT pg_try_advisory_lock($1)',
      [lockKey]
    );
    const acquired = result.rows[0].pg_try_advisory_lock;
    logger.info('Advisory lock acquisition attempt', { companyId, lockKey: lockKey.toString(), acquired });
    return acquired;
  } catch (error) {
    logger.error('Failed to acquire advisory lock', { companyId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * Release advisory lock for a company
 */
export async function releaseAdvisoryLock(companyId: string): Promise<void> {
  const keyString = companyId + 'reminders';
  const hash = createHash('sha256').update(keyString).digest('hex');
  const lockKey = BigInt('0x' + hash.substring(0, 16));

  try {
    await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    logger.info('Advisory lock released', { companyId, lockKey: lockKey.toString() });
  } catch (error) {
    logger.error('Failed to release advisory lock', { companyId, error: error instanceof Error ? error.message : String(error) });
  }
}