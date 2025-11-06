// Test Helper Utilities for Job Queue Processing Tests
// Provides mocks, factories, and assertion helpers for all 5 features

import { vi, type MockedFunction } from 'vitest';
import type PgBoss from 'pg-boss';
import { JobData, WebhookJobResult, ReminderJobResult } from '@/server/services/shared/jobTypes';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { CircuitState } from '@/lib/circuitBreaker';
import type { JobExecutionMetrics } from '@/lib/jobQueueMetrics';
import type { DeadLetterJob } from '@/lib/deadLetterQueue';

// Mock PgBoss instance
export interface MockPgBossJob {
  id: string;
  name: string;
  data: any;
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  priority?: number;
  startAfter?: Date;
}

export class MockPgBoss {
  private jobs: Map<string, MockPgBossJob> = new Map();
  private singletonKeys: Set<string> = new Set();
  public send: MockedFunction<any>;
  public work: MockedFunction<any>;
  public start: MockedFunction<any>;
  public stop: MockedFunction<any>;

  constructor() {
    this.send = vi.fn().mockImplementation(async (name: string, data: any, options?: any) => {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Check singleton key
      if (options?.singletonKey) {
        if (this.singletonKeys.has(options.singletonKey)) {
          // Return existing job ID for duplicate singleton key
          const existingJob = Array.from(this.jobs.values()).find(
            j => j.singletonKey === options.singletonKey
          );
          if (existingJob) {
            return existingJob.id;
          }
        }
        this.singletonKeys.add(options.singletonKey);
      }

      const job: MockPgBossJob = {
        id: jobId,
        name,
        data,
        singletonKey: options?.singletonKey,
        retryLimit: options?.retryLimit,
        retryDelay: options?.retryDelay,
        priority: options?.priority,
        startAfter: options?.startAfter,
      };

      this.jobs.set(jobId, job);
      return jobId;
    });

    this.work = vi.fn().mockResolvedValue(undefined);
    this.start = vi.fn().mockResolvedValue(undefined);
    this.stop = vi.fn().mockResolvedValue(undefined);
  }

  getJob(jobId: string): MockPgBossJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): MockPgBossJob[] {
    return Array.from(this.jobs.values());
  }

  getJobsBySingletonKey(singletonKey: string): MockPgBossJob[] {
    return Array.from(this.jobs.values()).filter(j => j.singletonKey === singletonKey);
  }

  clear(): void {
    this.jobs.clear();
    this.singletonKeys.clear();
  }

  hasSingletonKey(key: string): boolean {
    return this.singletonKeys.has(key);
  }
}

// Job Data Factories
export const createTestJobData = (overrides?: Partial<JobData>): JobData => ({
  eventId: `evt_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  eventType: 'membership.created',
  membershipId: `mem_test_${Date.now()}`,
  payload: JSON.stringify({ test: 'data' }),
  companyId: `company_test_${Date.now()}`,
  eventCreatedAt: new Date().toISOString(),
  priority: 1,
  ...overrides,
});

export const createTestWebhookJobData = (eventId?: string, companyId?: string): JobData => {
  return createTestJobData({
    eventId: eventId || `evt_webhook_${Date.now()}`,
    eventType: 'payment_failed',
    companyId: companyId || `company_webhook_${Date.now()}`,
  });
};

export const createTestReminderJobData = (companyId?: string): { companyId: string } => ({
  companyId: companyId || `company_reminder_${Date.now()}`,
});

// Circuit Breaker Test Helpers
export interface MockCircuitBreaker {
  state: CircuitState;
  execute: MockedFunction<any>;
  getState: MockedFunction<any>;
  getMetrics: MockedFunction<any>;
  reset: MockedFunction<any>;
}

export const createMockCircuitBreaker = (initialState: CircuitState = CircuitState.CLOSED): MockCircuitBreaker => {
  const state = { value: initialState };
  
  return {
    get state() {
      return state.value;
    },
    execute: vi.fn().mockImplementation(async (operation: () => Promise<any>) => {
      if (state.value === CircuitState.OPEN) {
        throw new AppError(
          'Circuit breaker is OPEN',
          ErrorCode.SERVICE_UNAVAILABLE,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.MEDIUM,
          503
        );
      }
      try {
        const result = await operation();
        if (state.value === CircuitState.HALF_OPEN) {
          state.value = CircuitState.CLOSED;
        }
        return result;
      } catch (error) {
        // Simulate failure threshold logic
        throw error;
      }
    }),
    getState: vi.fn().mockReturnValue(state.value),
    getMetrics: vi.fn().mockReturnValue({
      state: state.value,
      requests: 0,
      successes: 0,
      failures: 0,
      failureRate: 0,
    }),
    reset: vi.fn().mockImplementation(() => {
      state.value = CircuitState.CLOSED;
    }),
  };
};

export const setCircuitBreakerState = (breaker: MockCircuitBreaker, state: CircuitState): void => {
  (breaker as any).state = { value: state };
};

// Dead Letter Queue Test Helpers
export const createMockDeadLetterJob = (overrides?: Partial<DeadLetterJob>): DeadLetterJob => ({
  id: `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  originalJobId: `job_${Date.now()}`,
  jobType: 'webhook-processing',
  jobData: { test: 'data' },
  failureReason: 'Max retries exceeded',
  errorMessage: 'Test error message',
  retryCount: 5,
  maxRetries: 5,
  firstFailedAt: new Date(),
  lastFailedAt: new Date(),
  priority: 0,
  companyId: `company_${Date.now()}`,
  recoveryAttempts: 0,
  autoRecoveryEnabled: true,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Metrics Test Helpers
export const createMockJobExecutionMetrics = (overrides?: Partial<JobExecutionMetrics>): JobExecutionMetrics => ({
  jobId: `job_${Date.now()}`,
  jobType: 'webhook-processing',
  companyId: `company_${Date.now()}`,
  status: 'completed',
  duration: 100,
  attempts: 1,
  ...overrides,
});

export const createMockMetricsService = () => {
  const recordedMetrics: JobExecutionMetrics[] = [];
  
  return {
    recordJobExecution: vi.fn().mockImplementation(async (metrics: JobExecutionMetrics) => {
      recordedMetrics.push(metrics);
    }),
    recordJobEnqueued: vi.fn().mockResolvedValue(undefined),
    recordJobError: vi.fn().mockResolvedValue(undefined),
    recordDeadLetterJob: vi.fn().mockResolvedValue(undefined),
    recordMemoryPressure: vi.fn().mockResolvedValue(undefined),
    getMetrics: vi.fn().mockReturnValue(recordedMetrics),
    clearMetrics: vi.fn().mockImplementation(() => {
      recordedMetrics.length = 0;
    }),
    getRecordedMetrics: () => [...recordedMetrics],
  };
};

// Dead Letter Queue Service Mock
export const createMockDeadLetterQueueService = () => {
  const jobs: DeadLetterJob[] = [];
  
  return {
    addJob: vi.fn().mockImplementation(async (
      originalJobId: string,
      jobType: string,
      jobData: any,
      error: Error,
      options?: any
    ) => {
      const dlqJob = createMockDeadLetterJob({
        originalJobId,
        jobType,
        jobData,
        failureReason: error.name,
        errorMessage: error.message,
        ...options,
      });
      jobs.push(dlqJob);
      return dlqJob.id;
    }),
    processJobs: vi.fn().mockResolvedValue({
      processed: 0,
      recovered: 0,
      failed: 0,
    }),
    getPendingJobs: vi.fn().mockResolvedValue([]),
    cleanup: vi.fn().mockResolvedValue({
      cleaned: 0,
      errors: [],
    }),
    getJobs: () => [...jobs],
    clearJobs: () => {
      jobs.length = 0;
    },
  };
};

// Database Mock Helpers
export const createMockDatabase = () => {
  const queries: Array<{ sql: string; params: any[] }> = [];
  
  return {
    query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
      queries.push({ sql, params: params || [] });
      return { rows: [], rowCount: 0 };
    }),
    select: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(1),
    getQueries: () => [...queries],
    clearQueries: () => {
      queries.length = 0;
    },
  };
};

// Logger Mock
export const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

// Assertion Helpers
export const assertSingletonKeyPrevention = (
  mockPgBoss: MockPgBoss,
  singletonKey: string,
  expectedJobCount: number = 1
) => {
  const jobsWithKey = mockPgBoss.getJobsBySingletonKey(singletonKey);
  expect(jobsWithKey.length).toBe(expectedJobCount);
  expect(mockPgBoss.hasSingletonKey(singletonKey)).toBe(true);
};

export const assertExponentialBackoff = (
  delays: number[],
  baseDelay: number,
  multiplier: number,
  maxDelay?: number
) => {
  delays.forEach((delay, index) => {
    const expectedDelay = Math.min(
      baseDelay * Math.pow(multiplier, index),
      maxDelay || Infinity
    );
    // Allow 10% tolerance for jitter
    expect(delay).toBeGreaterThanOrEqual(expectedDelay * 0.9);
    expect(delay).toBeLessThanOrEqual(expectedDelay * 1.1);
  });
};

export const assertCircuitBreakerState = (
  breaker: MockCircuitBreaker,
  expectedState: CircuitState
) => {
  expect(breaker.getState()).toBe(expectedState);
};

export const assertDeadLetterQueueJob = (
  dlqService: ReturnType<typeof createMockDeadLetterQueueService>,
  originalJobId: string,
  jobType: string
) => {
  const jobs = dlqService.getJobs();
  const job = jobs.find(j => j.originalJobId === originalJobId && j.jobType === jobType);
  expect(job).toBeDefined();
  expect(job?.retryCount).toBeGreaterThanOrEqual(job?.maxRetries || 0);
};

export const assertMetricsRecorded = (
  metricsService: ReturnType<typeof createMockMetricsService>,
  expectedCount: number,
  jobType?: string
) => {
  const metrics = metricsService.getRecordedMetrics();
  if (jobType) {
    const filtered = metrics.filter(m => m.jobType === jobType);
    expect(filtered.length).toBeGreaterThanOrEqual(expectedCount);
  } else {
    expect(metrics.length).toBeGreaterThanOrEqual(expectedCount);
  }
};

// Error Helpers
export const createRetryableError = (message: string = 'Retryable error'): AppError => {
  return new AppError(
    message,
    ErrorCode.INTERNAL_ERROR,
    ErrorCategory.SYSTEM,
    ErrorSeverity.MEDIUM,
    500,
    true // retryable
  );
};

export const createNonRetryableError = (message: string = 'Non-retryable error'): AppError => {
  return new AppError(
    message,
    ErrorCode.VALIDATION_ERROR,
    ErrorCategory.USER_ERROR,
    ErrorSeverity.HIGH,
    400,
    false // not retryable
  );
};

// Timing Helpers
export const wait = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const measureTime = async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
};

// Test Configuration Helpers
export const createTestJobQueueConfig = (overrides?: any) => ({
  maxConcurrentJobs: 10,
  batchSize: 5,
  retry: {
    baseDelayMs: 1000,
    maxDelayMs: 300000,
    maxAttempts: {
      'webhook-processing': 3,
      'reminder-processing': 2,
      'default': 3,
    },
    backoffMultiplier: 2,
    jitter: true,
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000,
    monitoringWindow: 300000,
  },
  deadLetterQueue: {
    enabled: true,
    maxRetries: 5,
    retentionDays: 30,
  },
  metrics: {
    enabled: true,
    retentionDays: 90,
  },
  memoryPressure: {
    enabled: true,
    thresholdMb: 512,
    checkIntervalMs: 30000,
  },
  ...overrides,
});

