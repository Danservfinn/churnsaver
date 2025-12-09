import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/dashboard/kpis/route';

vi.mock('@/lib/db', () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
  sql: {
    select: vi.fn().mockResolvedValue([{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { total: 0 }, { total: 0 }])
  }
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/lib/auth/whop', () => ({
  getRequestContext: vi.fn()
}));

vi.mock('@/lib/validation', () => ({
  KpiQuerySchema: {},
  validateAndTransform: vi.fn((_, value) => ({ success: true, data: { window: Number(value.window || 14) } }))
}));

vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { caseActions: {}, webhooks: {} }
}));

describe.skip('Dashboard KPI route company validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when companyId is missing', async () => {
    const { getRequestContext } = await import('@/lib/auth/whop');
    vi.mocked(getRequestContext).mockResolvedValue({
      companyId: '',
      isAuthenticated: true
    });

    const request = new NextRequest('http://localhost/api/dashboard/kpis?window=14');
    const response = await GET(request);

    expect(response.status).toBe(400);
  });
});

