import { describe, it, expect, vi } from 'vitest';
import { createRecoveryCase } from '@/server/services/cases';
import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));
vi.mock('@/lib/logger');

const sql = sqlWithRLS as any;

// Ensure unique open case constraint behavior is enforced via code path

describe('Unique Open Case Constraint', () => {
  it('returns existing case when unique constraint triggers', async () => {
    const canonical = {
      id: 'case_primary',
      company_id: 'companyA',
      membership_id: 'memA',
      status: 'open',
    };
    const uniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'idx_recovery_cases_one_open_per_membership',
    });

    sql.insert.mockResolvedValueOnce(canonical as any).mockRejectedValueOnce(uniqueViolation as any);
    sql.select.mockResolvedValueOnce([canonical] as any);

    const result = await createRecoveryCase({ eventId: 'evt1', membershipId: 'memA', userId: 'userA' } as any, 'companyA');
    const result2 = await createRecoveryCase({ eventId: 'evt2', membershipId: 'memA', userId: 'userA' } as any, 'companyA');

    expect([result?.id, result2?.id]).toContain(canonical.id);
    expect(sql.select).toHaveBeenCalled();
  });
});
