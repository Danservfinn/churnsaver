import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db-rls', () => {
  return {
    sqlWithRLS: {
      select: vi.fn(),
    },
  };
});

const { sqlWithRLS } = await import('@/lib/db-rls');
const { assertCompanyContext } = await import('@/server/services/shared/jobHelpers');

describe('pg-boss worker RLS validation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('uses skipRLS for company existence check and passes when company exists', async () => {
    (sqlWithRLS.select as any).mockResolvedValue([{ id: 'company-1' }]);

    const result = await assertCompanyContext('company-1');

    expect(sqlWithRLS.select).toHaveBeenCalledWith(
      'SELECT id FROM companies WHERE id = $1',
      ['company-1'],
      expect.objectContaining({ skipRLS: true, enforceCompanyContext: false })
    );
    expect(result.isValid).toBe(true);
    expect(result.companyId).toBe('company-1');
  });

  it('fails validation when company is missing', async () => {
    (sqlWithRLS.select as any).mockResolvedValue([]);

    const result = await assertCompanyContext('missing-company');

    expect(result.isValid).toBe(false);
  });
});

