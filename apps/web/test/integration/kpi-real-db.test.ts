import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS } from '@/lib/db-rls';

const COMPANY_ID = `company_kpi_${randomUUID()}`;

vi.mock('@/lib/auth/whop', () => ({
  getRequestContext: vi.fn(async () => ({
    companyId: COMPANY_ID,
    userId: 'tester',
    isAuthenticated: true
  }))
}));

vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0, resetAt: new Date() })),
  RATE_LIMIT_CONFIGS: { caseActions: {} }
}));

describe.skip('Dashboard KPI real DB integration', () => {
  beforeAll(async () => {
    await initDbWithRLS();
  });

  afterEach(async () => {
    await sqlWithRLS.execute(
      'DELETE FROM recovery_cases WHERE company_id = $1',
      [COMPANY_ID],
      { skipRLS: true }
    );
  });

  afterAll(async () => {
    await closeDbWithRLS();
  });

  it('computes KPIs using real database rows', async () => {
    const now = new Date();
    const withinWindow = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const staleDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

    await sqlWithRLS.execute(
      `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status, recovery_type, recovered_amount_cents)
       VALUES
       ($1, $4, 'mem-open', 'user-1', $2, 'open', NULL, 0),
       ($5, $4, 'mem-click', 'user-2', $2, 'recovered', 'CLICK_THROUGH', 5000),
       ($6, $4, 'mem-organic', 'user-3', $2, 'recovered', 'ORGANIC', 0),
       ($7, $4, 'mem-expired', 'user-4', $3, 'expired', NULL, 0)`,
      [
        randomUUID(),
        withinWindow,
        staleDate,
        COMPANY_ID,
        randomUUID(),
        randomUUID(),
        randomUUID()
      ],
      { skipRLS: true }
    );

    const { GET } = await import('@/app/api/dashboard/kpis/route');
    const req = new NextRequest(`http://localhost/api/dashboard/kpis?window=30`);
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.activeCases).toBe(1); // open within window
    expect(json.recoveries).toBe(1); // click-through
    expect(json.organicRecoveries).toBe(1); // organic
    expect(json.totalCases).toBe(3); // expired excluded
    expect(json.recoveredRevenueCents).toBe(5000);
    expect(json.organicRevenueCents).toBe(0);
  });
});

