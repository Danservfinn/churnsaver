// Serverless-Compatible Scheduler Service
// Handles reminder processing without node-cron, designed for external cron triggers
//
// Usage:
// - External cron calls /api/scheduler/reminders (POST) every 5-15 minutes
// - Service processes pending reminders for all companies
// - Built for serverless environments (Vercel, Netlify, etc.)

import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { processPendingReminders } from '@/server/cron/processReminders';
import { jobQueue } from './jobQueue';
import { createHash } from 'crypto';

export interface SchedulerJob {
  id: string;
  type: 'reminder_batch'; // Can be extended for other job types
  companyId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchedulerStats {
  totalCompanies: number;
  processedCompanies: number;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  lastRunAt?: Date;
}

// Advisory lock helper for durable coordination across serverless instances
async function acquireAdvisoryLock(companyId: string): Promise<boolean> {
  // Generate consistent lock key as hash of companyId + 'reminders'
  const keyString = companyId + 'reminders';
  const hash = createHash('sha256').update(keyString).digest('hex');
  const lockKey = BigInt('0x' + hash.substring(0, 16)); // Use first 16 hex chars for 64-bit key

  try {
    const result = await sql.query<{ pg_try_advisory_lock: boolean }>(
      'SELECT pg_try_advisory_lock($1)',
      [lockKey]
    );
    const acquired = result.rows[0].pg_try_advisory_lock;
    logger.info('Advisory lock acquisition attempt', { companyId, lockKey: lockKey.toString(), acquired });
    return acquired;
  } catch (error) {
    logger.error('Failed to acquire advisory lock', { companyId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function releaseAdvisoryLock(companyId: string): Promise<void> {
  const keyString = companyId + 'reminders';
  const hash = createHash('sha256').update(keyString).digest('hex');
  const lockKey = BigInt('0x' + hash.substring(0, 16));

  try {
    await sql.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    logger.info('Advisory lock released', { companyId, lockKey: lockKey.toString() });
  } catch (error) {
    logger.error('Failed to release advisory lock', { companyId, error: error instanceof Error ? error.message : String(error) });
  }
}

class ServerlessScheduler {
  private active = false;
  private lastRunCompleted = new Date();
  private processingStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalProcessingTime: 0
  };

  // Start the scheduler (no-op in serverless, here for API compatibility)
  start(): void {
    this.active = true;
    logger.info('Serverless scheduler service started');
  }

  // Stop the scheduler (no-op in serverless, here for API compatibility)
  stop(): void {
    this.active = false;
    logger.info('Serverless scheduler service stopped');
  }

  // Check if scheduler is "active"
  isActive(): boolean {
    return this.active;
  }

  // Process all pending reminders - main entry point for external cron
  async schedulePendingJobs(): Promise<{
    totalCompanies: number;
    processedCompanies: number;
    totalJobs: number;
    failedJobs: number;
    processingTimeMs: number;
  }> {
    const startTime = Date.now();
    const runId = `run_${startTime}`;

    try {
      logger.info('Starting serverless reminder processing cycle', { runId });

      await initDb();

      // Get all companies from companies catalog (RLS allows SELECT on companies)
      // Note: companies table has permissive SELECT policy; no companyContext required
      const companyRows = await sql.select<{ company_id: string }>(
        'SELECT id as company_id FROM companies ORDER BY id'
      );

      if (companyRows.length === 0) {
        logger.warn('No companies configured for reminder processing');
        return {
          totalCompanies: 0,
          processedCompanies: 0,
          totalJobs: 0,
          failedJobs: 0,
          processingTimeMs: Date.now() - startTime
        };
      }

      const companyIds = companyRows.map(r => r.company_id);
      let processedCompanies = 0;
      let totalJobs = 0;
      let failedJobs = 0;

      logger.info('Found companies for reminder processing', {
        companyCount: companyIds.length,
        companies: companyIds
      });

      // Initialize job queue
      await jobQueue.init();

      // Enqueue reminder processing jobs for each company
      for (const companyId of companyIds) {
        const jobId = `reminder_${companyId}_${runId}`;

        // Acquire advisory lock for this company to prevent concurrent processing
        const lockAcquired = await acquireAdvisoryLock(companyId);
        if (!lockAcquired) {
          logger.warn('Company reminder processing already running (lock held), skipping', { companyId, jobId });
          continue;
        }

        try {
          // Enqueue job instead of processing immediately
          await jobQueue.enqueueReminderJob(companyId);

          totalJobs++;
          processedCompanies++;
          logger.info('Company reminder processing job enqueued', {
            companyId,
            jobId
          });

        } catch (error) {
          failedJobs++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Company reminder job enqueue failed', {
            companyId,
            jobId,
            error: errorMessage
          });
        } finally {
          // Always release the advisory lock
          await releaseAdvisoryLock(companyId);
        }
      }

      const processingTimeMs = Date.now() - startTime;

      // Update stats
      this.processingStats.totalRuns++;
      this.processingStats.successfulRuns++;
      this.processingStats.totalProcessingTime += processingTimeMs;
      this.lastRunCompleted = new Date();

      const summary = {
        runId,
        totalCompanies: companyIds.length,
        processedCompanies,
        totalJobs,
        failedJobs,
        processingTimeMs,
        status: failedJobs === 0 ? 'success' : 'partial_failure'
      };

      logger.info('Serverless reminder processing cycle completed', summary);

      return {
        ...summary,
        // Exclude status field from return for API compatibility
        totalCompanies: summary.totalCompanies,
        processedCompanies: summary.processedCompanies,
        totalJobs: summary.totalJobs,
        failedJobs: summary.failedJobs,
        processingTimeMs: summary.processingTimeMs
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const processingTimeMs = Date.now() - startTime;

      logger.error('Serverless reminder processing cycle failed', {
        runId,
        error: errorMessage,
        processingTimeMs
      });

      // Update failure stats
      this.processingStats.totalRuns++;
      this.processingStats.failedRuns++;

      throw error;
    }
  }

  // Manual trigger (for testing/development)
  async triggerRun(companyId?: string): Promise<any> {
    logger.info('Manual scheduler trigger requested', { companyId });

    if (companyId) {
      // Run for specific company
      const result = await processPendingReminders(companyId);
      logger.info('Manual company trigger completed', { companyId, result });
      return result;
    } else {
      // Run for all companies
      return await this.schedulePendingJobs();
    }
  }
}

// Export singleton instance
export const scheduler = new ServerlessScheduler();
