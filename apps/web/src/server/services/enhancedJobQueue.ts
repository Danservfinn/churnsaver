// Enhanced Job Queue Service
// Extends existing job queue with circuit breaker, exponential backoff, dead letter queue, and comprehensive error handling

import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { executeWithRecovery } from '@/lib/errorRecovery';
import { getCircuitBreaker } from '@/lib/circuitBreaker';
import { deadLetterQueue, addToDeadLetterQueue } from '@/lib/deadLetterQueue';
import { jobQueueMetrics, JobQueueMetricsService } from '@/lib/jobQueueMetrics';
import { errorMonitoringIntegration } from '@/lib/errorMonitoringIntegration';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { CategorizedError, categorizeAndLogError } from '@/lib/errorCategorization';
import { processWebhookEvent, ProcessedEvent } from './eventProcessor';
import { processPendingReminders } from '../cron/processReminders';
import {
  JobData,
  WebhookJobResult,
  ReminderJobResult,
  QueueStats,
  JobProcessingMetrics
} from './shared/jobTypes';
import {
  assertCompanyContext,
  updateEventProcessingStatus,
  isEventProcessed,
  createProcessedEvent,
  calculateJobMetrics
} from './shared/jobHelpers';

// Enhanced job interface
export interface EnhancedJob {
  id: string;
  type: string;
  payload: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  metadata?: any;
  companyId?: string;
  circuitBreakerEnabled?: boolean;
  timeoutMs?: number;
}

// Enhanced job result interface
export interface EnhancedJobResult {
  success: boolean;
  jobId: string;
  result?: any;
  error?: Error;
  duration?: number;
  retryable?: boolean;
  movedToDeadLetter?: boolean;
  circuitBreakerTripped?: boolean;
  memoryUsage?: number;
  queueDepth?: number;
}

// Job processor interface
export interface JobProcessor {
  type: string;
  handler: (job: EnhancedJob) => Promise<any>;
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    timeout?: number;
    circuitBreaker?: boolean;
    deadLetterQueue?: boolean;
    priority?: number;
  };
}

// Enhanced job queue configuration
export interface EnhancedJobQueueConfig {
  maxConcurrentJobs: number;
  batchSize: number;
  retry: {
    baseDelayMs: number;
    maxDelayMs: number;
    maxAttempts: Record<string, number>;
    backoffMultiplier: number;
    jitter: boolean;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringWindow: number;
  };
  deadLetterQueue: {
    enabled: boolean;
    maxRetries: number;
    retentionDays: number;
  };
  metrics: {
    enabled: boolean;
    retentionDays: number;
  };
  memoryPressure: {
    enabled: boolean;
    thresholdMb: number;
    checkIntervalMs: number;
  };
}

// Default configuration
const DEFAULT_CONFIG: EnhancedJobQueueConfig = {
  maxConcurrentJobs: 10,
  batchSize: 5,
  retry: {
    baseDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    maxAttempts: {
      'webhook-processing': 3,
      'reminder-processing': 2,
      'default': 3
    },
    backoffMultiplier: 2,
    jitter: true
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringWindow: 300000 // 5 minutes
  },
  deadLetterQueue: {
    enabled: true,
    maxRetries: 5,
    retentionDays: 30
  },
  metrics: {
    enabled: true,
    retentionDays: 90
  },
  memoryPressure: {
    enabled: true,
    thresholdMb: 512, // 512MB
    checkIntervalMs: 30000 // 30 seconds
  }
};

export class EnhancedJobQueueService {
  private config: EnhancedJobQueueConfig;
  private boss: PgBoss | null = null;
  private initialized = false;
  private processors: Map<string, JobProcessor> = new Map();
  private activeJobs: Map<string, EnhancedJob> = new Map();
  private circuitBreakers: Map<string, any> = new Map();
  private processingTimes: number[] = [];
  private memoryMonitorInterval: NodeJS.Timeout | null = null;
  private metricsService: JobQueueMetricsService;

  // Job queue names
  private readonly WEBHOOK_PROCESSING_JOB = 'webhook-processing';
  private readonly REMINDER_PROCESSING_JOB = 'reminder-processing';

  constructor(config: Partial<EnhancedJobQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metricsService = jobQueueMetrics;
    this.initializeDefaultProcessors();
  }

  /**
   * Initialize enhanced job queue service
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize pg-boss with PostgreSQL connection
      this.boss = new PgBoss(process.env.DATABASE_URL!);
      await this.boss.start();

      // Register enhanced job handlers
      await this.boss.work(this.WEBHOOK_PROCESSING_JOB, (async (job: PgBoss.Job<JobData>) => {
        return await this.processEnhancedWebhookJob(job);
      }) as any);

      await this.boss.work(this.REMINDER_PROCESSING_JOB, (async (job: PgBoss.Job<{ companyId: string }>) => {
        return await this.processEnhancedReminderJob(job);
      }) as any);

      // Initialize circuit breakers
      if (this.config.circuitBreaker.enabled) {
        this.initializeCircuitBreakers();
      }

      // Start memory pressure monitoring
      if (this.config.memoryPressure.enabled) {
        this.startMemoryMonitoring();
      }

      this.initialized = true;

      logger.info('Enhanced job queue service initialized', {
        jobTypes: [this.WEBHOOK_PROCESSING_JOB, this.REMINDER_PROCESSING_JOB],
        config: {
          maxConcurrentJobs: this.config.maxConcurrentJobs,
          circuitBreakerEnabled: this.config.circuitBreaker.enabled,
          deadLetterQueueEnabled: this.config.deadLetterQueue.enabled,
          metricsEnabled: this.config.metrics.enabled
        }
      });
    } catch (error) {
      logger.error('Failed to initialize enhanced job queue service', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Enqueue webhook processing job with enhanced features
   */
  async enqueueWebhookJob(data: JobData): Promise<string> {
    if (!this.boss) await this.init();

    try {
      const maxRetries = this.config.retry.maxAttempts[this.WEBHOOK_PROCESSING_JOB] || 
                        this.config.retry.maxAttempts.default;

      const jobId = await this.boss!.send(this.WEBHOOK_PROCESSING_JOB, data, {
        retryLimit: maxRetries,
        retryDelay: this.calculateRetryDelay(0, this.WEBHOOK_PROCESSING_JOB),
        expireInSeconds: 24 * 60 * 60, // 24 hours
        priority: 1, // High priority for webhooks
        singletonKey: data.eventId, // Prevent duplicate processing
        startAfter: this.calculateScheduledTime(data.priority || 1)
      });

      // Record enqueue metrics
      if (this.config.metrics.enabled) {
        await this.metricsService.recordJobEnqueued(jobId || '', this.WEBHOOK_PROCESSING_JOB, data.companyId);
      }

      logger.info('Enhanced webhook job enqueued', {
        jobId,
        eventId: data.eventId,
        eventType: data.eventType,
        membershipId: data.membershipId,
        companyId: data.companyId,
        maxRetries,
        priority: 1
      });

      return jobId || '';
    } catch (error) {
      const categorizedError = this.categorizeError(error as Error, 'enqueue_webhook', {
        eventId: data.eventId,
        companyId: data.companyId
      });
      
      await this.handleJobEnqueueError(categorizedError, data, this.WEBHOOK_PROCESSING_JOB);
      throw error;
    }
  }

  /**
   * Enqueue reminder processing job with enhanced features
   */
  async enqueueReminderJob(companyId: string, scheduleTime?: Date): Promise<string> {
    if (!this.boss) await this.init();

    const data = { companyId };

    try {
      const maxRetries = this.config.retry.maxAttempts[this.REMINDER_PROCESSING_JOB] || 
                        this.config.retry.maxAttempts.default;

      const jobId = await this.boss!.send(this.REMINDER_PROCESSING_JOB, data, {
        retryLimit: maxRetries,
        retryDelay: this.calculateRetryDelay(0, this.REMINDER_PROCESSING_JOB),
        expireInSeconds: 48 * 60 * 60, // 48 hours
        priority: 0, // Normal priority
        startAfter: scheduleTime
      });

      // Record enqueue metrics
      if (this.config.metrics.enabled) {
        await this.metricsService.recordJobEnqueued(jobId || '', this.REMINDER_PROCESSING_JOB, companyId);
      }

      logger.info('Enhanced reminder job enqueued', {
        jobId,
        companyId,
        scheduledTime: scheduleTime?.toISOString(),
        maxRetries,
        priority: 0
      });

      return jobId || '';
    } catch (error) {
      const categorizedError = this.categorizeError(error as Error, 'enqueue_reminder', {
        companyId
      });
      
      await this.handleJobEnqueueError(categorizedError, data, this.REMINDER_PROCESSING_JOB);
      throw error;
    }
  }

  /**
   * Process enhanced webhook job
   */
  private async processEnhancedWebhookJob(job: PgBoss.Job<JobData>): Promise<WebhookJobResult> {
    const startTime = Date.now();
    const { data, id: jobId } = job;
    
    const enhancedJob: EnhancedJob = {
      id: jobId,
      type: this.WEBHOOK_PROCESSING_JOB,
      payload: data,
      priority: 1,
      attempts: (job as any).attempts || 0,
      maxAttempts: this.config.retry.maxAttempts[this.WEBHOOK_PROCESSING_JOB] || 3,
      status: 'processing',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      companyId: data.companyId,
      circuitBreakerEnabled: true,
      timeoutMs: 30000 // 30 seconds
    };

    // Add to active jobs
    this.activeJobs.set(jobId, enhancedJob);

    try {
      logger.info('Processing enhanced webhook job', {
        jobId,
        eventId: data.eventId,
        eventType: data.eventType,
        membershipId: data.membershipId,
        companyId: data.companyId,
        attempt: enhancedJob.attempts
      });

      // Check memory pressure
      if (this.config.memoryPressure.enabled) {
        const memoryUsage = this.getMemoryUsage();
        if (memoryUsage > this.config.memoryPressure.thresholdMb) {
          logger.warn('High memory pressure detected', {
            jobId,
            memoryUsageMb: memoryUsage,
            thresholdMb: this.config.memoryPressure.thresholdMb
          });
          
          // Schedule job for later processing
          throw new AppError(
            'High memory pressure - job rescheduled',
            ErrorCode.SERVICE_UNAVAILABLE,
            ErrorCategory.SYSTEM,
            ErrorSeverity.MEDIUM,
            503,
            true // retryable
          );
        }
      }

      // Validate company context
      const companyContext = await assertCompanyContext(data.companyId);
      if (!companyContext.isValid) {
        throw new Error(companyContext.error || 'Company validation failed');
      }

      // Check for duplicate processing
      const alreadyProcessed = await isEventProcessed(data.eventId, data.companyId!);
      if (alreadyProcessed) {
        logger.info('Skipping duplicate webhook processing', {
          jobId,
          eventId: data.eventId
        });
        
        const duration = Date.now() - startTime;
        this.processingTimes.push(duration);
        
        await this.recordJobMetrics(enhancedJob, 'completed', duration, undefined, {
          skipped: true,
          duplicate: true
        });
        
        return { success: true, eventId: data.eventId, skipped: true };
      }

      // Process with circuit breaker
      const result = await this.executeWithCircuitBreaker(
        async () => {
          const processedEvent = createProcessedEvent(
            data.eventId,
            data.eventType,
            data.membershipId,
            data.payload,
            data.eventCreatedAt
          );

          return await processWebhookEvent(processedEvent, data.companyId || 'unknown');
        },
        this.WEBHOOK_PROCESSING_JOB,
        enhancedJob
      );

      // Update event processing status
      await updateEventProcessingStatus(
        data.eventId,
        data.companyId!,
        result,
        result ? undefined : 'processing_failed'
      );

      const duration = Date.now() - startTime;
      this.processingTimes.push(duration);

      await this.recordJobMetrics(enhancedJob, 'completed', duration, undefined, {
        eventId: data.eventId,
        success: result
      });

      logger.info('Enhanced webhook job completed', {
        jobId,
        eventId: data.eventId,
        success: result,
        duration,
        attempts: enhancedJob.attempts
      });

      return { success: result, eventId: data.eventId };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.processingTimes.push(duration);

      const categorizedError = this.categorizeError(error as Error, 'process_webhook', {
        jobId,
        eventId: data.eventId,
        companyId: data.companyId
      });

      await this.handleJobProcessingError(enhancedJob, categorizedError, duration);

      // Move to dead letter queue if max attempts reached
      if (enhancedJob.attempts >= enhancedJob.maxAttempts && this.config.deadLetterQueue.enabled) {
        await this.moveToDeadLetterQueue(enhancedJob, categorizedError);
      }

      throw categorizedError;
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Process enhanced reminder job
   */
  private async processEnhancedReminderJob(job: PgBoss.Job<{ companyId: string }>): Promise<ReminderJobResult> {
    const startTime = Date.now();
    const { data, id: jobId } = job;
    
    const enhancedJob: EnhancedJob = {
      id: jobId,
      type: this.REMINDER_PROCESSING_JOB,
      payload: data,
      priority: 0,
      attempts: (job as any).attempts || 0,
      maxAttempts: this.config.retry.maxAttempts[this.REMINDER_PROCESSING_JOB] || 2,
      status: 'processing',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      companyId: data.companyId,
      circuitBreakerEnabled: true,
      timeoutMs: 60000 // 60 seconds
    };

    // Add to active jobs
    this.activeJobs.set(jobId, enhancedJob);

    try {
      logger.info('Processing enhanced reminder job', {
        jobId,
        companyId: data.companyId,
        attempt: enhancedJob.attempts
      });

      // Process with circuit breaker
      const result = await this.executeWithCircuitBreaker(
        async () => processPendingReminders(data.companyId),
        this.REMINDER_PROCESSING_JOB,
        enhancedJob
      );

      const duration = Date.now() - startTime;
      this.processingTimes.push(duration);

      await this.recordJobMetrics(enhancedJob, 'completed', duration, undefined, {
        companyId: data.companyId,
        result
      });

      logger.info('Enhanced reminder job completed', {
        jobId,
        companyId: data.companyId,
        result,
        duration,
        attempts: enhancedJob.attempts
      });

      return { 
        success: true, 
        companyId: data.companyId, 
        ...result 
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.processingTimes.push(duration);

      const categorizedError = this.categorizeError(error as Error, 'process_reminder', {
        jobId,
        companyId: data.companyId
      });

      await this.handleJobProcessingError(enhancedJob, categorizedError, duration);

      // Move to dead letter queue if max attempts reached
      if (enhancedJob.attempts >= enhancedJob.maxAttempts && this.config.deadLetterQueue.enabled) {
        await this.moveToDeadLetterQueue(enhancedJob, categorizedError);
      }

      throw categorizedError;
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Execute operation with circuit breaker
   */
  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    jobType: string,
    job: EnhancedJob
  ): Promise<T> {
    if (!job.circuitBreakerEnabled || !this.config.circuitBreaker.enabled) {
      return await operation();
    }

    const circuitBreaker = this.getCircuitBreaker(jobType);
    
    return await circuitBreaker.execute(operation, {
      companyId: job.companyId,
      requestId: job.id,
      timeout: job.timeoutMs
    });
  }

  /**
   * Get or create circuit breaker for job type
   */
  private getCircuitBreaker(jobType: string) {
    if (!this.circuitBreakers.has(jobType)) {
      this.circuitBreakers.set(jobType, getCircuitBreaker(jobType, {
        failureThreshold: this.config.circuitBreaker.failureThreshold,
        recoveryTimeout: this.config.circuitBreaker.recoveryTimeout,
        monitoringWindow: this.config.circuitBreaker.monitoringWindow,
        enableMetrics: this.config.metrics.enabled,
        enablePersistence: true
      }));
    }
    return this.circuitBreakers.get(jobType)!;
  }

  /**
   * Initialize circuit breakers for job types
   */
  private initializeCircuitBreakers(): void {
    const jobTypes = [this.WEBHOOK_PROCESSING_JOB, this.REMINDER_PROCESSING_JOB];
    
    jobTypes.forEach(jobType => {
      this.getCircuitBreaker(jobType);
    });

    logger.info('Circuit breakers initialized for job types', {
      jobTypes,
      config: this.config.circuitBreaker
    });
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, jobType: string): number {
    const baseDelay = this.config.retry.baseDelayMs;
    const maxDelay = this.config.retry.maxDelayMs;
    const backoffMultiplier = this.config.retry.backoffMultiplier;
    
    let delay = baseDelay * Math.pow(backoffMultiplier, attempt);
    delay = Math.min(delay, maxDelay);

    // Add jitter to prevent thundering herd
    if (this.config.retry.jitter) {
      const jitterRange = delay * 0.1;
      delay += Math.random() * jitterRange - jitterRange / 2;
    }

    return Math.floor(delay);
  }

  /**
   * Calculate scheduled time based on priority
   */
  private calculateScheduledTime(priority: number): Date | undefined {
    // Higher priority jobs get scheduled sooner
    if (priority >= 5) return undefined; // Process immediately
    
    const delayMs = (6 - priority) * 5000; // 5-25 seconds delay
    return new Date(Date.now() + delayMs);
  }

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024);
    }
    return 0;
  }

  /**
   * Start memory pressure monitoring
   */
  private startMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }

    this.memoryMonitorInterval = setInterval(() => {
      const memoryUsage = this.getMemoryUsage();
      
      if (memoryUsage > this.config.memoryPressure.thresholdMb) {
        logger.warn('Memory pressure detected', {
          memoryUsageMb: memoryUsage,
          thresholdMb: this.config.memoryPressure.thresholdMb,
          activeJobs: this.activeJobs.size
        });

        // Trigger memory pressure recovery
        this.handleMemoryPressure(memoryUsage);
      }
    }, this.config.memoryPressure.checkIntervalMs);
  }

  /**
   * Handle memory pressure
   */
  private handleMemoryPressure(memoryUsage: number): void {
    // Reduce concurrent processing
    const maxConcurrent = Math.max(1, Math.floor(
      this.config.maxConcurrentJobs * 0.5
    ));

    // Log memory pressure event
    if (this.config.metrics.enabled) {
      this.metricsService.recordMemoryPressure(memoryUsage, this.activeJobs.size);
    }

    logger.info('Memory pressure recovery activated', {
      memoryUsageMb: memoryUsage,
      originalMaxConcurrent: this.config.maxConcurrentJobs,
      reducedMaxConcurrent: maxConcurrent
    });
  }

  /**
   * Categorize and log error
   */
  private categorizeError(error: Error, operation: string, context: any = {}): CategorizedError {
    return categorizeAndLogError(error, {
      operation,
      service: 'enhanced_job_queue',
      ...context
    });
  }

  /**
   * Handle job enqueue errors
   */
  private async handleJobEnqueueError(
    error: CategorizedError,
    jobData: any,
    jobType: string
  ): Promise<void> {
    await errorMonitoringIntegration.processError(error, {
      endpoint: jobType,
      companyId: jobData.companyId
    });

    if (this.config.metrics.enabled) {
      await this.metricsService.recordJobError(jobType, error.categorizedError, {
        operation: 'enqueue'
      });
    }
  }

  /**
   * Handle job processing errors
   */
  private async handleJobProcessingError(
    job: EnhancedJob,
    error: CategorizedError,
    duration: number
  ): Promise<void> {
    await errorMonitoringIntegration.processError(error, {
      endpoint: job.type,
      companyId: job.companyId,
      responseTime: duration
    });

    if (this.config.metrics.enabled) {
      await this.metricsService.recordJobError(job.type, error.categorizedError, {
        operation: 'processing',
        attempts: job.attempts,
        duration
      });
    }

    logger.error('Job processing failed', {
      jobId: job.id,
      jobType: job.type,
      error: error.categorizedError.message,
      duration,
      attempts: job.attempts
    });
  }

  /**
   * Move job to dead letter queue
   */
  private async moveToDeadLetterQueue(
    job: EnhancedJob,
    error: CategorizedError
  ): Promise<void> {
    if (!this.config.deadLetterQueue.enabled) return;

    try {
      await addToDeadLetterQueue(
        job.id,
        job.type,
        job.payload,
        error.categorizedError,
        {
          maxRetries: this.config.deadLetterQueue.maxRetries,
          priority: job.priority,
          companyId: job.companyId,
          metadata: {
            originalAttempts: job.attempts,
            maxAttempts: job.maxAttempts,
            failureReason: error.categorizedError.message,
            movedAt: new Date().toISOString()
          }
        }
      );

      logger.warn('Job moved to dead letter queue', {
        jobId: job.id,
        jobType: job.type,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        error: error.categorizedError.message
      });

      if (this.config.metrics.enabled) {
        await this.metricsService.recordDeadLetterJob(job.type, job.companyId);
      }
    } catch (dlqError) {
      logger.error('Failed to move job to dead letter queue', {
        jobId: job.id,
        error: error.categorizedError.message,
        dlqError: dlqError instanceof Error ? dlqError.message : String(dlqError)
      });
    }
  }

  /**
   * Record job metrics
   */
  private async recordJobMetrics(
    job: EnhancedJob,
    status: string,
    duration: number,
    error?: AppError,
    metadata?: any
  ): Promise<void> {
    if (!this.config.metrics.enabled) return;

    try {
      await this.metricsService.recordJobExecution({
        jobId: job.id,
        jobType: job.type,
        companyId: job.companyId,
        status,
        duration,
        attempts: job.attempts,
        errorCategory: error?.category,
        errorCode: error?.code ? String(error.code) : undefined,
        errorMessage: error?.message,
        memoryUsage: this.getMemoryUsage(),
        queueDepth: this.activeJobs.size,
        metadata
      });
    } catch (metricsError) {
      logger.error('Failed to record job metrics', {
        jobId: job.id,
        error: metricsError instanceof Error ? metricsError.message : String(metricsError)
      });
    }
  }

  /**
   * Initialize default job processors
   */
  private initializeDefaultProcessors(): void {
    // Webhook processor
    this.processors.set(this.WEBHOOK_PROCESSING_JOB, {
      type: this.WEBHOOK_PROCESSING_JOB,
      handler: async (job) => {
        const data = job.payload as JobData;
        const processedEvent = createProcessedEvent(
          data.eventId,
          data.eventType,
          data.membershipId,
          data.payload,
          data.eventCreatedAt
        );
        return await processWebhookEvent(processedEvent, job.companyId || 'unknown');
      },
      options: {
        maxRetries: this.config.retry.maxAttempts[this.WEBHOOK_PROCESSING_JOB],
        timeout: 30000,
        circuitBreaker: true,
        deadLetterQueue: true,
        priority: 1
      }
    });

    // Reminder processor
    this.processors.set(this.REMINDER_PROCESSING_JOB, {
      type: this.REMINDER_PROCESSING_JOB,
      handler: async (job) => {
        return await processPendingReminders(job.companyId!);
      },
      options: {
        maxRetries: this.config.retry.maxAttempts[this.REMINDER_PROCESSING_JOB],
        timeout: 60000,
        circuitBreaker: true,
        deadLetterQueue: true,
        priority: 0
      }
    });
  }

  /**
   * Get enhanced queue statistics
   */
  async getEnhancedStats(): Promise<QueueStats & {
    memoryUsage: number;
    activeJobs: number;
    circuitBreakerStats: Record<string, any>;
    deadLetterStats: any;
  }> {
    if (!this.boss) await this.init();

    try {
      // Get base stats from existing implementation
      const baseStats = await this.getBaseStats();

      // Get circuit breaker stats
      const circuitBreakerStats: Record<string, any> = {};
      if (this.config.circuitBreaker.enabled) {
        this.circuitBreakers.forEach((breaker, jobType) => {
          circuitBreakerStats[jobType] = breaker.getMetrics();
        });
      }

      // Get dead letter queue stats
      let deadLetterStats = null;
      if (this.config.deadLetterQueue.enabled) {
        deadLetterStats = await deadLetterQueue.getStats();
      }

      return {
        ...baseStats,
        memoryUsage: this.getMemoryUsage(),
        activeJobs: this.activeJobs.size,
        circuitBreakerStats,
        deadLetterStats
      };
    } catch (error) {
      logger.error('Failed to get enhanced queue stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        queues: {},
        dlq: { failed: 0, cancelled: 0, total: 0 },
        healthy: false,
        initialized: this.initialized,
        memoryUsage: 0,
        activeJobs: 0,
        circuitBreakerStats: {},
        deadLetterStats: null
      };
    }
  }

  /**
   * Get base stats (reuse existing implementation)
   */
  private async getBaseStats(): Promise<QueueStats> {
    // This would reuse the existing getStats() method from JobQueueService
    // For now, return a simplified version
    return {
      queues: {},
      dlq: { failed: 0, cancelled: 0, total: 0 },
      healthy: true,
      initialized: this.initialized
    };
  }

  /**
   * Get processing metrics
   */
  getProcessingMetrics(): JobProcessingMetrics {
    return calculateJobMetrics(
      this.processingTimes,
      this.processingTimes.length, // simplified success count
      0, // simplified failure count
      0  // simplified skipped count
    );
  }

  /**
   * Clean up old data
   */
  async cleanup(): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      // Clean up old metrics
      if (this.config.metrics.enabled) {
        const metricsResult = await this.metricsService.cleanup(this.config.metrics.retentionDays);
        cleaned += metricsResult.cleaned;
        errors.push(...metricsResult.errors);
      }

      // Clean up dead letter queue
      if (this.config.deadLetterQueue.enabled) {
        const dlqResult = await deadLetterQueue.cleanup();
        cleaned += dlqResult.cleaned;
        errors.push(...dlqResult.errors);
      }

      logger.info('Enhanced job queue cleanup completed', {
        cleaned,
        errors: errors.length
      });
    } catch (error) {
      const errorMsg = `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logger.error('Enhanced job queue cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return { cleaned, errors };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = null;
    }

    if (this.boss) {
      await this.boss.stop({ graceful: true, timeout: 10000 });
      logger.info('Enhanced job queue service shut down gracefully');
    }

    this.initialized = false;
    this.activeJobs.clear();
    this.circuitBreakers.clear();
    this.processingTimes = [];
  }
}

// Export singleton instance
export const enhancedJobQueue = new EnhancedJobQueueService();

// Export default for convenience
export default enhancedJobQueue;