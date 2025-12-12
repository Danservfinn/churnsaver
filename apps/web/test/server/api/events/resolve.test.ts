import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockInit = vi.fn();
const mockExecute = vi.fn();
const mockAssertCompanyContext = vi.fn();

vi.mock('@/lib/db-rls', () => ({
  initDbWithRLS: mockInit,
  sqlWithRLS: {
    execute: mockExecute,
  },
}));

vi.mock('@/server/services/shared/jobHelpers', () => ({
  assertCompanyContext: mockAssertCompanyContext,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const { POST } = await import('@/app/api/events/resolve/route');

describe('admin resolve endpoint', () => {
  const strongToken = 'x'.repeat(32);

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ADMIN_API_TOKEN = strongToken;
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_TOKEN;
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  const makeRequest = (body: any, ip = '203.0.113.5') =>
    new NextRequest('http://localhost/api/events/resolve', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'x-admin-token': strongToken,
        'x-forwarded-for': ip,
      }),
      body: JSON.stringify(body),
    });

  it('rejects when company validation fails', async () => {
    mockAssertCompanyContext.mockResolvedValue({ isValid: false, error: 'bad company' });

    const res = await POST(makeRequest({ eventId: 'evt', companyId: 'bad' }));

    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('updates with RLS enforcement when validation succeeds', async () => {
    mockAssertCompanyContext.mockResolvedValue({ isValid: true });
    mockExecute.mockResolvedValue({ rowCount: 1 });

    const res = await POST(makeRequest({ eventId: 'evt', companyId: 'good' }));

    expect(res.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledTimes(1);

    const [_sql, _params, options] = mockExecute.mock.calls[0];
    expect(options).toMatchObject({ companyId: 'good', enforceCompanyContext: true });
  });

  it('blocks disallowed IPs when allowlist set', async () => {
    process.env.ADMIN_ALLOWED_IPS = '198.51.100.9';
    mockAssertCompanyContext.mockResolvedValue({ isValid: true });

    const res = await POST(makeRequest({ eventId: 'evt', companyId: 'good' }, '203.0.113.5'));

    expect(res.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});





