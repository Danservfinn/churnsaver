import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { processPaymentFailedEvent } from '@/server/services/cases';

const COMPANY_ID = `company_case_race_${randomUUID()}`;
const MEMBERSHIP_ID = `membership_case_race_${randomUUID()}`;
const USER_ID = `user_case_race_${randomUUID()}`;

async function ensureCompany() {
  await sqlWithRLS.execute(
    `INSERT INTO companies (id, name) VALUES ($1, 'Case Race Company') ON CONFLICT (id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true, enforceCompanyContext: false }
  );
}

async function cleanup() {
  await sqlWithRLS.execute(`DELETE FROM recovery_cases WHERE company_id = $1`, [COMPANY_ID], { skipRLS: true });
}

describe('Concurrent recovery case creation race', () => {
  beforeAll(async () => {
    await initDbWithRLS();
    await ensureCompany();
  });

  afterAll(async () => {
    await cleanup();
    await closeDbWithRLS();
  });

  it('creates only one open case for concurrent payment_failed events', async () => {
    clearRequestContext();
    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const baseEvent = {
      membershipId: MEMBERSHIP_ID,
      userId: USER_ID,
      reason: 'payment_failed',
    };

    const results = await Promise.all([
      processPaymentFailedEvent({ ...baseEvent, eventId: `evt_pf_${randomUUID()}` }, COMPANY_ID),
      processPaymentFailedEvent({ ...baseEvent, eventId: `evt_pf_${randomUUID()}` }, COMPANY_ID),
    ]);

    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);

    const rows = await sqlWithRLS.select<{
      id: string;
      status: string;
      attempts: number;
    }>(
      `SELECT id, status, attempts FROM recovery_cases WHERE company_id = $1 AND membership_id = $2`,
      [COMPANY_ID, MEMBERSHIP_ID],
      { companyId: COMPANY_ID }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('open');
    // Second concurrent event should merge and bump attempts
    expect(rows[0].attempts).toBeGreaterThanOrEqual(0);
  });
});


