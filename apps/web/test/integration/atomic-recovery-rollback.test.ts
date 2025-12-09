import { describe, it, expect, vi } from 'vitest';
import { markCaseRecoveredByMembership } from '@/server/services/cases';
import { sqlWithRLS } from '@/lib/db-rls';
import { recordRecoveryWithClient, checkRecoveryAllowed } from '@/server/services/subscriptions';

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/server/services/subscriptions', () => ({
  recordRecoveryWithClient: vi.fn(),
  checkRecoveryAllowed: vi.fn().mockResolvedValue({ allowed: true }),
}));

const sql = sqlWithRLS as any;

// Simulate recovery rollback when usage recording fails

describe('Atomic Recovery Rollback', () => {
  it('returns false when recordRecoveryWithClient throws inside transaction', async () => {
    sql.select.mockResolvedValueOnce([
      {
        id: 'case1',
        company_id: 'companyA',
        membership_id: 'memA',
        status: 'open',
        first_failure_at: new Date()
      }
    ]);
    // qualifying click to force usage path
    sql.select.mockResolvedValueOnce([
      { id: 'click1', clicked_at: new Date(), is_bot_suspected: false }
    ]);
    sql.transaction.mockImplementation(async (cb: any) => {
      const client = {
        query: vi.fn().mockImplementation(async (text: string) => {
          if (text.startsWith('UPDATE')) {
            return { rowCount: 1, rows: [{ id: 'case1', membership_id: 'memA', status: 'recovered', recovered_amount_cents: 100 }] };
          }
          return { rowCount: 0, rows: [] };
        }),
      };
      return cb(client);
    });

    vi.mocked(recordRecoveryWithClient).mockRejectedValueOnce(new Error('usage fail'));

    const result = await markCaseRecoveredByMembership('companyA', 'memA', 100, new Date(), 30, 'evt_fail');
    expect(result).toBe(false);
  });
});
