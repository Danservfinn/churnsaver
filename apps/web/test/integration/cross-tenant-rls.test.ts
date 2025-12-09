import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  initDbWithRLS,
  closeDbWithRLS,
  sqlWithRLS,
  setRequestContext,
  clearRequestContext,
} from '@/lib/db-rls';
import { randomUUID } from 'crypto';

const COMPANY_A = `company_a_${randomUUID()}`;
const COMPANY_B = `company_b_${randomUUID()}`;

async function cleanupTestData() {
  await sqlWithRLS.execute(
    'DELETE FROM recovery_cases WHERE company_id IN ($1, $2)',
    [COMPANY_A, COMPANY_B],
    { skipRLS: true }
  );
  await sqlWithRLS.execute(
    'DELETE FROM events WHERE company_id IN ($1, $2)',
    [COMPANY_A, COMPANY_B],
    { skipRLS: true }
  );
}

describe('Cross-tenant isolation with real RLS policies', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeDbWithRLS();
  });

  beforeEach(() => {
    clearRequestContext();
  });

  afterEach(async () => {
    clearRequestContext();
    await cleanupTestData();
  });

  it('Company A cannot read Company B recovery_cases rows via RLS', async () => {
    const caseAId = randomUUID();
    const caseBId = randomUUID();

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status)
       VALUES ($1, $2, $3, $4, NOW(), 'open')`,
      [caseAId, COMPANY_A, 'mem-a', 'user-a'],
      { skipRLS: true }
    );

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status)
       VALUES ($1, $2, $3, $4, NOW(), 'open')`,
      [caseBId, COMPANY_B, 'mem-b', 'user-b'],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_A, userId: 'tester', isAuthenticated: true });

    const rows = await sqlWithRLS.select<{ id: string; company_id: string }>(
      'SELECT id, company_id FROM recovery_cases ORDER BY id'
    );

    expect(rows.some(row => row.company_id === COMPANY_B)).toBe(false);
    expect(rows.every(row => row.company_id === COMPANY_A)).toBe(true);
  });

  it('Company A cannot update Company B recovery_cases rows', async () => {
    const caseBId = randomUUID();

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status)
       VALUES ($1, $2, $3, $4, NOW(), 'open')`,
      [caseBId, COMPANY_B, 'mem-b', 'user-b'],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_A, userId: 'tester', isAuthenticated: true });

    await expect(
      sqlWithRLS.execute(
        `UPDATE recovery_cases SET status = 'closed_no_recovery' WHERE id = $1`,
        [caseBId]
      )
    ).rejects.toThrow();
  });

  it('Company A cannot read Company B events rows via RLS', async () => {
    const eventAId = randomUUID();
    const eventBId = randomUUID();

    await sqlWithRLS.execute(
      `INSERT INTO events (id, whop_event_id, type, company_id, payload, payload_min, processed, occurred_at, received_at)
       VALUES ($1, $2, 'test', $3, '{}', '{}', false, NOW(), NOW())`,
      [randomUUID(), eventAId, COMPANY_A],
      { skipRLS: true }
    );

    await sqlWithRLS.execute(
      `INSERT INTO events (id, whop_event_id, type, company_id, payload, payload_min, processed, occurred_at, received_at)
       VALUES ($1, $2, 'test', $3, '{}', '{}', false, NOW(), NOW())`,
      [randomUUID(), eventBId, COMPANY_B],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_A, userId: 'tester', isAuthenticated: true });

    const rows = await sqlWithRLS.select<{ whop_event_id: string; company_id: string }>(
      'SELECT whop_event_id, company_id FROM events ORDER BY whop_event_id'
    );

    expect(rows.some(row => row.company_id === COMPANY_B)).toBe(false);
    expect(rows.every(row => row.company_id === COMPANY_A)).toBe(true);
  });
});

