import { describe, it, expect } from 'vitest';
import { isEventAlreadyUsedForRecovery } from '@/server/services/cases';
import { describe, it, expect, vi } from 'vitest';
import { sqlWithRLS } from '@/lib/db-rls';

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: vi.fn(),
  },
}));

const sql = sqlWithRLS as any;

describe('Expired Case Late Success', () => {
  it('returns false when no open case (expired) exists', async () => {
    sql.select.mockResolvedValueOnce([]); // no open case
    const result = await isEventAlreadyUsedForRecovery('companyA', 'evt_expired');
    expect(result).toBe(false);
  });
});
