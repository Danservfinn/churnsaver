import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';

const COMPANY_ID = `company_plan_${randomUUID()}`;
const MEMBERSHIP_ID = `membership_plan_${randomUUID()}`;
const USER_ID = `user_plan_${randomUUID()}`;

async function ensureCompanyAndTierLimitReached() {
  await sqlWithRLS.execute(
    `INSERT INTO companies (id, name) VALUES ($1, 'Plan Limit Company') ON CONFLICT (id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true, enforceCompanyContext: false }
  );

  // Ensure subscription exists and is at the free tier limit (max_total_recoveries = 1)
  await sqlWithRLS.execute(
    `INSERT INTO company_subscriptions (company_id, tier, total_recoveries_used, monthly_recovered_revenue_cents, month_start_date)
     VALUES ($1, 'free', 1, 0, CURRENT_DATE)
     ON CONFLICT (company_id) DO UPDATE SET total_recoveries_used = EXCLUDED.total_recoveries_used`,
    [COMPANY_ID],
    { skipRLS: true }
  );
}

async function seedClickAttribution(caseId: string) {
  const linkSendId = randomUUID();
  await sqlWithRLS.execute(
    `INSERT INTO recovery_link_sends (id, case_id, company_id, membership_id, user_id, channel, token, whop_manage_url, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'dm', $6, 'https://example.com/manage', NOW() + interval '7 days')`,
    [linkSendId, caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID, `token_${randomUUID()}`],
    { skipRLS: true }
  );

  const clickId = randomUUID();
  await sqlWithRLS.execute(
    `INSERT INTO recovery_click_events (id, link_send_id, case_id, company_id, clicked_at, is_bot_suspected)
     VALUES ($1, $2, $3, $4, NOW() - interval '1 hour', false)`,
    [clickId, linkSendId, caseId, COMPANY_ID],
    { skipRLS: true }
  );
}

async function cleanup() {
  await sqlWithRLS.execute(`DELETE FROM recovery_click_events WHERE company_id = $1`, [COMPANY_ID], { skipRLS: true });
  await sqlWithRLS.execute(`DELETE FROM recovery_link_sends WHERE company_id = $1`, [COMPANY_ID], { skipRLS: true });
  await sqlWithRLS.execute(`DELETE FROM recovery_cases WHERE company_id = $1`, [COMPANY_ID], { skipRLS: true });
  await sqlWithRLS.execute(`DELETE FROM company_subscriptions WHERE company_id = $1`, [COMPANY_ID], { skipRLS: true });
}

describe('Plan limit enforcement during recovery', () => {
  beforeAll(async () => {
    await initDbWithRLS();
    await ensureCompanyAndTierLimitReached();
  });

  afterAll(async () => {
    await cleanup();
    await closeDbWithRLS();
  });

  it('downgrades recovery to ORGANIC when plan limits are exceeded', async () => {
    clearRequestContext();
    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const caseId = randomUUID();
    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovered_amount_cents)
       VALUES ($1, $2, $3, $4, NOW(), 'open', 0)`,
      [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID],
      { skipRLS: true }
    );

    await seedClickAttribution(caseId);

    const eventId = `evt_plan_limit_${randomUUID()}`;
    const result = await markCaseRecoveredByMembership(
      COMPANY_ID,
      MEMBERSHIP_ID,
      5000,
      new Date(),
      30,
      eventId
    );

    expect(result).toBe(true);

    const cases = await sqlWithRLS.select<{
      status: string;
      recovery_type: string | null;
      recovered_amount_cents: number;
      recovery_source_event_id: string | null;
    }>(
      `SELECT status, recovery_type, recovered_amount_cents, recovery_source_event_id
       FROM recovery_cases
       WHERE id = $1`,
      [caseId],
      { companyId: COMPANY_ID }
    );

    expect(cases[0].status).toBe('recovered');
    expect(cases[0].recovery_type).toBe('ORGANIC');
    expect(cases[0].recovered_amount_cents).toBe(0);
    expect(cases[0].recovery_source_event_id).toBe(eventId);

    const subs = await sqlWithRLS.select<{
      total_recoveries_used: number;
      monthly_recovered_revenue_cents: number;
    }>(
      `SELECT total_recoveries_used, monthly_recovered_revenue_cents
       FROM company_subscriptions
       WHERE company_id = $1`,
      [COMPANY_ID],
      { skipRLS: true, enforceCompanyContext: false }
    );

    // Usage should not increase because plan limit was exceeded
    expect(subs[0].total_recoveries_used).toBe(1);
    expect(subs[0].monthly_recovered_revenue_cents).toBe(0);
  });
});


