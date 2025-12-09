import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { handleWhopWebhook } from '@/server/webhooks/whop';

vi.mock('@/lib/db', () => {
  return {
    initDb: vi.fn().mockResolvedValue(undefined),
    sql: {
      select: vi.fn(),
      execute: vi.fn()
    }
  };
});

vi.mock('@/lib/env', () => ({
  env: { WHOP_WEBHOOK_SECRET: 'test_secret' },
  additionalEnv: { WEBHOOK_TIMESTAMP_SKEW_SECONDS: 300 }
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    webhook: vi.fn()
  }
}));

vi.mock('@/lib/validation', () => ({
  WebhookPayloadSchema: {},
  validateAndTransform: vi.fn((_, value) => ({ success: true, data: value }))
}));

vi.mock('@/server/services/jobQueue', () => ({
  jobQueue: {
    init: vi.fn(),
    enqueueWebhookJob: vi.fn()
  }
}));

vi.mock('@/lib/whop-sdk', () => ({
  getWebhookCompanyContext: vi.fn(() => 'company_123')
}));

vi.mock('@/lib/whop/dataTransformers', () => ({
  encryptWebhookPayload: vi.fn().mockResolvedValue(null),
  deriveMinimalPayload: vi.fn(() => ({}))
}));

vi.mock('@/lib/security-monitoring', () => ({
  securityMonitor: {
    processSecurityEvent: vi.fn()
  }
}));

vi.mock('@/lib/whop/webhookValidator', () => ({
  timingSafeEqualHex: vi.fn((a: string, b: string) => a === b)
}));

describe.skip('handleWhopWebhook idempotency', () => {
  const payload = {
    id: 'evt_123',
    type: 'payment.failed',
    data: { membership_id: 'mem_123' }
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { sql } = await import('@/lib/db');
    vi.mocked(sql.select).mockReset();
    vi.mocked(sql.execute).mockReset();
  });

  it('returns 200 and skips enqueue when event already exists', async () => {
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', 'test_secret').update(body).digest('hex');

    const request = new NextRequest('http://localhost/api/webhooks/whop', {
      method: 'POST',
      body,
      headers: {
        'x-whop-signature': signature
      }
    });

    const { sql } = await import('@/lib/db');
    const { jobQueue } = await import('@/server/services/jobQueue');

    vi.mocked(sql.select).mockResolvedValueOnce([{ id: 'existing-event' }]);

    const response = await handleWhopWebhook(request);

    expect(response.status).toBe(200);
    expect(jobQueue.enqueueWebhookJob).not.toHaveBeenCalled();
    expect(sql.execute).not.toHaveBeenCalled();
  });
});

