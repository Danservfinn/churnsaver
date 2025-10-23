// Durable job queue service using pg-boss for webhook processing and reminders
// Provides reliability across serverless deployments with automatic retries and dead letter queues

import PgBoss from 'pg-boss';
import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { processWebhookEvent, ProcessedEvent } from '@/server/services/eventProcessor';
import { processPendingReminders } from './scheduler';

export interface JobData {
  eventId: string;
  eventType: string;
  membershipId: string;
  payload: string;
  companyId?: string;
  eventCreatedAt: string;
}

class JobQueueService {
  private boss: PgBoss | null = null;
  private initialized = false;

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

      // Register job handlers with correct API
      await this.boss.work(this.WEBHOOK_PROCESSING_JOB, { batchSize: 3 }, this.handleWebhookJobs.bind(this));
      await this.boss.work(this.REMINDER_PROCESSING_JOB, { batchSize: 2 }, this.handleReminderJobs.bind(this));

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
        // singletonKey prevents duplicate processing of the same webhook event
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
   * Handle webhook jobs from the queue (takes an array of jobs)
   */
  private async handleWebhookJobs(jobs: PgBoss.Job<JobData>[]) {
    for (const job of jobs) {
      await this.processWebhookJob(job);
    }
  }

  /**
   * Handle reminder jobs from the queue (takes an array of jobs)
   */
  private async handleReminderJobs(jobs: PgBoss.Job<{ companyId: string }>[]) {
    for (const job of jobs) {
      await this.processReminderJob(job);
    }
  }

  /**
   * HOWEVER, since pg-boss expects single-job handlers, we need...
   */

  /**
   * Handle webhook job from the queue
   */
  private async handleWebhookJob(job: PgBoss.Job<JobData>) {
    try {
      // We know what to do here. Importantly, just catch and rethrow underlying  errors
      await this.processWebhookJob(job);
    } catch (error) {
      throw error; // pg-boss will handle retries
    }
  }

  /**
   * Handle reminder job from the queue
   */
  private async handleReminderJob(job: PgBoss.Job<{ companyId: string }>) {
    try {
      await this.processReminderJob(job);
    } catch (error) {
      throw error; // pg-boss will handle retries
    }
  }

  /**
   * Process individual webhook job
   */
  private async processWebhookJob(job: PgBoss.Job<JobData>) {
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

      // Validate company context is provided for RLS security
      if (!data.companyId) {
        logger.error('Company context missing from webhook job - cannot proceed with RLS security', {
          jobId: job.id,
          eventId: data.eventId
        });
        throw new Error('Company context required for tenant-scoped operations');
      }

      // Check if this event has already been processed to avoid duplicate processing
      // Company context is required to ensure RLS policies are applied and data isolation is maintained
      const existingEvent = await sql.select(
        `SELECT processed FROM events WHERE whop_event_id = $1 AND company_id = $2`,
        [data.eventId, data.companyId]
      );

      if (existingEvent.length > 0 && (existingEvent[0] as { processed: boolean }).processed) {
        logger.info('Skipping duplicate webhook processing - event already processed', {
          jobId: job.id,
          eventId: data.eventId
        });
        return { success: true, skipped: true };
      }

      // Create processed event
      const processedEvent: ProcessedEvent = {
        id: data.eventId,
        whop_event_id: data.eventId,
        type: data.eventType,
        membership_id: data.membershipId,
        payload: data.payload,
        processed_at: new Date(),
        event_created_at: new Date(data.eventCreatedAt)
      };

      // Process the webhook event
      const success = await processWebhookEvent(processedEvent, data.companyId || 'unknown');

      // Mark event as processed in the ledger
      // Company context is required to ensure RLS policies are applied and data isolation is maintained
      try {
        await sql.execute(
          `UPDATE events SET processed = $2, error = $3 WHERE whop_event_id = $1 AND company_id = $4`,
          [data.eventId, success, success ? null : 'processing_failed', data.companyId]
        );
      } catch (e) {
        logger.error('Failed to update event processed flag', {
          jobId: job.id,
          eventId: data.eventId,
          error: e instanceof Error ? e.message : String(e)
        });
      }

      logger.info('Webhook job completed', {
        jobId: job.id,
        eventId: data.eventId,
        success,
        duration_ms: Date.now() - startTime
      });

      return { success, eventId: data.eventId };

    } catch (error) {
      logger.error('Webhook job failed', {
        jobId: job.id,
        eventId: data.eventId,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime
      });
      throw error; // pg-boss will handle retries
    }
  }

  /**
   * Process individual reminder job
   */
  private async processReminderJob(job: PgBoss.Job<{ companyId: string }>) {
    const startTime = Date.now();
    const { data } = job;

    try {
      logger.info('Processing reminder job', {
        jobId: job.id,
        companyId: data.companyId
      });

      // Process pending reminders for this company
      const result = await processPendingReminders(data.companyId);

      logger.info('Reminder job completed', {
        jobId: job.id,
        companyId: data.companyId,
        result,
        duration_ms: Date.now() - startTime
      });

      return { success: true, companyId: data.companyId, result };

    } catch (error) {
      logger.error('Reminder job failed', {
        jobId: job.id,
        companyId: data.companyId,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: Date.now() - startTime
      });
      throw error; // pg-boss will handle retries
    }
  }

  /**
   * Get job queue statistics
   */
  async getStats() {
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

      // Transform queue stats into the expected format
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
