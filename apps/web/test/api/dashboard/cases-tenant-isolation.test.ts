import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getCases } from '@/app/api/dashboard/cases/route';

type RecoveryCaseRow = {
  id: string;
  membership_id: string;
  user_id: string;
  company_id: string;
  status: string;
  first_failure_at: Date;
  created_at: Date;
};

const recoveryCases: RecoveryCaseRow[] = [];
const companyA = 'company-a';
const companyB = 'company-b';

vi.mock('@/lib/env', () => ({
  env: { ENCRYPTION_KEY: 'test-key' },
  additionalEnv: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  initDb: vi.fn(),
  sql: {
    select: vi.fn(async (query: string, params: any[] = []) => {
      const filterParams = () => {
        let idx = 0;
        const companyId = params[idx++] as string;
        const filters: {
          companyId: string;
          status?: string;
          start?: Date;
          end?: Date;
        } = { companyId };

        if (query.includes('status =')) {
          filters.status = params[idx++] as string;
        }

        if (query.includes('first_failure_at >=')) {
          filters.start = new Date(params[idx++] as string | Date);
        }

        if (query.includes('first_failure_at <=')) {
          filters.end = new Date(params[idx++] as string | Date);
        }

        const remaining = params.slice(idx);
        return { filters, remaining };
      };

      const applyFilters = (cases: RecoveryCaseRow[], filters: ReturnType<typeof filterParams>['filters']) =>
        cases.filter((c) => {
          if (c.company_id !== filters.companyId) return false;
          if (filters.status && c.status !== filters.status) return false;
          if (filters.start && c.first_failure_at < filters.start) return false;
          if (filters.end && c.first_failure_at > filters.end) return false;
          return true;
        });

      if (query.includes('COUNT(*) as count')) {
        const { filters } = filterParams();
        return [{ count: applyFilters(recoveryCases, filters).length }];
      }

      if (query.includes('FROM recovery_cases')) {
        const { filters, remaining } = filterParams();
        const limit = remaining[0] ?? recoveryCases.length;
        const offset = remaining[1] ?? 0;

        return applyFilters(recoveryCases, filters)
          .sort((a, b) => b.first_failure_at.getTime() - a.first_failure_at.getTime())
          .slice(offset, offset + limit);
      }

      return [];
    }),
  },
}));

vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0, resetAt: new Date() })),
  RATE_LIMIT_CONFIGS: { caseActions: {} },
}));

describe('Cases API tenant isolation', () => {
  beforeEach(() => {
    recoveryCases.length = 0;
    vi.clearAllMocks();

    recoveryCases.push(
      {
        id: 'case-a-open',
        membership_id: 'mem-a-1',
        user_id: 'user-a-1',
        company_id: companyA,
        status: 'open',
        first_failure_at: new Date('2024-01-10T12:00:00Z'),
        created_at: new Date('2024-01-10T12:00:00Z'),
      },
      {
        id: 'case-a-recovered',
        membership_id: 'mem-a-2',
        user_id: 'user-a-2',
        company_id: companyA,
        status: 'recovered',
        first_failure_at: new Date('2024-01-05T12:00:00Z'),
        created_at: new Date('2024-01-05T12:00:00Z'),
      },
      {
        id: 'case-b-open',
        membership_id: 'mem-b-1',
        user_id: 'user-b-1',
        company_id: companyB,
        status: 'open',
        first_failure_at: new Date('2024-01-08T12:00:00Z'),
        created_at: new Date('2024-01-08T12:00:00Z'),
      }
    );
  });

  const buildRequest = (url: string, companyId = companyA) =>
    new NextRequest(url, {
      headers: {
        'x-company-id': companyId,
        'x-user-id': 'user-tenant',
        'x-authenticated': 'true',
      },
    });

  it('returns only company A cases and correct total', async () => {
    const req = buildRequest('http://localhost/api/dashboard/cases?page=1&limit=10');
    const res = await getCases(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.cases).toHaveLength(2);
    expect(json.data.total).toBe(2);
    expect(json.data.cases.every((c: RecoveryCaseRow) => c.company_id === companyA)).toBe(true);
  });

  it('filters by status within the tenant and does not leak other tenants', async () => {
    const req = buildRequest('http://localhost/api/dashboard/cases?status=recovered');
    const res = await getCases(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.cases).toHaveLength(1);
    expect(json.data.total).toBe(1);
    expect(json.data.cases[0].id).toBe('case-a-recovered');
  });

  it('applies pagination without leaking cases from other companies', async () => {
    const page1Req = buildRequest('http://localhost/api/dashboard/cases?page=1&limit=1');
    const page2Req = buildRequest('http://localhost/api/dashboard/cases?page=2&limit=1');

    const [res1, res2] = await Promise.all([getCases(page1Req), getCases(page2Req)]);
    const [json1, json2] = await Promise.all([res1.json(), res2.json()]);

    expect(json1.data.total).toBe(2);
    expect(json1.data.cases).toHaveLength(1);
    expect(json2.data.cases).toHaveLength(1);

    const returnedIds = [...json1.data.cases, ...json2.data.cases].map((c: RecoveryCaseRow) => c.id);
    expect(returnedIds).toEqual(expect.arrayContaining(['case-a-open', 'case-a-recovered']));
    expect(returnedIds).not.toContain('case-b-open');
  });
});

