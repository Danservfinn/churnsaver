import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleWhopWebhook } from '@/server/webhooks/whop';
import { createHmac, randomBytes } from 'crypto';

vi.mock('@/lib/db-rls', () => ({
  initDbWithRLS: vi.fn(),
  sqlWithRLS: {
    transaction: vi.fn()
  }
}));

vi.mock('@/server/services/jobQueue', () => ({
  jobQueue: {
    init: vi.fn(),
    enqueueWebhookJob: vi.fn()
  }
}));

vi.mock('@/lib/security-monitoring', () => ({
  securityMonitor: {
    processSecurityEvent: vi.fn()
  }
}));

describe('Whop webhook event type normalization', () => {
  const secret = randomBytes(24).toString('hex');

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as any).WHOP_WEBHOOK_SECRET = secret;
    (require('@/lib/db-rls').sqlWithRLS.transaction as unknown as vi.Mock).mockResolvedValue({
      alreadyProcessed: false
    });
  });

  afterEach(() => {
    delete (process.env as any).WHOP_WEBHOOK_SECRET;
  });

  it('normalizes dotted event types before enqueueing jobs', async () => {
    const payload = {
      id: 'evt_normalize_1',
      type: 'payment.succeeded',
      data: { membership_id: 'mem_normalized' },
      created_at: new Date().toISOString()
    };

    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const headers = new Headers({
      'x-whop-signature': `sha256=${signature}`,
      'x-whop-timestamp': `${Math.floor(Date.now() / 1000)}`,
      'content-type': 'application/json'
    });

    const mockRequest = {
      text: async () => body,
      headers
    } as any;

    const response = await handleWhopWebhook(mockRequest);

    expect(response.status).toBe(200);
    const enqueueWebhookJob = (require('@/server/services/jobQueue').jobQueue.enqueueWebhookJob as unknown as vi.Mock);
    expect(enqueueWebhookJob).toHaveBeenCalledTimes(1);
    const jobArg = enqueueWebhookJob.mock.calls[0][0];
    expect(jobArg.eventType).toBe('payment_succeeded');
    expect(JSON.parse(jobArg.payload).type).toBe('payment_succeeded');
  });
});

