import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import {
  initDbWithRLS,
  closeDbWithRLS,
  sqlWithRLS,
  setRequestContext,
  clearRequestContext
} from '@/lib/db-rls';

const COMPANY_A = `company_click_a_${randomUUID()}`;
const COMPANY_B = `company_click_b_${randomUUID()}`;

describe.skip('RLS for recovery_link_sends and recovery_click_events', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterEach(async () => {
    clearRequestContext();
    await sqlWithRLS.execute('DELETE FROM recovery_click_events WHERE company_id IN ($1, $2)', [COMPANY_A, COMPANY_B], { skipRLS: true });
    await sqlWithRLS.execute('DELETE FROM recovery_link_sends WHERE company_id IN ($1, $2)', [COMPANY_A, COMPANY_B], { skipRLS: true });
  });

  afterAll(async () => {
    await closeDbWithRLS();
  });

  it('enforces SELECT isolation across tenants', async () => {
    await sqlWithRLS.execute(
      `INSERT INTO recovery_link_sends (id, case_id, company_id, membership_id, user_id, channel, token, whop_manage_url, expires_at)
       VALUES
       ($1, 'case-a', $3, 'mem-a', 'user-a', 'dm', 'token-a', 'https://example.com/a', NOW() + INTERVAL '1 day'),
       ($2, 'case-b', $4, 'mem-b', 'user-b', 'dm', 'token-b', 'https://example.com/b', NOW() + INTERVAL '1 day')`,
      [randomUUID(), randomUUID(), COMPANY_A, COMPANY_B],
      { skipRLS: true }
    );

    setRequestContext({ companyId: COMPANY_A, userId: 'tester', isAuthenticated: true });
    const rows = await sqlWithRLS.select<{ company_id: string }>(
      'SELECT company_id FROM recovery_link_sends ORDER BY company_id'
    );

    expect(rows.length).toBe(1);
    expect(rows[0].company_id).toBe(COMPANY_A);
  });

  it('prevents cross-tenant inserts into recovery_click_events', async () => {
    setRequestContext({ companyId: COMPANY_A, userId: 'tester', isAuthenticated: true });

    await expect(
      sqlWithRLS.insert(
        `INSERT INTO recovery_click_events (id, link_send_id, case_id, company_id, clicked_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
        [randomUUID(), randomUUID(), 'case-b', COMPANY_B]
      )
    ).rejects.toThrow();
  });
});

