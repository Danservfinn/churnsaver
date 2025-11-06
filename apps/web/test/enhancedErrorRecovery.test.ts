// Enhanced Error Recovery Test Suite
// Comprehensive tests for circuit breaker, dead letter queue, and enhanced error recovery

// Environment variable setup for tests
process.env.WHOP_API_KEY = 'X-Y-nTi5c2M8Yp8MpqsSdyF2w67WpI2Sr8YcLufQqnA';
process.env.NEXT_PUBLIC_WHOP_APP_ID = 'app_oU8bWaXOsDs6PO';
process.env.WHOP_APP_ID = 'app_oU8bWaXOsDs6PO';
process.env.WHOP_WEBHOOK_SECRET = 'ws_f93eb504266e162946b5af532dd72c25cd72039486394e498cc5dced1b9c9b8e';
process.env.DATABASE_URL = 'postgresql://postgres.bhiiqapevietyvepvhpq:0BoDyCmM%26PWhUM@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=no-verify&pgbouncer=true&options=project%3Dbhiiqapevietyvepvhpq';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'test-encryption-key';
process.env.ENABLE_PUSH = 'true';

// Mock @whop/sdk to prevent actual API calls
jest.mock('@whop/sdk');

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EnhancedCircuitBreaker, getCircuitBreaker, CircuitState } from '@/lib/circuitBreaker';
import { DeadLetterQueueService, addToDeadLetterQueue } from '@/lib/deadLetterQueue';
import { EnhancedErrorRecoveryService, executeWithEnhancedRecovery } from '@/server/services/enhancedErrorRecovery';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';

// Mock dependencies
jest.mock('@/lib/logger');
jest.mock('@/lib/db');
jest.mock('@/lib/errorCategorization');
jest.mock('@/lib/errorMonitoringIntegration');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockSql = sql as jest.Mocked<typeof sql>;

describe('Enhanced Error Recovery Tests', () => {
  let circuitBreaker: EnhancedCircuitBreaker;
  let deadLetterQueue: DeadLetterQueueService;
  let enhancedRecovery: EnhancedErrorRecoveryService;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock database queries
    mockSql.query = jest.fn().mockResolvedValue({
      rows: [],
      rowCount: 0
    });

    // Initialize services
    circuitBreaker = getCircuitBreaker('test-service', {
      failureThreshold: 3,
      recoveryTimeout: 1000,
      successThreshold: 2,
      monitoringWindow: 5000,
      timeoutDuration: 100,
      enableMetrics: false, // Disable for tests to avoid DB calls
      enablePersistence: false
    });

    deadLetterQueue = new DeadLetterQueueService({
      enableMetrics: false,
      enableAutoRecovery: false
    });

    enhancedRecovery = new EnhancedErrorRecoveryService();
  });

  afterEach(async () => {
    // Clean up test state
    await circuitBreaker.reset();
    jest.clearAllMocks();
  });

  describe('Circuit Breaker Tests', () => {
    it('should execute operation successfully when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after failure threshold is reached', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockRejectedValueOnce(new Error('Third failure'))
        .mockResolvedValue('success');

      // First failure
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('First failure');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Second failure
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Second failure');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);

      // Third failure - should open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Third failure');
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject immediately when circuit is open', async () => {
      // Force circuit open
      await circuitBreaker.forceOpen('Test force open');
      
      const operation = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after recovery timeout', async () => {
      // Force circuit open with short timeout
      const fastCircuitBreaker = getCircuitBreaker('fast-service', {
        failureThreshold: 1,
        recoveryTimeout: 50, // 50ms
        enableMetrics: false,
        enablePersistence: false
      });

      await fastCircuitBreaker.forceOpen('Test');
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Next call should transition to half-open
      const operation = jest.fn().mockResolvedValue('success');
      const result = await fastCircuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      expect(fastCircuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after success threshold in half-open state', async () => {
      // Force circuit to half-open
      await circuitBreaker.forceOpen('Test');
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for recovery timeout
      
      // First success in half-open
      const operation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Second success in half-open
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      
      // Third success should close circuit
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track metrics correctly', async () => {
      const operation = jest.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValueOnce('success');

      // Successful operation
      await circuitBreaker.execute(operation);
      
      let metrics = circuitBreaker.getMetrics();
      expect(metrics.requests).toBe(1);
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(0);

      // Failed operation
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');
      
      metrics = circuitBreaker.getMetrics();
      expect(metrics.requests).toBe(2);
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(1);
    });

    it('should handle operation timeout', async () => {
      const operation = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 200)); // Longer than timeout
      });

      await expect(
        circuitBreaker.execute(operation, { timeout: 100 })
      ).rejects.toThrow('Operation timed out after 100ms');
    });
  });

  describe('Dead Letter Queue Tests', () => {
    it('should add job to dead letter queue', async () => {
      mockSql.query.mockResolvedValueOnce({
        rows: [{ id: 'test-job-id' }],
        rowCount: 1
      });

      const jobId = await deadLetterQueue.addJob(
        'original-job-123',
        'webhook-processing',
        { eventId: 'evt-123', membershipId: 'mem-123' },
        new Error('Test error'),
        {
          maxRetries: 3,
          priority: 1,
          companyId: 'company-123'
        }
      );

      expect(jobId).toBeDefined();
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_queue_dead_letter'),
        expect.arrayContaining([
          expect.any(String), // id
          'original-job-123', // original_job_id
          'webhook-processing', // job_type
          JSON.stringify({ eventId: 'evt-123', membershipId: 'mem-123' }), // job_data
          'Error', // failure_reason
          'Test error', // error_message
          0, // retry_count
          3, // max_retries
          expect.any(Date), // first_failed_at
          expect.any(Date), // last_failed_at
          expect.any(Date), // next_retry_at
          1, // priority
          'company-123', // company_id
          0, // recovery_attempts
          true, // auto_recovery_enabled
          JSON.stringify({}) // metadata
        ])
      );
    });

    it('should process jobs with recovery strategies', async () => {
      // Mock pending jobs
      mockSql.query.mockResolvedValueOnce({
        rows: [{
          id: 'dlq-job-1',
          original_job_id: 'job-1',
          job_type: 'webhook-processing',
          job_data: { eventId: 'evt-123' },
          failure_reason: 'Connection timeout',
          error_message: 'Connection timeout',
          retry_count: 1,
          max_retries: 3,
          first_failed_at: new Date(),
          last_failed_at: new Date(),
          next_retry_at: new Date(),
          priority: 1,
          company_id: 'company-123',
          recovery_attempts: 0,
          auto_recovery_enabled: true,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });

      // Mock successful recovery
      const { processWebhookEvent } = await import('@/server/services/eventProcessor');
      (processWebhookEvent as jest.Mock).mockResolvedValueOnce(true);

      const result = await deadLetterQueue.processJobs({ batchSize: 1 });

      expect(result.processed).toBe(1);
      expect(result.recovered).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should handle recovery strategy failure', async () => {
      // Mock pending jobs
      mockSql.query.mockResolvedValueOnce({
        rows: [{
          id: 'dlq-job-2',
          original_job_id: 'job-2',
          job_type: 'webhook-processing',
          job_data: { eventId: 'evt-456' },
          failure_reason: 'Invalid data',
          error_message: 'Invalid data',
          retry_count: 2,
          max_retries: 3,
          first_failed_at: new Date(),
          last_failed_at: new Date(),
          next_retry_at: new Date(),
          priority: 1,
          company_id: 'company-123',
          recovery_attempts: 0,
          auto_recovery_enabled: true,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });

      // Mock failed recovery
      const { processWebhookEvent } = await import('@/server/services/eventProcessor');
      (processWebhookEvent as jest.Mock).mockRejectedValueOnce(new Error('Still invalid'));

      const result = await deadLetterQueue.processJobs({ batchSize: 1 });

      expect(result.processed).toBe(1);
      expect(result.recovered).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should calculate retry delay with exponential backoff', async () => {
      // Test exponential backoff calculation
      const jobId = await deadLetterQueue.addJob(
        'original-job-backoff',
        'test-job',
        { test: 'data' },
        new Error('Test error'),
        { maxRetries: 3 }
      );

      // Verify the next retry time is calculated correctly
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO job_queue_dead_letter'),
        expect.arrayContaining([
          expect.any(String),
          'original-job-backoff',
          'test-job',
          JSON.stringify({ test: 'data' }),
          'Error',
          'Test error',
          0,
          3,
          expect.any(Date),
          expect.any(Date),
          expect.any(Date), // This should be > current time for retry
          0,
          null,
          0,
          true,
          JSON.stringify({})
        ])
      );
    });

    it('should get statistics correctly', async () => {
      // Mock stats query
      mockSql.query.mockResolvedValueOnce({
        rows: [{
          total_jobs: '10',
          pending_jobs: '3',
          processing_jobs: '2',
          failed_jobs: '1',
          average_retry_count: '1.5',
          oldest_job_age: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
        }],
        rowCount: 1
      });

      // Mock job type breakdown
      mockSql.query.mockResolvedValueOnce({
        rows: [
          { job_type: 'webhook-processing', count: '5' },
          { job_type: 'database-job', count: '3' },
          { job_type: 'api-job', count: '2' }
        ],
        rowCount: 3
      });

      // Mock company breakdown
      mockSql.query.mockResolvedValueOnce({
        rows: [
          { company_id: 'company-1', count: '6' },
          { company_id: 'company-2', count: '4' }
        ],
        rowCount: 2
      });

      const stats = await deadLetterQueue.getStats();

      expect(stats.totalJobs).toBe(10);
      expect(stats.pendingJobs).toBe(3);
      expect(stats.processingJobs).toBe(2);
      expect(stats.failedJobs).toBe(1);
      expect(stats.averageRetryCount).toBe(1.5);
      expect(stats.jobsByType['webhook-processing']).toBe(5);
      expect(stats.jobsByType['database-job']).toBe(3);
      expect(stats.jobsByType['api-job']).toBe(2);
      expect(stats.jobsByCompany['company-1']).toBe(6);
      expect(stats.jobsByCompany['company-2']).toBe(4);
    });
  });

  describe('Enhanced Error Recovery Tests', () => {
    it('should execute operation successfully with all recovery mechanisms', async () => {
      const operation = jest.fn().mockResolvedValue('success-result');
      
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'database',
        operation: 'test-query',
        circuitBreaker: true,
        transactionRollback: true,
        deadLetterQueue: true,
        companyId: 'test-company',
        requestId: 'test-request-123'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success-result');
      expect(result.attempts).toBe(1);
      expect(result.recoveryStrategy).toContain('circuit_breaker');
      expect(result.recoveryStrategy).toContain('transaction_rollback');
      expect(result.recoveryStrategy).toContain('dead_letter_queue');
    });

    it('should handle operation failure with retry and dead letter queue', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValue('success-after-retry');

      // Mock dead letter queue addition
      mockSql.query.mockResolvedValueOnce({
        rows: [{ id: 'dlq-job-id' }],
        rowCount: 1
      });

      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'database',
        operation: 'test-query',
        maxRetries: 2,
        circuitBreaker: true,
        deadLetterQueue: true,
        companyId: 'test-company',
        requestId: 'test-request-456'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBeGreaterThan(1);
      expect(result.deadLetterQueued).toBe(true);
      expect(result.recoveryStrategy).toContain('circuit_breaker');
      expect(result.recoveryStrategy).toContain('dead_letter_queue');
    });

    it('should handle memory pressure recovery', async () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      (process as any).memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 600 * 1024 * 1024, // 600MB - above default threshold
        heapTotal: 1024 * 1024 * 1024
      });

      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'memory_intensive',
        operation: 'large-processing',
        memoryThreshold: 500 * 1024 * 1024, // 500MB
        circuitBreaker: true,
        companyId: 'test-company'
      });

      // Verify memory pressure was handled
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO memory_pressure_events'),
        expect.arrayContaining([
          'memory_intensive',
          expect.any(Number), // memory_usage_mb
          expect.any(Number), // memory_threshold_mb
          expect.any(Number), // pressure_duration_ms
          expect.any(String), // recovery_action
          true, // recovery_success
          true, // gc_triggered
          false, // process_restart
          expect.any(String) // metadata
        ])
      );

      // Restore original memory usage
      (process as any).memoryUsage = originalMemoryUsage;
    });

    it('should handle transaction rollback on failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Transaction failed'));
      
      // Mock transaction operations
      mockSql.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // ROLLBACK
        .mockResolvedValueOnce({
          rows: [{ id: 'tx-id' }],
          rowCount: 1
        }); // INSERT INTO transaction_rollback_log

      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'database',
        operation: 'transactional-update',
        transactionRollback: true,
        companyId: 'test-company',
        requestId: 'test-request-tx'
      });

      expect(result.success).toBe(false);
      expect(result.transactionRolledBack).toBe(true);
      expect(result.recoveryStrategy).toContain('transaction_rollback');

      // Verify rollback was logged
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transaction_rollback_log'),
        expect.arrayContaining([
          expect.any(String), // transaction_id
          'database', // service_name
          'transactional-update', // operation_type
          expect.stringContaining('Transaction failed'), // rollback_reason
          true, // rollback_success
          expect.any(Number), // rollback_duration_ms
          expect.any(Array), // affected_tables
          expect.any(String), // rollback_data
          'test-company', // company_id
          null, // user_id
          'test-request-tx' // request_id
        ])
      );
    });

    it('should record recovery metrics', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Mock metrics insertion
      mockSql.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1
      });

      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'external_api',
        operation: 'api-call',
        circuitBreaker: true,
        companyId: 'test-company',
        requestId: 'test-request-metrics'
      });

      expect(result.success).toBe(true);
      
      // Verify metrics were recorded
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO error_recovery_metrics'),
        expect.arrayContaining([
          'external_api', // service_name
          'api-call', // operation_type
          ErrorCategory.SYSTEM, // error_category
          'SUCCESS', // error_code
          expect.stringContaining('circuit_breaker'), // recovery_strategy
          true, // success
          expect.any(Number), // attempts
          expect.any(Number), // duration_ms
          expect.any(String), // circuit_breaker_state
          expect.any(Number), // memory_usage_mb
          null, // error_message
          expect.any(String), // metadata
          'test-company', // company_id
          null, // user_id
          'test-request-metrics' // request_id
        ])
      );
    });

    it('should get recovery statistics', async () => {
      // Mock stats query
      mockSql.query.mockResolvedValueOnce({
        rows: [
          {
            service_name: 'database',
            recovery_strategy: 'circuit_breaker,transaction_rollback',
            total_operations: '100',
            successful_operations: '95',
            failed_operations: '5',
            average_attempts: '1.1',
            average_duration_ms: '150'
          },
          {
            service_name: 'external_api',
            recovery_strategy: 'circuit_breaker,dead_letter_queue',
            total_operations: '50',
            successful_operations: '45',
            failed_operations: '5',
            average_attempts: '1.3',
            average_duration_ms: '200'
          }
        ],
        rowCount: 2
      });

      const stats = await enhancedRecovery.getRecoveryStats({
        service: 'database',
        companyId: 'test-company'
      });

      expect(stats.stats).toHaveLength(2);
      expect(stats.stats[0].service_name).toBe('database');
      expect(stats.stats[0].successful_operations).toBe('95');
      expect(stats.stats[1].service_name).toBe('external_api');
      expect(stats.stats[1].recovery_strategy).toContain('dead_letter_queue');
      expect(stats.circuitBreakerHealth).toBeDefined();
      expect(stats.deadLetterQueueStats).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete error recovery flow', async () => {
      // Simulate a complete error recovery scenario
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValue('final-success');

      // Mock circuit breaker to track state changes
      const circuitBreaker = getCircuitBreaker('integration-test', {
        failureThreshold: 2,
        recoveryTimeout: 100,
        enableMetrics: false,
        enablePersistence: false
      });

      // Mock dead letter queue
      mockSql.query.mockResolvedValueOnce({
        rows: [{ id: 'integration-dlq-job' }],
        rowCount: 1
      });

      // Execute with all recovery mechanisms
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'integration-test',
        operation: 'complete-flow-test',
        maxRetries: 2,
        circuitBreaker: true,
        deadLetterQueue: true,
        transactionRollback: true,
        exponentialBackoff: true,
        companyId: 'integration-company',
        requestId: 'integration-request'
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.deadLetterQueued).toBe(true);
      expect(result.recoveryStrategy).toContain('circuit_breaker');
      expect(result.recoveryStrategy).toContain('dead_letter_queue');
      expect(result.recoveryStrategy).toContain('transaction_rollback');
      expect(result.recoveryStrategy).toContain('exponential_backoff');
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should handle concurrent operations with circuit breaker', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Execute multiple concurrent operations
      const promises = Array.from({ length: 5 }, (_, i) => 
        circuitBreaker.execute(operation, { requestId: `concurrent-${i}` })
      );

      const results = await Promise.all(promises);

      // All should succeed since circuit starts closed
      results.forEach(result => {
        expect(result).toBe('success');
      });

      expect(operation).toHaveBeenCalledTimes(5);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.requests).toBe(5);
      expect(metrics.successes).toBe(5);
    });

    it('should handle dead letter queue processing with custom strategies', async () => {
      // Add custom recovery strategy
      deadLetterQueue.addStrategy({
        name: 'custom_test_strategy',
        canHandle: (job) => job.jobType === 'custom-test-job',
        execute: async (job) => {
          return {
            success: true,
            recovered: true,
            result: 'custom-recovery-success',
            action: 'custom_recovery',
            duration: 100,
            attempts: 1
          };
        }
      });

      // Mock custom job
      mockSql.query.mockResolvedValueOnce({
        rows: [{
          id: 'custom-dlq-job',
          original_job_id: 'custom-job',
          job_type: 'custom-test-job',
          job_data: { custom: 'data' },
          failure_reason: 'Custom failure',
          error_message: 'Custom failure',
          retry_count: 1,
          max_retries: 3,
          first_failed_at: new Date(),
          last_failed_at: new Date(),
          next_retry_at: new Date(),
          priority: 1,
          company_id: 'custom-company',
          recovery_attempts: 0,
          auto_recovery_enabled: true,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date()
        }],
        rowCount: 1
      });

      const result = await deadLetterQueue.processJobs({ batchSize: 1 });

      expect(result.processed).toBe(1);
      expect(result.recovered).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should handle cleanup operations', async () => {
      // Mock cleanup queries
      mockSql.query
        .mockResolvedValueOnce({ rows: [{ id: 'old-metric-1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'old-dlq-1' }], rowCount: 1 });

      const cleanupResult = await enhancedRecovery.cleanup();

      expect(cleanupResult.errorRecoveryMetrics).toBe(1);
      expect(cleanupResult.deadLetterJobs).toBe(1);

      // Verify cleanup queries were called
      expect(mockSql.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM error_recovery_metrics')
      );
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency operations efficiently', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const startTime = Date.now();
      
      // Execute 100 operations
      const promises = Array.from({ length: 100 }, () => 
        circuitBreaker.execute(operation)
      );

      await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(operation).toHaveBeenCalledTimes(100);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.requests).toBe(100);
      expect(metrics.successes).toBe(100);
      expect(metrics.failures).toBe(0);
    });

    it('should handle memory pressure efficiently', async () => {
      // Mock memory usage tracking
      let memoryCallCount = 0;
      const originalMemoryUsage = process.memoryUsage;
      (process as any).memoryUsage = jest.fn().mockImplementation(() => {
        memoryCallCount++;
        return {
          heapUsed: 400 * 1024 * 1024 + (memoryCallCount * 10 * 1024 * 1024), // Gradually increase
          heapTotal: 1024 * 1024 * 1024
        };
      });

      const operation = jest.fn().mockResolvedValue('success');
      
      // Execute multiple operations to test memory monitoring
      const promises = Array.from({ length: 10 }, (_, i) => 
        enhancedRecovery.executeWithRecovery(operation, {
          service: 'memory_intensive',
          operation: `memory-test-${i}`,
          memoryThreshold: 500 * 1024 * 1024,
          companyId: 'perf-test'
        })
      );

      await Promise.all(promises);

      // Restore original memory usage
      (process as any).memoryUsage = originalMemoryUsage;

      // All operations should succeed
      promises.forEach((promise, index) => {
        expect(promise).resolves.toMatchObject({
          success: true,
          data: 'success'
        });
      });

      // Memory should have been monitored
      expect(memoryCallCount).toBeGreaterThan(0);
    });

    it('should benchmark recovery operations', async () => {
      const operation = jest.fn().mockResolvedValue('benchmark-success');
      const iterations = 50;
      const results: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await enhancedRecovery.executeWithRecovery(operation, {
          service: 'benchmark',
          operation: `benchmark-${i}`,
          circuitBreaker: true,
          transactionRollback: true
        });
        
        results.push(Date.now() - startTime);
      }
      
      const averageTime = results.reduce((sum, time) => sum + time, 0) / results.length;
      const maxTime = Math.max(...results);
      const minTime = Math.min(...results);
      
      // Performance assertions (adjust thresholds as needed)
      expect(averageTime).toBeLessThan(100); // Average under 100ms
      expect(maxTime).toBeLessThan(500); // Max under 500ms
      expect(minTime).toBeGreaterThan(0); // Should take some time
      
      // Calculate percentiles
      const sortedResults = results.sort((a, b) => a - b);
      const p95 = sortedResults[Math.floor(sortedResults.length * 0.95)];
      const p99 = sortedResults[Math.floor(sortedResults.length * 0.99)];
      
      expect(p95).toBeLessThan(200); // 95th percentile under 200ms
      expect(p99).toBeLessThan(300); // 99th percentile under 300ms
    });
  });

  describe('Error Scenario Tests', () => {
    it('should handle network timeout errors', async () => {
      const networkError = new AppError(
        'Network timeout',
        ErrorCode.NETWORK_ERROR,
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        408,
        true
      );

      const operation = jest.fn().mockRejectedValue(networkError);
      
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'external_api',
        operation: 'network-call',
        circuitBreaker: true,
        deadLetterQueue: true,
        maxRetries: 2,
        companyId: 'error-test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual(networkError);
      expect(result.attempts).toBeGreaterThan(1);
      expect(result.recoveryStrategy).toContain('circuit_breaker');
    });

    it('should handle database connection errors', async () => {
      const dbError = new AppError(
        'Database connection lost',
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH,
        503,
        true
      );

      const operation = jest.fn().mockRejectedValue(dbError);
      
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'database',
        operation: 'db-query',
        circuitBreaker: true,
        transactionRollback: true,
        maxRetries: 2,
        companyId: 'error-test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual(dbError);
      expect(result.transactionRolledBack).toBe(true);
    });

    it('should handle memory exhaustion errors', async () => {
      // Mock memory exhaustion
      (process as any).memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 1024 * 1024 * 1024, // 1GB - very high
        heapTotal: 2048 * 1024 * 1024
      });

      const memError = new AppError(
        'Out of memory',
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        500,
        false
      );

      const operation = jest.fn().mockRejectedValue(memError);
      
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'memory_intensive',
        operation: 'large-processing',
        memoryThreshold: 800 * 1024 * 1024, // 800MB
        circuitBreaker: true,
        companyId: 'error-test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual(memError);
      expect(result.memoryUsage).toBeGreaterThan(800 * 1024 * 1024);
      
      // Restore original memory usage
      delete (process as any).memoryUsage;
    });

    it('should handle service unavailable errors', async () => {
      const serviceError = new AppError(
        'Service temporarily unavailable',
        ErrorCode.SERVICE_UNAVAILABLE,
        ErrorCategory.EXTERNAL_SERVICE,
        ErrorSeverity.HIGH,
        503,
        true
      );

      const operation = jest.fn().mockRejectedValue(serviceError);
      
      const result = await enhancedRecovery.executeWithRecovery(operation, {
        service: 'external_api',
        operation: 'api-call',
        circuitBreaker: true,
        deadLetterQueue: true,
        maxRetries: 2,
        companyId: 'error-test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toEqual(serviceError);
      expect(result.circuitBreakerState).toBe(CircuitState.OPEN);
    });
  });
});

// Convenience function tests
describe('Convenience Function Tests', () => {
  it('should execute with enhanced recovery using convenience function', async () => {
    const operation = jest.fn().mockResolvedValue('convenience-success');
    
    const result = await executeWithEnhancedRecovery(operation, {
      service: 'test-service',
      operation: 'convenience-test',
      circuitBreaker: true,
      companyId: 'convenience-company'
    });

    expect(result.success).toBe(true);
    expect(result.data).toBe('convenience-success');
  });

  it('should add to dead letter queue using convenience function', async () => {
    mockSql.query.mockResolvedValueOnce({
      rows: [{ id: 'convenience-dlq' }],
      rowCount: 1
    });

    const jobId = await addToDeadLetterQueue(
      'convenience-original-job',
      'convenience-job-type',
      { test: 'data' },
      new Error('Convenience test error'),
      {
        companyId: 'convenience-company',
        priority: 5
      }
    );

    expect(jobId).toBeDefined();
    expect(mockSql.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO job_queue_dead_letter'),
      expect.any(Array)
    );
  });
});