import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import {
  initDbWithRLS,
  closeDbWithRLS,
  sqlWithRLS,
  setRequestContext,
  clearRequestContext
} from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';

const COMPANY_ID = `company_${randomUUID()}`;
const MEMBERSHIP_ID = `membership_${randomUUID()}`;
const USER_ID = `user_${randomUUID()}`;

async function cleanup() {
  await sqlWithRLS.execute(
    'DELETE FROM recovery_cases WHERE company_id = $1',
    [COMPANY_ID],
    { skipRLS: true }
  );
  await sqlWithRLS.execute(
    'DELETE FROM company_subscriptions WHERE company_id = $1',
    [COMPANY_ID],
    { skipRLS: true, enforceCompanyContext: false }
  );
}

async function seedOpenCase() {
  const now = new Date();
  await sqlWithRLS.insert(
    `INSERT INTO recovery_cases (
       id, company_id, membership_id, user_id, first_failure_at,
       status, failure_reason, attempts, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'open', 'payment_failed', 0, NOW(), NOW())
     RETURNING id`,
    [randomUUID(), COMPANY_ID, MEMBERSHIP_ID, USER_ID, now],
    { companyId: COMPANY_ID }
  );
}

describe('Recovery Idempotency (real DB)', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterAll(async () => {
    await cleanup();
    await closeDbWithRLS();
  });

  beforeEach(async () => {
    clearRequestContext();
    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });
    await cleanup();
    await seedOpenCase();
  });

  afterEach(async () => {
    clearRequestContext();
    await cleanup();
  });

  it('processes the same event id only once with transactional guardrails', async () => {
    const eventId = `evt_${randomUUID()}`;
    const amountCents = 12_300;

    const first = await markCaseRecoveredByMembership(
      COMPANY_ID,
      MEMBERSHIP_ID,
      amountCents,
      new Date(),
      30,
      eventId
    );
    expect(first).toBe(true);

    const second = await markCaseRecoveredByMembership(
      COMPANY_ID,
      MEMBERSHIP_ID,
      amountCents,
      new Date(),
      30,
      eventId
    );
    expect(second).toBe(true);

    const cases = await sqlWithRLS.select<{
      recovered_amount_cents: number;
      recovery_source_event_id: string | null;
      status: string;
    }>(
      `SELECT recovered_amount_cents, recovery_source_event_id, status
       FROM recovery_cases
       WHERE company_id = $1 AND membership_id = $2`,
      [COMPANY_ID, MEMBERSHIP_ID],
      { companyId: COMPANY_ID }
    );

    expect(cases).toHaveLength(1);
    expect(cases[0].status).toBe('recovered');
    expect(cases[0].recovery_source_event_id).toBe(eventId);
    expect(cases[0].recovered_amount_cents).toBe(amountCents);

    const subscriptions = await sqlWithRLS.select<{
      total_recoveries_used: number;
      monthly_recovered_revenue_cents: number;
    }>(
      `SELECT total_recoveries_used, monthly_recovered_revenue_cents
       FROM company_subscriptions
       WHERE company_id = $1`,
      [COMPANY_ID],
      { skipRLS: true, enforceCompanyContext: false }
    );

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].total_recoveries_used).toBe(1);
    expect(subscriptions[0].monthly_recovered_revenue_cents).toBe(amountCents);
  });
});
