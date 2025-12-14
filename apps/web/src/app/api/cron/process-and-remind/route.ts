import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { initDbWithRLS } from '@/lib/db-rls';
import { initDb, sql } from '@/lib/db';
import { buildLockKey } from '@/server/services/shared/advisoryLock';
import { processUnprocessedEvents } from '@/server/services/eventProcessor';
import { supabaseAdmin } from '@/lib/supabase/server';
import { sendWhopPushNotification, sendWhopDirectMessage } from '@/server/services/notifications/whop';
import { enhancedJobQueue } from '@/server/services/enhancedJobQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RUN_MS = 10000; // 10 second hard cap per invocation
const MAX_COMPANIES = 50; // safety cap on fan-out per run
const MAX_CASES = 50; // Safety cap on cases processed per run

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
}

async function tryAcquireGlobalLock(lockName: string) {
  const lockKey = buildLockKey(lockName);
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

async function processQueue(startTime: number) {
  const lock = await tryAcquireGlobalLock('process-queue-global');
  
  if (!lock.acquired) {
    logger.info('process-queue: Another instance is already running, skipping');
    return { processed: 0, skipped: true };
  }

  try {
    await Promise.all([initDb(), initDbWithRLS()]);
    
    const companies = await fetchCompaniesWithPendingEvents(MAX_COMPANIES);
    let processedCompanies = 0;
    let processedEvents = 0;

    for (const { company_id } of companies) {
      if (Date.now() - startTime >= MAX_RUN_MS) {
        break;
      }

      try {
        const result = await processUnprocessedEvents(company_id);
        processedCompanies += 1;
        processedEvents += result.processed;
      } catch (error) {
        logger.error('process-queue: company processing failed', {
          companyId: company_id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { processed: processedEvents, processedCompanies, skipped: false };
  } finally {
    await releaseGlobalLock(lock.lockKey);
  }
}

async function processReminders(startTime: number) {
  const lock = await tryAcquireGlobalLock('reminders-global');
  
  if (!lock.acquired) {
    logger.info('reminders: Another instance is already running, skipping');
    return { processed: 0, skipped: true };
  }

  try {
    await initDb();
    
    // Find cases that need reminders
    const casesQuery = `
      SELECT DISTINCT ON (rc.id)
        rc.id,
        rc.membership_id,
        rc.user_id,
        rc.company_id,
        rc.status,
        rc.first_failure_at,
        rc.last_nudge_at,
        rc.attempts,
        cs.enable_push,
        cs.enable_dm,
        cs.reminder_offsets_days
      FROM recovery_cases rc
      INNER JOIN creator_settings cs ON rc.company_id = cs.company_id
      WHERE rc.status IN ('pending', 'nudged')
        AND rc.first_failure_at IS NOT NULL
        AND (
          rc.last_nudge_at IS NULL 
          OR rc.last_nudge_at < NOW() - INTERVAL '1 day'
        )
      ORDER BY rc.id, rc.first_failure_at
      LIMIT $1
    `;

    const casesResult = await sql.query<{
      id: string;
      membership_id: string;
      user_id: string;
      company_id: string;
      status: string;
      first_failure_at: string;
      last_nudge_at: string | null;
      attempts: number;
      enable_push: boolean;
      enable_dm: boolean;
      reminder_offsets_days: number[];
    }>(casesQuery, [MAX_CASES]);
    const cases = casesResult.rows;

    if (cases.length === 0) {
      return { processed: 0, skipped: false };
    }

    let processed = 0;
    const now = Date.now();

    for (const recoveryCase of cases) {
      if (Date.now() - now > MAX_RUN_MS) {
        logger.warn('reminders: Time limit reached, stopping');
        break;
      }

      try {
        const daysSinceFailure = Math.floor(
          (Date.now() - new Date(recoveryCase.first_failure_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const reminderOffsets = recoveryCase.reminder_offsets_days || [0, 2, 4];
        const shouldRemind = reminderOffsets.includes(daysSinceFailure);

        if (!shouldRemind) {
          continue;
        }

        // Send notifications
        if (recoveryCase.enable_push) {
          await sendWhopPushNotification({
            userId: recoveryCase.user_id,
            title: 'Payment reminder',
            body: 'Please update your payment method to keep access.',
            data: { companyId: recoveryCase.company_id, membershipId: recoveryCase.membership_id },
            membershipId: recoveryCase.membership_id,
          });
        }

        if (recoveryCase.enable_dm) {
          await sendWhopDirectMessage({
            userId: recoveryCase.user_id,
            message: `Reminder: update your payment method to keep access. Membership ${recoveryCase.membership_id}`,
            membershipId: recoveryCase.membership_id,
          });
        }

        // Update last_nudge_at
        await sql.query(
          'UPDATE recovery_cases SET last_nudge_at = NOW(), attempts = attempts + 1 WHERE id = $1',
          [recoveryCase.id]
        );

        processed++;
      } catch (error) {
        logger.error('reminders: Error processing case', {
          caseId: recoveryCase.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { processed, skipped: false };
  } finally {
    await releaseGlobalLock(lock.lockKey);
  }
}

async function processMaintenance(startTime: number) {
  const lock = await tryAcquireGlobalLock('maintenance-global');
  
  if (!lock.acquired) {
    logger.info('maintenance: Another instance is already running, skipping');
    return { processed: 0, skipped: true };
  }

  try {
    await initDb();
    
    // Initialize and cleanup job queue
    await enhancedJobQueue.init();
    const result = await enhancedJobQueue.cleanup();
    await enhancedJobQueue.shutdown();
    
    // Clean up old rate_limit buckets (2 hours by default)
    const RATE_LIMIT_RETENTION_MINUTES = 120;
    const { rowCount: rateLimitPruned } = await sql.execute(
      `DELETE FROM rate_limits WHERE window_bucket_start < (NOW() - ($1 * INTERVAL '1 minute'))`,
      [RATE_LIMIT_RETENTION_MINUTES]
    );

    return { 
      processed: result.cleaned || 0, 
      cleanupRows: result.cleaned || 0,
      rateLimitPruned: rateLimitPruned || 0,
      errors: result.errors || [],
      skipped: false 
    };
  } finally {
    await releaseGlobalLock(lock.lockKey);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  logger.info('process-and-remind: Starting combined cron job');

  try {
    await Promise.all([initDb(), initDbWithRLS()]);
    
    // Process queue first
    const queueResult = await processQueue(startTime);
    
    // Then process reminders
    const remindersResult = await processReminders(startTime);
    
    // Finally process maintenance
    const maintenanceResult = await processMaintenance(startTime);

    const duration = Date.now() - startTime;
    logger.info('process-and-remind: Completed', {
      queueProcessed: queueResult.processed,
      queueSkipped: queueResult.skipped,
      remindersProcessed: remindersResult.processed,
      remindersSkipped: remindersResult.skipped,
      maintenanceProcessed: maintenanceResult.processed,
      maintenanceSkipped: maintenanceResult.skipped,
      duration,
    });

    return NextResponse.json({
      success: true,
      queue: {
        processed: queueResult.processed,
        skipped: queueResult.skipped,
      },
      reminders: {
        processed: remindersResult.processed,
        skipped: remindersResult.skipped,
      },
      maintenance: {
        processed: maintenanceResult.processed,
        skipped: maintenanceResult.skipped,
      },
      duration,
    });
  } catch (error) {
    logger.error('process-and-remind: Error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

