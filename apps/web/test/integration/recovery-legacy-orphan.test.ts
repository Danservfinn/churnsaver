import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '@/lib/db-rls';
import { markCaseRecoveredByMembership } from '@/server/services/cases';

const COMPANY_ID = `company_legacy_${randomUUID()}`;
const MEMBERSHIP_ID = `membership_legacy_${randomUUID()}`;
const USER_ID = `user_legacy_${randomUUID()}`;

async function ensureCompany() {
  await sqlWithRLS.execute(
    `INSERT INTO companies (id, name) VALUES ($1, 'Legacy Orphan Company') ON CONFLICT (id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true, enforceCompanyContext: false }
  );
  await sqlWithRLS.execute(
    `INSERT INTO company_subscriptions (company_id, tier)
     VALUES ($1, 'free')
     ON CONFLICT (company_id) DO NOTHING`,
    [COMPANY_ID],
    { skipRLS: true }
  );
}

async function cleanup() {
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

describe('Legacy orphan case recovery (no recovery_source_event_id)', () => {
  beforeAll(async () => {
    await initDbWithRLS();
    await ensureCompany();
  });

  afterAll(async () => {
    await cleanup();
    await closeDbWithRLS();
  });

  it('recovers a legacy case without triggering recovery_source_event_id uniqueness errors', async () => {
    clearRequestContext();
    setRequestContext({ companyId: COMPANY_ID, userId: USER_ID, isAuthenticated: true });

    const caseId = randomUUID();
    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovery_source_event_id, recovered_amount_cents)
       VALUES ($1, $2, $3, $4, NOW(), 'open', NULL, 0)`,
      [caseId, COMPANY_ID, MEMBERSHIP_ID, USER_ID],
      { skipRLS: true }
    );

    const eventId = `evt_legacy_${randomUUID()}`;
    const result = await markCaseRecoveredByMembership(
      COMPANY_ID,
      MEMBERSHIP_ID,
      4200,
      new Date(),
      30,
      eventId
    );

    expect(result).toBe(true);

    const rows = await sqlWithRLS.select<{
      id: string;
      status: string;
      recovery_source_event_id: string | null;
      recovered_amount_cents: number;
    }>(
      `SELECT id, status, recovery_source_event_id, recovered_amount_cents
       FROM recovery_cases
       WHERE id = $1`,
      [caseId],
      { companyId: COMPANY_ID }
    );

    expect(rows[0].status).toBe('recovered');
    expect(rows[0].recovery_source_event_id).toBe(eventId);
    expect(rows[0].recovered_amount_cents).toBe(4200);
  });
});


