// LOCAL DEVELOPMENT SCHEDULER - Node-Cron Based
// ===============================================
// This file contains the node-cron based scheduler for local development.
// DO NOT USE IN PRODUCTION - Use the serverless scheduler instead.
//
// Production Usage:
// - Use /api/scheduler/reminders endpoint triggered by external cron
// - See apps/web/src/server/services/scheduler.ts for serverless implementation
//
// Local Development Usage:
// - Run startReminderScheduler() for local testing
// - This uses node-cron to run every minute for development convenience
//
// Reminder scheduler service
// Processes recovery reminders based on configured offsets (T+0, T+2, T+4)

import * as cron from 'node-cron';
import { logger } from '@/lib/logger';
import { additionalEnv } from '@/lib/env';
import {
  discoverCompanyIdsForReminders,
  collectReminderCandidates,
  shouldSendReminder,
  ReminderCase,
} from '@/server/services/shared/companyDiscovery';
import { recordReminderAttempt } from '@/server/services/cases';
import { ReminderChannelSettings } from '@/server/services/reminders/notifier';
import { getSettingsForCompany } from '@/server/services/settings';
import { ReminderNotifier } from '@/server/services/shared/reminderNotifier';

export interface ReminderResult {
  caseId: string;
  success: boolean;
  channels: string[];
  incentiveApplied?: boolean;
  error?: string;
}

/**
 * Send reminders for a specific case using the shared ReminderNotifier
 * Preserves existing behavior: skip attempt recording when manage URL is unavailable
 */
async function sendReminderForCase(
  case_: ReminderCase,
  attemptNumber: number,
  settings: ReminderChannelSettings
): Promise<ReminderResult> {
  try {
    const reminderResult = await ReminderNotifier.sendReminder({
      caseSnapshot: {
        id: case_.id,
        company_id: case_.company_id,
        membership_id: case_.membership_id,
        user_id: case_.user_id,
        incentive_days: case_.incentive_days,
      },
      settings,
      attemptNumber,
      trigger: 'scheduled',
    });

    // Maintain previous behavior: do not record attempts when manage URL is unavailable
    if (reminderResult.error === 'MANAGE_URL_UNAVAILABLE') {
      logger.warn('Skipping reminder - no manage URL', {
        caseId: case_.id,
        membershipId: case_.membership_id,
      });
      return {
        caseId: case_.id,
        success: false,
        channels: [],
        error: 'No manage URL available',
      };
    }

    // Record attempt after a valid send attempt (regardless of channel success)
    const recorded = await recordReminderAttempt(case_.id, attemptNumber, case_.company_id);
    if (!recorded) {
      logger.error('Failed to record reminder attempt', {
        caseId: case_.id,
      });
      return {
        caseId: case_.id,
        success: false,
        channels: [],
        error: 'Failed to record reminder attempt',
      };
    }

    const channels: string[] = [];
    if (reminderResult.pushSent) channels.push('push');
    if (reminderResult.dmSent) channels.push('dm');
    const success = channels.length > 0;

    logger.info('Reminder processing completed', {
      caseId: case_.id,
      success,
      channels,
      incentiveApplied: reminderResult.incentiveApplied ?? false,
      newAttempts: attemptNumber,
    });

    return {
      caseId: case_.id,
      success,
      channels,
      incentiveApplied: reminderResult.incentiveApplied,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Reminder processing error', {
      caseId: case_.id,
      error: errorMessage,
    });
    return {
      caseId: case_.id,
      success: false,
      channels: [],
      error: errorMessage,
    };
  }
}

// Process all pending reminders for a company
export async function processPendingReminders(companyId: string): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: ReminderResult[];
}> {
  const results: ReminderResult[] = [];
  let processed = 0;
  let successful = 0;
  const startTime = Date.now();

  try {
    // Log scheduler start with metrics
    logger.scheduler('started', {
      companiesProcessed: 0,
      totalReminders: 0,
      successfulReminders: 0,
      failedReminders: 0,
      companyId,
    });

    // Get company settings
    const settings = await getSettingsForCompany(companyId);
    const reminderOffsets = settings.reminder_offsets_days;

    // Collect candidates using shared helper
    const cases = await collectReminderCandidates(companyId, additionalEnv.MAX_REMINDER_CASES_PER_RUN);

    logger.info('Found open cases for reminder processing', {
      caseCount: cases.length,
      companyId,
      maxCasesPerRun: additionalEnv.MAX_REMINDER_CASES_PER_RUN,
    });

    // Process cases in batches to prevent provider bursts
    const batchSize = additionalEnv.MAX_CONCURRENT_REMINDER_SENDS;
    for (let i = 0; i < cases.length; i += batchSize) {
      const batch = cases.slice(i, i + batchSize);
      const batchPromises = batch.map(async (case_: ReminderCase): Promise<ReminderResult | null> => {
        processed++;

        const { shouldSend, attemptNumber } = shouldSendReminder(case_, reminderOffsets);

        if (shouldSend) {
          const result = await sendReminderForCase(case_, attemptNumber, settings);
          if (result.success) {
            successful++;
          }
          return result;
        }
        return null;
      });

      // Wait for the current batch to complete before starting the next
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((result): result is ReminderResult => result !== null));
    }

    const processingTime = Date.now() - startTime;

    // Log scheduler completion with metrics
    logger.scheduler('completed', {
      companiesProcessed: 1, // This function processes one company
      totalReminders: processed,
      successfulReminders: successful,
      failedReminders: processed - successful,
      duration_ms: processingTime,
      companyId,
      success: true,
    });

    logger.info('Reminder processing cycle completed', {
      processed,
      successful,
      failed: processed - successful,
      processingTime,
      companyId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Reminder processing cycle failed', {
      error: errorMessage,
      companyId,
    });

    // Log failed scheduler execution
    logger.scheduler('failed', {
      companiesProcessed: 0,
      totalReminders: processed,
      successfulReminders: successful,
      failedReminders: processed - successful,
      duration_ms: Date.now() - startTime,
      companyId,
      success: false,
      error: errorMessage,
      error_category: 'processing',
    });
  }

  return {
    processed,
    successful,
    failed: processed - successful,
    results,
  };
}

// Cron job instance
let cronJob: any | null = null;

// Start the reminder scheduler (LOCAL DEVELOPMENT ONLY)
export function startReminderScheduler(): void {
  if (cronJob) {
    logger.warn('Reminder scheduler already running');
    return;
  }

  // WARNING: This is for LOCAL DEVELOPMENT ONLY
  // In production, use the serverless scheduler via /api/scheduler/reminders
  logger.warn('STARTING LOCAL NODE-CRON SCHEDULER - NOT FOR PRODUCTION USE');

  // Run every minute for development/testing
  // In production, this could be every 5-15 minutes
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      const companyIds = await discoverCompanyIdsForReminders();
      if (companyIds.length === 0) {
        logger.warn('No companies found for reminder processing');
        return;
      }

      logger.info('Starting scheduled reminder processing for companies', {
        count: companyIds.length,
      });

      for (const companyId of companyIds) {
        try {
          const result = await processPendingReminders(companyId);
          logger.info('Scheduled reminder processing completed for company', {
            companyId,
            processed: result.processed,
            successful: result.successful,
            failed: result.failed,
          });
        } catch (companyError) {
          logger.error('Scheduled reminder processing failed for company', {
            companyId,
            error: companyError instanceof Error ? companyError.message : String(companyError),
          });
        }
      }
    } catch (error) {
      logger.error('Scheduled reminder processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  logger.info('LOCAL DEVELOPMENT Reminder scheduler started', {
    schedule: 'every minute',
    warning: 'NOT FOR PRODUCTION - Use serverless scheduler instead',
  });
}

// Stop the reminder scheduler (LOCAL DEVELOPMENT ONLY)
export function stopReminderScheduler(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('LOCAL DEVELOPMENT Reminder scheduler stopped');
  }
}

// Check if scheduler is running
export function isSchedulerRunning(): boolean {
  return cronJob !== null;
}

// Manual trigger for testing (LOCAL DEVELOPMENT ONLY)
// NOTE: For production testing, use the serverless scheduler API endpoint
export async function triggerReminderProcessing(companyId: string): Promise<{
  processed: number;
  successful: number;
  failed: number;
  results: ReminderResult[];
}> {
  logger.info('LOCAL DEVELOPMENT Manual reminder processing triggered', { companyId });
  return await processPendingReminders(companyId);
}