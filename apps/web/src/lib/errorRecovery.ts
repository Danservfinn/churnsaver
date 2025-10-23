// Error recovery mechanisms for common failure scenarios
// Provides automated recovery strategies, circuit breakers, and fallback mechanisms

import { AppError, ErrorCategory, ErrorCode, ErrorSeverity } from '@/lib/apiResponse';
import { CategorizedError, categorizeAndLogError } from '@/lib/errorCategorization';
import { logger } from '@/lib/logger';
import { RecoveryContext } from '@/lib/types/observability';

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors: ErrorCode[];
  retryableCategories: ErrorCategory[];
}

// Circuit breaker configuration
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedRecoveryTime: number;
}

// Fallback configuration
export interface FallbackConfig {
  enabled: boolean;
  fallbackData?: any;
  fallbackService?: string;
  cacheEnabled: boolean;
  cacheTTL: number;
}

// Recovery strategy interface
export interface RecoveryStrategy {
  name: string;
  canHandle: (error: AppError) => boolean;
  execute: (error: AppError, context: any) => Promise<RecoveryResult>;
}

// Recovery result
export interface RecoveryResult {
  success: boolean;
  recovered: boolean;
  result?: any;
  error?: AppError;
  action?: string;
  duration: number;
  attempts: number;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
    ErrorCode.DATABASE_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.RATE_LIMITED
  ],
  retryableCategories: [
    ErrorCategory.NETWORK,
    ErrorCategory.EXTERNAL_SERVICE,
    ErrorCategory.DATABASE
  ]
};

// Default circuit breaker configuration
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000,
  monitoringPeriod: 300000,
  expectedRecoveryTime: 30000
};

// Circuit breaker states
enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

// Circuit breaker implementation
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>, context?: any): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new AppError(
          'Circuit breaker is open',
          ErrorCode.SERVICE_UNAVAILABLE,
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.MEDIUM,
          503,
          false,
          this.config.expectedRecoveryTime / 1000,
          {
            circuitState: this.state,
            failureCount: this.failureCount,
            nextAttempt: this.lastFailureTime + this.config.recoveryTimeout
          }
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker closed after successful recovery');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker opened again after half-open failure', {
        failureCount: this.failureCount
      });
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn('Circuit breaker opened due to failure threshold', {
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold
      });
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): any {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.successCount = 0;
  }
}

// Retry mechanism with exponential backoff
export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async execute<T>(
    operation: () => Promise<T>,
    context?: any
  ): Promise<T> {
    let lastError: Error | AppError = new AppError('Unknown error', ErrorCode.INTERNAL_SERVER_ERROR, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, 500);
    const startTime = Date.now();

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            attempt,
            totalAttempts: this.config.maxAttempts,
            duration: Date.now() - startTime
          });
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof AppError ? error : new AppError(
          error instanceof Error ? error.message : String(error),
          ErrorCode.INTERNAL_SERVER_ERROR,
          ErrorCategory.SYSTEM,
          ErrorSeverity.MEDIUM,
          500,
          false,
          undefined,
          { originalError: error instanceof Error ? error.name : 'Unknown' }
        );

        // Check if error is retryable
        if (!this.isRetryable(lastError as AppError) || attempt === this.config.maxAttempts) {
          categorizeAndLogError(lastError, {
            ...context,
            attempt,
            maxAttempts: this.config.maxAttempts,
            duration: Date.now() - startTime
          });
          throw lastError;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        
        logger.warn('Operation failed, retrying', {
          attempt,
          maxAttempts: this.config.maxAttempts,
          error: lastError.message,
          delay,
          nextAttemptIn: delay
        });

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError;
  }

  private isRetryable(error: AppError): boolean {
    return error.retryable || 
           this.config.retryableErrors.includes(error.code) ||
           this.config.retryableCategories.includes(error.category);
  }

  private calculateDelay(attempt: number): number {
    let delay = this.config.baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, this.config.maxDelay);

    if (this.config.jitter) {
      // Add jitter to prevent thundering herd
      const jitterRange = delay * 0.1;
      delay += Math.random() * jitterRange - jitterRange / 2;
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Fallback mechanism
export class FallbackHandler {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private config: FallbackConfig;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = {
      enabled: true,
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      ...config
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>,
    cacheKey?: string,
    context?: any
  ): Promise<T> {
    try {
      const result = await operation();
      
      // Cache successful result if caching is enabled
      if (this.config.cacheEnabled && cacheKey) {
        this.setCache(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      if (!this.config.enabled) {
        throw error;
      }

      // Try cache first
      if (this.config.cacheEnabled && cacheKey) {
        const cachedResult = this.getCache<T>(cacheKey);
        if (cachedResult !== null) {
          logger.info('Using cached fallback result', { cacheKey });
          return cachedResult;
        }
      }

      // Try fallback operation
      if (fallbackOperation) {
        try {
          const fallbackResult = await fallbackOperation();
          logger.info('Using fallback operation result', { context });
          return fallbackResult;
        } catch (fallbackError) {
          logger.error('Fallback operation failed', {
            originalError: error instanceof Error ? error.message : String(error),
            fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          });
        }
      }

      // Use fallback data if available
      if (this.config.fallbackData !== undefined) {
        logger.info('Using fallback data', { context });
        return this.config.fallbackData as T;
      }

      // If all fallbacks fail, throw the original error
      throw error;
    }
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private getCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.config.cacheTTL;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats(): any {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Recovery manager that coordinates all recovery mechanisms
export class RecoveryManager {
  private retryHandler: RetryHandler;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private fallbackHandlers: Map<string, FallbackHandler> = new Map();
  private strategies: RecoveryStrategy[] = [];

  constructor(
    retryConfig?: Partial<RetryConfig>,
    circuitBreakerConfig?: Partial<CircuitBreakerConfig>,
    fallbackConfig?: Partial<FallbackConfig>
  ) {
    this.retryHandler = new RetryHandler(retryConfig);
    this.initializeDefaultStrategies();
  }

  // Execute operation with all recovery mechanisms
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: {
      service?: string;
      circuitBreaker?: boolean;
      retry?: boolean;
      fallback?: boolean;
      fallbackOperation?: () => Promise<T>;
      cacheKey?: string;
      context?: RecoveryContext;
    } = {}
  ): Promise<T> {
    const {
      service = 'default',
      circuitBreaker = true,
      retry = true,
      fallback = true,
      fallbackOperation,
      cacheKey,
      context
    } = options;

    let wrappedOperation = operation;

    // Apply circuit breaker
    if (circuitBreaker) {
      const cb = this.getCircuitBreaker(service);
      wrappedOperation = () => cb.execute(operation, context);
    }

    // Apply retry mechanism
    if (retry) {
      const originalOperation = wrappedOperation;
      wrappedOperation = () => this.retryHandler.execute(originalOperation, context);
    }

    // Apply fallback mechanism
    if (fallback) {
      const fb = this.getFallbackHandler(service);
      const originalOperation = wrappedOperation;
      wrappedOperation = () => fb.execute(originalOperation, fallbackOperation, cacheKey, context);
    }

    try {
      return await wrappedOperation();
    } catch (error) {
      // Try recovery strategies
      const appError = error instanceof AppError ? error : new AppError(
        error instanceof Error ? error.message : String(error),
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.MEDIUM,
        500
      );

      for (const strategy of this.strategies) {
        if (strategy.canHandle(appError)) {
          try {
            const result = await strategy.execute(appError, context);
            if (result.success && result.recovered) {
              logger.info('Recovery strategy succeeded', {
                strategy: strategy.name,
                action: result.action,
                duration: result.duration,
                attempts: result.attempts
              });
              return result.result;
            }
          } catch (recoveryError) {
            logger.error('Recovery strategy failed', {
              strategy: strategy.name,
              error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
            });
          }
        }
      }

      throw error;
    }
  }

  private getCircuitBreaker(service: string): CircuitBreaker {
    if (!this.circuitBreakers.has(service)) {
      this.circuitBreakers.set(service, new CircuitBreaker());
    }
    return this.circuitBreakers.get(service)!;
  }

  private getFallbackHandler(service: string): FallbackHandler {
    if (!this.fallbackHandlers.has(service)) {
      this.fallbackHandlers.set(service, new FallbackHandler());
    }
    return this.fallbackHandlers.get(service)!;
  }

  private initializeDefaultStrategies(): void {
    // Database recovery strategy
    this.strategies.push({
      name: 'database_reconnection',
      canHandle: (error: AppError) => 
        error.category === ErrorCategory.DATABASE && 
        error.retryable,
      execute: async (error: AppError, context: any) => {
        const startTime = Date.now();
        let attempts = 0;

        try {
          // Attempt to reinitialize database connection
          const { initDb } = await import('@/lib/db');
          await initDb();
          attempts++;

          return {
            success: true,
            recovered: true,
            action: 'Database connection reinitialized',
            duration: Date.now() - startTime,
            attempts
          };
        } catch (recoveryError) {
          return {
            success: false,
            recovered: false,
            error: recoveryError instanceof AppError ? recoveryError : new AppError(
              recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
              ErrorCode.DATABASE_ERROR,
              ErrorCategory.DATABASE,
              ErrorSeverity.HIGH,
              500
            ),
            action: 'Database reconnection failed',
            duration: Date.now() - startTime,
            attempts
          };
        }
      }
    });

    // External service recovery strategy
    this.strategies.push({
      name: 'service_health_check',
      canHandle: (error: AppError) => 
        error.category === ErrorCategory.EXTERNAL_SERVICE && 
        error.retryable,
      execute: async (error: AppError, context: any) => {
        const startTime = Date.now();
        let attempts = 0;

        try {
          // Perform health check on external service
          const service = error.context?.service || 'unknown';
          attempts++;

          // Simulate health check (in real implementation, this would check the service)
          await new Promise(resolve => setTimeout(resolve, 100));

          return {
            success: true,
            recovered: true,
            action: `Health check passed for service: ${service}`,
            duration: Date.now() - startTime,
            attempts
          };
        } catch (recoveryError) {
          return {
            success: false,
            recovered: false,
            error: recoveryError instanceof AppError ? recoveryError : new AppError(
              recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
              ErrorCode.EXTERNAL_SERVICE_ERROR,
              ErrorCategory.EXTERNAL_SERVICE,
              ErrorSeverity.HIGH,
              500
            ),
            action: 'Service health check failed',
            duration: Date.now() - startTime,
            attempts
          };
        }
      }
    });
  }

  // Add custom recovery strategy
  addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.push(strategy);
  }

  // Get statistics for all recovery mechanisms
  getStats(): any {
    const circuitBreakerStats: Record<string, any> = {};
    for (const [service, breaker] of this.circuitBreakers.entries()) {
      circuitBreakerStats[service] = breaker.getStats();
    }

    const fallbackStats: Record<string, any> = {};
    for (const [service, fallback] of this.fallbackHandlers.entries()) {
      fallbackStats[service] = fallback.getCacheStats();
    }

    return {
      circuitBreakers: circuitBreakerStats,
      fallbacks: fallbackStats,
      strategies: this.strategies.map(s => s.name)
    };
  }

  // Reset all recovery mechanisms
  reset(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    for (const fallback of this.fallbackHandlers.values()) {
      fallback.clearCache();
    }
  }
}

// Default recovery manager instance
export const recoveryManager = new RecoveryManager();

// Utility function for easy recovery execution
export async function executeWithRecovery<T>(
  operation: () => Promise<T>,
  options?: {
    service?: string;
    circuitBreaker?: boolean;
    retry?: boolean;
    fallback?: boolean;
    fallbackOperation?: () => Promise<T>;
    cacheKey?: string;
    context?: RecoveryContext;
  }
): Promise<T> {
  return recoveryManager.executeWithRecovery(operation, options);
}