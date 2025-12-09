import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { processPaymentFailedEvent, processPaymentSucceededEvent } from '@/server/services/cases';
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
  attributed_click_id?: string | null;
  attribution_window_days?: number | null;
  updated_at?: Date;
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
  getRequestContext: vi.fn(async (request: NextRequest) => {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('company') || 'companyA';
    return {
      companyId,
      isAuthenticated: true,
    };
  }),
}));

vi.mock('@/lib/validation', () => ({
  KpiQuerySchema: {},
  validateAndTransform: vi.fn((_schema, data) => ({
    success: true,
    data: { window: Number(data.window) || 30 },
  })),
}));

vi.mock('@/lib/db', () => ({
  initDb: vi.fn(),
  sql: {
    select: vi.fn(async (query: string, params: any[] = []) => {
      if (query.includes('FROM recovery_cases') && query.includes('LIMIT 1')) {
        const [companyId, membershipId, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const sorted = recoveryCases
          .filter(
            (c) =>
              c.company_id === companyId &&
              c.membership_id === membershipId &&
              c.status === 'open' &&
              c.first_failure_at >= cutoffDate
          )
          .sort((a, b) => b.first_failure_at.getTime() - a.first_failure_at.getTime());
        return sorted.slice(0, 1);
      }

      if (query.includes('COUNT(*) as count') && query.includes('FROM recovery_cases')) {
        const [companyId, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const matches = recoveryCases.filter((c) => c.company_id === companyId && c.first_failure_at >= cutoffDate);

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
        const matches = recoveryCases.filter((c) => c.company_id === companyId && c.first_failure_at >= cutoffDate);

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
    insert: vi.fn(async (query: string, params: any[] = []) => {
      if (query.startsWith('INSERT INTO recovery_cases')) {
        const [id, companyId, membershipId, userId, firstFailureAt, status, failureReason, attempts] = params;
        const row: RecoveryCaseRow = {
          id,
          company_id: companyId,
          membership_id: membershipId,
          user_id: userId,
          first_failure_at: new Date(firstFailureAt),
          status,
          recovered_amount_cents: 0,
          recovery_type: null,
        };
        recoveryCases.push(row);
        return row as any;
      }
      return null;
    }),
    execute: vi.fn(async (query: string, params: any[] = []) => {
      if (query.startsWith('UPDATE recovery_cases') && query.includes('RETURNING')) {
        const [amount, recoveryType, attributedClickId, attributionWindowDays, caseId, companyId] = params;
        const target = recoveryCases.find((c) => c.id === caseId && c.company_id === companyId && c.status === 'open');
        if (!target) return [];
        target.status = 'recovered';
        target.recovered_amount_cents = recoveryType === 'CLICK_THROUGH' ? amount : 0;
        target.recovery_type = recoveryType;
        target.attributed_click_id = attributedClickId;
        target.attribution_window_days = attributionWindowDays;
        target.updated_at = new Date();
        return [
          {
            id: target.id,
            membership_id: target.membership_id,
            status: target.status,
            recovered_amount_cents: target.recovered_amount_cents,
            recovery_type: target.recovery_type,
            attributed_click_id: target.attributed_click_id,
            attribution_window_days: target.attribution_window_days,
          },
        ] as any;
      }

      return { rowCount: 1 };
    }),
  },
}));

describe('Multi-tenant isolation for shared membership_id', () => {
  const membershipId = 'shared-mem';
  const companyA = 'companyA';
  const companyB = 'companyB';
  const userId = 'user-1';

  beforeEach(() => {
    recoveryCases.length = 0;
    vi.clearAllMocks();
  });

  it('isolates recoveries and KPIs per company', async () => {
    await processPaymentFailedEvent(
      { eventId: 'pf-a', membershipId, userId, occurredAt: new Date() },
      companyA
    );
    await processPaymentFailedEvent(
      { eventId: 'pf-b', membershipId, userId, occurredAt: new Date() },
      companyB
    );

    await processPaymentSucceededEvent(
      { eventId: 'ps-a', membershipId, userId, amount: 20 },
      companyA,
      new Date()
    );

    const caseA = recoveryCases.find((c) => c.company_id === companyA)!;
    const caseB = recoveryCases.find((c) => c.company_id === companyB)!;

    expect(caseA.status).toBe('recovered');
    expect(caseB.status).toBe('open');

    const kpiReqA = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyA}`);
    const kpiReqB = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyB}`);

    const resA = await getKpis(kpiReqA);
    const resB = await getKpis(kpiReqB);
    const jsonA = await resA.json();
    const jsonB = await resB.json();

    expect(jsonA.recoveries).toBe(1);
    expect(jsonA.totalCases).toBe(1);
    expect(jsonB.recoveries).toBe(0);
    expect(jsonB.activeCases).toBe(1);
    expect(jsonB.totalCases).toBe(1);
  });

  it('computes KPI counts and revenue only for the requesting tenant', async () => {
    const now = new Date('2024-03-01T00:00:00Z');
    recoveryCases.push(
      {
        id: 'a-open',
        company_id: companyA,
        membership_id: 'mem-a-open',
        user_id,
        first_failure_at: now,
        status: 'open',
        recovered_amount_cents: 0,
        recovery_type: null,
      },
      {
        id: 'a-rec',
        company_id: companyA,
        membership_id: 'mem-a-rec',
        user_id,
        first_failure_at: now,
        status: 'recovered',
        recovered_amount_cents: 5000,
        recovery_type: 'CLICK_THROUGH',
      },
      {
        id: 'b-rec',
        company_id: companyB,
        membership_id: 'mem-b-rec',
        user_id,
        first_failure_at: now,
        status: 'recovered',
        recovered_amount_cents: 9000,
        recovery_type: 'CLICK_THROUGH',
      }
    );

    const reqA = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyA}`);
    const resA = await getKpis(reqA);
    const jsonA = await resA.json();

    expect(jsonA.recoveries).toBe(1);
    expect(jsonA.activeCases).toBe(1);
    expect(jsonA.totalCases).toBe(2);
    expect(jsonA.recoveryRate).toBe(50);
    expect(jsonA.recoveredRevenueCents).toBe(5000);
    expect(jsonA.organicRevenueCents).toBe(0);
  });

  it('respects attribution window while maintaining tenant isolation', async () => {
    vi.useFakeTimers();
    const now = new Date('2024-03-01T00:00:00Z');
    vi.setSystemTime(now);

    const outsideWindow = new Date('2024-01-15T00:00:00Z'); // 45 days before now
    const insideWindow = new Date('2024-02-20T00:00:00Z'); // 10 days before now

    recoveryCases.push(
      {
        id: 'a-old-recovered',
        company_id: companyA,
        membership_id: 'mem-a-old',
        user_id,
        first_failure_at: outsideWindow,
        status: 'recovered',
        recovered_amount_cents: 1000,
        recovery_type: 'CLICK_THROUGH',
      },
      {
        id: 'a-open-fresh',
        company_id: companyA,
        membership_id: 'mem-a-new',
        user_id,
        first_failure_at: insideWindow,
        status: 'open',
        recovered_amount_cents: 0,
        recovery_type: null,
      },
      {
        id: 'b-recovered',
        company_id: companyB,
        membership_id: 'mem-b-new',
        user_id,
        first_failure_at: insideWindow,
        status: 'recovered',
        recovered_amount_cents: 8000,
        recovery_type: 'CLICK_THROUGH',
      }
    );

    const reqA = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyA}`);
    const resA = await getKpis(reqA);
    const jsonA = await resA.json();

    expect(jsonA.totalCases).toBe(1);
    expect(jsonA.activeCases).toBe(1);
    expect(jsonA.recoveries).toBe(0);
    expect(jsonA.recoveredRevenueCents).toBe(0);

    vi.useRealTimers();
  });
});

