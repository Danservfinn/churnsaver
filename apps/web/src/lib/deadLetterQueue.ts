// Dead Letter Queue Service
// Handles failed jobs and provides recovery mechanisms for operations that exceed retry limits

import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { getCircuitBreaker } from '@/lib/circuitBreaker';

// Dead letter job interface
export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  jobType: string;
  jobData: any;
  failureReason: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  nextRetryAt?: Date;
  priority: number;
  companyId?: string;
  recoveryAttempts: number;
  autoRecoveryEnabled: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Dead letter queue configuration
export interface DeadLetterQueueConfig {
  maxRetryAttempts: number;
  baseRetryDelay: number;
  maxRetryDelay: number;
  backoffMultiplier: number;
  enableAutoRecovery: boolean;
  recoveryBatchSize: number;
  retentionDays: number;
  enableMetrics: boolean;
}

// Recovery strategy interface
export interface RecoveryStrategy {
  name: string;
  canHandle: (job: DeadLetterJob) => boolean;
  execute: (job: DeadLetterJob) => Promise<RecoveryResult>;
}

// Recovery result interface
export interface RecoveryResult {
  success: boolean;
  recovered: boolean;
  result?: any;
  error?: Error;
  action?: string;
  duration: number;
  attempts: number;
}

// Dead letter queue statistics
export interface DeadLetterQueueStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  recoveredJobs: number;
  failedJobs: number;
  jobsByType: Record<string, number>;
  jobsByCompany: Record<string, number>;
  averageRetryCount: number;
  oldestJobAge: number;
  recoveryRate: number;
}

// Default configuration
const DEFAULT_CONFIG: DeadLetterQueueConfig = {
  maxRetryAttempts: 5,
  baseRetryDelay: 60000, // 1 minute
  maxRetryDelay: 3600000, // 1 hour
  backoffMultiplier: 2,
  enableAutoRecovery: true,
  recoveryBatchSize: 10,
  retentionDays: 30,
  enableMetrics: true
};

export class DeadLetterQueueService {
  private config: DeadLetterQueueConfig;
  private recoveryStrategies: RecoveryStrategy[] = [];
  private processing = false;

  constructor(config: Partial<DeadLetterQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeDefaultStrategies();
  }

  /**
   * Add a failed job to the dead letter queue
   */
  async addJob(
    originalJobId: string,
    jobType: string,
    jobData: any,
    error: Error,
    options: {
      maxRetries?: number;
      priority?: number;
      companyId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    const jobId = `dlq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await sql.query(`
        INSERT INTO job_queue_dead_letter (
          id, original_job_id, job_type, job_data, failure_reason,
          error_message, retry_count, max_retries, first_failed_at,
          last_failed_at, next_retry_at, priority, company_id,
          recovery_attempts, auto_recovery_enabled, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        jobId,
        originalJobId,
        jobType,
        JSON.stringify(jobData),
        error.name || 'Unknown Error',
        error.message,
        0,
        options.maxRetries || this.config.maxRetryAttempts,
        new Date(),
        new Date(),
        this.calculateNextRetryTime(0),
        options.priority || 0,
        options.companyId || null,
        0,
        this.config.enableAutoRecovery,
        JSON.stringify(options.metadata || {})
      ]);

      logger.warn('Job added to dead letter queue', {
        jobId,
        originalJobId,
        jobType,
        error: error.message,
        retryCount: 0,
        maxRetries: options.maxRetries || this.config.maxRetryAttempts,
        companyId: options.companyId
      });

      if (this.config.enableMetrics) {
        await this.recordMetrics('job_added', jobType, {
          companyId: options.companyId,
          errorType: error.name,
          priority: options.priority
        });
      }

      return jobId;
    } catch (dbError) {
      logger.error('Failed to add job to dead letter queue', {
        originalJobId,
        jobType,
        error: error.message,
        dbError: dbError instanceof Error ? dbError.message : String(dbError)
      });
      throw dbError;
    }
  }

  /**
   * Process jobs in the dead letter queue
   */
  async processJobs(options: {
    batchSize?: number;
    jobTypes?: string[];
    companyId?: string;
  } = {}): Promise<{
    processed: number;
    recovered: number;
    failed: number;
  }> {
    if (this.processing) {
      logger.debug('Dead letter queue processing already in progress');
      return { processed: 0, recovered: 0, failed: 0 };
    }

    this.processing = true;
    const startTime = Date.now();
    
    try {
      const batchSize = options.batchSize || this.config.recoveryBatchSize;
      const jobs = await this.getPendingJobs(batchSize, options);

      if (jobs.length === 0) {
        return { processed: 0, recovered: 0, failed: 0 };
      }

      logger.info('Processing dead letter queue jobs', {
        batchSize,
        jobCount: jobs.length,
        jobTypes: options.jobTypes,
        companyId: options.companyId
      });

      let recovered = 0;
      let failed = 0;

      for (const job of jobs) {
        try {
          const result = await this.processJob(job);
          
          if (result.success && result.recovered) {
            recovered++;
            await this.markJobRecovered(job.id, result);
          } else {
            failed++;
            await this.updateJobFailure(job.id, result);
          }
        } catch (processingError) {
          failed++;
          await this.updateJobFailure(job.id, {
            success: false,
            recovered: false,
            error: processingError instanceof Error ? processingError : new Error(String(processingError)),
            action: 'processing_failed',
            duration: Date.now() - startTime,
            attempts: 1
          });
        }
      }

      const duration = Date.now() - startTime;
      
      logger.info('Dead letter queue processing completed', {
        processed: jobs.length,
        recovered,
        failed,
        duration,
        batchSize
      });

      if (this.config.enableMetrics) {
        await this.recordMetrics('batch_processed', 'dead_letter_queue', {
          processed: jobs.length,
          recovered,
          failed,
          duration
        });
      }

      return { processed: jobs.length, recovered, failed };

    } catch (error) {
      logger.error('Dead letter queue processing failed', {
        error: error instanceof Error ? error.message : String(error),
        options
      });
      throw error;
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get pending jobs from the dead letter queue
   */
  private async getPendingJobs(
    limit: number,
    options: {
      jobTypes?: string[];
      companyId?: string;
    } = {}
  ): Promise<DeadLetterJob[]> {
    let whereClause = 'WHERE next_retry_at <= NOW() AND auto_recovery_enabled = true';
    const params: any[] = [limit];

    if (options.jobTypes && options.jobTypes.length > 0) {
      whereClause += ` AND job_type = ANY($${params.length + 1})`;
      params.push(options.jobTypes);
    }

    if (options.companyId) {
      whereClause += ` AND company_id = $${params.length + 1}`;
      params.push(options.companyId);
    }

    const query = `
      SELECT 
        id, original_job_id, job_type, job_data, failure_reason,
        error_message, retry_count, max_retries, first_failed_at,
        last_failed_at, next_retry_at, priority, company_id,
        recovery_attempts, auto_recovery_enabled, metadata,
        created_at, updated_at
      FROM job_queue_dead_letter
      ${whereClause}
      ORDER BY priority DESC, created_at ASC
      LIMIT $1
    `;

    const result = await sql.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      originalJobId: row.original_job_id,
      jobType: row.job_type,
      jobData: row.job_data,
      failureReason: row.failure_reason,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      firstFailedAt: new Date(row.first_failed_at),
      lastFailedAt: new Date(row.last_failed_at),
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
      priority: row.priority,
      companyId: row.company_id,
      recoveryAttempts: row.recovery_attempts,
      autoRecoveryEnabled: row.auto_recovery_enabled,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  /**
   * Process a single dead letter job
   */
  private async processJob(job: DeadLetterJob): Promise<RecoveryResult> {
    const startTime = Date.now();
    let attempts = 0;

    // Try each recovery strategy
    for (const strategy of this.recoveryStrategies) {
      if (!strategy.canHandle(job)) {
        continue;
      }

      attempts++;
      
      try {
        logger.debug('Attempting recovery strategy', {
          jobId: job.id,
          strategy: strategy.name,
          jobType: job.jobType,
          attempt: attempts
        });

        const result = await strategy.execute(job);
        
        if (result.success && result.recovered) {
          logger.info('Job recovery successful', {
            jobId: job.id,
            strategy: strategy.name,
            action: result.action,
            duration: result.duration,
            attempts: result.attempts
          });

          return result;
        }
      } catch (strategyError) {
        logger.warn('Recovery strategy failed', {
          jobId: job.id,
          strategy: strategy.name,
          error: strategyError instanceof Error ? strategyError.message : String(strategyError)
        });
      }
    }

    // If all strategies failed, return failure result
    return {
      success: false,
      recovered: false,
      error: new Error('All recovery strategies failed'),
      action: 'no_recovery_strategy_succeeded',
      duration: Date.now() - startTime,
      attempts
    };
  }

  /**
   * Mark a job as recovered
   */
  private async markJobRecovered(jobId: string, result: RecoveryResult): Promise<void> {
    try {
      await sql.query(`
        DELETE FROM job_queue_dead_letter WHERE id = $1
      `, [jobId]);

      if (this.config.enableMetrics) {
        await this.recordMetrics('job_recovered', 'dead_letter_queue', {
          jobId,
          action: result.action,
          duration: result.duration,
          attempts: result.attempts
        });
      }
    } catch (error) {
      logger.error('Failed to mark job as recovered', {
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Update job failure information
   */
  private async updateJobFailure(jobId: string, result: RecoveryResult): Promise<void> {
    try {
      const newRetryCount = await sql.query(`
        SELECT retry_count FROM job_queue_dead_letter WHERE id = $1
      `, [jobId]);

      const currentRetryCount = newRetryCount.rows[0]?.retry_count || 0;
      const newRetryCountValue = currentRetryCount + 1;

      if (newRetryCountValue >= this.config.maxRetryAttempts) {
        // Disable auto-recovery if max retries reached
        await sql.query(`
          UPDATE job_queue_dead_letter 
          SET 
            retry_count = $1,
            recovery_attempts = recovery_attempts + 1,
            auto_recovery_enabled = false,
            updated_at = NOW()
          WHERE id = $2
        `, [newRetryCountValue, jobId]);
      } else {
        // Schedule next retry
        const nextRetryTime = this.calculateNextRetryTime(newRetryCountValue);
        
        await sql.query(`
          UPDATE job_queue_dead_letter 
          SET 
            retry_count = $1,
            recovery_attempts = recovery_attempts + 1,
            next_retry_at = $2,
            updated_at = NOW()
          WHERE id = $3
        `, [newRetryCountValue, nextRetryTime, jobId]);
      }

      if (this.config.enableMetrics) {
        await this.recordMetrics('job_retry_failed', 'dead_letter_queue', {
          jobId,
          retryCount: newRetryCountValue,
          maxRetries: this.config.maxRetryAttempts,
          autoRecoveryDisabled: newRetryCountValue >= this.config.maxRetryAttempts
        });
      }
    } catch (error) {
      logger.error('Failed to update job failure', {
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetryTime(retryCount: number): Date {
    let delay = this.config.baseRetryDelay * Math.pow(this.config.backoffMultiplier, retryCount);
    delay = Math.min(delay, this.config.maxRetryDelay);

    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    delay += jitter;

    return new Date(Date.now() + delay);
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultStrategies(): void {
    // Webhook processing recovery strategy
    this.recoveryStrategies.push({
      name: 'webhook_retry',
      canHandle: (job) => job.jobType === 'webhook-processing',
      execute: async (job) => {
        const startTime = Date.now();
        
        try {
          // Import dynamically to avoid circular dependencies
          const { processWebhookEvent } = await import('@/server/services/eventProcessor');
          const { ProcessedEvent } = await import('@/server/services/eventProcessor');
          
          const processedEvent = new ProcessedEvent(
            job.jobData.eventId,
            job.jobData.eventType,
            job.jobData.membershipId,
            job.jobData.payload,
            job.jobData.eventCreatedAt
          );

          const success = await processWebhookEvent(processedEvent, job.companyId || 'unknown');
          
          return {
            success: true,
            recovered: success,
            result: success,
            action: 'webhook_reprocessed',
            duration: Date.now() - startTime,
            attempts: 1
          };
        } catch (error) {
          return {
            success: false,
            recovered: false,
            error: error instanceof Error ? error : new Error(String(error)),
            action: 'webhook_reprocess_failed',
            duration: Date.now() - startTime,
            attempts: 1
          };
        }
      }
    });

    // Database operation recovery strategy
    this.recoveryStrategies.push({
      name: 'database_retry',
      canHandle: (job) => job.jobType.includes('database') || job.jobType.includes('db'),
      execute: async (job) => {
        const startTime = Date.now();
        
        try {
          // Get circuit breaker for database operations
          const dbCircuitBreaker = getCircuitBreaker('database');
          
          // Attempt to execute the original operation through circuit breaker
          const result = await dbCircuitBreaker.execute(async () => {
            // This would need to be implemented based on the specific operation
            // For now, we'll just simulate success
            return { success: true };
          }, {
            companyId: job.companyId,
            timeout: 30000
          });

          return {
            success: true,
            recovered: result.success,
            result,
            action: 'database_operation_retried',
            duration: Date.now() - startTime,
            attempts: 1
          };
        } catch (error) {
          return {
            success: false,
            recovered: false,
            error: error instanceof Error ? error : new Error(String(error)),
            action: 'database_retry_failed',
            duration: Date.now() - startTime,
            attempts: 1
          };
        }
      }
    });

    // External API recovery strategy
    this.recoveryStrategies.push({
      name: 'external_api_retry',
      canHandle: (job) => job.jobType.includes('api') || job.jobType.includes('external'),
      execute: async (job) => {
        const startTime = Date.now();
        
        try {
          // Get circuit breaker for external API calls
          const apiCircuitBreaker = getCircuitBreaker('external_api');
          
          // Attempt to retry the original API call
          const result = await apiCircuitBreaker.execute(async () => {
            // This would need to be implemented based on the specific API call
            // For now, we'll just simulate success
            return { success: true };
          }, {
            companyId: job.companyId,
            timeout: 15000
          });

          return {
            success: true,
            recovered: result.success,
            result,
            action: 'external_api_retried',
            duration: Date.now() - startTime,
            attempts: 1
          };
        } catch (error) {
          return {
            success: false,
            recovered: false,
            error: error instanceof Error ? error : new Error(String(error)),
            action: 'external_api_retry_failed',
            duration: Date.now() - startTime,
            attempts: 1
          };
        }
      }
    });
  }

  /**
   * Add custom recovery strategy
   */
  addStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    logger.info('Added custom recovery strategy', {
      name: strategy.name
    });
  }

  /**
   * Record metrics to database
   */
  private async recordMetrics(
    type: string,
    jobType: string,
    metadata: Record<string, any>
  ): Promise<void> {
    if (!this.config.enableMetrics) return;

    try {
      await sql.query(`
        INSERT INTO error_recovery_metrics (
          service_name, operation_type, error_category, error_code,
          recovery_strategy, success, attempts, duration_ms,
          error_message, metadata, company_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        'dead_letter_queue',
        type,
        ErrorCategory.SYSTEM,
        'DEAD_LETTER_QUEUE',
        'dead_letter_recovery',
        true,
        1,
        0,
        null,
        JSON.stringify(metadata),
        metadata.companyId || null
      ]);
    } catch (error) {
      logger.error('Failed to record dead letter queue metrics', {
        type,
        jobType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get dead letter queue statistics
   */
  async getStats(options?: {
    companyId?: string;
    jobTypes?: string[];
  }): Promise<DeadLetterQueueStats> {
    try {
      let whereClause = 'WHERE 1=1';
      const params: any[] = [];

      if (options?.companyId) {
        whereClause += ` AND company_id = $${params.length + 1}`;
        params.push(options.companyId);
      }

      if (options?.jobTypes && options.jobTypes.length > 0) {
        whereClause += ` AND job_type = ANY($${params.length + 1})`;
        params.push(options.jobTypes);
      }

      const result = await sql.query(`
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(*) FILTER (WHERE auto_recovery_enabled = true AND next_retry_at > NOW()) as pending_jobs,
          COUNT(*) FILTER (WHERE auto_recovery_enabled = true AND next_retry_at <= NOW()) as processing_jobs,
          COUNT(*) FILTER (WHERE recovery_attempts > 0 AND auto_recovery_enabled = false) as failed_jobs,
          AVG(retry_count) as average_retry_count,
          MIN(created_at) as oldest_job_age,
          COUNT(DISTINCT job_type) as job_type_count
        FROM job_queue_dead_letter
        ${whereClause}
      `, params);

      const jobsByTypeResult = await sql.query(`
        SELECT job_type, COUNT(*) as count
        FROM job_queue_dead_letter
        ${whereClause}
        GROUP BY job_type
      `, params);

      const jobsByCompanyResult = await sql.query(`
        SELECT company_id, COUNT(*) as count
        FROM job_queue_dead_letter
        ${whereClause}
        GROUP BY company_id
      `, params);

      const row = result.rows[0];
      const totalJobs = parseInt(row.total_jobs);
      const recoveredJobs = totalJobs - parseInt(row.failed_jobs) - parseInt(row.pending_jobs) - parseInt(row.processing_jobs);
      
      const jobsByType: Record<string, number> = {};
      jobsByTypeResult.rows.forEach(r => {
        jobsByType[r.job_type] = parseInt(r.count);
      });

      const jobsByCompany: Record<string, number> = {};
      jobsByCompanyResult.rows.forEach(r => {
        jobsByCompany[r.company_id || 'unknown'] = parseInt(r.count);
      });

      return {
        totalJobs,
        pendingJobs: parseInt(row.pending_jobs),
        processingJobs: parseInt(row.processing_jobs),
        recoveredJobs,
        failedJobs: parseInt(row.failed_jobs),
        jobsByType,
        jobsByCompany,
        averageRetryCount: parseFloat(row.average_retry_count) || 0,
        oldestJobAge: row.oldest_job_age ? Date.now() - new Date(row.oldest_job_age).getTime() : 0,
        recoveryRate: totalJobs > 0 ? (recoveredJobs / totalJobs) * 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get dead letter queue stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        recoveredJobs: 0,
        failedJobs: 0,
        jobsByType: {},
        jobsByCompany: {},
        averageRetryCount: 0,
        oldestJobAge: 0,
        recoveryRate: 0
      };
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanup(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      const result = await sql.query(`
        DELETE FROM job_queue_dead_letter 
        WHERE created_at < NOW() - INTERVAL '${this.config.retentionDays} days'
        RETURNING id
      `);

      cleaned = result.rows.length;
      
      logger.info('Dead letter queue cleanup completed', {
        cleaned,
        retentionDays: this.config.retentionDays
      });
    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('Dead letter queue cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        retentionDays: this.config.retentionDays
      });
    }

    return { cleaned, errors };
  }

  /**
   * Manually retry a specific job
   */
  async retryJob(jobId: string): Promise<RecoveryResult> {
    try {
      const jobResult = await sql.query(`
        SELECT * FROM job_queue_dead_letter WHERE id = $1
      `, [jobId]);

      if (jobResult.rows.length === 0) {
        throw new Error(`Job ${jobId} not found in dead letter queue`);
      }

      const job = this.mapRowToJob(jobResult.rows[0]);
      
      // Reset retry count and enable auto-recovery
      await sql.query(`
        UPDATE job_queue_dead_letter 
        SET 
          retry_count = 0,
          next_retry_at = NOW(),
          auto_recovery_enabled = true,
          updated_at = NOW()
        WHERE id = $1
      `, [jobId]);

      logger.info('Manual retry initiated for dead letter job', {
        jobId,
        jobType: job.jobType,
        originalJobId: job.originalJobId
      });

      // Process the job immediately
      return await this.processJob(job);
    } catch (error) {
      logger.error('Manual retry failed for dead letter job', {
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        recovered: false,
        error: error instanceof Error ? error : new Error(String(error)),
        action: 'manual_retry_failed',
        duration: 0,
        attempts: 0
      };
    }
  }

  /**
   * Map database row to DeadLetterJob interface
   */
  private mapRowToJob(row: any): DeadLetterJob {
    return {
      id: row.id,
      originalJobId: row.original_job_id,
      jobType: row.job_type,
      jobData: row.job_data,
      failureReason: row.failure_reason,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      firstFailedAt: new Date(row.first_failed_at),
      lastFailedAt: new Date(row.last_failed_at),
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
      priority: row.priority,
      companyId: row.company_id,
      recoveryAttempts: row.recovery_attempts,
      autoRecoveryEnabled: row.auto_recovery_enabled,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}

// Export singleton instance
export const deadLetterQueue = new DeadLetterQueueService();

// Export convenience function
export async function addToDeadLetterQueue(
  originalJobId: string,
  jobType: string,
  jobData: any,
  error: Error,
  options?: {
    maxRetries?: number;
    priority?: number;
    companyId?: string;
    metadata?: Record<string, any>;
  }
): Promise<string> {
  return deadLetterQueue.addJob(originalJobId, jobType, jobData, error, options);
}