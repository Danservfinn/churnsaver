import { isProductionLikeEnvironment } from '@/lib/env';

const DEMO_COMPANY_FALLBACK = 'demo-company';
const DEMO_USER_FALLBACK = 'demo-user';

function readBoolean(value: string | undefined | null): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

type HeadersLike = { get: (key: string) => string | null } | Headers;

export function isQaDemoBypassEnabled(request?: { url?: string; headers?: HeadersLike }): boolean {
  // NEVER allow QA/demo bypass in production-like environments (including preview/staging)
  if (isProductionLikeEnvironment() || process.env.NODE_ENV === 'production') {
    return false;
  }

  // In development, allow via env, query params, or headers
  const envEnabled =
    readBoolean(process.env.QA_DEMO_BYPASS) ||
    readBoolean(process.env.NEXT_PUBLIC_QA_DEMO_BYPASS);

  if (envEnabled) return true;

  if (request?.url) {
    const params = new URL(request.url).searchParams;
    const queryToggle =
      readBoolean(params.get('qa_demo')) || readBoolean(params.get('demo'));
    if (queryToggle) return true;
  }

  const headers = request?.headers;
  if (headers) {
    const get = 'get' in headers ? headers.get.bind(headers) : undefined;
    const headerValue = get?.('x-qa-demo-bypass');
    if (readBoolean(headerValue)) return true;
  }

  return false;
}

export function getQaDemoContext() {
  return {
    companyId:
      process.env.QA_DEMO_COMPANY_ID ||
      process.env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID ||
      DEMO_COMPANY_FALLBACK,
    userId:
      process.env.QA_DEMO_USER_ID ||
      process.env.NEXT_PUBLIC_QA_DEMO_USER_ID ||
      DEMO_USER_FALLBACK,
    isAuthenticated: true as const,
    devBypass: true as const,
  };
}

export function getQaDemoDashboardKpis() {
  return {
    activeCases: 8,
    recoveries: 5,
    organicRecoveries: 2,
    recoveryRate: 62.5,
    recoveredRevenueCents: 183400,
    organicRevenueCents: 42000,
    totalCases: 13,
    windowDays: 14,
    calculatedAt: new Date().toISOString(),
  };
}

export function getQaDemoDashboardCases() {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();

  return {
    cases: [
      {
        id: 'demo-case-1',
        membership_id: 'm-demo-1',
        user_id: 'u-demo-1',
        company_id:
          process.env.QA_DEMO_COMPANY_ID ||
          process.env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID ||
          DEMO_COMPANY_FALLBACK,
        status: 'open',
        attempts: 2,
        incentive_days: 3,
        recovered_amount_cents: 0,
        failure_reason: 'card_declined',
        recovery_type: null,
        attributed_click_id: null,
        first_failure_at: iso(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)),
        last_nudge_at: iso(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)),
        created_at: iso(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
      },
      {
        id: 'demo-case-2',
        membership_id: 'm-demo-2',
        user_id: 'u-demo-2',
        company_id:
          process.env.QA_DEMO_COMPANY_ID ||
          process.env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID ||
          DEMO_COMPANY_FALLBACK,
        status: 'recovered',
        attempts: 1,
        incentive_days: 7,
        recovered_amount_cents: 8200,
        failure_reason: 'insufficient_funds',
        recovery_type: 'CLICK_THROUGH',
        attributed_click_id: 'click-demo-2',
        first_failure_at: iso(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)),
        last_nudge_at: iso(new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)),
        created_at: iso(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)),
      },
      {
        id: 'demo-case-3',
        membership_id: 'm-demo-3',
        user_id: 'u-demo-3',
        company_id:
          process.env.QA_DEMO_COMPANY_ID ||
          process.env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID ||
          DEMO_COMPANY_FALLBACK,
        status: 'recovered',
        attempts: 3,
        incentive_days: 1,
        recovered_amount_cents: 5400,
        failure_reason: 'network_error',
        recovery_type: 'ORGANIC',
        attributed_click_id: null,
        first_failure_at: iso(new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)),
        last_nudge_at: iso(new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000)),
        created_at: iso(new Date(now.getTime() - 11 * 24 * 60 * 60 * 1000)),
      },
    ],
    total: 3,
    page: 1,
    limit: 10,
    totalPages: 1,
    filters: {},
  };
}

export function getQaDemoSettings() {
  return {
    company_id:
      process.env.QA_DEMO_COMPANY_ID ||
      process.env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID ||
      DEMO_COMPANY_FALLBACK,
    enable_push: true,
    enable_dm: true,
    incentive_days: 3,
    reminder_offsets_days: [0, 2, 4],
    updated_at: new Date().toISOString(),
  };
}

export function getQaDemoSubscription() {
  return {
    subscription: {
      company_id:
        process.env.QA_DEMO_COMPANY_ID ||
        process.env.NEXT_PUBLIC_QA_DEMO_COMPANY_ID ||
        DEMO_COMPANY_FALLBACK,
      tier: 'starter' as const,
      total_recoveries_used: 28,
      monthly_recovered_revenue_cents: 183400,
      month_start_date: new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString(),
    },
    limits: {
      tier: 'starter',
      max_monthly_recovered_revenue_cents: 250000,
      max_total_recoveries: 120,
      price_cents: 4900,
      name: 'Starter',
    },
  };
}

/**
 * Lightweight client-side detector for QA/demo bypass.
 * Uses env flags, persisted localStorage flag, and query params.
 */
export function isQaDemoClient(): boolean {
  if (typeof window === 'undefined') return false;

  const fromQuery = (() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('qa_demo') || params.get('demo');
    const normalized = raw?.toLowerCase();
    return normalized ? ['1', 'true', 'yes', 'on'].includes(normalized) : false;
  })();

  const fromStorage = (() => {
    try {
      return localStorage.getItem('qa_demo_bypass') === 'true';
    } catch {
      return false;
    }
  })();

  const fromEnv =
    process.env.NEXT_PUBLIC_QA_DEMO_BYPASS === 'true' ||
    process.env.QA_DEMO_BYPASS === 'true';

  return (fromEnv || fromQuery || fromStorage) && process.env.NODE_ENV !== 'production';
}



