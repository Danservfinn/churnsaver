import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/whop', () => ({
  getRequestContext: vi.fn(),
}));

vi.mock('@/lib/whop-sdk', () => ({
  getRequestContextSDK: vi.fn(),
}));

vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: {},
}));

describe.skip('Authenticated endpoints enforce auth (401 when unauthenticated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscription route returns 401 when not authenticated', async () => {
    const { getRequestContext } = await import('@/lib/auth/whop');
    vi.mocked(getRequestContext).mockResolvedValue({
      companyId: 'company-test',
      userId: 'user-test',
      isAuthenticated: false,
    });

    const { GET } = await import('@/app/api/subscription/route');
    const req = new NextRequest('http://localhost/api/subscription');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('cases export route returns 401 when not authenticated', async () => {
    const { getRequestContextSDK } = await import('@/lib/whop-sdk');
    vi.mocked(getRequestContextSDK).mockResolvedValue({
      companyId: 'company-test',
      userId: 'user-test',
      isAuthenticated: false,
    });

    const { GET } = await import('@/app/api/cases/export/route');
    const req = new NextRequest('http://localhost/api/cases/export');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('security metrics route returns 401 when not authenticated', async () => {
    const { getRequestContextSDK } = await import('@/lib/whop-sdk');
    vi.mocked(getRequestContextSDK).mockResolvedValue({
      companyId: 'company-test',
      userId: 'user-test',
      isAuthenticated: false,
    });

    const { GET } = await import('@/app/api/security/metrics/route');
    const req = new NextRequest('http://localhost/api/security/metrics');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

