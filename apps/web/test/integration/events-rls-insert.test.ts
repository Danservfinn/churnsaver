import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';

const COMPANY_ID = `company_events_${randomUUID()}`;
const EVENT_ID = `evt_${randomUUID()}`;

async function ensureCompany() {
  await sqlWithRLS.execute(
    `INSERT INTO companies (id, name) VALUES ($1, 'Events RLS Test') ON CONFLICT (id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true, enforceCompanyContext: false }
  );
}

async function cleanup() {
  await sqlWithRLS.execute(
    `DELETE FROM events WHERE company_id = $1`,
    [COMPANY_ID],
    { skipRLS: true }
  );
}

describe('Events RLS insert enforcement', () => {
  beforeAll(async () => {
    await initDbWithRLS();
    await ensureCompany();
  });

  afterAll(async () => {
    await cleanup();
    await closeDbWithRLS();
  });

  it('rejects INSERT without company context when policy enforces RLS', async () => {
    clearRequestContext();

    await expect(
      sqlWithRLS.execute(
        `INSERT INTO events (id, whop_event_id, type, company_id, payload, payload_min, processed, occurred_at, received_at)
         VALUES ($1, $2, 'test_event', $3, '{}', '{}', false, NOW(), NOW())`,
        [randomUUID(), EVENT_ID, COMPANY_ID]
      )
    ).rejects.toThrow();
  });

  it('allows INSERT when company context is set', async () => {
    clearRequestContext();
    setRequestContext({ companyId: COMPANY_ID, userId: 'tester', isAuthenticated: true });

    const result = await sqlWithRLS.execute(
      `INSERT INTO events (id, whop_event_id, type, company_id, payload, payload_min, processed, occurred_at, received_at)
       VALUES ($1, $2, 'test_event', $3, '{}', '{}', false, NOW(), NOW())`,
      [randomUUID(), `${EVENT_ID}_allowed`, COMPANY_ID],
      { companyId: COMPANY_ID }
    );

    expect(typeof result === 'number' ? result : result.rowCount).toBe(1);
  });
});


