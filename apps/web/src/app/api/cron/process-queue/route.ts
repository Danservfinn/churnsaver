import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { initDbWithRLS } from '@/lib/db-rls';
import { initDb, sql } from '@/lib/db';
import { buildLockKey } from '@/server/services/shared/advisoryLock';
import { processUnprocessedEvents } from '@/server/services/eventProcessor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RUN_MS = 5000; // hard cap per invocation to control Vercel compute
const MAX_COMPANIES = 50; // safety cap on fan-out per run

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
}

async function tryAcquireGlobalLock() {
  const lockKey = buildLockKey('process-queue-global');
  const result = await sql.query<{ pg_try_advisory_lock: boolean }>(
    'SELECT pg_try_advisory_lock($1)',
    [lockKey]
  );
  return { acquired: result.rows[0]?.pg_try_advisory_lock === true, lockKey };
}

async function releaseGlobalLock(lockKey: bigint) {
  await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
}

async function fetchCompaniesWithPendingEvents(limit: number) {
  return await sql.select<{ company_id: string; oldest: string }>(
    `
      SELECT company_id, MIN(received_at) AS oldest
      FROM events
      WHERE processed = false
        AND company_id IS NOT NULL
        AND company_resolution_status = 'resolved'
      GROUP BY company_id
      ORDER BY oldest ASC
      LIMIT $1
    `,
    [limit]
  );
}

async function fetchOldestPendingTimestamp() {
  const rows = await sql.select<{ oldest: string | null }>(
    `SELECT MIN(received_at) AS oldest FROM events WHERE processed = false`
  );
  return rows[0]?.oldest ?? null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  await Promise.all([initDb(), initDbWithRLS()]);

  const { acquired, lockKey } = await tryAcquireGlobalLock();

  if (!acquired) {
    logger.warn('process-queue: skipped because lock not acquired');
    return NextResponse.json(
      {
        status: 'skipped_lock',
        lockAcquired: false,
        durationMs: Date.now() - start
      },
      { status: 202 }
    );
  }

  let processedCompanies = 0;
  let processedEvents = 0;
  let successful = 0;
  let failed = 0;
  let truncated = false;

  try {
    const companies = await fetchCompaniesWithPendingEvents(MAX_COMPANIES);
    const oldestPendingAt = await fetchOldestPendingTimestamp();

    for (const { company_id } of companies) {
      if (Date.now() - start >= MAX_RUN_MS) {
        truncated = true;
        break;
      }

      try {
        const result = await processUnprocessedEvents(company_id);
        processedCompanies += 1;
        processedEvents += result.processed;
        successful += result.successful;
        failed += result.failed;
      } catch (error) {
        failed += 1;
        logger.error('process-queue: company processing failed', {
          companyId: company_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const durationMs = Date.now() - start;

    logger.info('process-queue: completed run', {
      processedCompanies,
      processedEvents,
      successful,
      failed,
      durationMs,
      truncated,
      oldestPendingAt,
      timeBudgetMs: MAX_RUN_MS
    });

    return NextResponse.json(
      {
        status: 'ok',
        lockAcquired: true,
        processedCompanies,
        processedEvents,
        successful,
        failed,
        durationMs,
        truncated,
        oldestPendingAt,
        timeBudgetMs: MAX_RUN_MS
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('process-queue: unhandled error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: 'processing_failed' },
      { status: 500 }
    );
  } finally {
    try {
      await releaseGlobalLock(lockKey);
    } catch (releaseError) {
      logger.warn('process-queue: failed to release global lock', {
        error: releaseError instanceof Error ? releaseError.message : String(releaseError)
      });
    }
  }
}
