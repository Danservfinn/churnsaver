import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRecoveryLinkSendByToken, recordClickEvent } from '@/server/services/recoveryLinks';

vi.mock('@/lib/db-rls', () => {
  return {
    sqlWithRLS: {
      select: vi.fn(),
      execute: vi.fn(),
      query: vi.fn(),
    },
  };
});

const { sqlWithRLS } = await import('@/lib/db-rls');

describe('RLS isolation helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('gets recovery link send using company-scoped RLS', async () => {
    (sqlWithRLS.select as any).mockResolvedValue([
      {
        id: 'link-1',
        case_id: 'case-1',
        company_id: 'company-1',
        membership_id: 'mem-1',
        user_id: 'user-1',
        whop_manage_url: 'https://example.com',
        expires_at: new Date().toISOString(),
      },
    ]);

    const result = await getRecoveryLinkSendByToken('token-123', 'company-1');

    expect(sqlWithRLS.select).toHaveBeenCalledWith(
      expect.any(String),
      ['token-123'],
      expect.objectContaining({ companyId: 'company-1' })
    );
    expect(result?.company_id).toBe('company-1');
  });

  it('records click events with tenant context', async () => {
    (sqlWithRLS.execute as any).mockResolvedValue({ rowCount: 1 });

    await recordClickEvent('link-1', 'case-1', 'company-2', {
      userAgent: 'ua',
      ipHash: 'hash',
      isBotSuspected: false,
    });

    expect(sqlWithRLS.execute).toHaveBeenCalledWith(
      expect.any(String),
      ['link-1', 'case-1', 'company-2', 'ua', 'hash', false],
      expect.objectContaining({ companyId: 'company-2' })
    );
  });
});







