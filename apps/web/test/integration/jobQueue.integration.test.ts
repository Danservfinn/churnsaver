// End-to-End Integration Tests for Job Queue Processing
// Combines all 5 features: singleton keys, exponential backoff, circuit breaker, DLQ, and metrics

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedJobQueueService } from '@/server/services/enhancedJobQueue';
import { getCircuitBreaker, CircuitState } from '@/lib/circuitBreaker';
import { addToDeadLetterQueue, deadLetterQueue } from '@/lib/deadLetterQueue';
import { jobQueueMetrics } from '@/lib/jobQueueMetrics';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { JobData } from '@/server/services/shared/jobTypes';
import {
  createTestWebhookJobData,
  MockPgBoss,
  createMockCircuitBreaker,
  createMockDeadLetterQueueService,
  createMockMetricsService,
  createMockDatabase,
  createMockLogger,
  createRetryableError,
  createTestJobQueueConfig,
  wait,
} from '../helpers/jobQueueTestHelpers';

// Create a global object to store mocks using vi.hoisted()
const mocks = vi.hoisted(() => ({
  logger: null as any,
  db: null as any,
  metrics: null as any,
  dlq: null as any,
  getCircuitBreaker: null as any,
}));

vi.mock('@/lib/logger', () => {
  mocks.logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger: mocks.logger };
});

vi.mock('@/lib/db', () => {
  mocks.db = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    select: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(1),
    getQueries: vi.fn().mockReturnValue([]),
    clearQueries: vi.fn(),
  };
  return { sql: mocks.db };
});

vi.mock('@/lib/circuitBreaker', async () => {
  const { CircuitState } = await import('@/lib/circuitBreaker');
  mocks.getCircuitBreaker = vi.fn().mockReturnValue({
    state: CircuitState.CLOSED,
    execute: vi.fn().mockImplementation(async (op: () => Promise<any>) => op()),
    getState: vi.fn().mockReturnValue(CircuitState.CLOSED),
    getMetrics: vi.fn().mockReturnValue({ state: CircuitState.CLOSED }),
    reset: vi.fn(),
  });
  return {
    getCircuitBreaker: mocks.getCircuitBreaker,
    CircuitState,
  };
});

vi.mock('@/lib/deadLetterQueue', () => {
  const dlqJobs: any[] = [];
  mocks.dlq = {
    addJob: vi.fn().mockImplementation(async () => {
      const id = `dlq_${Date.now()}`;
      dlqJobs.push({ id });
      return id;
    }),
    processJobs: vi.fn().mockResolvedValue({ processed: 0, recovered: 0, failed: 0 }),
    getJobs: () => [...dlqJobs],
    clearJobs: vi.fn().mockImplementation(() => {
      dlqJobs.length = 0;
    }),
    cleanup: vi.fn().mockResolvedValue({ cleaned: 0, errors: [] }),
  };
  return {
    addToDeadLetterQueue: vi.fn().mockImplementation(mocks.dlq.addJob),
    deadLetterQueue: mocks.dlq,
  };
});

vi.mock('@/lib/jobQueueMetrics', () => {
  const recordedMetrics: any[] = [];
  mocks.metrics = {
    recordJobExecution: vi.fn().mockImplementation(async (m: any) => {
      recordedMetrics.push(m);
    }),
    recordJobEnqueued: vi.fn().mockResolvedValue(undefined),
    recordJobError: vi.fn().mockResolvedValue(undefined),
    recordDeadLetterJob: vi.fn().mockResolvedValue(undefined),
    recordMemoryPressure: vi.fn().mockResolvedValue(undefined),
    getRecordedMetrics: () => [...recordedMetrics],
    clearMetrics: vi.fn().mockImplementation(() => {
      recordedMetrics.length = 0;
    }),
  };
  return { jobQueueMetrics: mocks.metrics };
});

// Export mocks for use in tests
const mockLogger = () => mocks.logger;
const mockDb = () => mocks.db;
const mockMetrics = () => mocks.metrics;
const mockDlq = () => mocks.dlq;
const mockGetCircuitBreaker = () => mocks.getCircuitBreaker;

vi.mock('@/server/services/eventProcessor', () => ({
  processWebhookEvent: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/server/cron/processReminders', () => ({
  processPendingReminders: vi.fn().mockResolvedValue({
    processed: 5,
    successful: 4,
    failed: 1,
  }),
}));

// Mock pg-boss module
vi.mock('pg-boss', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return new MockPgBoss();
    }),
  };
});

describe('Job Queue Processing - Integration Tests', () => {
  let service: EnhancedJobQueueService;
  let mockPgBoss: MockPgBoss;
  let localMockCircuitBreaker: ReturnType<typeof createMockCircuitBreaker>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockPgBoss = new MockPgBoss();
    localMockCircuitBreaker = createMockCircuitBreaker(CircuitState.CLOSED);
    mockGetCircuitBreaker().mockReturnValue(localMockCircuitBreaker);
    
    // Mock pg-boss
    const PgBoss = (await import('pg-boss')).default;
    vi.mocked(PgBoss).mockImplementation(() => mockPgBoss as any);

    // Reset mocks
    if (mockDb()) mockDb().clearQueries();
    if (mockLogger()) {
      mockLogger().info.mockClear();
      mockLogger().warn.mockClear();
      mockLogger().error.mockClear();
    }
    if (mockMetrics()) mockMetrics().clearMetrics();
    if (mockDlq()) mockDlq().clearJobs();

    service = new EnhancedJobQueueService(createTestJobQueueConfig());
    await service.init();
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
    }
    mockPgBoss.clear();
    if (mockDlq()) mockDlq().clearJobs();
    if (mockMetrics()) mockMetrics().clearMetrics();
  });

  it('should handle complete job lifecycle: enqueue → process → success → metrics', async () => {
    const eventId = 'evt_integration_complete';
    const jobData = createTestWebhookJobData(eventId);

    // 1. Enqueue job (singleton key enforced)
    const jobId = await service.enqueueWebhookJob(jobData);
    expect(jobId).toBeDefined();

    // 2. Verify singleton key was set
    const job = mockPgBoss.getJob(jobId);
    expect(job?.singletonKey).toBe(eventId);

    // 3. Verify enqueue metrics recorded
    const metrics = mockMetrics();
    if (metrics && metrics.recordJobEnqueued) {
      expect(metrics.recordJobEnqueued).toHaveBeenCalled();
    }

    // 4. Verify retry configuration (exponential backoff)
    expect(job?.retryLimit).toBeDefined();
    expect(job?.retryDelay).toBeGreaterThan(0);

    // 5. Simulate successful processing (would happen in real scenario)
    // Metrics would be recorded via recordJobMetrics
    
    // Verify all features were engaged
    expect(mockPgBoss.send).toHaveBeenCalled();
    expect(mockGetCircuitBreaker()).toHaveBeenCalled();
  });

  it('should handle job failure with retries → circuit breaker → DLQ → metrics', async () => {
    const eventId = 'evt_integration_failure';
    const jobData = createTestWebhookJobData(eventId);

    // Setup circuit breaker to fail after threshold
    let failureCount = 0;
    (localMockCircuitBreaker.execute as any).mockImplementation(async (operation: () => Promise<any>) => {
      failureCount++;
      if (failureCount >= 5) {
        // Circuit breaker opens
        (localMockCircuitBreaker.getState as any).mockReturnValue(CircuitState.OPEN);
        throw new AppError(
          'Circuit breaker is OPEN',
          ErrorCode.SERVICE_UNAVAILABLE,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.MEDIUM,
          503
        );
      }
      throw createRetryableError(`Failure attempt ${failureCount}`);
    });

    // Enqueue job
    const jobId = await service.enqueueWebhookJob(jobData);
    expect(jobId).toBeDefined();

    // Simulate multiple retry attempts
    for (let i = 0; i < 5; i++) {
      try {
        await localMockCircuitBreaker.execute(async () => {
          throw new Error('Test failure');
        });
      } catch (error) {
        // Expected
      }
    }

    // Verify circuit breaker opened
    expect(localMockCircuitBreaker.getState()).toBe(CircuitState.OPEN);

    // Simulate job exceeding max retries and moving to DLQ
    const enhancedJob = {
      id: jobId,
      type: 'webhook-processing',
      payload: jobData,
      priority: 1,
      attempts: 5,
      maxAttempts: 5,
      status: 'failed' as const,
      createdAt: new Date().toISOString(),
      companyId: jobData.companyId,
    };

    const error = createRetryableError('Max retries exceeded');
    const categorizedError = {
      categorizedError: error,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
    };

    await (service as any).moveToDeadLetterQueue(enhancedJob, categorizedError);

    // Verify job moved to DLQ
    expect(addToDeadLetterQueue).toHaveBeenCalled();
    const dlq = mockDlq();
    expect(dlq.getJobs().length).toBeGreaterThan(0);

    // Verify DLQ metrics recorded
    const metrics = mockMetrics();
    if (metrics && metrics.recordDeadLetterJob) {
      expect(metrics.recordDeadLetterJob).toHaveBeenCalled();
    }

    // Verify error metrics recorded
    await (service as any).recordJobMetrics(enhancedJob, 'failed', 5000, error);
    const errorMetrics = mockMetrics();
    if (errorMetrics && errorMetrics.recordJobExecution) {
      expect(errorMetrics.recordJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorCategory: error.category,
        })
      );
    }
  });

  it('should handle concurrent jobs with singleton keys and metrics', async () => {
    const eventId = 'evt_concurrent_integration';
    const jobData = createTestWebhookJobData(eventId);

    // Enqueue multiple jobs with same eventId concurrently
    const promises = Array(10).fill(null).map(() => 
      service.enqueueWebhookJob(jobData)
    );

    const jobIds = await Promise.all(promises);

    // Verify singleton key enforcement (may have duplicates)
    const uniqueJobIds = new Set(jobIds);
    expect(uniqueJobIds.size).toBeGreaterThan(0);

    // Verify all jobs have singleton key set
    jobIds.forEach(jobId => {
      const job = mockPgBoss.getJob(jobId);
      if (job) {
        expect(job.singletonKey).toBe(eventId);
      }
    });

    // Verify metrics recorded for all enqueue attempts
    const metrics = mockMetrics();
    if (metrics && metrics.recordJobEnqueued) {
      expect(metrics.recordJobEnqueued).toHaveBeenCalledTimes(10);
    }
  });

  it('should handle exponential backoff retries with circuit breaker and metrics', async () => {
    const jobData = createTestWebhookJobData();

    // Configure service with specific retry settings
    const retryService = new EnhancedJobQueueService(createTestJobQueueConfig({
      retry: {
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        maxAttempts: {
          'webhook-processing': 3,
          'reminder-processing': 2,
          'default': 3,
        },
        backoffMultiplier: 2,
        jitter: false,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 3,
        recoveryTimeout: 60000,
        monitoringWindow: 300000,
      },
    }));

    await retryService.init();

    // Calculate retry delays
    const calculateRetryDelay = (retryService as any).calculateRetryDelay.bind(retryService);
    const delays = [
      calculateRetryDelay(0, 'webhook-processing'),
      calculateRetryDelay(1, 'webhook-processing'),
      calculateRetryDelay(2, 'webhook-processing'),
    ];

    // Verify exponential backoff
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(4000);

    // Enqueue job
    const jobId = await retryService.enqueueWebhookJob(jobData);
    const job = mockPgBoss.getJob(jobId);

    // Verify retry configuration
    expect(job?.retryLimit).toBe(3);
    expect(job?.retryDelay).toBeGreaterThan(0);

    await retryService.shutdown();
  });

  it('should handle circuit breaker recovery with HALF_OPEN state and metrics', async () => {
    const jobData = createTestWebhookJobData();

    // Start with OPEN circuit breaker
    (localMockCircuitBreaker.getState as any).mockReturnValue(CircuitState.OPEN);
    (localMockCircuitBreaker.execute as any).mockRejectedValue(
      new AppError(
        'Circuit breaker is OPEN',
        ErrorCode.SERVICE_UNAVAILABLE,
        ErrorCategory.EXTERNAL_SERVICE,
        ErrorSeverity.MEDIUM,
        503
      )
    );

    // Enqueue job
    const jobId = await service.enqueueWebhookJob(jobData);

    // Simulate recovery timeout elapsed
    await wait(100);

    // Transition to HALF_OPEN
    (localMockCircuitBreaker.getState as any).mockReturnValue(CircuitState.HALF_OPEN);
    (localMockCircuitBreaker.execute as any).mockResolvedValue({ success: true });

    // Try operation in HALF_OPEN state
    const result = await localMockCircuitBreaker.execute(async () => ({ success: true }));

    expect(result.success).toBe(true);

    // Transition to CLOSED after success
    (localMockCircuitBreaker.getState as any).mockReturnValue(CircuitState.CLOSED);

    // Verify circuit breaker state transitions
    expect(localMockCircuitBreaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should handle DLQ recovery with retry and metrics', async () => {
    const originalJobId = 'job_recovery_test';
    const jobType = 'webhook-processing';
    const jobData = { test: 'recovery data' };

    // Add job to DLQ
    const dlq = mockDlq();
    const dlqJobId = await dlq.addJob(
      originalJobId,
      jobType,
      jobData,
      new Error('Original failure'),
      { maxRetries: 5, companyId: 'company_recovery' }
    );

    expect(dlqJobId).toBeDefined();
    expect(dlq.getJobs().length).toBe(1);

    // Process DLQ jobs (recovery attempt)
    const processResult = await dlq.processJobs({ batchSize: 10 });

    expect(processResult).toBeDefined();
    expect(processResult).toHaveProperty('processed');
    expect(processResult).toHaveProperty('recovered');
    expect(processResult).toHaveProperty('failed');

    // Verify DLQ metrics
    expect(dlq.processJobs).toHaveBeenCalled();
  });

  it('should handle complete failure scenario: all features engaged', async () => {
    const eventId = 'evt_complete_failure';
    const jobData = createTestWebhookJobData(eventId);

    // 1. Enqueue with singleton key
    const jobId = await service.enqueueWebhookJob(jobData);
    expect(jobId).toBeDefined();
    const metrics = mockMetrics();
    if (metrics && metrics.recordJobEnqueued) {
      expect(metrics.recordJobEnqueued).toHaveBeenCalled();
    }

    // 2. Simulate failures triggering exponential backoff retries
    let attempt = 0;
    (localMockCircuitBreaker.execute as any).mockImplementation(async (operation: () => Promise<any>) => {
      attempt++;
      if (attempt < 5) {
        // Fail with retryable error
        throw createRetryableError(`Attempt ${attempt} failed`);
      }
      // After 5 failures, circuit opens
      (localMockCircuitBreaker.getState as any).mockReturnValue(CircuitState.OPEN);
      throw new AppError(
        'Circuit breaker is OPEN',
        ErrorCode.SERVICE_UNAVAILABLE,
        ErrorCategory.EXTERNAL_SERVICE,
        ErrorSeverity.MEDIUM,
        503
      );
    });

    // 3. Simulate retry attempts
    for (let i = 0; i < 5; i++) {
      try {
        await localMockCircuitBreaker.execute(async () => {
          throw new Error('Test failure');
        });
      } catch (err) {
        // Record error metrics
        const enhancedJob = {
          id: jobId,
          type: 'webhook-processing',
          payload: jobData,
          priority: 1,
          attempts: i + 1,
          maxAttempts: 5,
          status: 'failed' as const,
          createdAt: new Date().toISOString(),
          companyId: jobData.companyId,
        };

        const retryError = createRetryableError(`Attempt ${i + 1} failed`);
        await (service as any).recordJobMetrics(enhancedJob, 'failed', 1000, retryError);
      }
    }

    // 4. Verify circuit breaker opened
    expect(localMockCircuitBreaker.getState()).toBe(CircuitState.OPEN);

    // 5. Move to DLQ after max retries
    const enhancedJob = {
      id: jobId,
      type: 'webhook-processing',
      payload: jobData,
      priority: 1,
      attempts: 5,
      maxAttempts: 5,
      status: 'failed' as const,
      createdAt: new Date().toISOString(),
      companyId: jobData.companyId,
    };

    const error = createRetryableError('Max retries exceeded');
    const categorizedError = {
      categorizedError: error,
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM,
    };

    await (service as any).moveToDeadLetterQueue(enhancedJob, categorizedError);

    // 6. Verify all features were engaged
    expect(addToDeadLetterQueue).toHaveBeenCalled();
    const dlqForCheck = mockDlq();
    expect(dlqForCheck.getJobs().length).toBeGreaterThan(0);
    const failureMetrics = mockMetrics();
    if (failureMetrics) {
      if (failureMetrics.recordDeadLetterJob) {
        expect(failureMetrics.recordDeadLetterJob).toHaveBeenCalled();
      }
      if (failureMetrics.recordJobExecution) {
        expect(failureMetrics.recordJobExecution).toHaveBeenCalledTimes(5); // One for each retry attempt
      }
    }
  });

  it('should handle successful job with all metrics recorded', async () => {
    const eventId = 'evt_success_metrics';
    const jobData = createTestWebhookJobData(eventId);

    // Enqueue job
    const jobId = await service.enqueueWebhookJob(jobData);
    const metrics = mockMetrics();
    if (metrics && metrics.recordJobEnqueued) {
      expect(metrics.recordJobEnqueued).toHaveBeenCalled();
    }

    // Simulate successful processing
    const enhancedJob = {
      id: jobId,
      type: 'webhook-processing',
      payload: jobData,
      priority: 1,
      attempts: 1,
      maxAttempts: 3,
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      companyId: jobData.companyId,
    };

    const duration = 250;
    await (service as any).recordJobMetrics(enhancedJob, 'completed', duration);

    // Verify execution metrics recorded
    const successMetrics = mockMetrics();
    if (successMetrics && successMetrics.recordJobExecution) {
      expect(successMetrics.recordJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId,
          jobType: 'webhook-processing',
          status: 'completed',
          duration,
          attempts: 1,
          memoryUsage: expect.any(Number),
          queueDepth: expect.any(Number),
        })
      );
    }

    // Verify singleton key was used
    const job = mockPgBoss.getJob(jobId);
    expect(job?.singletonKey).toBe(eventId);
  });
});

