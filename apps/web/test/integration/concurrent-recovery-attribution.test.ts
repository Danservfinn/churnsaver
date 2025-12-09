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
    const caseId = randomUUID();
    const eventId = `evt_recovery_${randomUUID()}`;

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovered_amount_cents)
       VALUES ($1, $2, $3, $4, NOW(), 'open', 0)`,
      [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const [first, second] = await Promise.allSettled([
      markCaseRecoveredByMembership(COMPANY_ID, MEMBERSHIP_ID, 1234, new Date(), 30, eventId),
      markCaseRecoveredByMembership(COMPANY_ID, MEMBERSHIP_ID, 1234, new Date(), 30, eventId),
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
    expect(rows[0].recovered_amount_cents).toBe(1234);
  });
});
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sqlWithRLS } from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';

describe('Concurrent Recovery Attribution', () => {
  const testCompanyId = 'test-company-concurrent';
  const testMembershipId = 'test-membership-concurrent';
  const testEventId = 'test-event-concurrent';
  let testCaseId: string;

  beforeEach(async () => {
    const result = await sqlWithRLS.insert<{ id: string }>(
      `INSERT INTO recovery_cases (company_id, membership_id, user_id, status, first_failure_at)
       VALUES ($1, $2, $3, 'open', NOW())
       RETURNING id`,
      [testCompanyId, testMembershipId, 'test-user'],
      { companyId: testCompanyId }
    );
    testCaseId = result!.id;
  });

  afterEach(async () => {
    await sqlWithRLS.execute(
      `DELETE FROM recovery_cases WHERE company_id = $1`,
      [testCompanyId],
      { skipRLS: true }
    );
  });

  it('should attribute recovery to only one concurrent request', async () => {
    const results = await Promise.allSettled([
      markCaseRecoveredByMembership(testCompanyId, testMembershipId, 1000, new Date(), 14, testEventId),
      markCaseRecoveredByMembership(testCompanyId, testMembershipId, 1000, new Date(), 14, testEventId)
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled' && r.value === true);

    const cases = await sqlWithRLS.select<{ recovery_source_event_id: string | null }>(
      `SELECT recovery_source_event_id FROM recovery_cases WHERE id = $1`,
      [testCaseId],
      { companyId: testCompanyId }
    );

    expect(cases[0].recovery_source_event_id).toBe(testEventId);
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });
});

