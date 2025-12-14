import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';

const COMPANY_ID = `company_concurrent_${randomUUID()}`;
const MEMBERSHIP_ID = `mem_concurrent_${randomUUID()}`;
const USER_ID = `user_concurrent_${randomUUID()}`;

async function cleanupTestData() {
  await sqlWithRLS.execute(
    `DELETE FROM recovery_cases WHERE company_id = $1`,
    [COMPANY_ID],
    { skipRLS: true }
  );
  await sqlWithRLS.execute(
    `DELETE FROM company_subscriptions WHERE company_id = $1`,
    [COMPANY_ID],
    { skipRLS: true }
  );
}

async function ensureSubscriptionRow() {
  await sqlWithRLS.execute(
    `INSERT INTO company_subscriptions (company_id, tier, total_recoveries_used, monthly_recovered_revenue_cents, month_start_date)
     VALUES ($1, 'free', 0, 0, CURRENT_DATE)
     ON CONFLICT (company_id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true }
  );
}

describe('Concurrent recovery attribution enforces single success', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeDbWithRLS();
  });

  afterEach(async () => {
    clearRequestContext();
    await cleanupTestData();
  });

  it('processes concurrent recovery attempts only once (unique recovery_source_event_id)', async () => {
    await ensureSubscriptionRow();

    const caseId = randomUUID();
    const eventId = `evt_recovery_${randomUUID()}`;
    const amountCents = 1234;

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovered_amount_cents)
       VALUES ($1, $2, $3, $4, NOW(), 'open', 0)`,
      [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const [first, second] = await Promise.allSettled([
      markCaseRecoveredByMembership(COMPANY_ID, MEMBERSHIP_ID, amountCents, new Date(), 30, eventId),
      markCaseRecoveredByMembership(COMPANY_ID, MEMBERSHIP_ID, amountCents, new Date(), 30, eventId),
    ]);

    const successes =
      (first.status === 'fulfilled' && first.value === true ? 1 : 0) +
      (second.status === 'fulfilled' && second.value === true ? 1 : 0);
    expect(successes).toBe(1);

    const rows = await sqlWithRLS.select<{ status: string; recovery_source_event_id: string | null; recovered_amount_cents: number }>(
      `SELECT status, recovery_source_event_id, recovered_amount_cents FROM recovery_cases WHERE id = $1`,
      [caseId],
      { companyId: COMPANY_ID }
    );

    expect(rows[0].status).toBe('recovered');
    expect(rows[0].recovery_source_event_id).toBe(eventId);
    expect(rows[0].recovered_amount_cents).toBe(amountCents);

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

    expect(subs[0].total_recoveries_used).toBe(1);
    expect(subs[0].monthly_recovered_revenue_cents).toBe(amountCents);
  });
});
