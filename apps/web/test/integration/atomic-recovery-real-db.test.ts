import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';
import * as subscriptions from '@/server/services/subscriptions';

const COMPANY_ID = `company_atomic_${randomUUID()}`;
const MEMBERSHIP_ID = `mem_atomic_${randomUUID()}`;
const USER_ID = `user_atomic_${randomUUID()}`;

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

async function seedOpenCase(): Promise<string> {
  const caseId = randomUUID();
  await sqlWithRLS.execute(
    `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovered_amount_cents)
     VALUES ($1, $2, $3, $4, NOW(), 'open', 0)
     ON CONFLICT DO NOTHING`,
    [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID],
    { skipRLS: true }
  );

  // Ensure subscription row exists for usage accounting
  await sqlWithRLS.execute(
    `INSERT INTO company_subscriptions (company_id, tier, total_recoveries_used, monthly_recovered_revenue_cents, month_start_date)
     VALUES ($1, 'free', 0, 0, CURRENT_DATE)
     ON CONFLICT (company_id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true }
  );

  return caseId;
}

describe('Atomic recovery rollback with real database transaction', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeDbWithRLS();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    clearRequestContext();
    await cleanupTestData();
  });

  it('rolls back case update when subscription usage update fails inside transaction', async () => {
    const caseId = await seedOpenCase();

    // Mock subscription usage update to throw inside the transaction
    vi.spyOn(subscriptions, 'recordRecoveryWithClient').mockRejectedValueOnce(new Error('usage fail'));

    // Ensure RLS context is set
    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const result = await markCaseRecoveredByMembership(COMPANY_ID, MEMBERSHIP_ID, 1234, new Date(), 30, 'evt_fail');

    expect(result).toBe(false);

    // Verify case remains open and unrecovered after rollback
    const cases = await sqlWithRLS.select<{ status: string; recovered_amount_cents: number }>(
      `SELECT status, recovered_amount_cents FROM recovery_cases WHERE id = $1`,
      [caseId],
      { companyId: COMPANY_ID }
    );

    expect(cases[0].status).toBe('open');
    expect(cases[0].recovered_amount_cents).toBe(0);
  });

  it('commits case recovery and usage increment together when subscription update succeeds', async () => {
    const caseId = await seedOpenCase();

    const usageSpy = vi
      .spyOn(subscriptions, 'recordRecoveryWithClient')
      .mockResolvedValueOnce({ allowed: true });

    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const amountCents = 2500;
    const result = await markCaseRecoveredByMembership(
      COMPANY_ID,
      MEMBERSHIP_ID,
      amountCents,
      new Date(),
      30,
      'evt_success'
    );

    expect(result).toBe(true);
    expect(usageSpy).toHaveBeenCalledTimes(1);

    const cases = await sqlWithRLS.select<{
      status: string;
      recovered_amount_cents: number;
      recovery_source_event_id: string | null;
    }>(
      `SELECT status, recovered_amount_cents, recovery_source_event_id
       FROM recovery_cases WHERE id = $1`,
      [caseId],
      { companyId: COMPANY_ID }
    );

    expect(cases[0].status).toBe('recovered');
    expect(cases[0].recovered_amount_cents).toBe(amountCents);
    expect(cases[0].recovery_source_event_id).toBe('evt_success');

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

    expect(subs[0].total_recoveries_used).toBeGreaterThanOrEqual(1);
    expect(subs[0].monthly_recovered_revenue_cents).toBeGreaterThanOrEqual(amountCents);
  });
});

