import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { expireOldCases } from '@/server/services/caseExpiry';
import { GET as getKpis } from '@/app/api/dashboard/kpis/route';

type RecoveryCaseRow = {
  id: string;
  company_id: string;
  membership_id: string;
  user_id: string;
  first_failure_at: Date;
  status: string;
  recovered_amount_cents: number;
  recovery_type: string | null;
};

const recoveryCases: RecoveryCaseRow[] = [];

vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: 'test-key',
  },
  additionalEnv: {
    KPI_ATTRIBUTION_WINDOW_DAYS: 30,
    CASE_EXPIRY_WINDOW_DAYS: 60,
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    webhook: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/auth/whop', () => ({
  getRequestContext: vi.fn(async () => ({
    companyId: 'companyA',
    isAuthenticated: true,
  })),
}));

vi.mock('@/lib/validation', () => ({
  KpiQuerySchema: {},
  validateAndTransform: vi.fn((_schema, data) => ({
    success: true,
    data: { window: Number(data.window) || 30 },
  })),
}));

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: vi.fn(async (query: string, params: any[] = []) => {
      if (query.includes('COUNT(*) as count') && query.includes('FROM recovery_cases')) {
        const [companyId, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const matches = recoveryCases.filter(
          (c) => c.company_id === companyId && c.first_failure_at >= cutoffDate && c.status !== 'expired'
        );

        if (query.includes("status = 'open'")) {
          return [{ count: matches.filter((c) => c.status === 'open').length }];
        }
        if (query.includes("status = 'recovered'") && query.includes("recovery_type = 'CLICK_THROUGH'")) {
          return [{ count: matches.filter((c) => c.status === 'recovered' && c.recovery_type === 'CLICK_THROUGH').length }];
        }
        if (query.includes("status = 'recovered'") && query.includes("recovery_type = 'ORGANIC'")) {
          return [{ count: matches.filter((c) => c.status === 'recovered' && c.recovery_type === 'ORGANIC').length }];
        }

        return [{ count: matches.length }];
      }

      if (query.includes('SUM(recovered_amount_cents)') && query.includes('FROM recovery_cases')) {
        const [companyId, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const matches = recoveryCases.filter(
          (c) => c.company_id === companyId && c.first_failure_at >= cutoffDate && c.status !== 'expired'
        );

        if (query.includes("recovery_type = 'CLICK_THROUGH'")) {
          const total = matches
            .filter((c) => c.status === 'recovered' && c.recovery_type === 'CLICK_THROUGH')
            .reduce((sum, c) => sum + (c.recovered_amount_cents || 0), 0);
          return [{ total }];
        }
        if (query.includes("recovery_type = 'ORGANIC'")) {
          const total = matches
            .filter((c) => c.status === 'recovered' && c.recovery_type === 'ORGANIC')
            .reduce((sum, c) => sum + (c.recovered_amount_cents || 0), 0);
          return [{ total }];
        }
      }

      return [];
    }),
    execute: vi.fn(async (query: string, params: any[] = []) => {
      if (query.includes('SET status = \'expired\'')) {
        const [companyId, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        let count = 0;
        for (const rc of recoveryCases) {
          if (rc.company_id === companyId && rc.status === 'open' && rc.first_failure_at < cutoffDate) {
            rc.status = 'expired';
            count += 1;
          }
        }
        return { rowCount: count };
      }
      return { rowCount: 0 };
    }),
  },
}));

describe.skip('Recovery case expiry semantics', () => {
  const companyId = 'companyA';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-01T00:00:00.000Z'));
    recoveryCases.length = 0;

    const now = new Date();
    const openOld = new Date(now);
    openOld.setDate(openOld.getDate() - 61);
    const openRecent = new Date(now);
    openRecent.setDate(openRecent.getDate() - 10);
    const recoveredRecent = new Date(now);
    recoveredRecent.setDate(recoveredRecent.getDate() - 5);
    const closedOld = new Date(now);
    closedOld.setDate(closedOld.getDate() - 40);

    recoveryCases.push(
      {
        id: 'case-old-open',
        company_id: companyId,
        membership_id: 'mem-old',
        user_id: 'user1',
        first_failure_at: openOld,
        status: 'open',
        recovered_amount_cents: 0,
        recovery_type: null,
      },
      {
        id: 'case-open-recent',
        company_id: companyId,
        membership_id: 'mem-recent',
        user_id: 'user2',
        first_failure_at: openRecent,
        status: 'open',
        recovered_amount_cents: 0,
        recovery_type: null,
      },
      {
        id: 'case-recovered',
        company_id: companyId,
        membership_id: 'mem-recovered',
        user_id: 'user3',
        first_failure_at: recoveredRecent,
        status: 'recovered',
        recovered_amount_cents: 5000,
        recovery_type: 'CLICK_THROUGH',
      },
      {
        id: 'case-closed',
        company_id: companyId,
        membership_id: 'mem-closed',
        user_id: 'user4',
        first_failure_at: closedOld,
        status: 'closed_no_recovery',
        recovered_amount_cents: 0,
        recovery_type: null,
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('expires only old open cases and keeps KPIs clean', async () => {
    const expired = await expireOldCases(companyId);
    expect(expired).toBe(1);

    const oldCase = recoveryCases.find((c) => c.id === 'case-old-open')!;
    const recentCase = recoveryCases.find((c) => c.id === 'case-open-recent')!;
    const recovered = recoveryCases.find((c) => c.id === 'case-recovered')!;
    const closed = recoveryCases.find((c) => c.id === 'case-closed')!;

    expect(oldCase.status).toBe('expired');
    expect(recentCase.status).toBe('open');
    expect(recovered.status).toBe('recovered');
    expect(closed.status).toBe('closed_no_recovery');

    const req = new NextRequest(`http://localhost/api/dashboard/kpis?window=90`, {
      method: 'GET',
    });
    const res = await getKpis(req);
    const json = await res.json();

    expect(json.totalCases).toBe(3); // expired case excluded
    expect(json.activeCases).toBe(1); // only the recent open case
    expect(json.recoveries).toBe(1);
    expect(json.organicRecoveries).toBe(0);
  });
});


