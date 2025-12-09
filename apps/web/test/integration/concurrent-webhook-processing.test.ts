import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS } from '@/lib/db-rls';
import { acquireEventLockWithClient } from '@/server/services/shared/advisoryLock';

describe('Concurrent webhook processing', () => {
  const companyId = `company_concurrent_${randomUUID()}`;
  const eventId = `evt_concurrent_${randomUUID()}`;

  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterEach(async () => {
    await sqlWithRLS.execute(
      'DELETE FROM events WHERE company_id = $1',
      [companyId],
      { skipRLS: true }
    );
  });

  afterAll(async () => {
    await closeDbWithRLS();
  });

  it('processes a webhook event only once when two workers run concurrently', async () => {
    // Seed an unprocessed event
    await sqlWithRLS.execute(
      `INSERT INTO events (
        id, whop_event_id, type, membership_id, payload, payload_min, payload_encrypted,
        processed_at, created_at, company_id, processed, company_resolution_status, occurred_at, received_at
      ) VALUES (
        $1, $2, 'payment_failed', 'mem-concurrent', '{}', '{}', NULL,
        NOW(), NOW(), $3, false, 'resolved', NOW(), NOW()
      )`,
      [randomUUID(), eventId, companyId],
      { skipRLS: true }
    );

    const worker = async () => {
      return sqlWithRLS.transaction(
        async (client) => {
          const locked = await acquireEventLockWithClient(client, companyId, eventId);
          if (!locked) return { locked: false as const, updated: false as const };

          const existing = await client.query<{ processed: boolean }>(
            `SELECT processed FROM events WHERE whop_event_id = $1 AND company_id = $2 FOR UPDATE`,
            [eventId, companyId]
          );

          if (existing.rowCount === 0) {
            return { locked: true as const, updated: false as const };
          }

          if (existing.rows[0].processed) {
            return { locked: true as const, updated: false as const, already: true as const };
          }

          await client.query(
            `UPDATE events SET processed = true, processed_at = NOW() WHERE whop_event_id = $1 AND company_id = $2`,
            [eventId, companyId]
          );

          return { locked: true as const, updated: true as const };
        },
        { companyId }
      );
    };

    const [first, second] = await Promise.all([worker(), worker()]);

    const processedCount = await sqlWithRLS.select<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM events WHERE whop_event_id = $1 AND company_id = $2 AND processed = true`,
      [eventId, companyId],
      { companyId }
    );

    expect(processedCount[0].count).toBe(1);
    expect(
      [first.updated === true, second.updated === true].filter(Boolean).length
    ).toBe(1);
  });
});

