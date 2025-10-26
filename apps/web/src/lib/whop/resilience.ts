// Whop Resilience Service
// Implements retry logic, circuit breaker pattern, and telemetry hooks for resilient external API calls

import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';
import { categorizeAndLogError, type ErrorContext, type CategorizedError } from '@/lib/errorCategorization';
import { ErrorCategory } from '@/lib/apiResponse';

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: (error: Error) => boolean;
}

/**
 * Circuit breaker state
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  monitoringWindow: number;
  name: string;
}

/**
 * Circuit breaker metrics
 */
interface CircuitBreakerMetrics {
  requests: number;
  failures: number;
  successes: number;
  timeouts: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

/**
 * Telemetry hooks configuration
 */
export interface TelemetryHooks {
  onRequestStart?: (context: RequestContext) => void;
  onRequestSuccess?: (context: RequestContext, response: any, duration: number) => void;
  onRequestError?: (context: RequestContext, error: Error, duration: number) => void;
  onRetryAttempt?: (context: RequestContext, attempt: number, delay: number) => void;
  onCircuitBreakerOpen?: (name: string, metrics: CircuitBreakerMetrics) => void;
  onCircuitBreakerClose?: (name: string, metrics: CircuitBreakerMetrics) => void;
  onCircuitBreakerHalfOpen?: (name: string, metrics: CircuitBreakerMetrics) => void;
}

/**
 * Request context for telemetry
 */
export interface RequestContext {
  operation: string;
  service: string;
  requestId: string;
  startTime: number;
  endpoint?: string;
  method?: string;
  userId?: string;
  companyId?: string;
  additionalData?: Record<string, any>;
}

/**
 * Resilience service configuration
 */
export interface ResilienceConfig {
  retryPolicy: Partial<RetryPolicy>;
  circuitBreaker: Partial<CircuitBreakerConfig>;
  telemetry: TelemetryHooks;
  enableMetrics: boolean;
  enableLogging: boolean;
}

/**
 * Default retry policy
 */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: (error: Error) => {
    // Default retryable error determination
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('network') ||
           message.includes('connection') ||
           message.includes('502') ||
           message.includes('503') ||
           message.includes('504') ||
           message.includes('server error') ||
           (error as any).status >= 500;
  }
};

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  successThreshold: 2,
  monitoringWindow: 60000, // 1 minute
  name: 'whop-api'
};

/**
 * Retry policy implementation with exponential backoff
 */
export class RetryPolicyExecutor {
  private config: RetryPolicy;

  constructor(config: Partial<RetryPolicy> = {}) {
    this.config = { ...DEFAULT_RETRY_POLICY, ...config };
  }

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: RequestContext,
    hooks?: TelemetryHooks
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        const result = await operation();

        // Success - no more retries needed
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            operation: context.operation,
            service: context.service,
            attempt,
            requestId: context.requestId
          });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.config.retryableErrors?.(lastError)) {
          // Not retryable, throw immediately
          break;
        }

        // Last attempt failed
        if (attempt > this.config.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt);

        // Call telemetry hook
        hooks?.onRetryAttempt?.(context, attempt, delay);

        logger.warn('Operation failed, retrying', {
          operation: context.operation,
          service: context.service,
          attempt,
          maxRetries: this.config.maxRetries,
          delay,
          error: lastError.message,
          requestId: context.requestId
        });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Calculate delay for retry attempt using exponential backoff
   */
  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelay);

    // Add jitter if enabled
    if (this.config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5); // 50-100% of calculated delay
    }

    return Math.floor(delay);
  }

  /**
   * Update retry policy configuration
   */
  updateConfig(config: Partial<RetryPolicy>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitState = CircuitState.CLOSED;
  private metrics: CircuitBreakerMetrics = {
    requests: 0,
    failures: 0,
    successes: 0,
    timeouts: 0
  };
  private halfOpenSuccessCount = 0;
  private hooks?: TelemetryHooks;

  constructor(config: Partial<CircuitBreakerConfig> = {}, hooks?: TelemetryHooks) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.hooks = hooks;
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: RequestContext
  ): Promise<T> {
    this.metrics.requests++;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (!this.shouldAttemptReset()) {
        throw new Error(`Circuit breaker is OPEN for ${this.config.name}`);
      }

      // Transition to half-open
      this.transitionToHalfOpen();
    }

    try {
      const result = await operation();

      // Success
      this.onSuccess();
      return result;
    } catch (error) {
      // Failure
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.metrics.lastFailureTime) return false;

    const timeSinceLastFailure = Date.now() - this.metrics.lastFailureTime;
    return timeSinceLastFailure >= this.config.recoveryTimeout;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.metrics.successes++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccessCount++;

      if (this.halfOpenSuccessCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }

    this.metrics.lastSuccessTime = Date.now();
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();

    // Check if we should open the circuit
    if (this.state === CircuitState.CLOSED && this.shouldOpenCircuit()) {
      this.transitionToOpen();
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.transitionToOpen();
    }
  }

  /**
   * Check if circuit should be opened based on failure rate
   */
  private shouldOpenCircuit(): boolean {
    const recentFailures = this.metrics.failures;
    const totalRequests = this.metrics.requests;

    // Simple threshold check
    return recentFailures >= this.config.failureThreshold;
  }

  /**
   * Transition to closed state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.halfOpenSuccessCount = 0;

    logger.info('Circuit breaker closed', {
      name: this.config.name,
      metrics: this.metrics
    });

    this.hooks?.onCircuitBreakerClose?.(this.config.name, this.metrics);
  }

  /**
   * Transition to open state
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;

    logger.warn('Circuit breaker opened', {
      name: this.config.name,
      metrics: this.metrics
    });

    this.hooks?.onCircuitBreakerOpen?.(this.config.name, this.metrics);
  }

  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenSuccessCount = 0;

    logger.info('Circuit breaker half-open', {
      name: this.config.name,
      metrics: this.metrics
    });

    this.hooks?.onCircuitBreakerHalfOpen?.(this.config.name, this.metrics);
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset circuit breaker metrics (for testing)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.metrics = {
      requests: 0,
      failures: 0,
      successes: 0,
      timeouts: 0
    };
    this.halfOpenSuccessCount = 0;
  }
}

/**
 * Telemetry collector for resilience operations
 */
export class TelemetryCollector {
  private hooks: TelemetryHooks;
  private config: WhopSdkConfig;

  constructor(hooks: TelemetryHooks = {}, config?: WhopSdkConfig) {
    this.hooks = hooks;
    this.config = config || whopConfig.get();
  }

  /**
   * Track request start
   */
  onRequestStart(context: RequestContext): void {
    if (this.config.enableMetrics) {
      metrics.recordCounter('whop.api.request_started', 1, {
        operation: context.operation,
        service: context.service
      });
    }

    this.hooks.onRequestStart?.(context);
  }

  /**
   * Track request success
   */
  onRequestSuccess(context: RequestContext, response: any, duration: number): void {
    if (this.config.enableMetrics) {
      metrics.recordHistogram('whop.api.request_duration', duration, {
        operation: context.operation,
        service: context.service,
        status: 'success'
      });
    }

    if (this.config.enableLogging) {
      logger.info('Whop API request succeeded', {
        ...context,
        duration,
        statusCode: (response as any)?.status
      });
    }

    this.hooks.onRequestSuccess?.(context, response, duration);
  }

  /**
   * Track request error
   */
  onRequestError(context: RequestContext, error: Error, duration: number): void {
    if (this.config.enableMetrics) {
      metrics.recordCounter('whop.api.request_error', 1, {
        operation: context.operation,
        service: context.service,
        error_type: error.name
      });
    }

    // Categorize and log error
    const errorContext: ErrorContext = {
      requestId: context.requestId,
      endpoint: context.endpoint,
      method: context.method,
      userId: context.userId,
      companyId: context.companyId,
      processingTimeMs: duration,
      additionalData: context.additionalData
    };

    categorizeAndLogError(error, errorContext);

    this.hooks.onRequestError?.(context, error, duration);
  }

  /**
   * Track retry attempt
   */
  onRetryAttempt(context: RequestContext, attempt: number, delay: number): void {
    if (this.config.enableMetrics) {
      metrics.recordCounter('whop.api.retry_attempt', 1, {
        operation: context.operation,
        service: context.service,
        attempt: attempt.toString()
      });
    }

    if (this.config.enableLogging) {
      logger.debug('Whop API retry attempt', {
        ...context,
        attempt,
        delay
      });
    }

    this.hooks.onRetryAttempt?.(context, attempt, delay);
  }
}

/**
 * Main resilience service that orchestrates retry, circuit breaker, and telemetry
 */
export class ResilienceService {
  private retryPolicy: RetryPolicyExecutor;
  private circuitBreaker: CircuitBreaker;
  private telemetry: TelemetryCollector;
  private config: ResilienceConfig;

  constructor(config: Partial<ResilienceConfig> = {}) {
    this.config = {
      retryPolicy: { ...DEFAULT_RETRY_POLICY, ...config.retryPolicy },
      circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config.circuitBreaker },
      telemetry: config.telemetry || {},
      enableMetrics: config.enableMetrics ?? true,
      enableLogging: config.enableLogging ?? true
    };

    this.retryPolicy = new RetryPolicyExecutor(this.config.retryPolicy);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreaker, this.config.telemetry);
    this.telemetry = new TelemetryCollector(this.config.telemetry);
  }

  /**
   * Execute a resilient operation with full resilience stack
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: RequestContext
  ): Promise<T> {
    const startTime = Date.now();

    // Track request start
    this.telemetry.onRequestStart(context);

    try {
      // Execute through circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        // Execute with retry logic
        return await this.retryPolicy.execute(operation, context, this.config.telemetry);
      }, context);

      // Track success
      const duration = Date.now() - startTime;
      this.telemetry.onRequestSuccess(context, result, duration);

      return result;
    } catch (error) {
      // Track error
      const duration = Date.now() - startTime;
      this.telemetry.onRequestError(context, error as Error, duration);

      throw error;
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  /**
   * Get circuit breaker metrics
   */
  getCircuitBreakerMetrics(): CircuitBreakerMetrics {
    return this.circuitBreaker.getMetrics();
  }

  /**
   * Reset circuit breaker (for testing/emergency recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Update retry policy configuration
   */
  updateRetryPolicy(config: Partial<RetryPolicy>): void {
    this.retryPolicy.updateConfig(config);
  }
}

/**
 * Default resilience service instance
 */
export const resilienceService = new ResilienceService();

/**
 * Convenience function for resilient execution
 */
export async function executeResiliently<T>(
  operation: () => Promise<T>,
  context: RequestContext,
  resilienceConfig?: Partial<ResilienceConfig>
): Promise<T> {
  const service = resilienceConfig
    ? new ResilienceService(resilienceConfig)
    : resilienceService;

  return service.execute(operation, context);
}

// Export types for external use
export type {
  ResilienceConfig,
  RetryPolicy,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  RequestContext
};
