import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db-rls', () => {
  const select = vi.fn();
  const transaction = vi.fn();
  return {
    sqlWithRLS: {
      select,
      transaction,
    },
  };
});

vi.mock('@/server/services/subscriptions', () => {
  return {
    checkRecoveryAllowed: vi.fn(),
    recordRecoveryWithClient: vi.fn(),
  };
});

const { sqlWithRLS } = await import('@/lib/db-rls');
const { checkRecoveryAllowed } = await import('@/server/services/subscriptions');
const { markCaseRecoveredByMembership } = await import('@/server/services/cases');

describe('markCaseRecoveredByMembership error handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('propagates allowance errors without closing the case or running transaction', async () => {
    const openCase = {
      id: 'case-1',
      company_id: 'company-1',
      membership_id: 'member-1',
      first_failure_at: new Date(),
      status: 'open',
    };

    (sqlWithRLS.select as any).mockResolvedValue([openCase]);
    (checkRecoveryAllowed as any).mockRejectedValue(new Error('allowance check failed'));

    await expect(
      markCaseRecoveredByMembership('company-1', 'member-1', 500, new Date(), 30, 'evt-1')
    ).rejects.toThrow('allowance check failed');

    expect(sqlWithRLS.transaction).not.toHaveBeenCalled();
  });
});

