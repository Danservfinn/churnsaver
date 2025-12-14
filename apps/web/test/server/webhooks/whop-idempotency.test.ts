import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWhopWebhook } from '@/server/webhooks/whop';
import { sqlWithRLS } from '@/lib/db-rls';
import { jobQueue } from '@/server/services/jobQueue';
import { securityMonitor } from '@/lib/security-monitoring';
import { env } from '@/lib/env';
import { createHmac } from 'crypto';

vi.mock('@/lib/db-rls', () => ({
  initDbWithRLS: vi.fn(),
  sqlWithRLS: {
    transaction: vi.fn(),
  },
}));

vi.mock('@/server/services/jobQueue', () => ({
  jobQueue: {
    init: vi.fn(),
    enqueueWebhookJob: vi.fn(),
  },
}));

vi.mock('@/lib/security-monitoring', () => ({
  securityMonitor: {
    processSecurityEvent: vi.fn(),
  },
}));

describe('handleWhopWebhook idempotency', () => {
  const secret = 'test_webhook_secret';

  beforeEach(() => {
    vi.clearAllMocks();
    (env as any).WHOP_WEBHOOK_SECRET = secret;
    (sqlWithRLS.transaction as unknown as vi.Mock).mockResolvedValue({ alreadyProcessed: true });
  });

  it('returns 200 immediately when event already processed', async () => {
    const payload = {
      id: 'evt_idempotent_1',
      type: 'payment_failed',
      data: { membership_id: 'mem_1' },
      created_at: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const headers = new Headers({
      'x-whop-signature': `sha256=${signature}`,
      'x-whop-timestamp': `${Math.floor(Date.now() / 1000)}`,
      'content-type': 'application/json',
    });

    const mockRequest = {
      text: async () => body,
      headers,
    } as any;

    const response = await handleWhopWebhook(mockRequest);

    expect(response.status).toBe(200);
    expect(jobQueue.enqueueWebhookJob).not.toHaveBeenCalled();
  });
});








