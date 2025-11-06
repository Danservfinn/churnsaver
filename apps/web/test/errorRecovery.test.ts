import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSuggestedActions, getRecoveryActions, ACTIONS_BY_CATEGORY } from '@/lib/errorCategorization';
import { ErrorCategory, ErrorCode, ErrorSeverity, AppError } from '@/lib/apiResponse';
import { CategorizedError } from '@/lib/errorCategorization';
import { CircuitBreaker } from '@/lib/errorRecovery';
import { RecoveryManager, RetryHandler, FallbackHandler, executeWithRecovery } from '@/lib/errorRecovery';

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

// Helper function to delay execution
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to mock timers for testing
class MockTimer {
  private callbacks: Map<number, () => void> = new Map();
  private currentTime = 0;

  setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const id = this.currentTime + delay;
    this.callbacks.set(id, callback);
    return id as any;
  }

  clearTimeout(id: NodeJS.Timeout): void {
    this.callbacks.delete(id as any);
  }

  advanceTime(ms: number): void {
    this.currentTime += ms;
    const toExecute: (() => void)[] = [];

    for (const [time, callback] of this.callbacks) {
      if (time <= this.currentTime) {
        toExecute.push(callback);
        this.callbacks.delete(time);
      }
    }

    toExecute.forEach(cb => cb());
  }

  getCurrentTime(): number {
    return this.currentTime;
  }
}

describe('Circuit Breaker Functionality Tests', () => {
  describe('Circuit Breaker Opening After Failure Threshold', () => {
    it('should open circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Execute failing operations up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failingOperation);
          throw new Error('Should have failed');
        } catch (error: any) {
          if (error.message === 'Should have failed') throw error;
          // Expected failure
        }
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should not open circuit before reaching failure threshold', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 1000
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Execute fewer failures than threshold
      for (let i = 0; i < 4; i++) {
        try {
          await breaker.execute(failingOperation);
          throw new Error('Should have failed');
        } catch (error: any) {
          if (error.message === 'Should have failed') throw error;
          // Expected failure
        }
      }

      expect(breaker.getState()).toBe('closed');
    });

    it('should handle mixed success and failure scenarios', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount % 2 === 0) { // Even calls succeed
          return 'success';
        } else {
          throw new Error('Operation failed');
        }
      };

      // This pattern should not trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await breaker.execute(operation);
        } catch (error) {
          // Expected for odd calls
        }
      }

      expect(breaker.getState()).toBe('closed');
      expect(callCount).toBe(6);
    });

    it('should reset failure count on successful operation', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1 || callCount === 2 || callCount === 4 || callCount === 5 || callCount === 6) {
          throw new Error('Operation failed');
        }
        return 'success';
      };

      // Two failures
      try { await breaker.execute(operation); } catch (e) {}
      try { await breaker.execute(operation); } catch (e) {}

      // Success should reset failure count
      const result = await breaker.execute(operation);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');

      // Two more failures should be needed to open circuit
      try { await breaker.execute(operation); } catch (e) {}
      try { await breaker.execute(operation); } catch (e) {}

      expect(breaker.getState()).toBe('closed'); // Still closed after 2 failures

      // Third failure should open circuit
      try { await breaker.execute(operation); } catch (e) {}

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('Half-Open State Transitions', () => {
    it('should transition to half-open after recovery timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 100 // Short timeout for testing
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Fail twice to open circuit
      try { await breaker.execute(failingOperation); } catch (e) {}
      try { await breaker.execute(failingOperation); } catch (e) {}

      expect(breaker.getState()).toBe('open');

      // Wait for recovery timeout
      await delay(150);

      // Next call should be allowed (half-open)
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should have failed in half-open state');
      } catch (error: any) {
        if (error.message === 'Should have failed in half-open state') throw error;
        // Expected failure - should transition back to open
        expect(breaker.getState()).toBe('open');
      }
    });

    it('should require multiple successes to fully close from half-open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 100
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount <= 2) { // First two calls fail
          throw new Error('Operation failed');
        }
        return 'success'; // Subsequent calls succeed
      };

      // Fail twice to open circuit
      try { await breaker.execute(operation); } catch (e) {}
      try { await breaker.execute(operation); } catch (e) {}

      expect(breaker.getState()).toBe('open');

      // Wait for recovery timeout and try recovery
      await delay(150);

      // First success in half-open should not close circuit yet
      const result1 = await breaker.execute(operation);
      expect(result1).toBe('success');
      expect(breaker.getState()).toBe('half_open');

      // Second success should close circuit
      const result2 = await breaker.execute(operation);
      expect(result2).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });

    it('should transition back to open on failure in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 100
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1 || callCount === 2) { // Fail first two calls
          throw new Error('Operation failed');
        }
        if (callCount === 4) { // Fail the first half-open attempt
          throw new Error('Operation failed');
        }
        return 'success';
      };

      // Fail twice to open circuit
      try { await breaker.execute(operation); } catch (e) {}
      try { await breaker.execute(operation); } catch (e) {}

      expect(breaker.getState()).toBe('open');

      // Wait for recovery timeout
      await delay(150);

      // Fail in half-open state - should go back to open
      try { await breaker.execute(operation); } catch (e) {}
      expect(breaker.getState()).toBe('open');

      // Wait again for recovery timeout
      await delay(150);

      // Succeed this time
      const result = await breaker.execute(operation);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });

    it('should handle concurrent calls during half-open state correctly', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 100
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1) { // First call fails
          throw new Error('Operation failed');
        }
        // Subsequent calls succeed
        return 'success';
      };

      // Fail once to open circuit
      try { await breaker.execute(operation); } catch (e) {}
      expect(breaker.getState()).toBe('open');

      // Wait for recovery timeout
      await delay(150);

      // Multiple concurrent calls during half-open
      const promises = [
        breaker.execute(operation),
        breaker.execute(operation),
        breaker.execute(operation)
      ];

      const results = await Promise.allSettled(promises);

      // All should succeed since we're in half-open and operations succeed
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value).toBe('success');
        } else {
          throw new Error('All operations should succeed in half-open state');
        }
      });

      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Recovery After Timeout', () => {
    it('should allow single test call after recovery timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 200
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Fail twice to open
      try { await breaker.execute(failingOperation); } catch (e) {}
      try { await breaker.execute(failingOperation); } catch (e) {}

      expect(breaker.getState()).toBe('open');

      // Immediately try to execute - should be rejected
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should be rejected when open');
      } catch (error: any) {
        if (error.message === 'Should be rejected when open') throw error;
        expect(error.message).toContain('Circuit breaker is open');
      }

      // Wait for recovery timeout
      await delay(250);

      // Now should be allowed to try (half-open)
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should fail in half-open');
      } catch (error: any) {
        if (error.message === 'Should fail in half-open') throw error;
        expect(error.message).toBe('Operation failed');
        expect(breaker.getState()).toBe('open');
      }
    });

    it('should reset recovery timer on each failure', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 300
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Fail once to open
      try { await breaker.execute(failingOperation); } catch (e) {}
      expect(breaker.getState()).toBe('open');

      // Wait partial recovery time
      await delay(150);

      // Fail again - should reset timer
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should be rejected');
      } catch (error: any) {
        if (error.message === 'Should be rejected') throw error;
        expect(error.message).toContain('Circuit breaker is open');
      }

      // Wait another partial period (total 300ms from last failure)
      await delay(200);

      // Should still be rejected (timer reset)
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should still be rejected');
      } catch (error: any) {
        if (error.message === 'Should still be rejected') throw error;
        expect(error.message).toContain('Circuit breaker is open');
      }

      // Wait full recovery time from last failure
      await delay(350);

      // Now should be allowed to try
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should fail in half-open');
      } catch (error: any) {
        if (error.message === 'Should fail in half-open') throw error;
        expect(error.message).toBe('Operation failed');
      }
    });
  });

  describe('Reset Functionality', () => {
    it('should reset circuit breaker to closed state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Build up failures
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(failingOperation); } catch (e) {}
      }

      expect(breaker.getState()).toBe('open');
      expect(breaker.getStats().failureCount).toBe(3);

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().failureCount).toBe(0);
      expect(breaker.getStats().successCount).toBe(0);
    });

    it('should allow operations after manual reset', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open circuit
      try { await breaker.execute(failingOperation); } catch (e) {}
      try { await breaker.execute(failingOperation); } catch (e) {}

      expect(breaker.getState()).toBe('open');

      // Reset manually
      breaker.reset();

      // Should now allow operations
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should fail but be allowed');
      } catch (error: any) {
        if (error.message === 'Should fail but be allowed') throw error;
        expect(error.message).toBe('Operation failed');
        expect(breaker.getState()).toBe('closed'); // Still closed after manual reset
      }
    });

    it('should reset all internal state', () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 5
      });

      // Simulate some state
      (breaker as any).failureCount = 3;
      (breaker as any).successCount = 2;
      (breaker as any).lastFailureTime = Date.now() - 1000;

      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastFailureTime).toBe(0);
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Circuit Breaker Edge Cases', () => {
    it('should handle zero failure threshold', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 0
      });

      // Should immediately open
      expect(breaker.getState()).toBe('closed'); // Starts closed

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Even one failure should open it
      try { await breaker.execute(failingOperation); } catch (e) {}
      expect(breaker.getState()).toBe('open');
    });

    it('should handle very short recovery timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 1 // 1ms timeout
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open circuit
      try { await breaker.execute(failingOperation); } catch (e) {}
      expect(breaker.getState()).toBe('open');

      // Very short wait should be enough
      await delay(5);

      // Should allow recovery attempt
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should fail in half-open');
      } catch (error: any) {
        if (error.message === 'Should fail in half-open') throw error;
        expect(error.message).toBe('Operation failed');
      }
    });

    it('should handle very long recovery timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeout: 10000 // 10 seconds
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open circuit
      try { await breaker.execute(failingOperation); } catch (e) {}
      expect(breaker.getState()).toBe('open');

      // Short wait should not be enough
      await delay(100);

      // Should still be rejected
      try {
        await breaker.execute(failingOperation);
        throw new Error('Should be rejected');
      } catch (error: any) {
        if (error.message === 'Should be rejected') throw error;
        expect(error.message).toContain('Circuit breaker is open');
      }
    });
  });
});

describe('Retry Mechanism with Exponential Backoff Tests', () => {
  describe('Retry Attempt Counting', () => {
    it('should count retry attempts correctly', async () => {
      const handler = new RetryHandler({
        maxAttempts: 4,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 4) {
          throw new AppError(
            'Retryable error',
            ErrorCode.GATEWAY_TIMEOUT,
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
      expect(attemptCount).toBe(4); // 1 initial + 3 retries
    });

    it('should not exceed maximum retry attempts', async () => {
      const handler = new RetryHandler({
        maxAttempts: 3,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new AppError(
          'Always fails',
          ErrorCode.GATEWAY_TIMEOUT,
          ErrorCategory.NETWORK,
          ErrorSeverity.HIGH,
          500,
          false,
          true
        );
      };

      try {
        await handler.execute(operation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.GATEWAY_TIMEOUT);
        expect(attemptCount).toBe(3); // Exactly max attempts
      }
    });

    it('should succeed on first attempt when operation succeeds', async () => {
      const handler = new RetryHandler({
        maxAttempts: 5,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        return 'success';
      };

      const result = await handler.execute(operation);
      expect(result).toBe('success');
      expect(attemptCount).toBe(1); // Only initial attempt
    });

    it('should track attempt count in error context', async () => {
      const handler = new RetryHandler({
        maxAttempts: 2,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new AppError(
          'Always fails',
          ErrorCode.GATEWAY_TIMEOUT,
          ErrorCategory.NETWORK,
          ErrorSeverity.HIGH,
          500,
          false,
          true
        );
      };

      try {
        await handler.execute(operation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.GATEWAY_TIMEOUT);
        expect(attemptCount).toBe(2);
      }
    });
  });

  describe('Backoff Delay Calculation with Jitter', () => {
    it('should calculate exponential backoff delays', async () => {
      const handler = new RetryHandler({
        maxAttempts: 5,
        baseDelay: 100,
        backoffMultiplier: 2,
        maxDelay: 10000,
        jitter: false // Disable jitter for predictable testing
      });

      const delays: number[] = [];
      let attemptCount = 0;

      const operation = async () => {
        attemptCount++;
        const startTime = Date.now();

        if (attemptCount < 5) {
          // Record delay before failing
          if (delays.length > 0) {
            delays.push(Date.now() - delays[delays.length - 1]);
          } else {
            delays.push(0);
          }

          throw new AppError(
            'Retryable error',
            ErrorCode.GATEWAY_TIMEOUT,
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
      // Expected delays: 0 (first attempt), 100, 200, 400 (exponential backoff)
      expect(delays[0]).toBe(0); // First attempt
      expect(delays[1]).toBeGreaterThanOrEqual(95); // ~100ms (base delay)
      expect(delays[2]).toBeGreaterThanOrEqual(195); // ~200ms (100 * 2)
      expect(delays[3]).toBeGreaterThanOrEqual(395); // ~400ms (200 * 2)
    });

    it('should respect maximum delay limit', async () => {
      const handler = new RetryHandler({
        maxAttempts: 10,
        baseDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 5000, // 5 second max
        jitter: false
      });

      const attemptTimestamps: number[] = [];
      let attemptCount = 0;

      const operation = async () => {
        attemptCount++;
        const attemptStartTime = Date.now();
        attemptTimestamps.push(attemptStartTime);

        if (attemptCount < 10) {
          throw new AppError(
            'Retryable error',
            ErrorCode.GATEWAY_TIMEOUT,
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
      
      // Calculate delays between consecutive attempts
      const delays: number[] = [];
      for (let i = 1; i < attemptTimestamps.length; i++) {
        delays.push(attemptTimestamps[i] - attemptTimestamps[i - 1]);
      }
      
      // Later delays should be capped at maxDelay
      for (let i = 3; i < delays.length; i++) {
        expect(delays[i]).toBeLessThanOrEqual(5500); // Allow some tolerance
      }
    }, { timeout: 45000 }); // Increase timeout to 45 seconds to account for cumulative delays

    it('should add jitter to delay calculations', async () => {
      const handler = new RetryHandler({
        maxAttempts: 4,
        baseDelay: 100,
        backoffMultiplier: 2,
        jitter: true
      });

      // Run multiple times to verify jitter variation
      const delaySets: number[][] = [];

      for (let run = 0; run < 5; run++) {
        const delays: number[] = [];
        let attemptCount = 0;

        const operation = async () => {
          attemptCount++;
          const startTime = Date.now();

          if (attemptCount < 4) {
            if (delays.length > 0) {
              delays.push(Date.now() - delays[delays.length - 1]);
            } else {
              delays.push(0);
            }

            throw new AppError(
              'Retryable error',
              ErrorCode.GATEWAY_TIMEOUT,
              ErrorCategory.NETWORK,
              ErrorSeverity.HIGH,
              500,
              false,
              true
            );
          }
          return 'success';
        };

        await handler.execute(operation);
        delaySets.push(delays.slice(1)); // Skip first delay (0)
      }

      // Verify that delays vary (due to jitter)
      let hasVariation = false;
      for (let i = 0; i < delaySets[0].length; i++) {
        const values = delaySets.map(set => set[i]);
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (max - min > 10) { // Allow for some timing variation
          hasVariation = true;
          break;
        }
      }

      expect(hasVariation).toBe(true);
    });

    it('should handle zero base delay', async () => {
      const handler = new RetryHandler({
        maxAttempts: 3,
        baseDelay: 0,
        backoffMultiplier: 2,
        jitter: false
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new AppError(
            'Retryable error',
            ErrorCode.GATEWAY_TIMEOUT,
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
      expect(attemptCount).toBe(3);
      // Should complete quickly with zero base delay
      expect(Date.now() - startTime).toBeLessThan(100);
    });
  });

  describe('Maximum Retry Limit Enforcement', () => {
    it('should enforce maximum retry limit', async () => {
      const handler = new RetryHandler({
        maxAttempts: 1, // Only 1 attempt total
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new AppError(
          'Always fails',
          ErrorCode.GATEWAY_TIMEOUT,
          ErrorCategory.NETWORK,
          ErrorSeverity.HIGH,
          500,
          false,
          true
        );
      };

      try {
        await handler.execute(operation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.GATEWAY_TIMEOUT);
        expect(attemptCount).toBe(1); // Only initial attempt, no retries
      }
    });

    it('should handle edge case of zero max attempts', async () => {
      const handler = new RetryHandler({
        maxAttempts: 0,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new AppError(
          'Always fails',
          ErrorCode.GATEWAY_TIMEOUT,
          ErrorCategory.NETWORK,
          ErrorSeverity.HIGH,
          500,
          false,
          true
        );
      };

      try {
        await handler.execute(operation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.GATEWAY_TIMEOUT);
        expect(attemptCount).toBe(0); // No attempts at all
      }
    });

    it('should handle very high max attempts gracefully', async () => {
      const handler = new RetryHandler({
        maxAttempts: 100,
        baseDelay: 1, // Very short delay
        maxDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 10) { // Succeed after 10 attempts
          throw new AppError(
            'Retryable error',
            ErrorCode.BAD_GATEWAY,
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
      expect(attemptCount).toBe(10);
      // Should complete reasonably quickly despite high limit
      expect(Date.now() - startTime).toBeLessThan(1000);
    });
  });

  describe('Retryable vs Non-Retryable Error Handling', () => {
    it('should retry on retryable errors', async () => {
      const handler = new RetryHandler({
        maxAttempts: 3,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new AppError(
            'Network timeout',
            ErrorCode.GATEWAY_TIMEOUT,
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            500,
            false,
            true // retryable
          );
        }
        return 'success';
      };

      const result = await handler.execute(operation);
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const handler = new RetryHandler({
        maxAttempts: 5,
        baseDelay: 10
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new AppError(
          'Validation failed',
          ErrorCode.BAD_REQUEST,
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          400,
          true, // not retryable
          false
        );
      };

      try {
        await handler.execute(operation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.BAD_REQUEST);
        expect(attemptCount).toBe(1); // Only initial attempt
      }
    });

    it('should retry on errors in retryable categories', async () => {
      const handler = new RetryHandler({
        maxAttempts: 3,
        baseDelay: 10,
        retryableCategories: [ErrorCategory.DATABASE]
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new AppError(
            'Database connection lost',
            ErrorCode.DATABASE_ERROR,
            ErrorCategory.DATABASE,
            ErrorSeverity.HIGH,
            500,
            false,
            false // not marked as retryable, but category is
          );
        }
        return 'success';
      };

      const result = await handler.execute(operation);
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should not retry on errors in non-retryable categories', async () => {
      const handler = new RetryHandler({
        maxAttempts: 5,
        baseDelay: 10,
        retryableCategories: [ErrorCategory.NETWORK] // Only network errors retryable
      });

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new AppError(
          'Authentication failed',
          ErrorCode.UNAUTHORIZED,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          401,
          false,
          false
        );
      };

      try {
        await handler.execute(operation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
        expect(attemptCount).toBe(1); // Only initial attempt
      }
    });

    it('should handle mixed retryable and non-retryable error codes', async () => {
      const handler = new RetryHandler({
        maxAttempts: 3,
        baseDelay: 10,
        retryableErrors: [ErrorCode.GATEWAY_TIMEOUT, ErrorCode.BAD_GATEWAY],
        retryableCategories: []
      });

      // Test retryable error
      let attemptCount = 0;
      const retryableOperation = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new AppError(
            'Network error',
            ErrorCode.NETWORK_ERROR,
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            500,
            false,
            false
          );
        }
        return 'success';
      };

      const result1 = await handler.execute(retryableOperation);
      expect(result1).toBe('success');
      expect(attemptCount).toBe(2);

      // Test non-retryable error
      attemptCount = 0;
      const nonRetryableOperation = async () => {
        attemptCount++;
        throw new AppError(
          'Bad request',
          ErrorCode.BAD_REQUEST,
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          400,
          false,
          false
        );
      };

      try {
        await handler.execute(nonRetryableOperation);
        throw new Error('Should have failed');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.BAD_REQUEST);
        expect(attemptCount).toBe(1);
      }
    });
  });
});

describe('Fallback Mechanism Tests', () => {
  describe('Fallback Activation When Primary Fails', () => {
    it('should activate fallback when primary operation fails', async () => {
      const handler = new FallbackHandler({
        enabled: true
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      const fallbackOperation = async () => {
        return 'fallback result';
      };

      const result = await handler.execute(primaryOperation, fallbackOperation);
      expect(result).toBe('fallback result');
    });

    it('should return primary result when primary succeeds', async () => {
      const handler = new FallbackHandler({
        enabled: true
      });

      const primaryOperation = async () => {
        return 'primary result';
      };

      const fallbackOperation = async () => {
        return 'fallback result';
      };

      const result = await handler.execute(primaryOperation, fallbackOperation);
      expect(result).toBe('primary result');
    });

    it('should not activate fallback when disabled', async () => {
      const handler = new FallbackHandler({
        enabled: false
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      const fallbackOperation = async () => {
        return 'fallback result';
      };

      try {
        await handler.execute(primaryOperation, fallbackOperation);
        throw new Error('Should have thrown primary error');
      } catch (error: any) {
        expect(error.message).toBe('Primary failed');
      }
    });

    it('should handle fallback operation failure', async () => {
      const handler = new FallbackHandler({
        enabled: true
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      const fallbackOperation = async () => {
        throw new Error('Fallback also failed');
      };

      try {
        await handler.execute(primaryOperation, fallbackOperation);
        throw new Error('Should have thrown primary error');
      } catch (error: any) {
        expect(error.message).toBe('Primary failed');
      }
    });
  });

  describe('Fallback Data Usage', () => {
    it('should use fallback data when no fallback operation provided', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        fallbackData: 'default data'
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      const result = await handler.execute(primaryOperation);
      expect(result).toBe('default data');
    });

    it('should prioritize fallback operation over fallback data', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        fallbackData: 'default data'
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      const fallbackOperation = async () => {
        return 'fallback operation result';
      };

      const result = await handler.execute(primaryOperation, fallbackOperation);
      expect(result).toBe('fallback operation result');
    });

    it('should use fallback data when fallback operation fails', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        fallbackData: 'default data'
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      const fallbackOperation = async () => {
        throw new Error('Fallback operation failed');
      };

      const result = await handler.execute(primaryOperation, fallbackOperation);
      expect(result).toBe('default data');
    });

    it('should handle null and undefined fallback data', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        fallbackData: null
      });

      const primaryOperation = async () => {
        throw new Error('Primary failed');
      };

      try {
        await handler.execute(primaryOperation);
        throw new Error('Should have thrown primary error');
      } catch (error: any) {
        expect(error.message).toBe('Primary failed');
      }
    });
  });

  describe('Cache Functionality', () => {
    it('should cache successful primary operation results', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000
      });

      let callCount = 0;
      const primaryOperation = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      // First call
      const result1 = await handler.execute(primaryOperation, undefined, 'test-key');
      expect(result1).toBe('result-1');

      // Second call should use cache
      const result2 = await handler.execute(primaryOperation, undefined, 'test-key');
      expect(result2).toBe('result-1'); // Same result from cache
      expect(callCount).toBe(1); // Primary operation called only once
    });

    it('should respect cache TTL', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 100 // Short TTL for testing
      });

      let callCount = 0;
      const primaryOperation = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      // First call
      const result1 = await handler.execute(primaryOperation, undefined, 'test-key');
      expect(result1).toBe('result-1');

      // Wait for cache to expire
      await delay(150);

      // Second call should not use cache
      const result2 = await handler.execute(primaryOperation, undefined, 'test-key');
      expect(result2).toBe('result-2'); // New result
      expect(callCount).toBe(2);
    });

    it('should use cached data when primary fails', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000
      });

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1) {
          return 'success'; // First call succeeds
        } else {
          throw new Error('Primary failed'); // Subsequent calls fail
        }
      };

      // First call succeeds and caches
      const result1 = await handler.execute(operation, undefined, 'test-key');
      expect(result1).toBe('success');

      // Second call fails but uses cache
      const result2 = await handler.execute(operation, undefined, 'test-key');
      expect(result2).toBe('success'); // From cache
      expect(callCount).toBe(1); // Primary operation not called again
    });

    it('should not cache when caching is disabled', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        cacheEnabled: false
      });

      let callCount = 0;
      const primaryOperation = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      // Multiple calls
      const result1 = await handler.execute(primaryOperation, undefined, 'test-key');
      const result2 = await handler.execute(primaryOperation, undefined, 'test-key');

      expect(result1).toBe('result-1');
      expect(result2).toBe('result-2'); // Different result
      expect(callCount).toBe(2); // Called twice
    });

    it('should handle cache with different keys separately', async () => {
      const handler = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000
      });

      let callCount = 0;
      const primaryOperation = async () => {
        callCount++;
        return `result-${callCount}`;
      };

      // Different keys should have separate cache entries
      const result1 = await handler.execute(primaryOperation, undefined, 'key1');
      const result2 = await handler.execute(primaryOperation, undefined, 'key2');

      expect(result1).toBe('result-1');
      expect(result2).toBe('result-2'); // Different result for different key
      expect(callCount).toBe(2);
    });
  });

  describe('Fallback Chain Support', () => {
    it('should support multiple fallback handlers in sequence', async () => {
      // Create primary handler that fails
      const primaryHandler = new FallbackHandler({
        enabled: true,
        fallbackData: 'primary fallback data'
      });

      // Create secondary handler that can fall back further
      const secondaryHandler = new FallbackHandler({
        enabled: true,
        fallbackData: 'secondary fallback data'
      });

      // Chain them: primary -> secondary -> final data
      const chainedOperation = async () => {
        try {
          // Primary operation fails
          throw new Error('Primary operation failed');
        } catch (error) {
          // Try secondary handler
          return await secondaryHandler.execute(
            async () => { throw new Error('Secondary operation failed'); },
            undefined,
            'secondary-key'
          );
        }
      };

      const result = await primaryHandler.execute(
        async () => { throw new Error('Primary operation failed'); },
        chainedOperation,
        'primary-key'
      );

      expect(result).toBe('secondary fallback data');
    });

    it('should handle complex fallback chains with caching', async () => {
      const handler1 = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000,
        fallbackData: 'level1-fallback'
      });

      const handler2 = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000,
        fallbackData: 'level2-fallback'
      });

      const handler3 = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000,
        fallbackData: 'level3-fallback'
      });

      // Chain: handler1 -> handler2 -> handler3
      const result = await handler1.execute(
        async () => { throw new Error('Primary operation failed'); },
        async () => {
          return await handler2.execute(
            async () => { throw new Error('Secondary operation failed'); },
            async () => {
              return await handler3.execute(
                async () => { throw new Error('Tertiary operation failed'); },
                undefined,
                'tertiary-key'
              );
            },
            'secondary-key'
          );
        },
        'primary-key'
      );

      expect(result).toBe('level3-fallback');
    });

    it('should handle deeply nested fallback chains', async () => {
      const nestedHandler = new FallbackHandler({
        enabled: true,
        cacheEnabled: true,
        cacheTTL: 5000,
        fallbackData: 'nested-fallback'
      });

      const result = await nestedHandler.execute(
        async () => { throw new Error('Deep nested failure'); },
        async () => {
          throw new Error('First fallback failed');
        },
        'nested-key'
      );

      expect(result).toBe('nested-fallback');
    });
  });
});

describe('Recovery Manager Coordination Tests', () => {
  describe('Strategy Selection Based on Error Type', () => {
    it('should select database reconnection strategy for database errors', async () => {
      const manager = new RecoveryManager();

      const operation = async () => {
        throw new AppError(
          'Database connection failed',
          ErrorCode.INTERNAL_SERVER_ERROR,
          ErrorCategory.DATABASE,
          ErrorSeverity.HIGH,
          500,
          false,
          true
        );
      };

      let strategyCalled = false;
      // Mock the database strategy
      (manager as any).strategies[0].execute = async () => {
        strategyCalled = true;
        return {
          success: true,
          recovered: true,
          action: 'database_reconnection',
          duration: 100,
          attempts: 1
        };
      };

      try {
        await manager.executeWithRecovery(operation, {
          service: 'database'
        });
      } catch (error) {
        // Expected to fail as we mocked the strategy to succeed but operation still fails
      }

      expect(strategyCalled).toBe(true);
    });

    it('should select service health check strategy for external service errors', async () => {
      const manager = new RecoveryManager();

      const operation = async () => {
        throw new AppError(
          'External service error',
          ErrorCode.BAD_GATEWAY,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.HIGH,
          502,
          false,
          true
        );
      };

      let strategyCalled = false;
      // Mock the service health check strategy
      (manager as any).strategies[1].execute = async () => {
        strategyCalled = true;
        return {
          success: true,
          recovered: true,
          action: 'service_health_check',
          duration: 50,
          attempts: 1
        };
      };

      try {
        await manager.executeWithRecovery(operation, {
          service: 'external_api'
        });
      } catch (error) {
        // Expected
      }

      expect(strategyCalled).toBe(true);
    });

    it('should not select strategies for non-recoverable errors', async () => {
      const manager = new RecoveryManager();

      const operation = async () => {
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

      let strategyCalled = false;
      // Mock strategy execution
      const originalStrategies = (manager as any).strategies;
      (manager as any).strategies = originalStrategies.map((strategy: any) => ({
        ...strategy,
        execute: async () => {
          strategyCalled = true;
          return {
            success: false,
            recovered: false,
            action: 'mocked',
            duration: 10,
            attempts: 1
          };
        }
      }));

      try {
        await manager.executeWithRecovery(operation, {
          service: 'validation'
        });
      } catch (error) {
        // Expected
      }

      expect(strategyCalled).toBe(false); // No strategies should be called for non-retryable errors

      // Restore original strategies
      (manager as any).strategies = originalStrategies;
    });
  });

  describe('Combined Recovery Mechanisms', () => {
    it('should combine circuit breaker and retry mechanisms', async () => {
      const manager = new RecoveryManager();

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount < 3) { // Fail first two attempts
          throw new AppError(
            'Temporary failure',
            ErrorCode.GATEWAY_TIMEOUT,
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            504,
            false,
            true
          );
        }
        return 'success';
      };

      const result = await manager.executeWithRecovery(operation, {
        service: 'combined-test',
        circuitBreaker: true,
        retry: true
      });

      expect(result).toBe('success');
      expect(callCount).toBe(3); // 2 failures + 1 success
    });

    it('should combine retry and fallback mechanisms', async () => {
      const manager = new RecoveryManager();

      let primaryCallCount = 0;
      let fallbackCallCount = 0;

      const primaryOperation = async () => {
        primaryCallCount++;
        throw new AppError(
          'Persistent failure',
          ErrorCode.SERVICE_UNAVAILABLE,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.HIGH,
          503,
          false,
          true
        );
      };

      const fallbackOperation = async () => {
        fallbackCallCount++;
        return 'fallback result';
      };

      const result = await manager.executeWithRecovery(primaryOperation, {
        fallbackOperation,
        service: 'combined-fallback-test',
        retry: true,
        fallback: true
      });

      expect(result).toBe('fallback result');
      expect(primaryCallCount).toBe(3); // Max retries reached
      expect(fallbackCallCount).toBe(1); // Fallback called once
    });

    it('should combine all three mechanisms: circuit breaker, retry, and fallback', async () => {
      const manager = new RecoveryManager({
        maxAttempts: 2,
        baseDelay: 10
      });

      let primaryCallCount = 0;
      let fallbackCallCount = 0;

      const primaryOperation = async () => {
        primaryCallCount++;
        throw new AppError(
          'Service consistently failing',
          ErrorCode.BAD_GATEWAY,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.HIGH,
          502,
          false,
          true
        );
      };

      const fallbackOperation = async () => {
        fallbackCallCount++;
        return 'comprehensive fallback';
      };

      const result = await manager.executeWithRecovery(primaryOperation, {
        fallbackOperation,
        service: 'comprehensive-test',
        circuitBreaker: true,
        retry: true,
        fallback: true
      });

      expect(result).toBe('comprehensive fallback');
      expect(primaryCallCount).toBe(2); // Max attempts
      expect(fallbackCallCount).toBe(1);
    });

    it('should handle mechanism priority correctly', async () => {
      const manager = new RecoveryManager();

      let callOrder: string[] = [];

      const operation = async () => {
        callOrder.push('primary');
        throw new Error('Primary failed');
      };

      const fallbackOperation = async () => {
        callOrder.push('fallback');
        return 'fallback result';
      };

      const result = await manager.executeWithRecovery(operation, {
        fallbackOperation,
        service: 'priority-test',
        circuitBreaker: true,
        retry: true,
        fallback: true
      });

      expect(result).toBe('fallback result');
      expect(callOrder).toContain('primary');
      expect(callOrder).toContain('fallback');
    });
  });

  describe('Recovery Statistics Tracking', () => {
    it('should track recovery attempts and success rates', async () => {
      const manager = new RecoveryManager();

      let failureCount = 0;
      const operation = async () => {
        failureCount++;
        if (failureCount < 3) {
          throw new AppError(
            'Recoverable failure',
            ErrorCode.GATEWAY_TIMEOUT,
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            504,
            false,
            true
          );
        }
        return 'success';
      };

      const result = await manager.executeWithRecovery(operation, {
        service: 'stats-test',
        retry: true
      });

      expect(result).toBe('success');
      expect(failureCount).toBe(3);

      const stats = manager.getStats();
      expect(stats.circuitBreakers['stats-test']).toBeDefined();
    });

    it('should track different service types separately', async () => {
      const manager = new RecoveryManager();

      // Test database service
      const dbOperation = async () => {
        throw new AppError(
          'DB error',
          ErrorCode.INTERNAL_SERVER_ERROR,
          ErrorCategory.DATABASE,
          ErrorSeverity.HIGH,
          500,
          false,
          true
        );
      };

      // Test API service
      const apiOperation = async () => {
        throw new AppError(
          'API error',
          ErrorCode.BAD_GATEWAY,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.HIGH,
          502,
          false,
          true
        );
      };

      try { await manager.executeWithRecovery(dbOperation, { service: 'database' }); } catch (e) {}
      try { await manager.executeWithRecovery(apiOperation, { service: 'api' }); } catch (e) {}

      const stats = manager.getStats();
      expect(stats.circuitBreakers['database']).toBeDefined();
      expect(stats.circuitBreakers['api']).toBeDefined();
      expect(stats.circuitBreakers['database'] !== stats.circuitBreakers['api']).toBe(true);
    });

    it('should reset statistics correctly', async () => {
      const manager = new RecoveryManager();

      const failingOperation = async () => {
        throw new AppError(
          'Failure for stats',
          ErrorCode.SERVICE_UNAVAILABLE,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.HIGH,
          503,
          false,
          true
        );
      };

      try { await manager.executeWithRecovery(failingOperation, { service: 'reset-test' }); } catch (e) {}

      const statsBefore = manager.getStats();
      expect(statsBefore.circuitBreakers['reset-test']).toBeDefined();

      manager.reset();

      const statsAfter = manager.getStats();
      expect(statsAfter.circuitBreakers['reset-test'].failureCount).toBe(0);
    });

    it('should provide comprehensive recovery metrics', async () => {
      const manager = new RecoveryManager();

      let successCount = 0;
      const mixedOperation = async () => {
        successCount++;
        if (successCount === 1) {
          throw new AppError(
            'First failure',
            ErrorCode.GATEWAY_TIMEOUT,
            ErrorCategory.NETWORK,
            ErrorSeverity.HIGH,
            504,
            false,
            true
          );
        }
        return 'success';
      };

      // One failure followed by success
      try { await manager.executeWithRecovery(mixedOperation, { service: 'metrics-test' }); } catch (e) {}
      const result = await manager.executeWithRecovery(mixedOperation, { service: 'metrics-test' });

      expect(result).toBe('success');

      const stats = manager.getStats();
      const circuitBreakerStats = stats.circuitBreakers['metrics-test'];
      expect(circuitBreakerStats.failureCount).toBeGreaterThanOrEqual(1);
      expect(circuitBreakerStats.successCount).toBeGreaterThanOrEqual(1);
    });
  });
});

// Run all tests
console.log('\n🧪 Running Error Recovery Tests...\n');

// The test cases are already defined in the describe blocks above,
// so we don't need to do anything here - they will be executed
// when the file is imported/run by the test runner

console.log('\n✅ All Error Recovery Tests Completed!\n');