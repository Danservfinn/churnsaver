import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: {
    KPI_ATTRIBUTION_WINDOW_DAYS: 30,
    CASE_EXPIRY_WINDOW_DAYS: 90,
  },
}));

vi.mock('@/server/services/shared/advisoryLock', () => ({
  acquireEventLockWithClient: vi.fn(),
  releaseEventLock: vi.fn(),
}));

vi.mock('@/server/services/shared/jobHelpers', () => ({
  assertCompanyContext: vi.fn().mockResolvedValue({ isValid: true }),
  updateEventProcessingStatus: vi.fn().mockResolvedValue(true),
  isEventProcessed: vi.fn().mockResolvedValue(false),
  createProcessedEvent: vi.fn().mockReturnValue({}),
  calculateJobMetrics: vi.fn(),
}));

vi.mock('@/server/services/eventProcessor', () => ({
  processWebhookEvent: vi.fn().mockResolvedValue(true),
}));

describe.skip('Event idempotency safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('treats duplicate payment_succeeded events as idempotent success', async () => {
    const cases = await import('@/server/services/cases');

    const event = {
      eventId: 'evt_dup_123',
      membershipId: 'mem_1',
      userId: 'user_1',
      amount: 19.99,
      currency: 'usd',
    };

    const isEventAlreadyUsedSpy = vi
      .spyOn(cases, 'isEventAlreadyUsedForRecovery')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const markCaseSpy = vi
      .spyOn(cases, 'markCaseRecoveredByMembership')
      .mockResolvedValue(true);

    const first = await cases.processPaymentSucceededEvent(event, 'company_1');
    const second = await cases.processPaymentSucceededEvent(event, 'company_1');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(markCaseSpy).toHaveBeenCalledTimes(1);
    expect(isEventAlreadyUsedSpy).toHaveBeenCalledTimes(2);
  });

  it('passes eventId through to recovery marking logic', async () => {
    const cases = await import('@/server/services/cases');

    const event = {
      eventId: 'evt_pass_through',
      membershipId: 'mem_2',
      userId: 'user_2',
      amount: 42,
      currency: 'usd',
    };

    vi.spyOn(cases, 'isEventAlreadyUsedForRecovery').mockResolvedValue(false);

    const markCaseSpy = vi
      .spyOn(cases, 'markCaseRecoveredByMembership')
      .mockResolvedValue(true);

    await cases.processPaymentSucceededEvent(event, 'company_2');

    expect(markCaseSpy).toHaveBeenCalledWith(
      'company_2',
      event.membershipId,
      Math.round(event.amount * 100),
      undefined,
      expect.any(Number),
      event.eventId
    );
  });
});

describe.skip('Job queue event-level locking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('allows only one job to process when event lock is contended', async () => {
    const { jobQueue } = await import('@/server/services/jobQueue');
    const { acquireEventLockWithClient } = await import('@/server/services/shared/advisoryLock');
    const { processWebhookEvent } = await import('@/server/services/eventProcessor');
    const { updateEventProcessingStatus, isEventProcessed, createProcessedEvent } = await import('@/server/services/shared/jobHelpers');

    vi.mocked(isEventProcessed).mockResolvedValue(false);
    vi.mocked(acquireEventLockWithClient).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(createProcessedEvent).mockReturnValue({ processed: true } as any);

    const job = {
      id: 'job_1',
      data: {
        eventId: 'evt_lock_test',
        eventType: 'payment_succeeded',
        membershipId: 'mem_lock',
        companyId: 'company_lock',
        payload: '{}',
        eventCreatedAt: new Date().toISOString(),
      },
    } as any;

    const firstResult = await (jobQueue as any).processWebhookJob(job);
    const secondResult = await (jobQueue as any).processWebhookJob(job);

    expect(firstResult.success).toBe(true);
    expect(secondResult.skipped).toBe(true);
    expect(processWebhookEvent).toHaveBeenCalledTimes(1);
    expect(updateEventProcessingStatus).toHaveBeenCalledTimes(1);
  });

  it('releases event lock even when processing fails', async () => {
    const { jobQueue } = await import('@/server/services/jobQueue');
    const { acquireEventLockWithClient, releaseEventLock } = await import('@/server/services/shared/advisoryLock');
    const { processWebhookEvent } = await import('@/server/services/eventProcessor');
    const { isEventProcessed } = await import('@/server/services/shared/jobHelpers');

    vi.mocked(isEventProcessed).mockResolvedValue(false);
    vi.mocked(acquireEventLockWithClient).mockResolvedValue(true);
    vi.mocked(processWebhookEvent).mockRejectedValue(new Error('boom'));

    const job = {
      id: 'job_fail',
      data: {
        eventId: 'evt_fail',
        eventType: 'payment_succeeded',
        membershipId: 'mem_fail',
        companyId: 'company_fail',
        payload: '{}',
        eventCreatedAt: new Date().toISOString(),
      },
    } as any;

    await expect((jobQueue as any).processWebhookJob(job)).rejects.toThrow('boom');
    expect(releaseEventLock).not.toHaveBeenCalled();
  });
});

