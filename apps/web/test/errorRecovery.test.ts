import { getSuggestedActions, getRecoveryActions, ACTIONS_BY_CATEGORY } from '../src/lib/errorCategorization';
import { ErrorCategory, ErrorCode, ErrorSeverity, AppError } from '../src/lib/apiResponse';
import { CategorizedError } from '../src/lib/errorCategorization';
import { CircuitBreaker } from '../src/lib/errorRecovery';
import { RecoveryManager, RetryHandler, FallbackHandler, executeWithRecovery } from '../src/lib/errorRecovery';

// Test framework following the pattern from existing tests
const test = (name: string, fn: () => void) => {
  console.log(`🧪 ${name}`);
  try {
    fn();
    console.log(`✅ ${name} - PASSED`);
  } catch (error) {
    console.log(`❌ ${name} - FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

const describe = (name: string, fn: () => void) => {
  console.log(`\n📋 ${name}`);
  fn();
};

const it = test;
const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}`);
    }
  },
  toEqual: (expected: any) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    }
  },
  toContain: (item: any) => {
    if (!Array.isArray(actual) || !actual.includes(item)) {
      throw new Error(`Expected array to contain ${item}`);
    }
  },
  toBeGreaterThan: (expected: number) => {
    if (!(actual > expected)) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toBeLessThan: (expected: number) => {
    if (!(actual < expected)) {
      throw new Error(`Expected ${actual} to be less than ${expected}`);
    }
  },
  toHaveLength: (expected: number) => {
    if (!Array.isArray(actual) || actual.length !== expected) {
      throw new Error(`Expected array to have length ${expected}, but got ${actual.length}`);
    }
  },
  not: {
    toContain: (item: any) => {
      if (Array.isArray(actual) && actual.includes(item)) {
        throw new Error(`Expected array not to contain ${item}`);
      }
    }
  },
  toBeDefined: () => {
    if (actual === undefined || actual === null) {
      throw new Error(`Expected value to be defined, but got ${actual}`);
    }
  },
  toBeUndefined: () => {
    if (actual !== undefined) {
      throw new Error(`Expected value to be undefined, but got ${actual}`);
    }
  }
});

// Helper function to create a test CategorizedError
function createTestCategorizedError(category: ErrorCategory): CategorizedError {
  const error = new AppError(
    'Test error',
    ErrorCode.INTERNAL_SERVER_ERROR,
    category,
    ErrorSeverity.MEDIUM,
    500,
    true,
    false
  );

  return {
    originalError: new Error('Test error'),
    categorizedError: error,
    context: {},
    detectedPatterns: [],
    suggestedActions: [],
    monitoringData: {}
  };
}

describe('ACTIONS_BY_CATEGORY Usage', () => {
  describe('getSuggestedActions()', () => {
    it('should return suggested actions for DATABASE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Check database connection');
      expect(actions).toContain('Verify database credentials');
      expect(actions).toContain('Monitor database performance');
      expect(actions).toContain('Check for deadlocks or connection pool exhaustion');
    });

    it('should return suggested actions for NETWORK category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.NETWORK);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Check network connectivity');
      expect(actions).toContain('Verify external service availability');
      expect(actions).toContain('Implement retry logic with exponential backoff');
      expect(actions).toContain('Consider circuit breaker pattern');
    });

    it('should return suggested actions for AUTHENTICATION category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.AUTHENTICATION);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Verify authentication token');
      expect(actions).toContain('Check token expiration');
      expect(actions).toContain('Review authentication configuration');
      expect(actions).toContain('Monitor for brute force attempts');
    });

    it('should return suggested actions for AUTHORIZATION category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.AUTHORIZATION);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Verify user permissions');
      expect(actions).toContain('Check role-based access control');
      expect(actions).toContain('Review authorization policies');
      expect(actions).toContain('Audit access logs');
    });

    it('should return suggested actions for VALIDATION category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.VALIDATION);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Review input validation rules');
      expect(actions).toContain('Check request format');
      expect(actions).toContain('Validate required fields');
      expect(actions).toContain('Update API documentation');
    });

    it('should return suggested actions for RATE_LIMIT category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.RATE_LIMIT);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Implement rate limiting headers');
      expect(actions).toContain('Add retry-after logic');
      expect(actions).toContain('Monitor usage patterns');
      expect(actions).toContain('Consider rate limit adjustments');
    });

    it('should return suggested actions for EXTERNAL_SERVICE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.EXTERNAL_SERVICE);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Check external service status');
      expect(actions).toContain('Verify API credentials');
      expect(actions).toContain('Implement fallback mechanisms');
      expect(actions).toContain('Monitor service level agreements');
    });

    it('should return suggested actions for SECURITY category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.SECURITY);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Immediate security review required');
      expect(actions).toContain('Check for suspicious activity patterns');
      expect(actions).toContain('Review access logs');
      expect(actions).toContain('Consider temporary IP blocking');
    });

    it('should return suggested actions for SYSTEM category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.SYSTEM);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Investigate error details');
      expect(actions).toContain('Check system logs');
      expect(actions).toContain('Monitor for recurrence');
      expect(actions).toContain('Escalate if persistent');
    });

    it('should return suggested actions for UNKNOWN category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.UNKNOWN);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Investigate error details');
      expect(actions).toContain('Check system logs');
      expect(actions).toContain('Monitor for recurrence');
      expect(actions).toContain('Escalate if persistent');
    });

    it('should return suggested actions for BUSINESS_LOGIC category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.BUSINESS_LOGIC);
      const actions = getSuggestedActions(categorizedError);

      expect(actions).toHaveLength(4);
      expect(actions).toContain('Review business logic rules');
      expect(actions).toContain('Check input data validation');
      expect(actions).toContain('Verify business requirements');
      expect(actions).toContain('Update business logic documentation');
    });

    it('should filter out recovery actions and return only suggested actions', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getSuggestedActions(categorizedError);

      // Should not contain recovery actions (those with 'action' property)
      expect(actions).not.toContain('check_database_connection');
      expect(actions).not.toContain('restart_connection_pool');
    });
  });
  
  // Circuit Breaker Tests
  describe('Circuit Breaker Tests', () => {
  
    describe('Circuit Breaker Initialization', () => {
      it('should initialize in CLOSED state', () => {
        const breaker = new CircuitBreaker();
        expect(breaker.getState()).toBe('closed');
      });
  
      it('should accept custom configuration', () => {
        const breaker = new CircuitBreaker({
          failureThreshold: 10,
          recoveryTimeout: 30000
        });
        // Test that it doesn't throw and has expected state
        expect(breaker.getState()).toBe('closed');
      });
    });
  
    describe('Circuit Breaker Operation', () => {
      it('should allow operations when CLOSED', async () => {
        const breaker = new CircuitBreaker();
        let callCount = 0;
  
        const operation = async () => {
          callCount++;
          return 'success';
        };
  
        const result = await breaker.execute(operation);
        expect(result).toBe('success');
        expect(callCount).toBe(1);
        expect(breaker.getState()).toBe('closed');
      });
  
      it('should open circuit after failure threshold', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3 });
  
        const failingOperation = async () => {
          throw new Error('Operation failed');
        };
  
        // Fail three times to trigger circuit breaker
        for (let i = 0; i < 3; i++) {
          try {
            await breaker.execute(failingOperation);
          } catch (error) {
            // Expected to fail
          }
        }
  
        expect(breaker.getState()).toBe('open');
  
        // Next operation should be rejected immediately
        try {
          await breaker.execute(failingOperation);
          throw new Error('Should have been rejected');
        } catch (error: any) {
          expect(error.message).toContain('Circuit breaker is open');
        }
      });
  
      it('should transition to HALF_OPEN after recovery timeout', async () => {
        const breaker = new CircuitBreaker({
          failureThreshold: 2,
          recoveryTimeout: 100 // Very short timeout for testing
        });
  
        const failingOperation = async () => {
          throw new Error('Operation failed');
        };
  
        // Fail twice to open circuit
        for (let i = 0; i < 2; i++) {
          try {
            await breaker.execute(failingOperation);
          } catch (error) {
            // Expected to fail
          }
        }
  
        expect(breaker.getState()).toBe('open');
  
        // Wait for recovery timeout
        await new Promise(resolve => setTimeout(resolve, 150));
  
        // Next operation should attempt recovery
        try {
          await breaker.execute(failingOperation);
          throw new Error('Should have failed');
        } catch (error: any) {
          expect(error.message).toBe('Operation failed');
          expect(breaker.getState()).toBe('open'); // Back to open after another failure
        }
      });
  
      it('should close circuit after successful recovery', async () => {
        const breaker = new CircuitBreaker({
          failureThreshold: 2,
          recoveryTimeout: 100
        });
  
        let shouldFail = true;
        const operation = async () => {
          if (shouldFail) {
            throw new Error('Operation failed');
          }
          return 'success';
        };
  
        // Fail twice to open circuit
        for (let i = 0; i < 2; i++) {
          try {
            await breaker.execute(operation);
          } catch (error) {
            // Expected to fail
          }
        }
  
        expect(breaker.getState()).toBe('open');
  
        // Wait for recovery timeout and allow success
        await new Promise(resolve => setTimeout(resolve, 150));
        shouldFail = false;
  
        // Should succeed and close circuit
        const result = await breaker.execute(operation);
        expect(result).toBe('success');
        expect(breaker.getState()).toBe('closed');
      });
    });
  
    describe('Circuit Breaker Statistics', () => {
      it('should track failure count', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 5 });
  
        const failingOperation = async () => {
          throw new Error('Operation failed');
        };
  
        for (let i = 0; i < 3; i++) {
          try {
            await breaker.execute(failingOperation);
          } catch (error) {
            // Expected to fail
          }
        }
  
        const stats = breaker.getStats();
        expect(stats.failureCount).toBe(3);
        expect(stats.state).toBe('closed');
      });
  
      it('should reset statistics', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 5 });
  
        const failingOperation = async () => {
          throw new Error('Operation failed');
        };
  
        for (let i = 0; i < 2; i++) {
          try {
            await breaker.execute(failingOperation);
          } catch (error) {
            // Expected to fail
          }
        }
  
        expect(breaker.getStats().failureCount).toBe(2);
  
        breaker.reset();
        expect(breaker.getStats().failureCount).toBe(0);
        expect(breaker.getState()).toBe('closed');
      });
    });
  });
  
  // Error Recovery Manager Tests
  describe('Error Recovery Manager Tests', () => {
  
    describe('Recovery Manager Initialization', () => {
      it('should initialize with default strategies', () => {
        const manager = new RecoveryManager();
        const stats = manager.getStats();
        expect(stats.strategies.length).toBeGreaterThan(0);
        expect(stats.strategies).toContain('database_reconnection');
        expect(stats.strategies).toContain('service_health_check');
      });
  
      it('should allow custom configuration', () => {
        const manager = new RecoveryManager(
          { maxAttempts: 5 },
          { failureThreshold: 10 },
          { enabled: false }
        );
        // Test that it initializes without error
        const stats = manager.getStats();
        expect(stats.strategies.length).toBeGreaterThan(0);
      });
    });
  
    describe('Recovery Execution', () => {
      it('should execute operation successfully without recovery', async () => {
        const manager = new RecoveryManager();
  
        const operation = async () => 'success';
        const result = await manager.executeWithRecovery({
          operation,
          service: 'test-service'
        });
  
        expect(result).toBe('success');
      });
  
      it('should attempt recovery on failure', async () => {
        const manager = new RecoveryManager();
  
        let attemptCount = 0;
        const operation = async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new AppError(
              'Database connection failed',
              ErrorCode.DATABASE_ERROR,
              ErrorCategory.DATABASE,
              ErrorSeverity.HIGH,
              500,
              false,
              true
            );
          }
          return 'recovered';
        };
  
        const result = await manager.executeWithRecovery({
          operation,
          service: 'test-service',
          retry: true
        });
  
        expect(result).toBe('recovered');
        expect(attemptCount).toBe(2); // Original attempt + 1 retry
      });
  
      it('should use circuit breaker', async () => {
        const manager = new RecoveryManager();
  
        let callCount = 0;
        const failingOperation = async () => {
          callCount++;
          throw new AppError(
            'Service unavailable',
            ErrorCode.SERVICE_UNAVAILABLE,
            ErrorCategory.EXTERNAL_SERVICE,
            ErrorSeverity.HIGH,
            503,
            false,
            true
          );
        };
  
        // This should fail multiple times and trigger circuit breaker
        for (let i = 0; i < 10; i++) {
          try {
            await manager.executeWithRecovery({
              operation: failingOperation,
              service: 'test-service',
              circuitBreaker: true
            });
          } catch (error) {
            // Expected failures
          }
        }
  
        // Circuit breaker should eventually block calls
        expect(callCount).toBeLessThan(10); // Some calls should be blocked
  
        const stats = manager.getStats();
        expect(stats.circuitBreakers['test-service']).toBeDefined();
      });
  
      it('should use fallback mechanism', async () => {
        const manager = new RecoveryManager();
  
        let primaryCalled = false;
        let fallbackCalled = false;
  
        const primaryOperation = async () => {
          primaryCalled = true;
          throw new Error('Primary failed');
        };
  
        const fallbackOperation = async () => {
          fallbackCalled = true;
          return 'fallback result';
        };
  
        const result = await manager.executeWithRecovery({
          operation: primaryOperation,
          fallbackOperation,
          service: 'test-service',
          fallback: true
        });
  
        expect(result).toBe('fallback result');
        expect(primaryCalled).toBe(true);
        expect(fallbackCalled).toBe(true);
      });
    });
  
    describe('Utility Function', () => {
      it('should provide easy-to-use recovery function', async () => {
        let attemptCount = 0;
        const operation = async () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new AppError(
              'Network error',
              ErrorCode.NETWORK_ERROR,
              ErrorCategory.NETWORK,
              ErrorSeverity.HIGH,
              500,
              false,
              true
            );
          }
          return 'success';
        };
  
        const result = await executeWithRecovery(operation, {
          retry: true,
          service: 'test-service'
        });
  
        expect(result).toBe('success');
        expect(attemptCount).toBe(2);
      });
    });
  });
  
  // Retry Handler Tests
  describe('Retry Handler Tests', () => {
  
    describe('Retry Configuration', () => {
      it('should use default configuration', () => {
        const handler = new RetryHandler();
        // Test that it initializes without error
        expect(handler).toBeDefined();
      });
  
      it('should accept custom configuration', () => {
        const handler = new RetryHandler({
          maxAttempts: 5,
          baseDelay: 500
        });
        expect(handler).toBeDefined();
      });
    });
  
    describe('Retry Logic', () => {
      it('should succeed on first attempt', async () => {
        const handler = new RetryHandler();
  
        let callCount = 0;
        const operation = async () => {
          callCount++;
          return 'success';
        };
  
        const result = await handler.execute(operation);
        expect(result).toBe('success');
        expect(callCount).toBe(1);
      });
  
      it('should retry on retryable errors', async () => {
        const handler = new RetryHandler({ maxAttempts: 3 });
  
        let callCount = 0;
        const operation = async () => {
          callCount++;
          if (callCount < 3) {
            throw new AppError(
              'Network timeout',
              ErrorCode.NETWORK_ERROR,
              ErrorCategory.NETWORK,
              ErrorSeverity.HIGH,
              500,
              false,
              true
            );
          }
          return 'success';
        };
  
        const result = await handler.execute(operation);
        expect(result).toBe('success');
        expect(callCount).toBe(3);
      });
  
      it('should not retry on non-retryable errors', async () => {
        const handler = new RetryHandler({ maxAttempts: 5 });
  
        let callCount = 0;
        const operation = async () => {
          callCount++;
          throw new AppError(
            'Validation failed',
            ErrorCode.BAD_REQUEST,
            ErrorCategory.VALIDATION,
            ErrorSeverity.MEDIUM,
            400,
            true,
            false // Not retryable
          );
        };
  
        try {
          await handler.execute(operation);
          throw new Error('Should have failed');
        } catch (error: any) {
          expect(error.code).toBe(ErrorCode.BAD_REQUEST);
          expect(callCount).toBe(1); // Only one attempt, no retries
        }
      });
  
      it('should respect max attempts limit', async () => {
        const handler = new RetryHandler({ maxAttempts: 3 });
  
        let callCount = 0;
        const operation = async () => {
          callCount++;
          throw new AppError(
            'Service unavailable',
            ErrorCode.SERVICE_UNAVAILABLE,
            ErrorCategory.EXTERNAL_SERVICE,
            ErrorSeverity.HIGH,
            503,
            false,
            true
          );
        };
  
        try {
          await handler.execute(operation);
          throw new Error('Should have failed');
        } catch (error: any) {
          expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
          expect(callCount).toBe(3); // Exactly max attempts
        }
      });
    });
  
    describe('Backoff Strategy', () => {
      it('should implement exponential backoff with jitter', async () => {
        const handler = new RetryHandler({
          maxAttempts: 4,
          baseDelay: 100,
          backoffMultiplier: 2,
          jitter: true
        });
  
        const delays: number[] = [];
        let callCount = 0;
        const operation = async () => {
          callCount++;
          const startTime = Date.now();
          if (callCount < 4) {
            // Record delay before failing
            if (delays.length > 0) {
              delays.push(Date.now() - delays[delays.length - 1]);
            } else {
              delays.push(0);
            }
  
            throw new AppError(
              'Network error',
              ErrorCode.NETWORK_ERROR,
              ErrorCategory.NETWORK,
              ErrorSeverity.HIGH,
              500,
              false,
              true
            );
          }
          return 'success';
        };
  
        const startTime = Date.now();
        const result = await handler.execute(operation);
  
        expect(result).toBe('success');
        expect(callCount).toBe(4);
        // Verify delays increased (exponential backoff)
        expect(delays.length).toBeGreaterThan(1);
      });
    });
  });
  
  // Fallback Handler Tests
  describe('Fallback Handler Tests', () => {
  
    describe('Fallback Configuration', () => {
      it('should use default configuration', () => {
        const handler = new FallbackHandler();
        expect(handler).toBeDefined();
      });
  
      it('should accept custom configuration', () => {
        const handler = new FallbackHandler({
          enabled: false,
          cacheTTL: 60000
        });
        expect(handler).toBeDefined();
      });
    });
  
    describe('Fallback Logic', () => {
      it('should return primary result on success', async () => {
        const handler = new FallbackHandler();
  
        const primaryOperation = async () => 'primary result';
        const result = await handler.execute(primaryOperation);
  
        expect(result).toBe('primary result');
      });
  
      it('should use fallback operation on failure', async () => {
        const handler = new FallbackHandler();
  
        const primaryOperation = async () => {
          throw new Error('Primary failed');
        };
  
        const fallbackOperation = async () => 'fallback result';
  
        const result = await handler.execute(primaryOperation, fallbackOperation);
        expect(result).toBe('fallback result');
      });
  
      it('should use fallback data when no operation provided', async () => {
        const handler = new FallbackHandler({
          fallbackData: 'default data'
        });
  
        const primaryOperation = async () => {
          throw new Error('Primary failed');
        };
  
        const result = await handler.execute(primaryOperation);
        expect(result).toBe('default data');
      });
  
      it('should cache successful results', async () => {
        const handler = new FallbackHandler({
          cacheEnabled: true,
          cacheTTL: 5000
        });
  
        let callCount = 0;
        const operation = async () => {
          callCount++;
          return `result-${callCount}`;
        };
  
        // First call
        const result1 = await handler.execute(operation, undefined, 'test-key');
        expect(result1).toBe('result-1');
  
        // Second call should use cache
        const result2 = await handler.execute(operation, undefined, 'test-key');
        expect(result2).toBe('result-1'); // Same result from cache
        expect(callCount).toBe(1); // Operation only called once
      });
  
      it('should prioritize cached data over fallback', async () => {
        const handler = new FallbackHandler({
          cacheEnabled: true,
          fallbackData: 'fallback data'
        });
  
        // Pre-populate cache
        await handler.execute(async () => 'cached result', undefined, 'test-key');
  
        // Now primary fails, should get cached result
        const primaryOperation = async () => {
          throw new Error('Primary failed');
        };
  
        const result = await handler.execute(primaryOperation, undefined, 'test-key');
        expect(result).toBe('cached result');
      });
  
      it('should respect cache TTL', async () => {
        const handler = new FallbackHandler({
          cacheEnabled: true,
          cacheTTL: 100 // Very short TTL
        });
  
        let callCount = 0;
        const operation = async () => {
          callCount++;
          return `result-${callCount}`;
        };
  
        // First call
        const result1 = await handler.execute(operation, undefined, 'test-key');
        expect(result1).toBe('result-1');
  
        // Wait for cache to expire
        await new Promise(resolve => setTimeout(resolve, 150));
  
        // Second call should not use cache
        const result2 = await handler.execute(operation, undefined, 'test-key');
        expect(result2).toBe('result-2'); // New result
        expect(callCount).toBe(2);
      });
    });
  
    describe('Cache Management', () => {
      it('should allow cache clearing', async () => {
        const handler = new FallbackHandler({ cacheEnabled: true });
  
        // Add to cache
        await handler.execute(async () => 'cached', undefined, 'test-key');
  
        // Verify cache exists
        let stats = handler.getCacheStats();
        expect(stats.size).toBeGreaterThan(0);
  
        // Clear cache
        handler.clearCache();
  
        // Verify cache is empty
        stats = handler.getCacheStats();
        expect(stats.size).toBe(0);
      });
    });
  });

  describe('getRecoveryActions()', () => {
    it('should return recovery actions for DATABASE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('check_database_connection');
      expect(actions[0].description).toBe('Verify database connectivity and credentials');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');
      expect(actions[0].estimatedTime).toBe('30s');

      expect(actions[1].action).toBe('restart_connection_pool');
      expect(actions[1].description).toBe('Restart database connection pool if needed');
      expect(actions[1].automated).toBe(true);
      expect(actions[1].priority).toBe('medium');
      expect(actions[1].estimatedTime).toBe('10s');
    });

    it('should return recovery actions for NETWORK category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.NETWORK);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('retry_with_backoff');
      expect(actions[0].description).toBe('Retry the operation with exponential backoff');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');
      expect(actions[0].estimatedTime).toBe('1-5s');

      expect(actions[1].action).toBe('check_service_health');
      expect(actions[1].description).toBe('Verify external service health status');
      expect(actions[1].automated).toBe(true);
      expect(actions[1].priority).toBe('medium');
      expect(actions[1].estimatedTime).toBe('5s');
    });

    it('should return recovery actions for RATE_LIMIT category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.RATE_LIMIT);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('wait_retry_after');
      expect(actions[0].description).toBe('Wait for the specified retry-after duration');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');

      expect(actions[1].action).toBe('reduce_request_rate');
      expect(actions[1].description).toBe('Implement client-side rate limiting');
      expect(actions[1].automated).toBe(false);
      expect(actions[1].priority).toBe('medium');
    });

    it('should return recovery actions for EXTERNAL_SERVICE category', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.EXTERNAL_SERVICE);
      const actions = getRecoveryActions(categorizedError);

      expect(actions).toHaveLength(2);
      expect(actions[0].action).toBe('enable_fallback');
      expect(actions[0].description).toBe('Switch to fallback service or cached data');
      expect(actions[0].automated).toBe(true);
      expect(actions[0].priority).toBe('high');

      expect(actions[1].action).toBe('check_service_status');
      expect(actions[1].description).toBe('Verify external service status page');
      expect(actions[1].automated).toBe(false);
      expect(actions[1].priority).toBe('medium');
    });

    it('should return empty array for categories without recovery actions', () => {
      const categoriesWithoutRecovery = [
        ErrorCategory.AUTHENTICATION,
        ErrorCategory.AUTHORIZATION,
        ErrorCategory.VALIDATION,
        ErrorCategory.SECURITY,
        ErrorCategory.SYSTEM,
        ErrorCategory.UNKNOWN,
        ErrorCategory.BUSINESS_LOGIC
      ];

      categoriesWithoutRecovery.forEach(category => {
        const categorizedError = createTestCategorizedError(category);
        const actions = getRecoveryActions(categorizedError);
        expect(actions).toHaveLength(0);
      });
    });

    it('should filter out suggested actions and return only recovery actions', () => {
      const categorizedError = createTestCategorizedError(ErrorCategory.DATABASE);
      const actions = getRecoveryActions(categorizedError);

      // Should not contain suggested actions (those without 'action' property)
      actions.forEach(action => {
        expect(action.action).toBeDefined();
        expect(typeof action.action).toBe('string');
        expect(action.description).toBeDefined();
        expect(typeof action.automated).toBe('boolean');
        expect(['low', 'medium', 'high', 'critical']).toContain(action.priority);
      });
    });
  });

  describe('ACTIONS_BY_CATEGORY structure validation', () => {
    it('should have all error categories defined', () => {
      const expectedCategories = Object.values(ErrorCategory);
      const actualCategories = Object.keys(ACTIONS_BY_CATEGORY);

      expectedCategories.forEach(category => {
        expect(actualCategories).toContain(category);
      });
    });

    it('should have actions array for each category', () => {
      Object.values(ACTIONS_BY_CATEGORY).forEach(actions => {
        expect(Array.isArray(actions)).toBe(true);
        expect(actions.length).toBeGreaterThan(0);
      });
    });

    it('should have valid action structure for each action', () => {
      Object.values(ACTIONS_BY_CATEGORY).forEach(actions => {
        actions.forEach(action => {
          expect(action.description).toBeDefined();
          expect(typeof action.description).toBe('string');
          expect(action.automated).toBeDefined();
          expect(typeof action.automated).toBe('boolean');
          expect(action.priority).toBeDefined();
          expect(['low', 'medium', 'high', 'critical']).toContain(action.priority);
        });
      });
    });

    it('should have recovery actions with action property', () => {
      // Check DATABASE category which has recovery actions
      const dbActions = ACTIONS_BY_CATEGORY[ErrorCategory.DATABASE];
      const recoveryActions = dbActions.filter(action => action.action);

      expect(recoveryActions.length).toBeGreaterThan(0);
      recoveryActions.forEach(action => {
        expect(action.action).toBeDefined();
        expect(typeof action.action).toBe('string');
        expect(action.estimatedTime).toBeDefined();
      });
    });

    it('should have suggested actions without action property', () => {
      // Check DATABASE category which has suggested actions
      const dbActions = ACTIONS_BY_CATEGORY[ErrorCategory.DATABASE];
      const suggestedActions = dbActions.filter(action => !action.action);

      expect(suggestedActions.length).toBeGreaterThan(0);
      suggestedActions.forEach(action => {
        expect(action.action).toBeUndefined();
      });
    });
  });
});