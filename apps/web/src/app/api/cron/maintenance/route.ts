import { NextRequest, NextResponse } from 'next/server';
import { enhancedJobQueue } from '@/server/services/enhancedJobQueue';
import { initDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { buildLockKey } from '@/server/services/shared/advisoryLock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_RUN_MS = 30000; // 30 second hard cap per invocation

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
}

async function tryAcquireGlobalLock() {
  const lockKey = buildLockKey('maintenance-global');
  const result = await sql.query<{ pg_try_advisory_lock: boolean }>(
    'SELECT pg_try_advisory_lock($1)',
    [lockKey]
  );
  return { acquired: result.rows[0]?.pg_try_advisory_lock === true, lockKey };
}

async function releaseGlobalLock(lockKey: bigint) {
  await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  await initDb();

  const { acquired, lockKey } = await tryAcquireGlobalLock();

  if (!acquired) {
    logger.warn('maintenance: skipped because lock not acquired');
    return NextResponse.json(
      {
        status: 'skipped_lock',
        lockAcquired: false,
        durationMs: Date.now() - start
      },
      { status: 202 }
    );
  }

  try {
    // Time budget check before starting cleanup
    if (Date.now() - start >= MAX_RUN_MS) {
      logger.warn('maintenance: time budget exceeded before processing');
      return NextResponse.json(
        {
          status: 'truncated',
          lockAcquired: true,
          durationMs: Date.now() - start,
          timeBudgetMs: MAX_RUN_MS
        },
        { status: 200 }
      );
    }

    await enhancedJobQueue.init();
    const result = await enhancedJobQueue.cleanup();
    await enhancedJobQueue.shutdown();

    // Clean up old rate_limit buckets (2 hours by default)
    const RATE_LIMIT_RETENTION_MINUTES = 120;
    const { rowCount: rateLimitPruned } = await sql.execute(
      `DELETE FROM rate_limits WHERE window_bucket_start < (NOW() - ($1 * INTERVAL '1 minute'))`,
      [RATE_LIMIT_RETENTION_MINUTES]
    );

    const durationMs = Date.now() - start;

    logger.info('Queue maintenance completed', {
      ...result,
      rateLimitPruned,
      durationMs,
      timeBudgetMs: MAX_RUN_MS
    });

    return NextResponse.json({
      status: 'ok',
      lockAcquired: true,
      ...result,
      rateLimitPruned,
      durationMs,
      timeBudgetMs: MAX_RUN_MS
    });
  } catch (error) {
    logger.error('Queue maintenance failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'maintenance_failed' }, { status: 500 });
  } finally {
    try {
      await releaseGlobalLock(lockKey);
    } catch (releaseError) {
      logger.warn('maintenance: failed to release global lock', {
        error: releaseError instanceof Error ? releaseError.message : String(releaseError)
      });
    }
  }
}

