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
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { getCaseManageUrl, recordReminderAttempt } from '@/server/services/cases';
import { sendRecoveryNudgePush } from '@/server/services/push';
import { sendRecoveryNudgeDM } from '@/server/services/dm';
import { applyRecoveryIncentive } from '@/server/services/incentives';
import { getSettingsForCompany } from '@/server/services/settings';

export interface ReminderCase {
  id: string;
  membership_id: string;
  user_id: string;
  company_id: string;
  first_failure_at: Date;
  last_nudge_at: Date | null;
  attempts: number;
  status: string;
  incentive_days: number;
}

export interface ReminderResult {
  caseId: string;
  success: boolean;
  channels: string[];
  incentiveApplied?: boolean;
  error?: string;
}

// Calculate if a reminder should be sent based on attempt count and time offsets
function shouldSendReminder(
  case_: ReminderCase,
  reminderOffsets: number[]
): { shouldSend: boolean; attemptNumber: number } {
  const now = new Date();
  const failureTime = new Date(case_.first_failure_at);

  // Calculate days since failure
  const daysSinceFailure = Math.floor(
    (now.getTime() - failureTime.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Find the next reminder offset that should have been sent
  const expectedAttempts = reminderOffsets.filter(offset => daysSinceFailure >= offset).length;

  // If we haven't sent enough reminders yet, send the next one
  if (case_.attempts < expectedAttempts) {
    return {
      shouldSend: true,
      attemptNumber: case_.attempts + 1,
    };
  }

  // Check if the last nudge was sent recently (avoid spam)
  if (case_.last_nudge_at) {
    const hoursSinceLastNudge = (now.getTime() - new Date(case_.last_nudge_at).getTime()) / (1000 * 60 * 60);
    // Only send if it's been at least 12 hours since last nudge
    if (hoursSinceLastNudge < 12) {
      return { shouldSend: false, attemptNumber: 0 };
    }
  }

  return { shouldSend: false, attemptNumber: 0 };
}

// Send reminders for a specific case
async function sendReminderForCase(
  case_: ReminderCase,
  attemptNumber: number,
  settings: { enable_push: boolean; enable_dm: boolean; incentive_days: number }
): Promise<ReminderResult> {
  const result: ReminderResult = {
    caseId: case_.id,
    success: false,
    channels: [],
  };

  try {
    logger.info('Processing reminder for case', {
      caseId: case_.id,
      membershipId: case_.membership_id,
      attemptNumber,
    });

    // Get manage URL
    const manageUrl = await getCaseManageUrl(case_.membership_id);
    if (!manageUrl) {
      result.error = 'No manage URL available';
      logger.warn('Skipping reminder - no manage URL', {
        caseId: case_.id,
        membershipId: case_.membership_id,
      });
      return result;
    }

    // Send push notification
    if (settings.enable_push) {
      const pushResult = await sendRecoveryNudgePush(
        case_.user_id,
        case_.membership_id,
        manageUrl,
        attemptNumber,
        case_.id, // caseId for audit
        case_.company_id // companyId for audit
      );

      if (pushResult.success) {
        result.channels.push('push');
        logger.info('Push reminder sent', {
          caseId: case_.id,
          messageId: pushResult.messageId,
        });
      } else {
        logger.warn('Push reminder failed', {
          caseId: case_.id,
          error: pushResult.error,
        });
      }
    }

    // Send direct message
    if (settings.enable_dm) {
      const dmResult = await sendRecoveryNudgeDM(
        case_.user_id,
        case_.membership_id,
        manageUrl,
        attemptNumber,
        case_.id, // caseId for audit
        case_.company_id // companyId for audit
      );

      if (dmResult.success) {
        result.channels.push('dm');
        logger.info('DM reminder sent', {
          caseId: case_.id,
          messageId: dmResult.messageId,
        });
      } else {
        logger.warn('DM reminder failed', {
          caseId: case_.id,
          error: dmResult.error,
        });
      }
    }

    // Apply incentive on first reminder (T+0) if not already applied and configured
    let incentiveApplied = false;
    if (attemptNumber === 1 && case_.incentive_days === 0 && settings.incentive_days > 0) {
      const incentiveResult = await applyRecoveryIncentive(
        case_.membership_id,
        case_.id,
        case_.company_id
      );

      if (incentiveResult.success) {
        incentiveApplied = true;
        logger.info('Recovery incentive applied', {
          caseId: case_.id,
          daysAdded: incentiveResult.daysAdded,
        });
      } else {
        logger.warn('Failed to apply recovery incentive', {
          caseId: case_.id,
          error: incentiveResult.error,
        });
      }
    }

    // Record the reminder attempt
    const recordResult = await recordReminderAttempt(case_.id, attemptNumber, case_.company_id);

    if (recordResult) {
      result.success = result.channels.length > 0;
      if (incentiveApplied) {
        result.incentiveApplied = true;
      }

      logger.info('Reminder processing completed', {
        caseId: case_.id,
        success: result.success,
        channels: result.channels,
        incentiveApplied,
        newAttempts: attemptNumber,
      });
    } else {
      result.error = 'Failed to record reminder attempt';
      logger.error('Failed to record reminder attempt', {
        caseId: case_.id,
      });
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Reminder processing error', {
      caseId: case_.id,
      error: result.error,
    });
  }

  return result;
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
      companyId
    });

    // Get company settings
    const settings = await getSettingsForCompany(companyId);
    const reminderOffsets = settings.reminder_offsets_days;

    // Query open recovery cases for this company with pagination limit
    const cases = await sql.select<ReminderCase>(
      `SELECT id, membership_id, user_id, company_id, first_failure_at,
              last_nudge_at, attempts, status, incentive_days
       FROM recovery_cases
       WHERE company_id = $1 AND status = 'open'
       ORDER BY first_failure_at ASC
       LIMIT $2`,
      [companyId, env.MAX_REMINDER_CASES_PER_RUN]
    );

    logger.info('Found open cases for reminder processing', {
      caseCount: cases.length,
      companyId,
      maxCasesPerRun: env.MAX_REMINDER_CASES_PER_RUN
    });

    // Process cases in batches to prevent provider bursts
    const batchSize = env.MAX_CONCURRENT_REMINDER_SENDS;
    for (let i = 0; i < cases.length; i += batchSize) {
      const batch = cases.slice(i, i + batchSize);
      const batchPromises = batch.map(async (case_) => {
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
      results.push(...batchResults.filter(result => result !== null));
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
      success: true
    });

    logger.info('Reminder processing cycle completed', {
      processed,
      successful,
      failed: processed - successful,
      processingTime,
      companyId
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Reminder processing cycle failed', {
      error: error instanceof Error ? error.message : String(error),
      companyId
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
      error_category: 'processing'
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

// Discover tenant/company ids to process reminders for
async function listCompanyIdsForReminders(): Promise<string[]> {
  try {
    // Prefer creator_settings (explicitly configured companies)
    const rows = await sql.select<{ company_id: string }>(
      `SELECT company_id FROM creator_settings`
    );
    const ids = rows.map(r => r.company_id).filter(Boolean);

    if (ids.length > 0) {
      return Array.from(new Set(ids));
    }

    // Fallback: derive from recovery_cases if settings not yet created
    const fallback = await sql.select<{ company_id: string }>(
      `SELECT DISTINCT company_id FROM recovery_cases`
    );
    return Array.from(new Set(fallback.map(r => r.company_id).filter(Boolean)));
  } catch (error) {
    logger.error('Failed to list companies for reminders', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

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
      const companyIds = await listCompanyIdsForReminders();
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
    warning: 'NOT FOR PRODUCTION - Use serverless scheduler instead'
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
