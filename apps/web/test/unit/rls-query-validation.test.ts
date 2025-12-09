import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dbRls from '@/lib/db-rls';
import { findExistingCase, getRecoveryCases } from '@/server/services/cases';

vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: { KPI_ATTRIBUTION_WINDOW_DAYS: 30 },
}));

describe('RLS query validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('findExistingCase always scopes by companyId', async () => {
    const selectSpy = vi
      .spyOn(dbRls.sqlWithRLS, 'select')
      .mockResolvedValue([]);

    await findExistingCase('company-a', 'membership-x', 30, new Date());

    expect(selectSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['company-a', 'membership-x', expect.anything(), expect.anything()]),
      expect.objectContaining({ companyId: 'company-a' })
    );
  });

  it('getRecoveryCases always scopes by companyId', async () => {
    const selectSpy = vi
      .spyOn(dbRls.sqlWithRLS, 'select')
      .mockResolvedValue([]);

    await getRecoveryCases('company-b', 'open', 10, 0);

    expect(selectSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['company-b', 'open', 10, 0]),
      expect.objectContaining({ companyId: 'company-b' })
    );
  });
});

