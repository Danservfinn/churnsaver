import { describe, beforeEach, test, expect, vi } from 'vitest';
import { markCaseRecoveredByMembership } from '@/server/services/cases';
import { sql } from '@/lib/db';
import { sqlWithRLS } from '@/lib/db-rls';
import { checkRecoveryAllowed, recordRecoveryWithClient } from '@/server/services/subscriptions';
import { logger } from '@/lib/logger';
import { createTestRecoveryCase } from '../../helpers/database';

vi.mock('@/lib/db');
vi.mock('@/lib/db-rls');
vi.mock('@/lib/logger');
vi.mock('@/server/services/subscriptions');

describe.skip('Atomic recovery transaction', () => {
  const companyId = 'company_atomic';
  const membershipId = 'membership_atomic';
  const recoveredAmountCents = 1234;
  const openCase = createTestRecoveryCase({
    id: 'case_atomic',
    company_id: companyId,
    membership_id: membershipId,
    status: 'open',
  });

  let transactionState: {
    committed: boolean;
    rolledBack: boolean;
    queries: Array<{ text: string; params?: unknown[] }>;
    client: any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transactionState = {
      committed: false,
      rolledBack: false,
      queries: [],
      client: null,
    };

    const mockClient = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        transactionState.queries.push({ text, params });

        if (text.includes('UPDATE recovery_cases')) {
          return {
            rows: [
              {
                id: openCase.id,
                membership_id: openCase.membership_id,
                status: 'recovered',
                recovered_amount_cents: recoveredAmountCents,
                recovery_type: 'CLICK_THROUGH',
                attributed_click_id: null,
                attribution_window_days: 30,
              },
            ],
            rowCount: 1,
          };
        }

        if (text.includes('INSERT INTO company_subscriptions')) {
          return { rows: [], rowCount: 0 };
        }

        if (text.includes('SELECT company_id')) {
          return {
            rows: [
              {
                company_id: companyId,
                tier: 'starter',
                whop_membership_id: null,
                total_recoveries_used: 0,
                monthly_recovered_revenue_cents: 0,
                month_start_date: new Date().toISOString(),
              },
            ],
            rowCount: 1,
          };
        }

        if (text.includes('UPDATE company_subscriptions')) {
          return { rows: [], rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      }),
    };

    transactionState.client = mockClient;

    vi.mocked(sqlWithRLS.transaction).mockImplementation(async (callback, _options) => {
      try {
        const result = await callback(mockClient as any);
        transactionState.committed = true;
        return result;
      } catch (error) {
        transactionState.rolledBack = true;
        throw error;
      }
    });

    // Default select mocks: first for findOpenCaseForMembership, second for findQualifyingClick
    vi.mocked(sql.select).mockResolvedValueOnce([openCase] as any).mockResolvedValueOnce([] as any);

    vi.mocked(checkRecoveryAllowed).mockResolvedValue({
      allowed: true,
      subscription: {
        company_id: companyId,
        tier: 'starter',
        whop_membership_id: null,
        total_recoveries_used: 0,
        monthly_recovered_revenue_cents: 0,
        month_start_date: new Date().toISOString(),
      },
      limits: {
        tier: 'starter',
        max_monthly_recovered_revenue_cents: null,
        max_total_recoveries: null,
        price_cents: 0,
        name: 'Starter',
      },
    } as any);
  });

  test('records recovery and usage atomically', async () => {
    vi.mocked(recordRecoveryWithClient).mockResolvedValue();

    const result = await markCaseRecoveredByMembership(
      companyId,
      membershipId,
      recoveredAmountCents,
      new Date(),
      30
    );

    expect(result).toBe(true);
    expect(transactionState.committed).toBe(true);
    expect(transactionState.rolledBack).toBe(false);
    expect(recordRecoveryWithClient).toHaveBeenCalledTimes(1);
    expect(recordRecoveryWithClient).toHaveBeenCalledWith(
      transactionState.client,
      companyId,
      recoveredAmountCents
    );
    expect(transactionState.queries.some(({ text }) => text.includes('UPDATE recovery_cases'))).toBe(true);
    expect(
      transactionState.queries.some(({ text }) => text.includes('UPDATE company_subscriptions'))
    ).toBe(true);
  });

  test('rolls back when usage recording fails', async () => {
    vi.mocked(recordRecoveryWithClient).mockRejectedValue(new Error('usage failed'));

    const result = await markCaseRecoveredByMembership(
      companyId,
      membershipId,
      recoveredAmountCents,
      new Date(),
      30
    );

    expect(result).toBe(false);
    expect(transactionState.committed).toBe(false);
    expect(transactionState.rolledBack).toBe(true);
    expect(recordRecoveryWithClient).toHaveBeenCalledTimes(1);
    expect(transactionState.queries.some(({ text }) => text.includes('UPDATE recovery_cases'))).toBe(true);
  });
});

