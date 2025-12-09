import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { sendWhopPushNotification, sendWhopDirectMessage } from '@/server/services/notifications/whop';

function requireAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
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

  const now = new Date().toISOString();

  // Fetch up to 50 cases ready for reminder
  const { data: cases, error } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, company_id, membership_id, user_id, attempts, first_failure_at, next_reminder_at, status')
    .eq('status', 'open')
    .lte('next_reminder_at', now)
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;

  for (const case_ of cases || []) {
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

  return NextResponse.json({ processed });
}

