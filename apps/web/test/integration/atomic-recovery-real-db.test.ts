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

describe.skip('Atomic recovery rollback with real database transaction', () => {
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
    // Seed an open case
    const caseId = randomUUID();
    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovered_amount_cents)
       VALUES ($1, $2, $3, $4, NOW(), 'open', 0)`,
      [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID],
      { skipRLS: true }
    );

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
});

