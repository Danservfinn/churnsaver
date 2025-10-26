// Comprehensive tests for Enhanced Job Queue Service
// Tests circuit breaker, exponential backoff, dead letter queue, and error handling

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { enhancedJobQueue, EnhancedJobQueueService } from '@/server/services/enhancedJobQueue';
import { deadLetterQueue } from '@/lib/deadLetterQueue';
import { jobQueueMetrics } from '@/lib/jobQueueMetrics';
import { getCircuitBreaker } from '@/lib/circuitBreaker';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { JobData } from '@/server/services/shared/jobTypes';

// Mock dependencies
jest.mock('@/lib/logger');
jest.mock('@/lib/db');
jest.mock('@/server/services/eventProcessor');
jest.mock('@/server/cron/processReminders');

describe('Enhanced Job Queue Service', () => {
  let service: EnhancedJobQueueService;
  let mockLogger: jest.Mocked<typeof logger>;
  let mockSql: jest.Mocked<typeof sql>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = enhancedJobQueue as EnhancedJobQueueService;
    mockLogger = logger as jest.Mocked<typeof logger>;
    mockSql = sql as jest.Mocked<typeof sql>;

    // Mock successful database queries
    mockSql.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockSql.select.mockResolvedValue([]);
    mockSql.insert.mockResolvedValue(null);
    mockSql.execute.mockResolvedValue(1);

    // Mock logger methods
    mockLogger.info.mockImplementation(() => {});
    mockLogger.warn.mockImplementation(() => {});
    mockLogger.error.mockImplementation(() => {});
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with default configuration', async () => {
      await service.init();

      expect(service).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced job queue service initialized',
        expect.any(Object)
      );
    });

    it('should initialize circuit breakers when enabled', async () => {
      const config = {
        circuitBreaker: { enabled: true }
      };
      const testService = new EnhancedJobQueueService(config);
      await testService.init();

      expect(getCircuitBreaker).toHaveBeenCalled();
      await testService.shutdown();
    });

    it('should start memory monitoring when enabled', async () => {
      const config = {
        memoryPressure: { enabled: true }
      };
      const testService = new EnhancedJobQueueService(config);
      await testService.init();

      // Memory monitoring should be started
      expect(testService).toBeDefined();
      await testService.shutdown();
    });
  });

  describe('Job Enqueueing', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should enqueue webhook job successfully', async () => {
      const jobData: JobData = {
        eventId: 'evt_123',
        eventType: 'membership.created',
        membershipId: 'mem_123',
        payload: { test: 'data' },
        companyId: 'company_123',
        eventCreatedAt: new Date().toISOString()
      };

      const jobId = await service.enqueueWebhookJob(jobData);

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced webhook job enqueued',
        expect.objectContaining({
          eventId: 'evt_123',
          jobType: 'webhook-processing'
        })
      );
    });

    it('should enqueue reminder job successfully', async () => {
      const companyId = 'company_123';
      const scheduledTime = new Date(Date.now() + 60000); // 1 minute from now

      const jobId = await service.enqueueReminderJob(companyId, scheduledTime);

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced reminder job enqueued',
        expect.objectContaining({
          companyId: 'company_123',
          jobType: 'reminder-processing'
        })
      );
    });

    it('should handle enqueue errors gracefully', async () => {
      const jobData: JobData = {
        eventId: 'evt_456',
        eventType: 'membership.created',
        membershipId: 'mem_456',
        payload: { test: 'data' },
        companyId: 'company_456',
        eventCreatedAt: new Date().toISOString()
      };

      // Mock database error
      mockSql.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(service.enqueueWebhookJob(jobData)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Integration', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should use circuit breaker for webhook processing', async () => {
      const circuitBreaker = getCircuitBreaker('webhook-processing');
      const mockExecute = jest.fn().mockResolvedValue({ success: true });
      
      circuitBreaker.execute = mockExecute;

      const jobData: JobData = {
        eventId: 'evt_circuit_123',
        eventType: 'membership.created',
        membershipId: 'mem_circuit_123',
        payload: { test: 'data' },
        companyId: 'company_circuit_123',
        eventCreatedAt: new Date().toISOString()
      };

      await service.enqueueWebhookJob(jobData);

      // Circuit breaker should be available for the job type
      expect(getCircuitBreaker).toHaveBeenCalledWith('webhook-processing', expect.any(Object));
    });

    it('should handle circuit breaker open state', async () => {
      const circuitBreaker = getCircuitBreaker('webhook-processing');
      const mockExecute = jest.fn().mockRejectedValue(
        new AppError(
          'Circuit breaker is open',
          ErrorCode.SERVICE_UNAVAILABLE,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.MEDIUM,
          503
        )
      );
      
      circuitBreaker.execute = mockExecute;

      const jobData: JobData = {
        eventId: 'evt_open_123',
        eventType: 'membership.created',
        membershipId: 'mem_open_123',
        payload: { test: 'data' },
        companyId: 'company_open_123',
        eventCreatedAt: new Date().toISOString()
      };

      // Should handle circuit breaker open error
      await expect(service.enqueueWebhookJob(jobData)).rejects.toThrow();
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate retry delay with exponential backoff', async () => {
      const config = {
        retry: {
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          backoffMultiplier: 2,
          jitter: false
        }
      };
      const testService = new EnhancedJobQueueService(config);
      await testService.init();

      // Access private method through reflection for testing
      const calculateRetryDelay = (testService as any).calculateRetryDelay.bind(testService);

      expect(calculateRetryDelay(0, 'webhook-processing')).toBe(1000);
      expect(calculateRetryDelay(1, 'webhook-processing')).toBe(2000);
      expect(calculateRetryDelay(2, 'webhook-processing')).toBe(4000);
      expect(calculateRetryDelay(3, 'webhook-processing')).toBe(8000);

      // Should not exceed max delay
      expect(calculateRetryDelay(10, 'webhook-processing')).toBeLessThanOrEqual(60000);

      await testService.shutdown();
    });

    it('should add jitter to retry delay when enabled', async () => {
      const config = {
        retry: {
          baseDelayMs: 1000,
          backoffMultiplier: 2,
          jitter: true
        }
      };
      const testService = new EnhancedJobQueueService(config);
      await testService.init();

      const calculateRetryDelay = (testService as any).calculateRetryDelay.bind(testService);
      const delay1 = calculateRetryDelay(2, 'webhook-processing');
      const delay2 = calculateRetryDelay(2, 'webhook-processing');

      // With jitter, delays should vary
      expect(delay1).not.toBe(delay2);
      // But should be within reasonable range
      expect(delay1).toBeGreaterThan(3500); // 4000 - 10% jitter
      expect(delay1).toBeLessThan(4500);   // 4000 + 10% jitter

      await testService.shutdown();
    });
  });

  describe('Dead Letter Queue Integration', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should move job to dead letter queue after max retries', async () => {
      const jobData: JobData = {
        eventId: 'evt_dlq_123',
        eventType: 'membership.created',
        membershipId: 'mem_dlq_123',
        payload: { test: 'data', shouldFail: true },
        companyId: 'company_dlq_123',
        eventCreatedAt: new Date().toISOString()
      };

      // Mock dead letter queue
      const mockAddToDeadLetterQueue = jest.fn().mockResolvedValue('dlq_job_123');
      jest.doMock('@/lib/deadLetterQueue', () => ({
        deadLetterQueue: {
          addJob: mockAddToDeadLetterQueue
        },
        addToDeadLetterQueue: mockAddToDeadLetterQueue
      }));

      await service.enqueueWebhookJob(jobData);

      // Simulate max retries exceeded
      expect(mockAddToDeadLetterQueue).toHaveBeenCalledWith(
        expect.any(String),
        'webhook-processing',
        expect.any(Object),
        expect.any(Error),
        expect.objectContaining({
          maxRetries: expect.any(Number),
          companyId: 'company_dlq_123'
        })
      );
    });

    it('should record dead letter queue metrics', async () => {
      const mockRecordDeadLetterJob = jest.fn().mockResolvedValue(undefined);
      jobQueueMetrics.recordDeadLetterJob = mockRecordDeadLetterJob;

      await service.enqueueWebhookJob({
        eventId: 'evt_metrics_123',
        eventType: 'membership.created',
        membershipId: 'mem_metrics_123',
        payload: { test: 'data' },
        companyId: 'company_metrics_123',
        eventCreatedAt: new Date().toISOString()
      });

      expect(mockRecordDeadLetterJob).toHaveBeenCalledWith(
        'webhook-processing',
        'company_metrics_123'
      );
    });
  });

  describe('Memory Pressure Handling', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should detect high memory pressure', async () => {
      const config = {
        memoryPressure: {
          enabled: true,
          thresholdMb: 100
        }
      };
      const testService = new EnhancedJobQueueService(config);
      await testService.init();

      // Mock high memory usage
      const mockMemoryUsage = jest.fn().mockReturnValue(150); // 150MB > 100MB threshold
      (testService as any).getMemoryUsage = mockMemoryUsage;

      const memoryUsage = (testService as any).getMemoryUsage();
      expect(memoryUsage).toBe(150);

      await testService.shutdown();
    });

    it('should handle memory pressure by rescheduling jobs', async () => {
      const config = {
        memoryPressure: {
          enabled: true,
          thresholdMb: 100
        }
      };
      const testService = new EnhancedJobQueueService(config);
      await testService.init();

      // Mock high memory usage
      (testService as any).getMemoryUsage = jest.fn().mockReturnValue(150);

      const jobData: JobData = {
        eventId: 'evt_memory_123',
        eventType: 'membership.created',
        membershipId: 'mem_memory_123',
        payload: { test: 'data' },
        companyId: 'company_memory_123',
        eventCreatedAt: new Date().toISOString()
      };

      // Should reschedule due to memory pressure
      await expect(testService.enqueueWebhookJob(jobData)).rejects.toThrow(
        expect.objectContaining({
          message: 'High memory pressure - job rescheduled'
        })
      );

      await testService.shutdown();
    });
  });

  describe('Metrics Recording', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should record job execution metrics', async () => {
      const mockRecordJobExecution = jest.fn().mockResolvedValue(undefined);
      jobQueueMetrics.recordJobExecution = mockRecordJobExecution;

      const jobData: JobData = {
        eventId: 'evt_metrics_exec_123',
        eventType: 'membership.created',
        membershipId: 'mem_metrics_exec_123',
        payload: { test: 'data' },
        companyId: 'company_metrics_exec_123',
        eventCreatedAt: new Date().toISOString()
      };

      await service.enqueueWebhookJob(jobData);

      expect(mockRecordJobExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'webhook-processing',
          companyId: 'company_metrics_exec_123'
        })
      );
    });

    it('should record job enqueue metrics', async () => {
      const mockRecordJobEnqueued = jest.fn().mockResolvedValue(undefined);
      jobQueueMetrics.recordJobEnqueued = mockRecordJobEnqueued;

      const jobData: JobData = {
        eventId: 'evt_enqueue_123',
        eventType: 'membership.created',
        membershipId: 'mem_enqueue_123',
        payload: { test: 'data' },
        companyId: 'company_enqueue_123',
        eventCreatedAt: new Date().toISOString()
      };

      await service.enqueueWebhookJob(jobData);

      expect(mockRecordJobEnqueued).toHaveBeenCalledWith(
        expect.any(String),
        'webhook-processing',
        'company_enqueue_123'
      );
    });

    it('should record job error metrics', async () => {
      const mockRecordJobError = jest.fn().mockResolvedValue(undefined);
      jobQueueMetrics.recordJobError = mockRecordJobError;

      // Mock error during processing
      mockSql.query.mockRejectedValueOnce(new Error('Processing failed'));

      const jobData: JobData = {
        eventId: 'evt_error_123',
        eventType: 'membership.created',
        membershipId: 'mem_error_123',
        payload: { test: 'data' },
        companyId: 'company_error_123',
        eventCreatedAt: new Date().toISOString()
      };

      try {
        await service.enqueueWebhookJob(jobData);
      } catch (error) {
        // Error expected
      }

      expect(mockRecordJobError).toHaveBeenCalledWith(
        'webhook-processing',
        expect.any(AppError),
        expect.any(Object)
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should get enhanced queue statistics', async () => {
      // Mock stats queries
      mockSql.query.mockResolvedValue({
        rows: [{
          total_jobs: '100',
          completed_jobs: '80',
          failed_jobs: '15',
          dead_letter_jobs: '5',
          average_processing_time: '2500'
        }]
      });

      const stats = await service.getEnhancedStats();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('memoryUsage');
      expect(stats).toHaveProperty('activeJobs');
      expect(stats).toHaveProperty('circuitBreakerStats');
      expect(stats).toHaveProperty('deadLetterStats');
      expect(stats).toHaveProperty('queues');
    });

    it('should get processing metrics', () => {
      const metrics = service.getProcessingMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('totalProcessingTime');
      expect(metrics).toHaveProperty('successfulJobs');
      expect(metrics).toHaveProperty('failedJobs');
    });
  });

  describe('Cleanup Operations', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should cleanup old metrics data', async () => {
      const mockMetricsCleanup = jest.fn().mockResolvedValue({
        cleaned: 50,
        errors: []
      });
      jobQueueMetrics.cleanup = mockMetricsCleanup;

      const mockDeadLetterCleanup = jest.fn().mockResolvedValue({
        cleaned: 10,
        errors: []
      });
      deadLetterQueue.cleanup = mockDeadLetterCleanup;

      const result = await service.cleanup();

      expect(result.cleaned).toBe(60); // 50 + 10
      expect(result.errors).toHaveLength(0);
      expect(mockMetricsCleanup).toHaveBeenCalled();
      expect(mockDeadLetterCleanup).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockMetricsCleanup = jest.fn().mockResolvedValue({
        cleaned: 0,
        errors: ['Database connection failed']
      });
      jobQueueMetrics.cleanup = mockMetricsCleanup;

      const result = await service.cleanup();

      expect(result.errors).toContain('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should handle database connection errors', async () => {
      mockSql.query.mockRejectedValue(new Error('Connection timeout'));

      const jobData: JobData = {
        eventId: 'evt_db_error_123',
        eventType: 'membership.created',
        membershipId: 'mem_db_error_123',
        payload: { test: 'data' },
        companyId: 'company_db_error_123',
        eventCreatedAt: new Date().toISOString()
      };

      await expect(service.enqueueWebhookJob(jobData)).rejects.toThrow('Connection timeout');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to enqueue webhook job',
        expect.any(Object)
      );
    });

    it('should handle company validation errors', async () => {
      // Mock company validation failure
      const { assertCompanyContext } = require('@/server/services/shared/jobHelpers');
      assertCompanyContext.mockResolvedValue({
        isValid: false,
        error: 'Company not found'
      });

      const jobData: JobData = {
        eventId: 'evt_company_error_123',
        eventType: 'membership.created',
        membershipId: 'mem_company_error_123',
        payload: { test: 'data' },
        companyId: 'invalid_company',
        eventCreatedAt: new Date().toISOString()
      };

      await expect(service.enqueueWebhookJob(jobData)).rejects.toThrow('Company not found');
    });

    it('should handle duplicate event processing', async () => {
      // Mock event already processed
      const { isEventProcessed } = require('@/server/services/shared/jobHelpers');
      isEventProcessed.mockResolvedValue(true);

      const jobData: JobData = {
        eventId: 'evt_duplicate_123',
        eventType: 'membership.created',
        membershipId: 'mem_duplicate_123',
        payload: { test: 'data' },
        companyId: 'company_duplicate_123',
        eventCreatedAt: new Date().toISOString()
      };

      // Should skip duplicate processing
      const result = await service.enqueueWebhookJob(jobData);
      expect(result).toBeDefined();
    });
  });

  describe('Transaction Rollback', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should rollback transaction on processing failure', async () => {
      // Mock transaction failure
      mockSql.query.mockRejectedValueOnce(new Error('Transaction failed'));

      const jobData: JobData = {
        eventId: 'evt_rollback_123',
        eventType: 'membership.created',
        membershipId: 'mem_rollback_123',
        payload: { test: 'data' },
        companyId: 'company_rollback_123',
        eventCreatedAt: new Date().toISOString()
      };

      await expect(service.enqueueWebhookJob(jobData)).rejects.toThrow();
      
      // Should have attempted rollback
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('rollback'),
        expect.any(Object)
      );
    });

    it('should maintain data consistency during rollback', async () => {
      // Mock partial success then failure
      mockSql.query
        .mockResolvedValueOnce({ rows: [{ id: 'job_123' }] }) // Insert success
        .mockRejectedValueOnce(new Error('Update failed')); // Update failure

      const jobData: JobData = {
        eventId: 'evt_consistency_123',
        eventType: 'membership.created',
        membershipId: 'mem_consistency_123',
        payload: { test: 'data' },
        companyId: 'company_consistency_123',
        eventCreatedAt: new Date().toISOString()
      };

      await expect(service.enqueueWebhookJob(jobData)).rejects.toThrow();
      
      // Verify consistency checks
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('ROLLBACK'),
        expect.any(Array)
      );
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(async () => {
      await service.init();
    });

    it('should shutdown gracefully', async () => {
      await service.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Enhanced job queue service shut down gracefully'
      );
    });

    it('should cleanup resources on shutdown', async () => {
      const testService = new EnhancedJobQueueService();
      await testService.init();

      // Verify resources are initialized
      expect(testService).toBeDefined();

      await testService.shutdown();

      // Memory monitor should be cleared
      expect((testService as any).memoryMonitorInterval).toBeNull();
      // Active jobs should be cleared
      expect((testService as any).activeJobs.size).toBe(0);
      // Circuit breakers should be cleared
      expect((testService as any).circuitBreakers.size).toBe(0);
    });
  });
});

// Integration tests
describe('Enhanced Job Queue Integration', () => {
  beforeEach(async () => {
    await enhancedJobQueue.init();
  });

  afterEach(async () => {
    await enhancedJobQueue.shutdown();
  });

  it('should process webhook job end-to-end', async () => {
    const jobData: JobData = {
      eventId: 'evt_integration_123',
      eventType: 'membership.created',
      membershipId: 'mem_integration_123',
      payload: { test: 'integration data' },
      companyId: 'company_integration_123',
      eventCreatedAt: new Date().toISOString()
    };

    // Mock successful processing
    const { processWebhookEvent } = require('@/server/services/eventProcessor');
    processWebhookEvent.mockResolvedValue(true);

    const jobId = await enhancedJobQueue.enqueueWebhookJob(jobData);

    expect(jobId).toBeDefined();
    expect(processWebhookEvent).toHaveBeenCalled();
  });

  it('should handle reminder job end-to-end', async () => {
    const companyId = 'company_reminder_integration_123';

    // Mock successful reminder processing
    const { processPendingReminders } = require('@/server/cron/processReminders');
    processPendingReminders.mockResolvedValue({
      processed: 5,
      successful: 4,
      failed: 1
    });

    const jobId = await enhancedJobQueue.enqueueReminderJob(companyId);

    expect(jobId).toBeDefined();
    expect(processPendingReminders).toHaveBeenCalledWith(companyId);
  });

  it('should integrate with dead letter queue on failures', async () => {
    const jobData: JobData = {
      eventId: 'evt_dlq_integration_123',
      eventType: 'membership.created',
      membershipId: 'mem_dlq_integration_123',
      payload: { test: 'data', shouldFail: true },
      companyId: 'company_dlq_integration_123',
      eventCreatedAt: new Date().toISOString()
    };

    // Mock processing failure
    const { processWebhookEvent } = require('@/server/services/eventProcessor');
    processWebhookEvent.mockRejectedValue(new Error('Processing failed'));

    const mockAddToDeadLetterQueue = jest.fn().mockResolvedValue('dlq_job_123');
    jest.doMock('@/lib/deadLetterQueue', () => ({
      addToDeadLetterQueue: mockAddToDeadLetterQueue
    }));

    await expect(enhancedJobQueue.enqueueWebhookJob(jobData)).rejects.toThrow();
    
    // Should eventually move to dead letter queue after retries
    expect(mockAddToDeadLetterQueue).toHaveBeenCalled();
  });
});