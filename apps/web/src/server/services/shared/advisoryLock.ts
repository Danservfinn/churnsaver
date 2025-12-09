// Advisory lock helper for durable coordination across serverless instances
// Prevents concurrent processing of the same company

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createHash } from 'crypto';
import { PoolClient } from 'pg';

export function buildLockKey(seed: string): bigint {
  const hash = createHash('sha256').update(seed).digest('hex');
  return BigInt('0x' + hash.substring(0, 16)); // Use first 16 hex chars for 64-bit key
}

/**
 * Acquire advisory lock for a company
 */
export async function acquireAdvisoryLock(companyId: string): Promise<boolean> {
  // Generate consistent lock key as hash of companyId + 'reminders'
  const keyString = companyId + 'reminders';
  const lockKey = buildLockKey(keyString);

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
  const lockKey = buildLockKey(keyString);

  try {
    await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    logger.info('Advisory lock released', { companyId, lockKey: lockKey.toString() });
  } catch (error) {
    logger.error('Failed to release advisory lock', { companyId, error: error instanceof Error ? error.message : String(error) });
  }
}

export function buildEventLockKey(companyId: string, eventId: string): bigint {
  const keyString = `${companyId}:${eventId}`;
  return buildLockKey(keyString);
}

/**
 * Acquire transaction-level advisory lock for an event scoped to a company using an existing client.
 * Uses pg_try_advisory_xact_lock so lock lifetime is bound to the transaction.
 */
export async function acquireEventLockWithClient(
  client: PoolClient,
  companyId: string,
  eventId: string
): Promise<boolean> {
  const lockKey = buildEventLockKey(companyId, eventId);

  try {
    const result = await client.query<{ pg_try_advisory_xact_lock: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1)',
      [lockKey]
    );
    const acquired = result.rows[0].pg_try_advisory_xact_lock;
    logger.info('Event advisory xact lock acquisition attempt', {
      companyId,
      eventId,
      lockKey: lockKey.toString(),
      acquired
    });
    return acquired;
  } catch (error) {
    logger.error('Failed to acquire event advisory xact lock', {
      companyId,
      eventId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Release advisory lock for an event scoped to a company
 */
export async function releaseEventLock(
  companyId: string,
  eventId: string
): Promise<void> {
  const lockKey = buildEventLockKey(companyId, eventId);

  try {
    await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    logger.info('Event advisory lock released', {
      companyId,
      eventId,
      lockKey: lockKey.toString()
    });
  } catch (error) {
    logger.error('Failed to release event advisory lock', {
      companyId,
      eventId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}