import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';
import { additionalEnv } from '@/lib/env';

const COMPANY_ID = `company_expired_${randomUUID()}`;
const MEMBERSHIP_ID = `mem_expired_${randomUUID()}`;
const USER_ID = `user_expired_${randomUUID()}`;

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

describe.skip('Expired case does not attribute late success (real DB)', () => {
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

  it('returns false and leaves case expired when success occurs after expiry window', async () => {
    const caseId = randomUUID();
    const daysPastExpiry = additionalEnv.CASE_EXPIRY_WINDOW_DAYS + 2;
    const firstFailureAt = new Date();
    firstFailureAt.setDate(firstFailureAt.getDate() - daysPastExpiry);

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovered_amount_cents)
       VALUES ($1, $2, $3, $4, $5, 'expired', 0)`,
      [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID, firstFailureAt],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const result = await markCaseRecoveredByMembership(
      COMPANY_ID,
      MEMBERSHIP_ID,
      999,
      new Date(),
      additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS,
      'evt_late_success'
    );

    expect(result).toBe(false);

    const rows = await sqlWithRLS.select<{ status: string; recovered_amount_cents: number }>(
      `SELECT status, recovered_amount_cents FROM recovery_cases WHERE id = $1`,
      [caseId],
      { companyId: COMPANY_ID }
    );

    expect(rows[0].status).toBe('expired');
    expect(rows[0].recovered_amount_cents).toBe(0);
  });
});

