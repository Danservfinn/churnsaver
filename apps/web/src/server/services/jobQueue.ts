// Durable job queue service using pg-boss for webhook processing and reminders
// Provides reliability across serverless deployments with automatic retries and dead letter queues

import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { processWebhookEvent, ProcessedEvent } from '@/server/services/eventProcessor';
// Import processPendingReminders from processReminders directly to avoid circular dependency
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

class JobQueueService {
  private boss: PgBoss | null = null;
  private initialized = false;
  private processingTimes: number[] = [];

  // Job queue names
  private readonly WEBHOOK_PROCESSING_JOB = 'webhook-processing';
  private readonly REMINDER_PROCESSING_JOB = 'reminder-processing';

  async init() {
    if (this.initialized) return;

    try {
      // Initialize pg-boss with PostgreSQL connection
      this.boss = new PgBoss(process.env.DATABASE_URL!);

      // Start pg-boss
      await this.boss.start();

      // Register simplified single handlers (flattened from dual-layer approach)
      await this.boss.work(this.WEBHOOK_PROCESSING_JOB, (async (job: PgBoss.Job<JobData>) => {
        return await this.processWebhookJob(job);
      }) as any);

      await this.boss.work(this.REMINDER_PROCESSING_JOB, (async (job: PgBoss.Job<{ companyId: string }>) => {
        return await this.processReminderJob(job);
      }) as any);
      this.initialized = true;

      logger.info('Job queue service initialized', {
        jobTypes: [this.WEBHOOK_PROCESSING_JOB, this.REMINDER_PROCESSING_JOB]
      });
    } catch (error) {
      logger.error('Failed to initialize job queue service', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Enqueue a webhook processing job
   */
  async enqueueWebhookJob(data: JobData) {
    if (!this.boss) await this.init();

    try {
      const jobId = await this.boss!.send(this.WEBHOOK_PROCESSING_JOB, data, {
        retryLimit: 3,
        retryDelay: 60, // 1 minute
        expireInSeconds: 24 * 60 * 60, // Expire if not processed within 24 hours
        priority: 1, // High priority for webhooks
        // singletonKey prevents duplicate processing of same webhook event
        // Uses whop_event_id to ensure only one job per unique event is processed
        singletonKey: data.eventId,
      });

      logger.info('Webhook job enqueued', {
        jobId,
        eventId: data.eventId,
        eventType: data.eventType,
        membershipId: data.membershipId
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to enqueue webhook job', {
        eventId: data.eventId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Enqueue a reminder processing job for a specific company
   */
  async enqueueReminderJob(companyId: string, scheduleTime?: Date) {
    if (!this.boss) await this.init();

    const data = { companyId };

    try {
      const options: PgBoss.SendOptions = {
        retryLimit: 2, // Fewer retries for reminders since they can be recovered
        retryDelay: 300, // 5 minutes between retries
        expireInSeconds: 48 * 60 * 60, // Expire after 2 days
        priority: 0, // Normal priority
        startAfter: scheduleTime, // Optional scheduling
      };

      const jobId = await this.boss!.send(this.REMINDER_PROCESSING_JOB, data, options);

      logger.info('Reminder job enqueued', {
        jobId,
        companyId,
        scheduledTime: scheduleTime?.toISOString(),
        startAfter: scheduleTime?.toISOString()
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to enqueue reminder job', {
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Process individual webhook job (flattened from dual-layer approach)
   */
  private async processWebhookJob(job: PgBoss.Job<JobData>): Promise<WebhookJobResult> {
    const startTime = Date.now();
    const { data } = job;

    try {
      logger.info('Processing webhook job', {
        jobId: job.id,
        eventId: data.eventId,
        eventType: data.eventType,
        membershipId: data.membershipId,
        companyId: data.companyId
      });

      // Validate company context using shared helper
      const companyContext = await assertCompanyContext(data.companyId);
      if (!companyContext.isValid) {
        throw new Error(companyContext.error || 'Company validation failed');
      }

      // Check if this event has already been processed using shared helper
      const alreadyProcessed = await isEventProcessed(data.eventId, data.companyId!);
      if (alreadyProcessed) {
        logger.info('Skipping duplicate webhook processing - event already processed', {
          jobId: job.id,
          eventId: data.eventId
        });
        this.processingTimes.push(Date.now() - startTime);
        return { success: true, eventId: data.eventId, skipped: true };
      }

      // Create processed event using shared helper
      const processedEvent: ProcessedEvent = createProcessedEvent(
        data.eventId,
        data.eventType,
        data.membershipId,
        data.payload,
        data.eventCreatedAt
      );

      // Process webhook event
      const success = await processWebhookEvent(processedEvent, data.companyId || 'unknown');

      // Update event processing status using shared helper
      await updateEventProcessingStatus(
        data.eventId,
        data.companyId!,
        success,
        success ? undefined : 'processing_failed'
      );

      this.processingTimes.push(Date.now() - startTime);

      logger.info('Webhook job completed', {
        jobId: job.id,
        eventId: data.eventId,
        success,
        duration_ms: Date.now() - startTime
      });

      return { success, eventId: data.eventId };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.processingTimes.push(Date.now() - startTime);

      logger.error('Webhook job failed', {
        jobId: job.id,
        eventId: data.eventId,
        error: errorMessage,
        duration_ms: Date.now() - startTime
      });

      // pg-boss will handle retries based on thrown error
      throw error;
    }
  }

  /**
   * Process individual reminder job (flattened from dual-layer approach)
   */
  private async processReminderJob(job: PgBoss.Job<{ companyId: string }>): Promise<ReminderJobResult> {
    const startTime = Date.now();
    const { data } = job;

    try {
      logger.info('Processing reminder job', {
        jobId: job.id,
        companyId: data.companyId
      });

      // Process pending reminders for this company
      const result = await processPendingReminders(data.companyId);

      this.processingTimes.push(Date.now() - startTime);

      logger.info('Reminder job completed', {
        jobId: job.id,
        companyId: data.companyId,
        result,
        duration_ms: Date.now() - startTime
      });

      return { 
        success: true, 
        companyId: data.companyId, 
        ...result 
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.processingTimes.push(Date.now() - startTime);

      logger.error('Reminder job failed', {
        jobId: job.id,
        companyId: data.companyId,
        error: errorMessage,
        duration_ms: Date.now() - startTime
      });

      // pg-boss will handle retries based on thrown error
      throw error;
    }
  }

  /**
   * Get job queue statistics
   */
  async getStats(): Promise<QueueStats> {
    if (!this.boss) await this.init();

    try {
      // Get queue statistics by querying pg-boss tables directly
      const queueStats: Array<{
        name: string;
        created: string;
        retry: string;
        active: string;
        completed: string;
        cancelled: string;
        failed: string;
        total: string;
      }> = await sql.select(`
        SELECT
          name,
          COUNT(*) FILTER (WHERE state = 'created') as created,
          COUNT(*) FILTER (WHERE state = 'retry') as retry,
          COUNT(*) FILTER (WHERE state = 'active') as active,
          COUNT(*) FILTER (WHERE state = 'completed') as completed,
          COUNT(*) FILTER (WHERE state = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE state = 'failed') as failed,
          COUNT(*) as total
        FROM pgboss.job
        WHERE name IN ($1, $2)
        GROUP BY name
      `, [this.WEBHOOK_PROCESSING_JOB, this.REMINDER_PROCESSING_JOB]);

      // Calculate overall totals
      const totals = queueStats.reduce((acc: {
        created: number;
        retry: number;
        active: number;
        completed: number;
        cancelled: number;
        failed: number;
        total: number;
      }, queue) => ({
        created: acc.created + parseInt(queue.created),
        retry: acc.retry + parseInt(queue.retry),
        active: acc.active + parseInt(queue.active),
        completed: acc.completed + parseInt(queue.completed),
        cancelled: acc.cancelled + parseInt(queue.cancelled),
        failed: acc.failed + parseInt(queue.failed),
        total: acc.total + parseInt(queue.total)
      }), { created: 0, retry: 0, active: 0, completed: 0, cancelled: 0, failed: 0, total: 0 });

      // Transform queue stats into expected format
      const queues: Record<string, {
        created: number;
        retry: number;
        active: number;
        completed: number;
        cancelled: number;
        failed: number;
        total: number;
      }> = {};
      queueStats.forEach(queue => {
        queues[queue.name] = {
          created: parseInt(queue.created),
          retry: parseInt(queue.retry),
          active: parseInt(queue.active),
          completed: parseInt(queue.completed),
          cancelled: parseInt(queue.cancelled),
          failed: parseInt(queue.failed),
          total: parseInt(queue.total)
        };
      });

      return {
        queues,
        dlq: {
          failed: totals.failed,
          cancelled: totals.cancelled,
          total: totals.failed + totals.cancelled
        },
        healthy: true,
        initialized: this.initialized
      };
    } catch (error) {
      logger.error('Failed to get queue stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        queues: {},
        dlq: { failed: 0, cancelled: 0, total: 0 },
        healthy: false,
        initialized: this.initialized
      };
    }
  }

  /**
   * Get processing metrics for monitoring
   */
  getProcessingMetrics(): JobProcessingMetrics {
    const successfulJobs = this.processingTimes.length; // Simplified - would need tracking
    const failedJobs = 0; // Simplified - would need tracking
    const skippedJobs = 0; // Simplified - would need tracking

    return calculateJobMetrics(
      this.processingTimes,
      successfulJobs,
      failedJobs,
      skippedJobs
    );
  }

  /**
   * Clean up old completed/archived jobs (simplified)
   */
  async cleanup() {
    logger.info('Job queue cleanup requested (simplified implementation)');
    return { success: true, cleaned: 0, note: 'pg-boss cleanup not implemented in this version' };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.boss) {
      await this.boss.stop({ graceful: true, timeout: 10000 });
      logger.info('Job queue service shut down gracefully');
    }
    this.initialized = false;
    this.processingTimes = []; // Reset metrics
  }
}

// Singleton instance
export const jobQueue = new JobQueueService();

// Process hooks are disabled in serverless environments like Vercel
// because they don't support persistent process listeners and can cause memory leaks
// across function invocations. Graceful shutdown still works in development/local environments.
if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  // Initialize on module load (will be lazy loaded when first used)
  process.on('SIGTERM', () => jobQueue.shutdown());
  process.on('SIGINT', () => jobQueue.shutdown());
}

// Export default for convenience
export default jobQueue;