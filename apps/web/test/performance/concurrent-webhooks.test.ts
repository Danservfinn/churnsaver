import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID, createHash } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';

const COMPANY_ID = `company_load_${randomUUID()}`;
const EVENT_ID = `evt_load_${randomUUID()}`;

async function cleanupTestData() {
  await sqlWithRLS.execute(
    `DELETE FROM events WHERE company_id = $1`,
    [COMPANY_ID],
    { skipRLS: true }
  );
}

describe('Concurrent webhook inserts remain idempotent (20 parallel)', () => {
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

  it('inserts a single event when 20 workers race on same whop_event_id', async () => {
    setRequestContext({ companyId: COMPANY_ID, userId: 'tester', isAuthenticated: true });

    const tasks = Array.from({ length: 20 }).map(() =>
      sqlWithRLS.transaction(
        async (client) => {
          // Derive advisory lock key to serialize per company+event
          const lockKey = BigInt('0x' + createHash('sha256').update(`${COMPANY_ID}:${EVENT_ID}`).digest('hex').slice(0, 16));
          await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

          await client.query(
            `INSERT INTO events (id, whop_event_id, type, company_id, payload, payload_min, processed, occurred_at, received_at)
             VALUES ($1, $2, 'test', $3, '{}', '{}', false, NOW(), NOW())
             ON CONFLICT (whop_event_id) DO NOTHING`,
            [randomUUID(), EVENT_ID, COMPANY_ID]
          );
        },
        { companyId: COMPANY_ID, enforceCompanyContext: true }
      )
    );

    await Promise.all(tasks);

    const rows = await sqlWithRLS.select<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM events WHERE whop_event_id = $1 AND company_id = $2`,
      [EVENT_ID, COMPANY_ID],
      { companyId: COMPANY_ID }
    );

    expect(rows[0].count).toBe(1);
  });
});







