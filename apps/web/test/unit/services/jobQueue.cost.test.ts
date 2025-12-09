import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('JobQueue cost controls', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ENABLE_PG_BOSS;
  });

  it('returns null when pg-boss is disabled (cron-only mode)', async () => {
    const { jobQueue } = await import('@/server/services/jobQueue');

    const result = await jobQueue.enqueueWebhookJob({
      eventId: 'evt_123',
      eventType: 'payment_failed',
      membershipId: 'mem_123',
      payload: '{}',
      companyId: 'company_123',
      eventCreatedAt: new Date().toISOString()
    });

    expect(result).toBeNull();
  });
});

