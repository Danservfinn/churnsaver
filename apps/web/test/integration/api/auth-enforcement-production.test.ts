import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getKpis } from '@/app/api/dashboard/kpis/route';
import * as whopAuth from '@/lib/auth/whop';
import * as envModule from '@/lib/env';

describe.skip('KPI auth enforcement in production-like environments', () => {
  beforeEach(() => {
    vi.spyOn(envModule, 'isProductionLikeEnvironment').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when unauthenticated in production-like environment', async () => {
    vi.spyOn(whopAuth, 'getRequestContext').mockResolvedValue({
      companyId: 'company_auth_test',
      userId: null,
      isAuthenticated: false,
    });

    const request = new NextRequest('http://localhost/api/dashboard/kpis');

    const response = await getKpis(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Authentication required');
  });
});

