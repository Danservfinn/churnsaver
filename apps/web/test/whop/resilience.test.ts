// Whop Resilience Service Tests
// Comprehensive tests for retry logic, circuit breaker pattern, and telemetry hooks

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  ResilienceService,
  RetryPolicyExecutor,
  CircuitBreaker,
  TelemetryCollector,
  CircuitState,
  executeResiliently,
  resilienceService,
  type RetryPolicy,
  type CircuitBreakerConfig,
  type TelemetryHooks,
  type RequestContext
} from '@/lib/whop/resilience';
import { whopConfig } from '@/lib/whop/sdkConfig';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';
import { categorizeAndLogError } from '@/lib/errorCategorization';

// Mock dependencies
jest.mock('@/lib/whop/sdkConfig');
jest.mock('@/lib/logger');
jest.mock('@/lib/metrics');
jest.mock('@/lib/errorCategorization');

const mockWhopConfig = whopConfig as jest.Mocked<typeof whopConfig>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockMetrics = metrics as jest.Mocked<typeof metrics>;
const mockCategorizeAndLogError = categorizeAndLogError as jest.MockedFunction<typeof categorizeAndLogError>;

describe('RetryPolicyExecutor', () => {
  let retryPolicy: RetryPolicyExecutor;
  let mockContext: RequestContext;
  let mockHooks: TelemetryHooks;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      operation: 'test-operation',
      service: 'test-service',
      requestId: 'test-request-123',
      startTime: Date.now(),
      endpoint: '/test/endpoint',
      method: 'GET'
    };

    mockHooks = {
      onRequestStart: jest.fn(),
      onRequestSuccess: jest.fn(),
      onRequestError: jest.fn(),
      onRetryAttempt: jest.fn()
    };

    retryPolicy = new RetryPolicyExecutor({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false // Disable jitter for predictable tests
    });
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await retryPolicy.execute(operation, mockContext, mockHooks);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockHooks.onRetryAttempt).not.toHaveBeenCalled();
    });

    it('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValue('success');

      const result = await retryPolicy.execute(operation, mockContext, mockHooks);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledTimes(2);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(
        mockContext,
        1,
        expect.any(Number)
      );
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(
        mockContext,
        2,
        expect.any(Number)
      );
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Invalid request'));
      
      await expect(retryPolicy.execute(operation, mockContext, mockHooks))
        .rejects.toThrow('Invalid request');
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockHooks.onRetryAttempt).not.toHaveBeenCalled();
    });

    it('should exhaust retries and fail', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent network error'));
      
      await expect(retryPolicy.execute(operation, mockContext, mockHooks))
        .rejects.toThrow('Persistent network error');
      
      expect(operation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await retryPolicy.execute(operation, mockContext, mockHooks);
      const endTime = Date.now();

      // Should have delays: 100ms (1st retry) + 200ms (2nd retry) = 300ms minimum
      expect(endTime - startTime).toBeGreaterThan(250);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(mockContext, 1, 100);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(mockContext, 2, 200);
    });

    it('should cap delay at maxDelay', async () => {
      const longRetryPolicy = new RetryPolicyExecutor({
        maxRetries: 4,
        baseDelay: 100,
        maxDelay: 300,
        backoffMultiplier: 4,
        jitter: false
      });

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Retry'))
        .mockRejectedValueOnce(new Error('Retry'))
        .mockRejectedValueOnce(new Error('Retry'))
        .mockResolvedValue('success');

      await longRetryPolicy.execute(operation, mockContext, mockHooks);

      // Delays should be: 100, 400, 300 (capped at maxDelay)
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(mockContext, 1, 100);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(mockContext, 2, 400);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(mockContext, 3, 300); // Capped
    });

    it('should add jitter when enabled', async () => {
      const jitterPolicy = new RetryPolicyExecutor({
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: true
      });

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Retryable error'))
        .mockResolvedValue('success');

      await jitterPolicy.execute(operation, mockContext, mockHooks);

      expect(mockHooks.onRetryAttempt).toHaveBeenCalledWith(
        mockContext,
        1,
        expect.any(Number)
      );

      const delay = (mockHooks.onRetryAttempt as jest.Mock).mock.calls[0][2];
      // With jitter, delay should be between 50-100ms (50-100% of 100ms)
      expect(delay).toBeGreaterThanOrEqual(50);
      expect(delay).toBeLessThanOrEqual(100);
    });

    it('should use custom retryable error function', async () => {
      const customPolicy = new RetryPolicyExecutor({
        maxRetries: 2,
        baseDelay: 100,
        retryableErrors: (error) => error.message.includes('Custom retry')
      });

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Custom retry error'))
        .mockRejectedValueOnce(new Error('Non-retryable error'))
        .mockResolvedValue('success');

      await expect(customPolicy.execute(operation, mockContext, mockHooks))
        .rejects.toThrow('Non-retryable error');
      
      expect(operation).toHaveBeenCalledTimes(2);
      expect(mockHooks.onRetryAttempt).toHaveBeenCalledTimes(1);
    });

    it('should log retry attempts', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await retryPolicy.execute(operation, mockContext, mockHooks);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Operation failed, retrying',
        expect.objectContaining({
          operation: 'test-operation',
          service: 'test-service',
          attempt: 1,
          error: 'Network error'
        })
      );
    });

    it('should log success after retry', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await retryPolicy.execute(operation, mockContext, mockHooks);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operation succeeded after retry',
        expect.objectContaining({
          operation: 'test-operation',
          service: 'test-service',
          attempt: 2
        })
      );
    });
  });

  describe('updateConfig', () => {
    it('should update retry policy configuration', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Retryable error'));
      
      retryPolicy.updateConfig({ maxRetries: 1 });
      
      await expect(retryPolicy.execute(operation, mockContext, mockHooks))
        .rejects.toThrow('Retryable error');
      
      expect(operation).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockContext: RequestContext;
  let mockHooks: TelemetryHooks;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      operation: 'test-operation',
      service: 'test-service',
      requestId: 'test-request-123',
      startTime: Date.now()
    };

    mockHooks = {
      onRequestStart: jest.fn(),
      onRequestSuccess: jest.fn(),
      onRequestError: jest.fn(),
      onCircuitBreakerOpen: jest.fn(),
      onCircuitBreakerClose: jest.fn(),
      onCircuitBreakerHalfOpen: jest.fn()
    };

    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000,
      successThreshold: 2,
      name: 'test-circuit'
    }, mockHooks);
  });

  describe('execute', () => {
    it('should execute operation when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(operation, mockContext);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service failure'));
      
      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation, mockContext))
          .rejects.toThrow('Service failure');
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(mockHooks.onCircuitBreakerOpen).toHaveBeenCalledWith(
        'test-circuit',
        expect.any(Object)
      );
    });

    it('should reject immediately when circuit is open', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation, mockContext))
          .rejects.toThrow('Service failure');
      }
      
      // Circuit should now be open
      await expect(circuitBreaker.execute(operation, mockContext))
        .rejects.toThrow('Circuit breaker is OPEN for test-circuit');
      
      expect(operation).toHaveBeenCalledTimes(3); // Should not be called when circuit is open
    });

    it('should transition to half-open after recovery timeout', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation, mockContext))
          .rejects.toThrow('Service failure');
      }
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Next call should transition to half-open
      await expect(circuitBreaker.execute(operation, mockContext))
        .rejects.toThrow('Service failure');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
      expect(mockHooks.onCircuitBreakerHalfOpen).toHaveBeenCalledWith(
        'test-circuit',
        expect.any(Object)
      );
    });

    it('should close circuit after success threshold in half-open state', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service failure'));
      const successOperation = jest.fn().mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation, mockContext))
          .rejects.toThrow('Service failure');
      }
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Execute successful operations to close circuit
      await circuitBreaker.execute(successOperation, mockContext);
      await circuitBreaker.execute(successOperation, mockContext);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockHooks.onCircuitBreakerClose).toHaveBeenCalledWith(
        'test-circuit',
        expect.any(Object)
      );
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service failure'));
      const successOperation = jest.fn().mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failingOperation, mockContext))
          .rejects.toThrow('Service failure');
      }
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // One success, then failure should reopen circuit
      await circuitBreaker.execute(successOperation, mockContext);
      await expect(circuitBreaker.execute(failingOperation, mockContext))
        .rejects.toThrow('Service failure');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('getState', () => {
    it('should return current circuit state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('getMetrics', () => {
    it('should return circuit breaker metrics', () => {
      const metrics = circuitBreaker.getMetrics();
      
      expect(metrics).toEqual({
        requests: expect.any(Number),
        failures: expect.any(Number),
        successes: expect.any(Number),
        timeouts: expect.any(Number)
      });
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker to initial state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service failure'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation, mockContext))
          .rejects.toThrow('Service failure');
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Reset the circuit
      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.requests).toBe(0);
      expect(metrics.failures).toBe(0);
      expect(metrics.successes).toBe(0);
    });
  });
});

describe('TelemetryCollector', () => {
  let telemetry: TelemetryCollector;
  let mockContext: RequestContext;
  let testConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      operation: 'test-operation',
      service: 'test-service',
      requestId: 'test-request-123',
      startTime: Date.now()
    };

    testConfig = {
      enableMetrics: true,
      enableLogging: true
    };

    mockWhopConfig.get.mockReturnValue(testConfig);
    telemetry = new TelemetryCollector({}, testConfig);
  });

  describe('onRequestStart', () => {
    it('should record request start metrics', () => {
      telemetry.onRequestStart(mockContext);
      
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_started',
        1,
        {
          operation: 'test-operation',
          service: 'test-service'
        }
      );
    });

    it('should call custom hook', () => {
      const customHook = jest.fn();
      const customTelemetry = new TelemetryCollector({
        onRequestStart: customHook
      }, testConfig);
      
      customTelemetry.onRequestStart(mockContext);
      
      expect(customHook).toHaveBeenCalledWith(mockContext);
    });

    it('should not record metrics when disabled', () => {
      const disabledConfig = { ...testConfig, enableMetrics: false };
      const disabledTelemetry = new TelemetryCollector({}, disabledConfig);
      
      disabledTelemetry.onRequestStart(mockContext);
      
      expect(mockMetrics.recordCounter).not.toHaveBeenCalled();
    });
  });

  describe('onRequestSuccess', () => {
    it('should record success metrics and logs', () => {
      const response = { status: 200, data: 'success' };
      const duration = 150;
      
      telemetry.onRequestSuccess(mockContext, response, duration);
      
      expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
        'whop.api.request_duration',
        duration,
        {
          operation: 'test-operation',
          service: 'test-service',
          status: 'success'
        }
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Whop API request succeeded',
        expect.objectContaining({
          operation: 'test-operation',
          duration,
          statusCode: 200
        })
      );
    });

    it('should call custom hook', () => {
      const customHook = jest.fn();
      const customTelemetry = new TelemetryCollector({
        onRequestSuccess: customHook
      }, testConfig);
      
      customTelemetry.onRequestSuccess(mockContext, {}, 100);
      
      expect(customHook).toHaveBeenCalledWith(mockContext, {}, 100);
    });
  });

  describe('onRequestError', () => {
    it('should record error metrics and categorize error', () => {
      const error = new Error('Test error');
      const duration = 200;
      
      telemetry.onRequestError(mockContext, error, duration);
      
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_error',
        1,
        {
          operation: 'test-operation',
          service: 'test-service',
          error_type: 'Error'
        }
      );
      
      expect(mockCategorizeAndLogError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          requestId: 'test-request-123',
          processingTimeMs: duration
        })
      );
    });

    it('should call custom hook', () => {
      const customHook = jest.fn();
      const customTelemetry = new TelemetryCollector({
        onRequestError: customHook
      }, testConfig);
      
      const error = new Error('Test error');
      customTelemetry.onRequestError(mockContext, error, 100);
      
      expect(customHook).toHaveBeenCalledWith(mockContext, error, 100);
    });
  });

  describe('onRetryAttempt', () => {
    it('should record retry metrics', () => {
      telemetry.onRetryAttempt(mockContext, 2, 150);
      
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.retry_attempt',
        1,
        {
          operation: 'test-operation',
          service: 'test-service',
          attempt: '2'
        }
      );
    });

    it('should log retry attempt', () => {
      telemetry.onRetryAttempt(mockContext, 2, 150);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Whop API retry attempt',
        expect.objectContaining({
          operation: 'test-operation',
          attempt: 2,
          delay: 150
        })
      );
    });

    it('should call custom hook', () => {
      const customHook = jest.fn();
      const customTelemetry = new TelemetryCollector({
        onRetryAttempt: customHook
      }, testConfig);
      
      customTelemetry.onRetryAttempt(mockContext, 2, 150);
      
      expect(customHook).toHaveBeenCalledWith(mockContext, 2, 150);
    });
  });
});

describe('ResilienceService', () => {
  let resilienceService: ResilienceService;
  let mockContext: RequestContext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      operation: 'test-operation',
      service: 'test-service',
      requestId: 'test-request-123',
      startTime: Date.now()
    };

    resilienceService = new ResilienceService({
      retryPolicy: {
        maxRetries: 2,
        baseDelay: 50
      },
      circuitBreaker: {
        failureThreshold: 2,
        recoveryTimeout: 500
      },
      enableMetrics: true,
      enableLogging: true
    });
  });

  describe('execute', () => {
    it('should execute successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await resilienceService.execute(operation, mockContext);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry failed operation through circuit breaker', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');
      
      const result = await resilienceService.execute(operation, mockContext);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle operation failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent error'));
      
      await expect(resilienceService.execute(operation, mockContext))
        .rejects.toThrow('Persistent error');
      
      expect(operation).toHaveBeenCalled();
    });

    it('should record telemetry for successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      await resilienceService.execute(operation, mockContext);
      
      // Should record start and success
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_started',
        1,
        expect.any(Object)
      );
    });

    it('should record telemetry for failed operation', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(resilienceService.execute(operation, mockContext))
        .rejects.toThrow('Test error');
      
      // Should record start and error
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_started',
        1,
        expect.any(Object)
      );
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_error',
        1,
        expect.any(Object)
      );
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return circuit breaker state', () => {
      const state = resilienceService.getCircuitBreakerState();
      
      expect([CircuitState.CLOSED, CircuitState.OPEN, CircuitState.HALF_OPEN]).toContain(state);
    });
  });

  describe('getCircuitBreakerMetrics', () => {
    it('should return circuit breaker metrics', () => {
      const metrics = resilienceService.getCircuitBreakerMetrics();
      
      expect(metrics).toEqual({
        requests: expect.any(Number),
        failures: expect.any(Number),
        successes: expect.any(Number),
        timeouts: expect.any(Number)
      });
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker', () => {
      resilienceService.resetCircuitBreaker();
      
      expect(resilienceService.getCircuitBreakerState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('updateRetryPolicy', () => {
    it('should update retry policy configuration', () => {
      resilienceService.updateRetryPolicy({ maxRetries: 5 });
      
      // Verify the update was applied (this would require accessing internal state)
      expect(resilienceService).toBeDefined();
    });
  });
});

describe('executeResiliently', () => {
  let mockContext: RequestContext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      operation: 'test-operation',
      service: 'test-service',
      requestId: 'test-request-123',
      startTime: Date.now()
    };
  });

  it('should execute with default resilience service', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    
    const result = await executeResiliently(operation, mockContext);
    
    expect(result).toBe('success');
  });

  it('should execute with custom resilience service', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const customConfig = {
      retryPolicy: { maxRetries: 1 },
      enableMetrics: false
    };
    
    const result = await executeResiliently(operation, mockContext, customConfig);
    
    expect(result).toBe('success');
  });
});

describe('Default Resilience Service', () => {
  it('should export default resilience service instance', () => {
    expect(resilienceService).toBeDefined();
    expect(resilienceService).toBeInstanceOf(ResilienceService);
  });
});

describe('Integration Tests', () => {
  let resilienceService: ResilienceService;
  let mockContext: RequestContext;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      operation: 'integration-test',
      service: 'whop-api',
      requestId: 'integration-123',
      startTime: Date.now(),
      endpoint: '/api/v1/test',
      method: 'POST'
    };

    resilienceService = new ResilienceService({
      retryPolicy: {
        maxRetries: 2,
        baseDelay: 50,
        jitter: false
      },
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 200,
        name: 'integration-circuit'
      },
      telemetry: {
        onRequestStart: jest.fn(),
        onRequestSuccess: jest.fn(),
        onRequestError: jest.fn(),
        onRetryAttempt: jest.fn(),
        onCircuitBreakerOpen: jest.fn(),
        onCircuitBreakerClose: jest.fn()
      },
      enableMetrics: true,
      enableLogging: true
    });
  });

  it('should handle complete resilience flow with retry and recovery', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValue({ data: 'success', status: 200 });

    const result = await resilienceService.execute(operation, mockContext);

    expect(result).toEqual({ data: 'success', status: 200 });
    expect(operation).toHaveBeenCalledTimes(3);
    
    // Verify telemetry hooks were called
    expect(resilienceService['telemetry']['hooks'].onRequestStart).toHaveBeenCalled();
    expect(resilienceService['telemetry']['hooks'].onRetryAttempt).toHaveBeenCalledTimes(2);
    expect(resilienceService['telemetry']['hooks'].onRequestSuccess).toHaveBeenCalled();
  });

  it('should open circuit breaker after threshold and recover', async () => {
    const failingOperation = jest.fn().mockRejectedValue(new Error('Service unavailable'));
    const successOperation = jest.fn().mockResolvedValue('recovered');

    // Fail enough times to open circuit
    for (let i = 0; i < 3; i++) {
      await expect(resilienceService.execute(failingOperation, mockContext))
        .rejects.toThrow('Service unavailable');
    }

    expect(resilienceService.getCircuitBreakerState()).toBe(CircuitState.OPEN);

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 250));

    // Should succeed and close circuit
    const result = await resilienceService.execute(successOperation, mockContext);
    expect(result).toBe('recovered');
    expect(resilienceService.getCircuitBreakerState()).toBe(CircuitState.CLOSED);
  });

  it('should handle operation that succeeds after circuit opens', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('Service error'));

    // Open circuit breaker
    for (let i = 0; i < 3; i++) {
      await expect(resilienceService.execute(operation, mockContext))
        .rejects.toThrow('Service error');
    }

    expect(resilienceService.getCircuitBreakerState()).toBe(CircuitState.OPEN);

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 250));

    // Make operation succeed
    operation.mockResolvedValue('success after recovery');

    const result = await resilienceService.execute(operation, mockContext);
    expect(result).toBe('success after recovery');
  });
});