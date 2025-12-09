import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import {
  createRecoveryCase,
  markCaseRecoveredByMembership,
  type PaymentFailedEvent,
} from '@/server/services/cases';
import { POST as leanWebhookPost } from '@/app/api/lean/webhooks/whop/route';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRecoveryAllowed, recordRecovery } from '@/server/services/subscriptions';
import { NextRequest } from 'next/server';

// Mocks
vi.mock('@/lib/db', () => ({
  sql: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    webhook: vi.fn(),
  },
}));

vi.mock('@/lib/errorHandler', async () => {
  const actual = await vi.importActual<any>('@/lib/errorHandler');
  return {
    ...actual,
    errorHandler: {
      wrapAsync: vi.fn().mockImplementation(async (fn: any, _code?: any, _ctx?: any) => {
        const data = await fn();
        return { success: true, data };
      }),
    },
  };
});

vi.mock('@/lib/env', () => ({
  env: { ENCRYPTION_KEY: 'test-key', WHOP_WEBHOOK_SECRET: 'secret' },
  additionalEnv: { KPI_ATTRIBUTION_WINDOW_DAYS: 30 },
}));

vi.mock('@/server/services/subscriptions', () => ({
  checkRecoveryAllowed: vi.fn(),
  recordRecovery: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => {
  const fromMock = vi.fn();
  const chain = {
    upsert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  fromMock.mockReturnValue(chain);
  return {
    supabaseAdmin: {
      from: fromMock,
    },
  };
});

vi.mock('@/server/services/settings', () => ({
  getSettingsForCompany: vi.fn(),
}));

describe.skip('Case correctness safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses event occurredAt for first_failure_at', async () => {
    const occurredAt = new Date('2024-01-01T12:00:00Z');
    const event: PaymentFailedEvent = {
      eventId: 'evt-1',
      membershipId: 'mem-1',
      userId: 'user-1',
      occurredAt,
    };

    await createRecoveryCase(event, 'company-1');

    expect(sql.insert).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.any(String), 'company-1', 'mem-1', 'user-1', occurredAt])
    );
  });

  it('blocks tiered click-through when allowance denied and records as organic with zero revenue', async () => {
    const openCase = {
      id: 'case-1',
      company_id: 'company-1',
      membership_id: 'mem-1',
      user_id: 'user-1',
      first_failure_at: new Date(),
      status: 'open',
      attempts: 0,
      incentive_days: 0,
    };

    // Sequence: findOpenCase -> qualifyingClick -> update
    vi.mocked(sql.select).mockResolvedValueOnce([openCase] as any) // findOpenCaseForMembership
      .mockResolvedValueOnce([{ id: 'click-1', clicked_at: new Date(), is_bot_suspected: false }] as any) // qualifying click
      .mockResolvedValueOnce([{
        id: openCase.id,
        membership_id: openCase.membership_id,
        status: 'recovered',
        recovered_amount_cents: 0,
        recovery_type: 'ORGANIC',
        attributed_click_id: null,
        attribution_window_days: 30,
      }] as any); // update returning

    vi.mocked(checkRecoveryAllowed).mockResolvedValue({ allowed: false, reason: 'limit' });

    const result = await markCaseRecoveredByMembership('company-1', 'mem-1', 5000, new Date(), 30);

    expect(result).toBe(true);
    expect(recordRecovery).not.toHaveBeenCalled();
    // Ensure update wrote zero amount when downgraded to ORGANIC
    const updateCall = vi.mocked(sql.select).mock.calls[2];
    expect(updateCall?.[1]?.[0]).toBe(0);
  });

  it('rejects stale open cases outside attribution window', async () => {
    const staleCase = {
      id: 'case-stale',
      company_id: 'company-1',
      membership_id: 'mem-stale',
      user_id: 'user-1',
      first_failure_at: new Date('2023-01-01T00:00:00Z'),
      status: 'open',
      attempts: 0,
      incentive_days: 0,
    };

    // findOpenCaseForMembership should return empty because cutoff applied; simulate no rows
    vi.mocked(sql.select).mockResolvedValueOnce([] as any);

    const result = await markCaseRecoveredByMembership(
      'company-1',
      'mem-stale',
      1000,
      new Date('2024-01-01T00:00:00Z'),
      30
    );

    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns 500 when lean webhook persistence fails', async () => {
    process.env.WHOP_WEBHOOK_SECRET = 'secret';
    const body = JSON.stringify({
      id: 'evt-lean-1',
      type: 'membership_went_invalid',
      data: { company_id: 'company-1', membership_id: 'mem-1' },
    });
    const signature = crypto.createHmac('sha256', 'secret').update(body).digest('hex');

    // Make upsert fail
    const { supabaseAdmin } = await import('@/lib/supabase/server');
    const chain = supabaseAdmin.from('events') as any;
    chain.upsert.mockResolvedValueOnce({ error: { message: 'db failure' } });

    const req = new NextRequest('http://localhost/api/lean/webhooks/whop', {
      method: 'POST',
      body,
      headers: {
        'x-whop-signature': signature,
        'content-type': 'application/json',
      },
    });

    const res = await leanWebhookPost(req);
    expect(res.status).toBe(500);
  });
});

