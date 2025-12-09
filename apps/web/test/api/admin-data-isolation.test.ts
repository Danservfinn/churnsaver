import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as exportCases } from '@/app/api/cases/export/route';
import { GET as listExports } from '@/app/api/data/export/route';
import { GET as getSecurityMetrics } from '@/app/api/security/metrics/route';

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

const exportRequests = [
  { request_id: 'req-a-1', company_id: companyA, status: 'completed' },
  { request_id: 'req-b-1', company_id: companyB, status: 'completed' },
];

vi.mock('@/lib/env', () => ({
  env: { ENCRYPTION_KEY: 'test-key' },
  additionalEnv: {},
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  initDb: vi.fn(),
  sql: {
    select: vi.fn(async (query: string, params: any[] = []) => {
      if (query.includes('FROM recovery_cases')) {
        const companyId = params[0];
        let status: string | undefined;
        let start: Date | undefined;
        let end: Date | undefined;
        let idx = 1;

        if (query.includes('status =')) {
          status = params[idx++];
        }
        if (query.includes('first_failure_at >=')) {
          start = new Date(params[idx++] as string | Date);
        }
        if (query.includes('first_failure_at <=')) {
          end = new Date(params[idx++] as string | Date);
        }

        return recoveryCases
          .filter((c) => {
            if (c.company_id !== companyId) return false;
            if (status && c.status !== status) return false;
            if (start && c.first_failure_at < start) return false;
            if (end && c.first_failure_at > end) return false;
            return true;
          })
          .sort((a, b) => b.first_failure_at.getTime() - a.first_failure_at.getTime());
      }
      return [];
    }),
  },
}));

vi.mock('@/lib/whop-sdk', () => ({
  getRequestContextSDK: vi.fn(async () => ({
    companyId: companyA,
    userId: 'user-a',
    isAuthenticated: true,
  })),
}));

vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0, resetAt: new Date() })),
  RATE_LIMIT_CONFIGS: { caseActions: {}, dataExport: {} },
}));

vi.mock('@/server/services/dataExport', () => {
  class DataExportError extends Error {
    code: string;
    category = 'test';
    details?: any;
    constructor(message: string, code = 'LIST_FAILED', details?: any) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }

  return {
    DataExportError,
    validateExportRequest: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
    createExportRequest: vi.fn(),
    listExportRequests: vi.fn(async (_userId: string, companyId: string) => {
      const requests = exportRequests.filter((req) => req.company_id === companyId);
      return { requests, total: requests.length };
    }),
  };
});

vi.mock('@/lib/security-monitoring', () => ({
  securityMonitor: {
    getSecurityMetrics: vi.fn(async () => ({
      totalEvents: 5,
      eventsBySeverity: { high: 2, critical: 1 },
      topOffenders: ['ip-a'],
      unusualPatterns: [],
    })),
    getActiveAlerts: vi.fn(() => [
      { id: 'alert-1', severity: 'high', message: 'Test', companyId: companyA },
    ]),
  },
}));

describe('Admin data fetchers - tenant isolation', () => {
  beforeEach(() => {
    recoveryCases.length = 0;
    vi.clearAllMocks();

    recoveryCases.push(
      {
        id: 'case-a-1',
        membership_id: 'mem-a-1',
        user_id: 'user-a-1',
        company_id: companyA,
        status: 'open',
        first_failure_at: new Date('2024-01-10T00:00:00Z'),
        created_at: new Date('2024-01-10T00:00:00Z'),
      },
      {
        id: 'case-a-2',
        membership_id: 'mem-a-2',
        user_id: 'user-a-2',
        company_id: companyA,
        status: 'recovered',
        first_failure_at: new Date('2024-01-05T00:00:00Z'),
        created_at: new Date('2024-01-05T00:00:00Z'),
      },
      {
        id: 'case-b-1',
        membership_id: 'mem-b-1',
        user_id: 'user-b-1',
        company_id: companyB,
        status: 'open',
        first_failure_at: new Date('2024-01-06T00:00:00Z'),
        created_at: new Date('2024-01-06T00:00:00Z'),
      }
    );
  });

  it('exports CSV containing only the requesting company cases', async () => {
    const req = new NextRequest('http://localhost/api/cases/export?status=open');
    const res = await exportCases(req);
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(csv).toContain('case-a-1');
    expect(csv).not.toContain('case-b-1');
  });

  it('lists data export requests scoped to the requesting company', async () => {
    const req = new NextRequest('http://localhost/api/data/export?limit=10&status=completed');
    const res = await listExports(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.requests).toHaveLength(1);
    expect(json.data.requests[0].request_id).toBe('req-a-1');
  });

  it('returns security metrics only when authenticated', async () => {
    const { getRequestContextSDK } = await import('@/lib/whop-sdk');
    vi.mocked(getRequestContextSDK).mockResolvedValueOnce({
      companyId: companyA,
      userId: 'user-a',
      isAuthenticated: false,
    });

    const unauthReq = new NextRequest('http://localhost/api/security/metrics');
    const unauthRes = await getSecurityMetrics(unauthReq);
    expect(unauthRes.status).toBe(401);

    const authReq = new NextRequest('http://localhost/api/security/metrics?includeAlerts=true');
    const authRes = await getSecurityMetrics(authReq);
    const json = await authRes.json();

    expect(authRes.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.metrics.totalEvents).toBe(5);
    expect(json.data.activeAlerts).toHaveLength(1);
    expect(json.data.activeAlerts[0].companyId).toBe(companyA);
  });
});

