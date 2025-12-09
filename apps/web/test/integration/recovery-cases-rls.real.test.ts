import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  initDbWithRLS,
  closeDbWithRLS,
  sqlWithRLS,
  setRequestContext,
  clearRequestContext,
} from '@/lib/db-rls';

const COMPANY_A = `company_a_${randomUUID()}`;
const COMPANY_B = `company_b_${randomUUID()}`;

async function cleanup() {
  await sqlWithRLS.execute(
    'DELETE FROM recovery_cases WHERE company_id IN ($1, $2)',
    [COMPANY_A, COMPANY_B],
    { skipRLS: true }
  );
}

describe('recovery_cases RLS (real table)', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterAll(async () => {
    await cleanup();
    await closeDbWithRLS();
  });

  beforeEach(() => {
    clearRequestContext();
  });

  afterEach(async () => {
    clearRequestContext();
    await cleanup();
  });

  it('enforces company-scoped inserts and reads', async () => {
    setRequestContext({ companyId: COMPANY_A, userId: 'tester-a', isAuthenticated: true });

    const inserted = await sqlWithRLS.insert<{ id: string; company_id: string }>(
      `INSERT INTO recovery_cases (company_id, membership_id, user_id, status, first_failure_at)
       VALUES ($1, $2, $3, 'open', NOW())
       RETURNING id, company_id`,
      [COMPANY_A, 'member-a', 'user-a']
    );

    expect(inserted).not.toBeNull();
    expect(inserted?.company_id).toBe(COMPANY_A);

    await expect(
      sqlWithRLS.insert(
        `INSERT INTO recovery_cases (company_id, membership_id, user_id, status, first_failure_at)
         VALUES ($1, $2, $3, 'open', NOW())
         RETURNING id`,
        [COMPANY_B, 'member-b', 'user-a']
      )
    ).rejects.toThrow();

    setRequestContext({ companyId: COMPANY_B, userId: 'tester-b', isAuthenticated: true });

    const rowsForB = await sqlWithRLS.select<{ company_id: string }>(
      'SELECT company_id FROM recovery_cases ORDER BY created_at DESC'
    );

    expect(rowsForB.length).toBe(0);
  });

  it('requires company context for tenant-scoped queries', async () => {
    clearRequestContext();

    await expect(sqlWithRLS.select('SELECT id FROM recovery_cases LIMIT 1')).rejects.toThrow(
      /company context required/i
    );
  });
});

