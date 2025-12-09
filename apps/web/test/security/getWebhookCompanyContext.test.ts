import { describe, it, expect, vi } from 'vitest';

// Use real implementation instead of global mock from test/setup.ts
vi.doUnmock('@/lib/whop-sdk');

describe('getWebhookCompanyContext', () => {
  it('ignores x-whop-company-id header when payload has no company', async () => {
    const { getWebhookCompanyContext } = await import('@/lib/whop-sdk');

    const headers = {
      'x-whop-company-id': 'header-company',
    };

    const companyId = getWebhookCompanyContext(headers, { data: {} });

    expect(companyId).toBeUndefined();
  });

  it('returns company from signed payload data', async () => {
    const { getWebhookCompanyContext } = await import('@/lib/whop-sdk');

    const headers = {
      'x-whop-company-id': 'header-company',
    };

    const payload = {
      data: {
        company_id: 'payload-company',
      },
    };

    const companyId = getWebhookCompanyContext(headers, payload);

    expect(companyId).toBe('payload-company');
  });
});

