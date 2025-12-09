import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  processPaymentFailedEvent,
  processPaymentSucceededEvent,
} from '@/server/services/cases';
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
  attributed_click_id?: string | null;
  attribution_window_days?: number | null;
  attempts?: number;
  updated_at?: Date;
};

type ClickEvent = {
  id: string;
  link_send_id: string;
  case_id: string;
  membership_id: string;
  clicked_at: Date;
  is_bot_suspected: boolean;
};

const recoveryCases: RecoveryCaseRow[] = [];
const clickEvents: ClickEvent[] = [];
const companyId = 'company-edge';
const userId = 'user-edge';

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
    scheduler: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/auth/whop', () => ({
  getRequestContext: vi.fn(async (request: NextRequest) => {
    const url = new URL(request.url);
    const company = url.searchParams.get('company') || companyId;
    return {
      companyId: company,
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

vi.mock('@/server/services/subscriptions', () => ({
  checkRecoveryAllowed: vi.fn(async () => ({ allowed: true })),
  recordRecovery: vi.fn(),
}));

vi.mock('@/server/services/settings', () => ({
  getSettingsForCompany: vi.fn(async () => ({
    enable_push: false,
    enable_dm: false,
    incentive_days: 0,
    reminder_offsets_days: [0, 2, 4],
  })),
}));

vi.mock('@/server/services/shared/reminderNotifier', () => ({
  ReminderNotifier: {
    sendReminder: vi.fn().mockResolvedValue({
      pushSent: false,
      dmSent: false,
      incentiveApplied: false,
      error: null,
    }),
  },
}));

vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 0, resetAt: new Date() })),
  RATE_LIMIT_CONFIGS: { caseActions: {}, webhooks: {} },
}));

vi.mock('@/lib/db', () => ({
  initDb: vi.fn(),
  sql: {
    select: vi.fn(async (query: string, params: any[] = []) => {
      // Open case lookup (merge logic)
      if (query.includes('FROM recovery_cases') && query.includes('status = \'open\'') && query.includes('LIMIT 1')) {
        const [companyParam, membershipId, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const sorted = recoveryCases
          .filter(
            (c) =>
              c.company_id === companyParam &&
              c.membership_id === membershipId &&
              c.status === 'open' &&
              c.first_failure_at >= cutoffDate
          )
          .sort((a, b) => b.first_failure_at.getTime() - a.first_failure_at.getTime());
        return sorted.slice(0, 1);
      }

      // KPI count queries
      if (query.includes('COUNT(*) as count') && query.includes('FROM recovery_cases')) {
        const [companyParam, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const matches = recoveryCases.filter((c) => c.company_id === companyParam && c.first_failure_at >= cutoffDate);

        if (query.includes('status = \'open\'')) {
          return [{ count: matches.filter((c) => c.status === 'open').length }];
        }
        if (query.includes('recovery_type = \'CLICK_THROUGH\'')) {
          return [{ count: matches.filter((c) => c.status === 'recovered' && c.recovery_type === 'CLICK_THROUGH').length }];
        }
        if (query.includes('recovery_type = \'ORGANIC\'')) {
          return [{ count: matches.filter((c) => c.status === 'recovered' && c.recovery_type === 'ORGANIC').length }];
        }
        return [{ count: matches.length }];
      }

      // KPI revenue queries
      if (query.includes('SUM(recovered_amount_cents)') && query.includes('FROM recovery_cases')) {
        const [companyParam, cutoff] = params;
        const cutoffDate = new Date(cutoff);
        const matches = recoveryCases.filter((c) => c.company_id === companyParam && c.first_failure_at >= cutoffDate);

        if (query.includes('recovery_type = \'CLICK_THROUGH\'')) {
          const total = matches
            .filter((c) => c.status === 'recovered' && c.recovery_type === 'CLICK_THROUGH')
            .reduce((sum, c) => sum + (c.recovered_amount_cents || 0), 0);
          return [{ total }];
        }
        if (query.includes('recovery_type = \'ORGANIC\'')) {
          const total = matches
            .filter((c) => c.status === 'recovered' && c.recovery_type === 'ORGANIC')
            .reduce((sum, c) => sum + (c.recovered_amount_cents || 0), 0);
          return [{ total }];
        }
      }

      // Qualifying click lookup
      if (query.includes('FROM recovery_click_events')) {
        const [, caseId, paymentTime, windowStart] = params;
        const paymentDate = new Date(paymentTime);
        const startDate = new Date(windowStart);
        const clicks = clickEvents
          .filter(
            (c) =>
              c.case_id === caseId &&
              c.clicked_at < paymentDate &&
              c.clicked_at >= startDate &&
              !c.is_bot_suspected
          )
          .sort((a, b) => b.clicked_at.getTime() - a.clicked_at.getTime());
        return clicks.slice(0, 1);
      }

      return [];
    }),
    insert: vi.fn(async (query: string, params: any[] = []) => {
      // Create case
      if (query.startsWith('INSERT INTO recovery_cases')) {
        const [id, companyParam, membershipId, userIdParam, firstFailureAt, status, failureReason, attempts] = params;
        const row: RecoveryCaseRow = {
          id,
          company_id: companyParam,
          membership_id: membershipId,
          user_id: userIdParam,
          first_failure_at: new Date(firstFailureAt),
          status,
          recovered_amount_cents: 0,
          recovery_type: null,
          attempts,
        };
        recoveryCases.push(row);
        return row as any;
      }

      // Update existing case attempts (merge)
      if (query.startsWith('UPDATE recovery_cases') && query.includes('RETURNING *')) {
        const [caseId, , reason] = params;
        const target = recoveryCases.find((c) => c.id === caseId);
        if (target) {
          target.attempts = (target.attempts ?? 0) + 1;
          if (reason) target.recovery_type = target.recovery_type;
        }
        return target ? ({ ...target } as any) : null;
      }

      return null;
    }),
    execute: vi.fn(async (query: string, params: any[] = []) => {
      // Mark case recovered with attribution
      if (query.startsWith('UPDATE recovery_cases') && query.includes('RETURNING')) {
        const [amount, recoveryType, attributedClickId, attributionWindowDays, caseId, companyParam] = params;
        const target = recoveryCases.find(
          (c) => c.id === caseId && c.company_id === companyParam && c.status === 'open'
        );
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

      // Expire old cases
      if (query.includes('SET status = \'expired\'')) {
        const [cutoff] = params;
        const cutoffDate = new Date(cutoff);
        let count = 0;
        for (const rc of recoveryCases) {
          if (rc.status === 'open' && rc.first_failure_at < cutoffDate) {
            rc.status = 'expired';
            count += 1;
          }
        }
        return { rowCount: count };
      }

      // Reminder attempt update (noop)
      if (query.includes('SET attempts =')) {
        return { rowCount: 1 };
      }

      return { rowCount: 1 };
    }),
  },
}));

const addClickEvent = (caseId: string, overrides: Partial<ClickEvent> = {}) => {
  clickEvents.push({
    id: overrides.id || `click-${caseId}-${clickEvents.length}`,
    link_send_id: overrides.link_send_id || `ls-${caseId}`,
    case_id: caseId,
    membership_id: overrides.membership_id || 'mem-edge',
    clicked_at: overrides.clicked_at || new Date(),
    is_bot_suspected: overrides.is_bot_suspected ?? false,
  });
};

describe.skip('KPI edge scenarios', () => {
  beforeEach(() => {
    recoveryCases.length = 0;
    clickEvents.length = 0;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('merges multiple failures and counts a single recovery within the window', async () => {
    const now = new Date('2024-03-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const event = {
      eventId: 'pf-merge',
      membershipId: 'mem-edge',
      userId,
      occurredAt: now,
    };

    await processPaymentFailedEvent(event, companyId);
    await processPaymentFailedEvent(event, companyId);
    await processPaymentFailedEvent(event, companyId);

    const openCase = recoveryCases.find((c) => c.company_id === companyId && c.status === 'open')!;
    addClickEvent(openCase.id, { membership_id: openCase.membership_id, clicked_at: new Date(now.getTime() - 1000) });

    await processPaymentSucceededEvent(
      {
        eventId: 'ps-merge',
        membershipId: 'mem-edge',
        userId,
        amount: 20,
      },
      companyId,
      now
    );

    const req = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyId}`);
    const res = await getKpis(req);
    const json = await res.json();

    expect(json.totalCases).toBe(1);
    expect(json.recoveries).toBe(1);
    expect(json.activeCases).toBe(0);
    expect(json.recoveredRevenueCents).toBe(2000);
    expect(json.recoveryRate).toBe(100);

    vi.useRealTimers();
  });

  it('does not attribute recoveries when success arrives outside the window', async () => {
    const now = new Date('2024-03-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const fortyDaysAgo = new Date(now);
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

    await processPaymentFailedEvent(
      { eventId: 'pf-stale', membershipId: 'mem-stale', userId, occurredAt: fortyDaysAgo },
      companyId
    );

    await processPaymentSucceededEvent(
      { eventId: 'ps-stale', membershipId: 'mem-stale', userId, amount: 30 },
      companyId,
      now
    );

    const req = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyId}`);
    const res = await getKpis(req);
    const json = await res.json();

    expect(json.totalCases).toBe(0);
    expect(json.recoveries).toBe(0);
    expect(json.activeCases).toBe(0);
    expect(json.recoveredRevenueCents).toBe(0);

    vi.useRealTimers();
  });

  it('excludes expired cases from recoveries and active counts', async () => {
    const now = new Date('2024-03-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const sixtyFiveDaysAgo = new Date(now);
    sixtyFiveDaysAgo.setDate(sixtyFiveDaysAgo.getDate() - 65);

    await processPaymentFailedEvent(
      { eventId: 'pf-expire', membershipId: 'mem-expire', userId, occurredAt: sixtyFiveDaysAgo },
      companyId
    );

    const expiredCount = await expireOldCases(companyId);
    expect(expiredCount).toBe(1);

    await processPaymentSucceededEvent(
      { eventId: 'ps-expire', membershipId: 'mem-expire', userId, amount: 40 },
      companyId,
      now
    );

    const req = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyId}`);
    const res = await getKpis(req);
    const json = await res.json();

    expect(json.totalCases).toBe(0);
    expect(json.recoveries).toBe(0);
    expect(json.activeCases).toBe(0);
    expect(json.recoveredRevenueCents).toBe(0);

    vi.useRealTimers();
  });

  it('handles orphan open cases by counting only the recovered canonical case', async () => {
    const now = new Date('2024-03-01T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const recent = new Date(now);
    recent.setDate(recent.getDate() - 5);
    const older = new Date(now);
    older.setDate(older.getDate() - 10);

    recoveryCases.push(
      {
        id: 'case-newer',
        company_id: companyId,
        membership_id: 'mem-orphan',
        user_id: userId,
        first_failure_at: recent,
        status: 'open',
        recovered_amount_cents: 0,
        recovery_type: null,
      },
      {
        id: 'case-older',
        company_id: companyId,
        membership_id: 'mem-orphan',
        user_id: userId,
        first_failure_at: older,
        status: 'open',
        recovered_amount_cents: 0,
        recovery_type: null,
      }
    );

    addClickEvent('case-newer', { membership_id: 'mem-orphan', clicked_at: new Date(now.getTime() - 1000) });

    await processPaymentSucceededEvent(
      { eventId: 'ps-orphan', membershipId: 'mem-orphan', userId, amount: 25 },
      companyId,
      now
    );

    const req = new NextRequest(`http://localhost/api/dashboard/kpis?window=30&company=${companyId}`);
    const res = await getKpis(req);
    const json = await res.json();

    expect(json.totalCases).toBe(2);
    expect(json.recoveries).toBe(1);
    expect(json.activeCases).toBe(1);
    expect(json.recoveredRevenueCents).toBe(2500);
    expect(json.recoveryRate).toBe(50);

    vi.useRealTimers();
  });
});

