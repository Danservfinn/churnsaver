// Enhanced Circuit Breaker Implementation
// Provides advanced circuit breaker functionality with database persistence and monitoring

import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';

// Circuit breaker states
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open', 
  HALF_OPEN = 'half_open'
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  monitoringWindow: number;
  timeoutDuration: number;
  enableMetrics: boolean;
  enablePersistence: boolean;
  maxHalfOpenCalls: number;
}

// Circuit breaker metrics
export interface CircuitBreakerMetrics {
  name: string;
  state: CircuitState;
  requests: number;
  successes: number;
  failures: number;
  timeouts: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  failureRate: number;
  averageResponseTime: number;
  nextAttemptTime?: number;
}

// Circuit breaker event data
interface CircuitBreakerEvent {
  circuitName: string;
  previousState: CircuitState;
  newState: CircuitState;
  triggerReason: string;
  failureCount: number;
  successCount: number;
  timeoutMs?: number;
  recoveryTimeoutMs?: number;
  metadata?: Record<string, any>;
  companyId?: string;
}

// Default configuration
const DEFAULT_CONFIG: Partial<CircuitBreakerConfig> = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  successThreshold: 3,
  monitoringWindow: 300000, // 5 minutes
  timeoutDuration: 30000, // 30 seconds
  enableMetrics: true,
  enablePersistence: true,
  maxHalfOpenCalls: 5
};

export class EnhancedCircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: CircuitBreakerMetrics;
  private requestHistory: Array<{ timestamp: number; success: boolean; duration: number }> = [];
  private halfOpenCalls = 0;
  private lastStateChange = 0;

  constructor(config: Partial<CircuitBreakerConfig>) {
    this.config = {
      name: config.name || 'default',
      ...DEFAULT_CONFIG,
      ...config
    } as CircuitBreakerConfig;

    this.metrics = {
      name: this.config.name,
      state: this.state,
      requests: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      failureRate: 0,
      averageResponseTime: 0
    };

    this.loadPersistedState();
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: {
      companyId?: string;
      requestId?: string;
      timeout?: number;
    }
  ): Promise<T> {
    const startTime = Date.now();
    this.metrics.requests++;

    try {
      // Check if circuit is open
      if (this.state === CircuitState.OPEN) {
        if (this.shouldAttemptReset()) {
          await this.transitionToHalfOpen('Recovery timeout elapsed');
        } else {
          throw new AppError(
            `Circuit breaker is OPEN for ${this.config.name}`,
            ErrorCode.SERVICE_UNAVAILABLE,
            ErrorCategory.EXTERNAL_SERVICE,
            ErrorSeverity.MEDIUM,
            503,
            false,
            undefined,
            {
              circuitName: this.config.name,
              state: this.state,
              failureCount: this.metrics.failures,
              nextAttemptIn: Math.ceil((this.metrics.nextAttemptTime! - Date.now()) / 1000)
            }
          );
        }
      }

      // Set timeout if provided
      let timeoutHandle: NodeJS.Timeout | undefined;
      if (context?.timeout) {
        timeoutHandle = setTimeout(() => {
          this.onTimeout();
        }, context.timeout);
      }

      // Execute the operation
      const result = await operation();

      // Clear timeout if operation completed
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      // Handle success
      await this.onSuccess();
      
      const duration = Date.now() - startTime;
      this.updateAverageResponseTime(duration);

      if (this.config.enableMetrics) {
        this.recordMetrics('success', duration, context);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Handle failure
      await this.onFailure(error as Error);

      if (this.config.enableMetrics) {
        this.recordMetrics('failure', duration, context, error as Error);
      }

      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private async onSuccess(): Promise<void> {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();

    // Add to request history
    this.requestHistory.push({
      timestamp: Date.now(),
      success: true,
      duration: Date.now() - Date.now()
    });

    // Clean old history
    this.cleanupHistory();

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenCalls++;
      
      if (this.halfOpenCalls >= this.config.successThreshold) {
        await this.transitionToClosed('Success threshold reached in half-open state');
      }
    }
  }

  /**
   * Handle failed operation
   */
  private async onFailure(error: Error): Promise<void> {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();

    // Add to request history
    this.requestHistory.push({
      timestamp: Date.now(),
      success: false,
      duration: Date.now() - Date.now()
    });

    // Clean old history
    this.cleanupHistory();

    if (this.state === CircuitState.HALF_OPEN) {
      await this.transitionToOpen('Failure in half-open state');
    } else if (this.state === CircuitState.CLOSED && this.shouldOpenCircuit()) {
      await this.transitionToOpen('Failure threshold reached');
    }

    logger.warn('Circuit breaker operation failed', {
      circuitName: this.config.name,
      state: this.state,
      error: error.message,
      failureCount: this.metrics.failures,
      successCount: this.metrics.successes
    });
  }

  /**
   * Handle operation timeout
   */
  private onTimeout(): void {
    this.metrics.timeouts++;
    this.metrics.lastFailureTime = Date.now();

    logger.warn('Circuit breaker operation timed out', {
      circuitName: this.config.name,
      state: this.state,
      timeoutDuration: this.config.timeoutDuration
    });

    // Treat timeout as failure
    this.onFailure(new Error(`Operation timed out after ${this.config.timeoutDuration}ms`));
  }

  /**
   * Check if circuit should open based on failure rate
   */
  private shouldOpenCircuit(): boolean {
    const recentRequests = this.requestHistory.filter(
      req => Date.now() - req.timestamp <= this.config.monitoringWindow
    );

    if (recentRequests.length < this.config.failureThreshold) {
      return false;
    }

    const recentFailures = recentRequests.filter(req => !req.success).length;
    const failureRate = recentFailures / recentRequests.length;

    return failureRate >= 0.5 || recentFailures >= this.config.failureThreshold;
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.metrics.lastFailureTime) return false;
    
    return Date.now() - this.metrics.lastFailureTime >= this.config.recoveryTimeout;
  }

  /**
   * Transition to closed state
   */
  private async transitionToClosed(reason: string): Promise<void> {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.halfOpenCalls = 0;
    this.lastStateChange = Date.now();

    await this.logStateTransition(previousState, CircuitState.CLOSED, reason);

    logger.info('Circuit breaker closed', {
      circuitName: this.config.name,
      reason,
      metrics: this.getMetrics()
    });

    if (this.config.enablePersistence) {
      await this.persistState();
    }
  }

  /**
   * Transition to open state
   */
  private async transitionToOpen(reason: string): Promise<void> {
    const previousState = this.state;
    this.state = CircuitState.OPEN;
    this.metrics.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
    this.lastStateChange = Date.now();

    await this.logStateTransition(previousState, CircuitState.OPEN, reason);

    logger.warn('Circuit breaker opened', {
      circuitName: this.config.name,
      reason,
      failureCount: this.metrics.failures,
      nextAttemptIn: this.config.recoveryTimeout
    });

    if (this.config.enablePersistence) {
      await this.persistState();
    }
  }

  /**
   * Transition to half-open state
   */
  private async transitionToHalfOpen(reason: string): Promise<void> {
    const previousState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenCalls = 0;
    this.lastStateChange = Date.now();

    await this.logStateTransition(previousState, CircuitState.HALF_OPEN, reason);

    logger.info('Circuit breaker half-open', {
      circuitName: this.config.name,
      reason,
      maxHalfOpenCalls: this.config.maxHalfOpenCalls
    });

    if (this.config.enablePersistence) {
      await this.persistState();
    }
  }

  /**
   * Log state transition to database
   */
  private async logStateTransition(
    previousState: CircuitState,
    newState: CircuitState,
    reason: string
  ): Promise<void> {
    if (!this.config.enablePersistence) return;

    try {
      await sql.query(`
        INSERT INTO circuit_breaker_events (
          circuit_name, previous_state, new_state, trigger_reason,
          failure_count, success_count, timeout_ms, recovery_timeout_ms,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        this.config.name,
        previousState,
        newState,
        reason,
        this.metrics.failures,
        this.metrics.successes,
        this.config.timeoutDuration,
        this.config.recoveryTimeout,
        JSON.stringify({
          requests: this.metrics.requests,
          timeouts: this.metrics.timeouts,
          averageResponseTime: this.metrics.averageResponseTime,
          monitoringWindow: this.config.monitoringWindow,
          failureThreshold: this.config.failureThreshold
        })
      ]);
    } catch (error) {
      logger.error('Failed to log circuit breaker state transition', {
        circuitName: this.config.name,
        previousState,
        newState,
        reason,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clean up old request history
   */
  private cleanupHistory(): void {
    const cutoff = Date.now() - this.config.monitoringWindow;
    this.requestHistory = this.requestHistory.filter(req => req.timestamp > cutoff);
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(duration: number): void {
    if (this.metrics.requests === 0) {
      this.metrics.averageResponseTime = duration;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (this.metrics.requests - 1) + duration) / this.metrics.requests;
    }
  }

  /**
   * Record metrics to database
   */
  private async recordMetrics(
    type: 'success' | 'failure',
    duration: number,
    context?: { companyId?: string; requestId?: string },
    error?: Error
  ): Promise<void> {
    if (!this.config.enablePersistence) return;

    try {
      await sql.query(`
        INSERT INTO error_recovery_metrics (
          service_name, operation_type, error_category, error_code,
          recovery_strategy, success, attempts, duration_ms,
          circuit_breaker_state, error_message, metadata,
          company_id, user_id, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        this.config.name,
        'circuit_breaker_execution',
        type === 'success' ? ErrorCategory.EXTERNAL_SERVICE : error ? ErrorCategory.EXTERNAL_SERVICE : ErrorCategory.SYSTEM,
        type === 'success' ? 'SUCCESS' : error?.name || 'UNKNOWN_ERROR',
        'circuit_breaker',
        type === 'success',
        1,
        duration,
        this.state,
        error?.message || null,
        JSON.stringify({
          circuitName: this.config.name,
          failureThreshold: this.config.failureThreshold,
          successThreshold: this.config.successThreshold,
          monitoringWindow: this.config.monitoringWindow,
          requestHistory: this.requestHistory.length
        }),
        context?.companyId || null,
        null, // user_id would need to be passed in context
        context?.requestId || null
      ]);
    } catch (dbError) {
      logger.error('Failed to record circuit breaker metrics', {
        circuitName: this.config.name,
        type,
        duration,
        error: dbError instanceof Error ? dbError.message : String(dbError)
      });
    }
  }

  /**
   * Persist circuit breaker state to database
   */
  private async persistState(): Promise<void> {
    // This would typically store state in a cache or database
    // For now, we'll just log the state change
    logger.debug('Circuit breaker state persisted', {
      circuitName: this.config.name,
      state: this.state,
      metrics: this.metrics
    });
  }

  /**
   * Load persisted state from database
   */
  private async loadPersistedState(): Promise<void> {
    // This would typically load state from cache or database
    // For now, we'll start with a clean state
    logger.debug('Circuit breaker state loaded', {
      circuitName: this.config.name,
      initialState: this.state
    });
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const recentRequests = this.requestHistory.filter(
      req => Date.now() - req.timestamp <= this.config.monitoringWindow
    );

    const recentFailures = recentRequests.filter(req => !req.success).length;
    this.metrics.failureRate = recentRequests.length > 0 ? recentFailures / recentRequests.length : 0;
    this.metrics.state = this.state;

    return { ...this.metrics };
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker to closed state
   */
  async reset(): Promise<void> {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.metrics = {
      name: this.config.name,
      state: this.state,
      requests: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      failureRate: 0,
      averageResponseTime: 0
    };
    this.requestHistory = [];
    this.halfOpenCalls = 0;
    this.lastStateChange = Date.now();

    await this.logStateTransition(previousState, CircuitState.CLOSED, 'Manual reset');

    logger.info('Circuit breaker reset', {
      circuitName: this.config.name
    });
  }

  /**
   * Force circuit breaker to open state
   */
  async forceOpen(reason: string = 'Manual force open'): Promise<void> {
    if (this.state !== CircuitState.OPEN) {
      await this.transitionToOpen(reason);
    }
  }

  /**
   * Force circuit breaker to close state
   */
  async forceClose(reason: string = 'Manual force close'): Promise<void> {
    if (this.state !== CircuitState.CLOSED) {
      await this.transitionToClosed(reason);
    }
  }
}

// Circuit breaker registry for managing multiple circuit breakers
class CircuitBreakerRegistry {
  private circuitBreakers: Map<string, EnhancedCircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): EnhancedCircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const circuitBreaker = new EnhancedCircuitBreaker({ name, ...config });
      this.circuitBreakers.set(name, circuitBreaker);
    }
    return this.circuitBreakers.get(name)!;
  }

  /**
   * Get all circuit breaker metrics
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
      metrics[name] = circuitBreaker.getMetrics();
    }
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  async resetAll(): Promise<void> {
    const resetPromises = Array.from(this.circuitBreakers.values()).map(cb => cb.reset());
    await Promise.all(resetPromises);
  }

  /**
   * Get circuit breaker health status
   */
  getHealthStatus(): {
    healthy: boolean;
    total: number;
    open: number;
    halfOpen: number;
    closed: number;
    details: Record<string, CircuitBreakerMetrics>;
  } {
    const metrics = this.getAllMetrics();
    let open = 0, halfOpen = 0, closed = 0;

    for (const metric of Object.values(metrics)) {
      switch (metric.state) {
        case CircuitState.OPEN:
          open++;
          break;
        case CircuitState.HALF_OPEN:
          halfOpen++;
          break;
        case CircuitState.CLOSED:
          closed++;
          break;
      }
    }

    const total = this.circuitBreakers.size;
    const healthy = open === 0; // Consider unhealthy if any circuits are open

    return {
      healthy,
      total,
      open,
      halfOpen,
      closed,
      details: metrics
    };
  }
}

// Export singleton registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Export convenience function
export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): EnhancedCircuitBreaker {
  return circuitBreakerRegistry.getCircuitBreaker(name, config);
}