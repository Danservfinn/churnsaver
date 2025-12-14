import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { sendWhopPushNotification, sendWhopDirectMessage } from '@/server/services/notifications/whop';
import { initDb, sql } from '@/lib/db';
import { buildLockKey } from '@/server/services/shared/advisoryLock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RUN_MS = 10000; // 10 second hard cap per invocation
const MAX_CASES = 50; // Safety cap on cases processed per run

function requireAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
}

async function tryAcquireGlobalLock() {
  const lockKey = buildLockKey('reminders-global');
  const result = await sql.query<{ pg_try_advisory_lock: boolean }>(
    'SELECT pg_try_advisory_lock($1)',
    [lockKey]
  );
  return { acquired: result.rows[0]?.pg_try_advisory_lock === true, lockKey };
}

async function releaseGlobalLock(lockKey: bigint) {
  await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
}

function calculateNextReminder(
  firstFailureAt: string,
  attempts: number,
  offsets: number[]
): string | null {
  if (attempts >= offsets.length) return null;
  const nextOffset = offsets[attempts];
  const date = new Date(firstFailureAt);
  date.setDate(date.getDate() + nextOffset);
  return date.toISOString();
}

async function getSettings(companyId: string) {
  const { data } = await supabaseAdmin
    .from('creator_settings')
    .select('reminder_offsets_days')
    .eq('company_id', companyId)
    .single();
  return data?.reminder_offsets_days || [0, 2, 4];
}

async function sendReminder(case_: any, companyId: string) {
  const title = 'Payment reminder';
  const body = 'Please update your payment method to keep access.';
  try {
    await sendWhopPushNotification({
      userId: case_.user_id,
      title,
      body,
      data: { companyId, membershipId: case_.membership_id },
      membershipId: case_.membership_id,
    });
  } catch (e) {
    logger.warn('Push reminder failed', {
      error: e instanceof Error ? e.message : String(e),
      membershipId: case_.membership_id,
      companyId,
    });
  }

  try {
    await sendWhopDirectMessage({
      userId: case_.user_id,
      message: `Reminder: update your payment method to keep access. Membership ${case_.membership_id}`,
      membershipId: case_.membership_id,
    });
  } catch (e) {
    logger.warn('DM reminder failed', {
      error: e instanceof Error ? e.message : String(e),
      membershipId: case_.membership_id,
      companyId,
    });
  }
}

export async function GET(req: NextRequest) {
  if (!requireAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  await initDb();

  const { acquired, lockKey } = await tryAcquireGlobalLock();

  if (!acquired) {
    logger.warn('reminders: skipped because lock not acquired');
    return NextResponse.json(
      {
        status: 'skipped_lock',
        lockAcquired: false,
        durationMs: Date.now() - start
      },
      { status: 202 }
    );
  }

  let processed = 0;
  let truncated = false;

  try {
    const now = new Date().toISOString();

    // Fetch up to MAX_CASES cases ready for reminder
    const { data: cases, error } = await supabaseAdmin
      .from('recovery_cases')
      .select('id, company_id, membership_id, user_id, attempts, first_failure_at, next_reminder_at, status')
      .eq('status', 'open')
      .lte('next_reminder_at', now)
      .limit(MAX_CASES);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const case_ of cases || []) {
      // Time budget check
      if (Date.now() - start >= MAX_RUN_MS) {
        truncated = true;
        break;
      }

      const offsets = await getSettings(case_.company_id);
      const nextAttempt = case_.attempts + 1;
      const nextReminderAt = calculateNextReminder(case_.first_failure_at, nextAttempt, offsets);

      await sendReminder(case_, case_.company_id);

      await supabaseAdmin
        .from('recovery_cases')
        .update({
          attempts: nextAttempt,
          last_nudge_at: new Date().toISOString(),
          next_reminder_at: nextReminderAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', case_.id);

      processed += 1;
    }

    const durationMs = Date.now() - start;

    logger.info('reminders: completed run', {
      processed,
      durationMs,
      truncated,
      timeBudgetMs: MAX_RUN_MS
    });

    return NextResponse.json({
      status: 'ok',
      lockAcquired: true,
      processed,
      durationMs,
      truncated,
      timeBudgetMs: MAX_RUN_MS
    });
  } catch (error) {
    logger.error('reminders: unhandled error', {
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
      logger.warn('reminders: failed to release global lock', {
        error: releaseError instanceof Error ? releaseError.message : String(releaseError)
      });
    }
  }
}

