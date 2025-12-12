import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.fn();
const executeMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: selectMock,
    execute: executeMock,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}));

describe('settings service uses sqlWithRLS safely', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns company settings via RLS-enforced select', async () => {
    const now = new Date().toISOString();
    selectMock.mockResolvedValueOnce([
      {
        company_id: 'company-1',
        enable_push: true,
        enable_dm: false,
        incentive_days: 5,
        reminder_offsets_days: [1, 3],
        updated_at: now,
      },
    ]);

    const { getSettingsForCompany } = await import('@/server/services/settings');
    const result = await getSettingsForCompany('company-1');

    expect(selectMock).toHaveBeenCalledWith(
      'SELECT company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at FROM creator_settings WHERE company_id = $1',
      ['company-1'],
      { companyId: 'company-1', enforceCompanyContext: true }
    );
    expect(result.company_id).toBe('company-1');
    expect(result.updated_at).toBe(now);
    expect(loggerInfoMock).not.toHaveBeenCalled();
  });

  it('falls back to defaults when no row exists', async () => {
    selectMock.mockResolvedValueOnce([]);

    const { getSettingsForCompany } = await import('@/server/services/settings');
    const result = await getSettingsForCompany('company-missing');

    expect(result.company_id).toBe('company-missing');
    expect(loggerInfoMock).toHaveBeenCalled();
  });

  it('upserts settings with enforced company context', async () => {
    executeMock.mockResolvedValueOnce({ rowCount: 1 });
    const { upsertSettingsForCompany } = await import('@/server/services/settings');

    const success = await upsertSettingsForCompany({
      company_id: 'company-2',
      enable_push: false,
      enable_dm: true,
      incentive_days: 2,
      reminder_offsets_days: [1, 2],
      updated_at: '2024-01-01T00:00:00.000Z',
    });

    expect(success).toBe(true);
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO creator_settings'),
      expect.any(Array),
      { companyId: 'company-2', enforceCompanyContext: true }
    );
  });

  it('returns false and logs on upsert failure', async () => {
    executeMock.mockRejectedValueOnce(new Error('db fail'));
    const { upsertSettingsForCompany } = await import('@/server/services/settings');

    const success = await upsertSettingsForCompany({
      company_id: 'company-3',
      enable_push: false,
      enable_dm: false,
      incentive_days: 0,
      reminder_offsets_days: [],
      updated_at: '2024-01-01T00:00:00.000Z',
    });

    expect(success).toBe(false);
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});

