// Serverless-Compatible Scheduler Service
// Handles reminder processing without node-cron, designed for external cron triggers
//
// Usage:
// - External cron calls /api/scheduler/reminders (POST) every 5-15 minutes
// - Service processes pending reminders for all companies
// - Built for serverless environments (Vercel, Netlify, etc.)

import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { jobQueue } from './jobQueue';
import { 
  discoverCompanyIdsForReminders,
  collectReminderCandidates,
  getReminderOffsets,
  processReminderBatch
} from './shared/companyDiscovery';
import { acquireAdvisoryLock, releaseAdvisoryLock } from '@/server/services/shared/advisoryLock';

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

class ServerlessScheduler {
  private active = false;
  private lastRunCompleted = new Date();
  private processingStats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalProcessingTime: 0
  };

  // Start scheduler (no-op in serverless, here for API compatibility)
  start(): void {
    this.active = true;
    logger.info('Serverless scheduler service started');
  }

  // Stop scheduler (no-op in serverless, here for API compatibility)
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

      // Use shared company discovery
      const companyIds = await discoverCompanyIdsForReminders();

      if (companyIds.length === 0) {
        logger.warn('No companies configured for reminder processing');
        return {
          totalCompanies: 0,
          processedCompanies: 0,
          totalJobs: 0,
          failedJobs: 0,
          processingTimeMs: Date.now() - startTime
        };
      }

      let processedCompanies = 0;
      let totalJobs = 0;
      let failedJobs = 0;

      logger.info('Found companies for reminder processing', {
        companyCount: companyIds.length,
        companies: companyIds
      });

      // Initialize job queue
      await jobQueue.init();

      // Process each company using shared discovery and batch processing
      for (const companyId of companyIds) {
        const jobId = `reminder_${companyId}_${runId}`;

        // Acquire advisory lock for this company to prevent concurrent processing
        const lockAcquired = await acquireAdvisoryLock(companyId);
        if (!lockAcquired) {
          logger.warn('Company reminder processing already running (lock held), skipping', { companyId, jobId });
          continue;
        }

        try {
          // Use shared reminder collection and batch processing
          const candidates = await collectReminderCandidates(companyId);
          const reminderOffsets = await getReminderOffsets(companyId);
          
          const result = await processReminderBatch(
            candidates,
            reminderOffsets,
            async (case_, attemptNumber) => {
              // Enqueue job instead of processing immediately
              await jobQueue.enqueueReminderJob(companyId);
              return { caseId: case_.id, attemptNumber, enqueued: true };
            }
          );

          totalJobs += result.processed;
          failedJobs += result.failed;
          processedCompanies++;

          logger.info('Company reminder processing job enqueued', {
            companyId,
            jobId,
            processed: result.processed,
            successful: result.successful,
            failed: result.failed
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
          // Always release advisory lock
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
      // Run for specific company using shared modules
      const candidates = await collectReminderCandidates(companyId);
      const reminderOffsets = await getReminderOffsets(companyId);
      
      const result = await processReminderBatch(
        candidates,
        reminderOffsets,
        async (case_, attemptNumber) => {
          // Process immediately for manual trigger
          return { caseId: case_.id, attemptNumber, processed: true };
        }
      );
      
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

// Export shared modules for use by jobQueue and other services
export { 
  discoverCompanyIdsForReminders,
  collectReminderCandidates,
  getReminderOffsets,
  processReminderBatch
};