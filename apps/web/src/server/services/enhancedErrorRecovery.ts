// Enhanced Error Recovery Service
// Integrates circuit breaker, dead letter queue, transaction rollback, and memory pressure recovery

import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { categorizeAndLogError } from '@/lib/errorCategorization';
import { errorMonitoringIntegration } from '@/lib/errorMonitoringIntegration';
import { EnhancedCircuitBreaker, getCircuitBreaker, CircuitState } from '@/lib/circuitBreaker';
import { DeadLetterQueueService, addToDeadLetterQueue } from '@/lib/deadLetterQueue';
import { RecoveryContext } from '@/lib/types/observability';

// Enhanced recovery options
export interface EnhancedRecoveryOptions {
  service: string;
  operation: string;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  timeout?: number;
  circuitBreaker?: boolean;
  deadLetterQueue?: boolean;
  transactionRollback?: boolean;
  autoRepair?: boolean;
  memoryThreshold?: number;
  exponentialBackoff?: boolean;
  jobData?: any;
  companyId?: string;
  userId?: string;
  requestId?: string;
  priority?: number;
}

// Enhanced recovery result
export interface EnhancedRecoveryResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  duration: number;
  recoveryStrategy?: string;
  circuitBreakerState?: CircuitState;
  memoryUsage?: number;
  transactionRolledBack?: boolean;
  deadLetterQueued?: boolean;
  metrics?: RecoveryMetrics;
}

// Recovery metrics
export interface RecoveryMetrics {
  service: string;
  operation: string;
  errorCategory: string;
  errorCode: string;
  recoveryStrategy: string;
  success: boolean;
  attempts: number;
  duration: number;
  circuitBreakerState?: string;
  memoryUsage?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

// Transaction rollback info
export interface TransactionRollbackInfo {
  transactionId: string;
  serviceName: string;
  operationType: string;
  rollbackReason: string;
  affectedTables: string[];
  rollbackData?: Record<string, any>;
}

// Memory pressure info
export interface MemoryPressureInfo {
  serviceName: string;
  currentUsage: number;
  threshold: number;
  pressureDuration: number;
  recoveryAction: string;
  gcTriggered: boolean;
  processRestart: boolean;
}

// Recovery strategy configuration
export interface RecoveryStrategyConfig {
  database: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
    circuitBreaker: boolean;
    transactionRollback: boolean;
    autoRepair: boolean;
    timeout: number;
  };
  external_api: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
    exponentialBackoff: boolean;
    circuitBreaker: boolean;
    timeout: number;
  };
  job_queue: {
    maxRetries: number;
    retryDelay: number;
    exponentialBackoff: boolean;
    deadLetterQueue: boolean;
    timeout: number;
  };
  memory_intensive: {
    maxRetries: number;
    retryDelay: number;
    memoryThreshold: number;
    circuitBreaker: boolean;
    gcTriggerThreshold: number;
  };
}

// Default recovery strategy configuration
const DEFAULT_RECOVERY_CONFIG: RecoveryStrategyConfig = {
  database: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    circuitBreaker: true,
    transactionRollback: true,
    autoRepair: true,
    timeout: 30000
  },
  external_api: {
    maxRetries: 3,
    retryDelay: 1500,
    backoffMultiplier: 2,
    exponentialBackoff: true,
    circuitBreaker: true,
    timeout: 15000
  },
  job_queue: {
    maxRetries: 5,
    retryDelay: 2000,
    exponentialBackoff: true,
    deadLetterQueue: true,
    timeout: 60000
  },
  memory_intensive: {
    maxRetries: 2,
    retryDelay: 5000,
    memoryThreshold: 500 * 1024 * 1024, // 500MB
    circuitBreaker: true,
    gcTriggerThreshold: 400 * 1024 * 1024 // 400MB
  }
};

export class EnhancedErrorRecoveryService {
  private deadLetterQueue: DeadLetterQueueService;
  private circuitBreakers: Map<string, EnhancedCircuitBreaker> = new Map();
  private activeTransactions: Map<string, TransactionRollbackInfo> = new Map();
  private memoryMonitor: MemoryMonitor;

  constructor() {
    this.deadLetterQueue = new DeadLetterQueueService();
    this.memoryMonitor = new MemoryMonitor();
    this.initializeCircuitBreakers();
  }

  /**
   * Execute operation with enhanced recovery mechanisms
   */
  async executeWithRecovery<T = any>(
    operation: () => Promise<T>,
    options: EnhancedRecoveryOptions
  ): Promise<EnhancedRecoveryResult<T>> {
    const startTime = Date.now();
    const config = this.getRecoveryConfig(options.service);
    let attempts = 0;
    let lastError: Error | null = null;
    let circuitBreakerState: CircuitState | undefined;

    // Get or create circuit breaker for this service
    const circuitBreaker = this.getCircuitBreaker(options.service, config);

    try {
      // Check memory pressure before execution
      await this.checkMemoryPressure(options);

      // Execute operation through circuit breaker
      const result = await circuitBreaker.execute(
        async () => {
          attempts++;
          
          try {
            // Start transaction if rollback is enabled
            if (options.transactionRollback) {
              await this.startTransaction(options);
            }

            // Execute the operation with timeout
            const operationResult = await this.executeWithTimeout(
              operation,
              options.timeout || config.timeout
            );

            // Commit transaction if successful
            if (options.transactionRollback) {
              await this.commitTransaction(options);
            }

            return operationResult;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Rollback transaction if enabled
            if (options.transactionRollback) {
              await this.rollbackTransaction(options, lastError);
            }

            throw lastError;
          }
        },
        {
          companyId: options.companyId,
          requestId: options.requestId,
          timeout: options.timeout || config.timeout
        }
      );

      circuitBreakerState = circuitBreaker.getState();

      // Record successful recovery metrics
      await this.recordRecoveryMetrics({
        service: options.service,
        operation: options.operation,
        errorCategory: ErrorCategory.SYSTEM,
        errorCode: 'SUCCESS',
        recoveryStrategy: this.determineRecoveryStrategy(options),
        success: true,
        attempts,
        duration: Date.now() - startTime,
        circuitBreakerState,
        memoryUsage: this.memoryMonitor.getCurrentUsage(),
        metadata: {
          companyId: options.companyId,
          userId: options.userId,
          requestId: options.requestId
        }
      });

      return {
        success: true,
        data: result,
        attempts,
        duration: Date.now() - startTime,
        recoveryStrategy: this.determineRecoveryStrategy(options),
        circuitBreakerState,
        memoryUsage: this.memoryMonitor.getCurrentUsage()
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      circuitBreakerState = circuitBreaker.getState();

      // Determine if we should add to dead letter queue
      const shouldQueueForDeadLetter = 
        options.deadLetterQueue && 
        attempts >= (options.maxRetries || config.maxRetries);

      if (shouldQueueForDeadLetter) {
        try {
          await addToDeadLetterQueue(
            options.requestId || `job_${Date.now()}`,
            `${options.service}_${options.operation}`,
            options.jobData || {},
            lastError,
            {
              maxRetries: options.maxRetries || config.maxRetries,
              priority: options.priority || 0,
              companyId: options.companyId,
              metadata: {
                service: options.service,
                operation: options.operation,
                attempts,
                duration: Date.now() - startTime
              }
            }
          );
        } catch (dlqError) {
          logger.error('Failed to add job to dead letter queue', {
            error: dlqError instanceof Error ? dlqError.message : String(dlqError),
            originalError: lastError.message
          });
        }
      }

      // Record failed recovery metrics
      await this.recordRecoveryMetrics({
        service: options.service,
        operation: options.operation,
        errorCategory: this.getErrorCategory(lastError),
        errorCode: lastError.name || 'UNKNOWN_ERROR',
        recoveryStrategy: this.determineRecoveryStrategy(options),
        success: false,
        attempts,
        duration: Date.now() - startTime,
        circuitBreakerState,
        memoryUsage: this.memoryMonitor.getCurrentUsage(),
        errorMessage: lastError.message,
        metadata: {
          companyId: options.companyId,
          userId: options.userId,
          requestId: options.requestId,
          deadLetterQueued: shouldQueueForDeadLetter
        }
      });

      // Categorize and log the error
      await categorizeAndLogError(lastError, {
        service: options.service,
        operation: options.operation,
        attempts,
        duration: Date.now() - startTime,
        circuitBreakerState,
        memoryUsage: this.memoryMonitor.getCurrentUsage(),
        companyId: options.companyId,
        userId: options.userId,
        requestId: options.requestId
      });

      return {
        success: false,
        error: lastError,
        attempts,
        duration: Date.now() - startTime,
        recoveryStrategy: this.determineRecoveryStrategy(options),
        circuitBreakerState,
        memoryUsage: this.memoryMonitor.getCurrentUsage(),
        deadLetterQueued: shouldQueueForDeadLetter
      };
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutHandle);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  /**
   * Get recovery configuration for service
   */
  private getRecoveryConfig(service: string): any {
    switch (service) {
      case 'database':
        return DEFAULT_RECOVERY_CONFIG.database;
      case 'external_api':
        return DEFAULT_RECOVERY_CONFIG.external_api;
      case 'job_queue':
        return DEFAULT_RECOVERY_CONFIG.job_queue;
      case 'memory_intensive':
        return DEFAULT_RECOVERY_CONFIG.memory_intensive;
      default:
        return DEFAULT_RECOVERY_CONFIG.database;
    }
  }

  /**
   * Get or create circuit breaker for service
   */
  private getCircuitBreaker(service: string, config: any): EnhancedCircuitBreaker {
    if (!this.circuitBreakers.has(service)) {
      const circuitBreaker = getCircuitBreaker(service, {
        failureThreshold: 5,
        recoveryTimeout: 60000,
        successThreshold: 3,
        monitoringWindow: 300000,
        timeoutDuration: config.timeout,
        enableMetrics: true,
        enablePersistence: true
      });
      this.circuitBreakers.set(service, circuitBreaker);
    }
    return this.circuitBreakers.get(service)!;
  }

  /**
   * Initialize circuit breakers for common services
   */
  private initializeCircuitBreakers(): void {
    const services = ['database', 'external_api', 'job_queue', 'memory_intensive'];
    
    for (const service of services) {
      const config = this.getRecoveryConfig(service);
      this.getCircuitBreaker(service, config);
    }

    logger.info('Enhanced error recovery circuit breakers initialized', {
      services
    });
  }

  /**
   * Check for memory pressure
   */
  private async checkMemoryPressure(options: EnhancedRecoveryOptions): Promise<void> {
    const currentUsage = this.memoryMonitor.getCurrentUsage();
    const threshold = options.memoryThreshold || this.getRecoveryConfig(options.service).memoryThreshold;

    if (currentUsage > threshold) {
      await this.handleMemoryPressure({
        serviceName: options.service,
        currentUsage,
        threshold,
        pressureDuration: 0, // Would need to track this over time
        recoveryAction: 'gc_trigger',
        gcTriggered: true,
        processRestart: false
      });
    }
  }

  /**
   * Handle memory pressure
   */
  private async handleMemoryPressure(info: MemoryPressureInfo): Promise<void> {
    try {
      // Trigger garbage collection
      if (global.gc) {
        global.gc();
      }

      // Log memory pressure event
      await sql.query(`
        INSERT INTO memory_pressure_events (
          service_name, memory_usage_mb, memory_threshold_mb,
          pressure_duration_ms, recovery_action, recovery_success,
          gc_triggered, process_restart, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        info.serviceName,
        Math.round(info.currentUsage / 1024 / 1024),
        Math.round(info.threshold / 1024 / 1024),
        info.pressureDuration,
        info.recoveryAction,
        true, // Assume success for now
        info.gcTriggered,
        info.processRestart,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          usagePercentage: (info.currentUsage / info.threshold) * 100
        })
      ]);

      logger.warn('Memory pressure detected and handled', {
        serviceName: info.serviceName,
        currentUsageMB: Math.round(info.currentUsage / 1024 / 1024),
        thresholdMB: Math.round(info.threshold / 1024 / 1024),
        recoveryAction: info.recoveryAction,
        gcTriggered: info.gcTriggered
      });

    } catch (error) {
      logger.error('Failed to handle memory pressure', {
        serviceName: info.serviceName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start transaction for rollback support
   */
  private async startTransaction(options: EnhancedRecoveryOptions): Promise<void> {
    const transactionId = `tx_${options.requestId || Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.activeTransactions.set(transactionId, {
      transactionId,
      serviceName: options.service,
      operationType: options.operation,
      rollbackReason: '',
      affectedTables: []
    });

    // Start database transaction
    await sql.query('BEGIN');
    
    logger.debug('Transaction started', {
      transactionId,
      service: options.service,
      operation: options.operation
    });
  }

  /**
   * Commit transaction
   */
  private async commitTransaction(options: EnhancedRecoveryOptions): Promise<void> {
    await sql.query('COMMIT');
    
    // Clear transaction from active transactions
    const transactionId = this.findTransactionId(options);
    if (transactionId) {
      this.activeTransactions.delete(transactionId);
    }
    
    logger.debug('Transaction committed', {
      service: options.service,
      operation: options.operation
    });
  }

  /**
   * Rollback transaction
   */
  private async rollbackTransaction(options: EnhancedRecoveryOptions, error: Error): Promise<void> {
    const transactionId = this.findTransactionId(options);
    
    try {
      await sql.query('ROLLBACK');
      
      if (transactionId) {
        const transactionInfo = this.activeTransactions.get(transactionId);
        if (transactionInfo) {
          // Log rollback to database
          await sql.query(`
            INSERT INTO transaction_rollback_log (
              transaction_id, service_name, operation_type, rollback_reason,
              rollback_success, rollback_duration_ms, affected_tables,
              rollback_data, company_id, user_id, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `, [
            transactionId,
            options.service,
            options.operation,
            error.message,
            true, // Assume success for now
            0, // Would need to track duration
            transactionInfo.affectedTables,
            JSON.stringify(transactionInfo.rollbackData || {}),
            options.companyId,
            options.userId,
            options.requestId
          ]);

          this.activeTransactions.delete(transactionId);
        }
      }
      
      logger.warn('Transaction rolled back', {
        transactionId,
        service: options.service,
        operation: options.operation,
        error: error.message
      });
    } catch (rollbackError) {
      logger.error('Failed to rollback transaction', {
        transactionId,
        service: options.service,
        operation: options.operation,
        error: error.message,
        rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      });
    }
  }

  /**
   * Find transaction ID for options
   */
  private findTransactionId(options: EnhancedRecoveryOptions): string | undefined {
    for (const [id, transaction] of this.activeTransactions.entries()) {
      if (transaction.serviceName === options.service && 
          transaction.operationType === options.operation) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Determine recovery strategy based on options
   */
  private determineRecoveryStrategy(options: EnhancedRecoveryOptions): string {
    const strategies: string[] = [];
    
    if (options.circuitBreaker) strategies.push('circuit_breaker');
    if (options.deadLetterQueue) strategies.push('dead_letter_queue');
    if (options.transactionRollback) strategies.push('transaction_rollback');
    if (options.autoRepair) strategies.push('auto_repair');
    if (options.memoryThreshold) strategies.push('memory_management');
    if (options.exponentialBackoff) strategies.push('exponential_backoff');
    
    return strategies.join(',') || 'retry';
  }

  /**
   * Get error category from error
   */
  private getErrorCategory(error: Error): string {
    if (error.message.includes('timeout')) return ErrorCategory.EXTERNAL_SERVICE;
    if (error.message.includes('connection')) return ErrorCategory.DATABASE;
    if (error.message.includes('network')) return ErrorCategory.NETWORK;
    if (error.message.includes('memory')) return ErrorCategory.SYSTEM;
    return ErrorCategory.SYSTEM;
  }

  /**
   * Record recovery metrics
   */
  private async recordRecoveryMetrics(metrics: RecoveryMetrics): Promise<void> {
    try {
      await sql.query(`
        INSERT INTO error_recovery_metrics (
          service_name, operation_type, error_category, error_code,
          recovery_strategy, success, attempts, duration_ms,
          circuit_breaker_state, memory_usage_mb, error_message,
          metadata, company_id, user_id, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        metrics.service,
        metrics.operation,
        metrics.errorCategory,
        metrics.errorCode,
        metrics.recoveryStrategy,
        metrics.success,
        metrics.attempts,
        metrics.duration,
        metrics.circuitBreakerState,
        metrics.memoryUsage ? Math.round(metrics.memoryUsage / 1024 / 1024) : null,
        metrics.errorMessage,
        JSON.stringify(metrics.metadata || {}),
        metrics.metadata?.companyId || null,
        metrics.metadata?.userId || null,
        metrics.metadata?.requestId || null
      ]);

      // Also send to error monitoring integration
      if (metrics.success) {
        logger.info('Recovery operation successful', {
          service: metrics.service,
          operation: metrics.operation,
          strategy: metrics.recoveryStrategy,
          attempts: metrics.attempts,
          duration: metrics.duration
        });
      }
    } catch (error) {
      logger.error('Failed to record recovery metrics', {
        metrics,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get recovery statistics
   */
  async getRecoveryStats(options?: {
    service?: string;
    companyId?: string;
    timeRange?: { start: Date; end: Date };
  }): Promise<any> {
    try {
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (options?.service) {
        whereClause += ` AND service_name = $${params.length + 1}`;
        params.push(options.service);
      }

      if (options?.companyId) {
        whereClause += ` AND company_id = $${params.length + 1}`;
        params.push(options.companyId);
      }

      if (options?.timeRange) {
        whereClause += ` AND created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
        params.push(options.timeRange.start, options.timeRange.end);
      }

      const result = await sql.query(`
        SELECT 
          service_name,
          recovery_strategy,
          COUNT(*) as total_operations,
          COUNT(*) FILTER (WHERE success = true) as successful_operations,
          COUNT(*) FILTER (WHERE success = false) as failed_operations,
          AVG(attempts) as average_attempts,
          AVG(duration_ms) as average_duration_ms,
          MAX(duration_ms) as max_duration_ms,
          MIN(duration_ms) as min_duration_ms
        FROM error_recovery_metrics
        ${whereClause}
        GROUP BY service_name, recovery_strategy
        ORDER BY service_name, recovery_strategy
      `, params);

      return {
        stats: result.rows,
        circuitBreakerHealth: this.getCircuitBreakerHealth(),
        deadLetterQueueStats: await this.deadLetterQueue.getStats(options)
      };
    } catch (error) {
      logger.error('Failed to get recovery statistics', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        stats: [],
        circuitBreakerHealth: {},
        deadLetterQueueStats: {}
      };
    }
  }

  /**
   * Get circuit breaker health status
   */
  private getCircuitBreakerHealth(): any {
    const health: Record<string, any> = {};
    
    for (const [service, circuitBreaker] of this.circuitBreakers.entries()) {
      health[service] = circuitBreaker.getMetrics();
    }
    
    return health;
  }

  /**
   * Process dead letter queue
   */
  async processDeadLetterQueue(options?: {
    batchSize?: number;
    jobTypes?: string[];
    companyId?: string;
  }): Promise<{ processed: number; recovered: number; failed: number }> {
    return this.deadLetterQueue.processJobs(options);
  }

  /**
   * Clean up old recovery data
   */
  async cleanup(): Promise<{ errorRecoveryMetrics: number; deadLetterJobs: number }> {
    try {
      // Clean up old error recovery metrics
      const errorMetricsResult = await sql.query(`
        DELETE FROM error_recovery_metrics 
        WHERE created_at < NOW() - INTERVAL '90 days'
        RETURNING id
      `);

      // Clean up dead letter jobs
      const deadLetterResult = await this.deadLetterQueue.cleanup();

      return {
        errorRecoveryMetrics: errorMetricsResult.rows.length,
        deadLetterJobs: deadLetterResult.cleaned
      };
    } catch (error) {
      logger.error('Failed to cleanup recovery data', {
        error: error instanceof Error ? error.message : String(error)
      });
      return { errorRecoveryMetrics: 0, deadLetterJobs: 0 };
    }
  }

  /**
   * Reset all recovery mechanisms
   */
  async reset(): Promise<void> {
    // Reset circuit breakers
    for (const circuitBreaker of this.circuitBreakers.values()) {
      await circuitBreaker.reset();
    }

    // Clear active transactions
    this.activeTransactions.clear();

    // Reset memory monitor
    this.memoryMonitor.reset();

    logger.info('Enhanced error recovery service reset');
  }
}

// Memory monitor for tracking memory usage
class MemoryMonitor {
  private baselineUsage: number = 0;
  private peakUsage: number = 0;

  constructor() {
    this.baselineUsage = this.getCurrentUsage();
    this.peakUsage = this.baselineUsage;
  }

  getCurrentUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  getPeakUsage(): number {
    return this.peakUsage;
  }

  getUsagePercentage(): number {
    const current = this.getCurrentUsage();
    return (current / this.baselineUsage) * 100;
  }

  reset(): void {
    this.baselineUsage = this.getCurrentUsage();
    this.peakUsage = this.baselineUsage;
  }

  updatePeak(): void {
    const current = this.getCurrentUsage();
    if (current > this.peakUsage) {
      this.peakUsage = current;
    }
  }
}

// Export singleton instance
export const enhancedErrorRecovery = new EnhancedErrorRecoveryService();

// Export convenience function
export async function executeWithEnhancedRecovery<T = any>(
  operation: () => Promise<T>,
  options: EnhancedRecoveryOptions
): Promise<EnhancedRecoveryResult<T>> {
  return enhancedErrorRecovery.executeWithRecovery(operation, options);
}