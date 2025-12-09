import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markCaseRecoveredByMembership } from '@/server/services/cases';
import { recordRecoveryWithClient, checkRecoveryAllowed } from '@/server/services/subscriptions';

const openCase = {
  id: 'case-1',
  company_id: 'company-1',
  membership_id: 'mem-1',
  user_id: 'user-1',
  first_failure_at: new Date(),
  status: 'open',
  attempts: 0,
  incentive_days: 0,
};

vi.mock('@/server/services/subscriptions', () => ({
  recordRecoveryWithClient: vi.fn(),
  checkRecoveryAllowed: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/db-rls', () => {
  const select = vi.fn();
  const transaction = vi.fn();
  return { sqlWithRLS: { select, transaction, execute: vi.fn(), query: vi.fn() } };
});

const { sqlWithRLS } = await import('@/lib/db-rls');

describe('Recovery attribution transaction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('records recovery atomically and idempotently when eventId provided', async () => {
    (checkRecoveryAllowed as any).mockResolvedValue({ allowed: true });

    const fakeClient = {
      query: vi.fn(async (text: string) => {
        if (text.includes('SELECT 1 FROM recovery_cases')) {
          return { rowCount: 0 };
        }
        if (text.startsWith('UPDATE recovery_cases')) {
          return {
            rows: [
              {
                id: openCase.id,
                membership_id: openCase.membership_id,
                recovered_amount_cents: 500,
                recovery_type: 'CLICK_THROUGH',
                attributed_click_id: null,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };

    (sqlWithRLS.select as any).mockImplementation(async (text: string) => {
      if (text.includes('FROM recovery_cases')) {
        return [openCase];
      }
      if (text.includes('FROM recovery_click_events')) {
        return [
          {
            id: 'click-1',
            clicked_at: new Date(),
            is_bot_suspected: false,
          },
        ];
      }
      return [];
    });

    (sqlWithRLS.transaction as any).mockImplementation(async (cb: any, options: any) => {
      expect(options?.companyId).toBe(openCase.company_id);
      return cb(fakeClient);
    });

    const result = await markCaseRecoveredByMembership(
      openCase.company_id,
      openCase.membership_id,
      500,
      new Date(),
      30,
      'evt-1'
    );

    expect(result).toBe(true);
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT 1 FROM recovery_cases'),
      ['company-1', 'evt-1']
    );
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recovery_cases'),
      expect.any(Array)
    );
    expect(checkRecoveryAllowed).toHaveBeenCalled();
    expect(recordRecoveryWithClient).toHaveBeenCalledWith(fakeClient, openCase.company_id, 500);
  });
});

