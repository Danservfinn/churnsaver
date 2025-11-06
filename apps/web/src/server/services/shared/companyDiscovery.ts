// Shared company discovery and reminder iteration module
// Consolidates company enumeration logic between local and serverless schedulers

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { additionalEnv } from '@/lib/env';

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

export interface ReminderProcessingResult<T = unknown> {
  processed: number;
  successful: number;
  failed: number;
  results: T[];
}

/**
 * Discover tenant/company ids to process reminders for
 * Prefers creator_settings (explicitly configured companies) with fallback to recovery_cases
 */
export async function discoverCompanyIdsForReminders(): Promise<string[]> {
  try {
    // Prefer creator_settings (explicitly configured companies)
    const rows = await sql.select<{ company_id: string }>(
      'SELECT company_id FROM creator_settings'
    );
    const ids = rows.map(row => row.company_id).filter(Boolean);

    if (ids.length > 0) {
      logger.debug('Found companies from creator_settings', {
        count: ids.length,
        companies: ids,
      });
      return Array.from(new Set(ids)); // Remove duplicates
    }

    // Fallback: derive from recovery_cases if settings not yet created
    const fallback = await sql.select<{ company_id: string }>(
      'SELECT DISTINCT company_id FROM recovery_cases'
    );
    const fallbackIds = Array.from(
      new Set(fallback.map(row => row.company_id).filter(Boolean))
    );

    logger.debug('Using fallback company discovery from recovery_cases', {
      count: fallbackIds.length,
      companies: fallbackIds,
    });

    return fallbackIds;
  } catch (error) {
    logger.error('Failed to discover companies for reminders', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Collect reminder candidates for a company with pagination limit
 */
export async function collectReminderCandidates(
  companyId: string,
  limit: number = additionalEnv.MAX_REMINDER_CASES_PER_RUN
): Promise<ReminderCase[]> {
  try {
    const cases = await sql.select<ReminderCase>(
      `SELECT id, membership_id, user_id, company_id, first_failure_at,
              last_nudge_at, attempts, status, incentive_days
       FROM recovery_cases
       WHERE company_id = $1 AND status = 'open'
       ORDER BY first_failure_at ASC
       LIMIT $2`,
      [companyId, limit]
    );

    logger.debug('Collected reminder candidates', {
      companyId,
      caseCount: cases.length,
      limit,
    });

    return cases;
  } catch (error) {
    logger.error('Failed to collect reminder candidates', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Calculate if a reminder should be sent based on attempt count and time offsets
 */
export function shouldSendReminder(
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
    const hoursSinceLastNudge =
      (now.getTime() - new Date(case_.last_nudge_at).getTime()) / (1000 * 60 * 60);
    // Only send if it's been at least 12 hours since last nudge
    if (hoursSinceLastNudge < 12) {
      return { shouldSend: false, attemptNumber: 0 };
    }
  }

  return { shouldSend: false, attemptNumber: 0 };
}

/**
 * Process reminders in batches to prevent provider bursts
 */
export async function processReminderBatch<T>(
  candidates: ReminderCase[],
  reminderOffsets: number[],
  processor: (candidate: ReminderCase, attemptNumber: number) => Promise<T>
): Promise<ReminderProcessingResult<T>> {
  const results: T[] = [];
  let processed = 0;
  let successful = 0;
  let failed = 0;

  try {
    // Process in batches to prevent provider bursts
    const batchSize = additionalEnv.MAX_CONCURRENT_REMINDER_SENDS;

    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);

      const batchPromises = batch.map(async (case_): Promise<T | null> => {
        processed++;

        const { shouldSend, attemptNumber } = shouldSendReminder(case_, reminderOffsets);

        if (shouldSend) {
          try {
            const result = await processor(case_, attemptNumber);
            successful++;
            return result;
          } catch (error) {
            failed++;
            logger.error('Reminder processing failed for case', {
              caseId: case_.id,
              membershipId: case_.membership_id,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        }
        return null;
      });

      // Wait for current batch to complete before starting next
      const batchResults = await Promise.all(batchPromises);
      const filteredResults = batchResults.filter((result): result is Awaited<T> => result !== null);
      results.push(...filteredResults as T[]);
    }

    return {
      processed,
      successful,
      failed,
      results,
    };
  } catch (error) {
    logger.error('Batch reminder processing failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      processed,
      successful,
      failed,
      results: [],
    };
  }
}

/**
 * Get reminder offsets from company settings
 */
export async function getReminderOffsets(companyId: string): Promise<number[]> {
  try {
    const settings = await sql.select<{ reminder_offsets_days: string }>(
      'SELECT reminder_offsets_days FROM creator_settings WHERE company_id = $1',
      [companyId]
    );

    if (settings.length > 0 && settings[0].reminder_offsets_days) {
      // Parse JSON array of reminder offsets
      const offsets = JSON.parse(settings[0].reminder_offsets_days);
      return Array.isArray(offsets) ? offsets : [0, 2, 4]; // Default fallback
    }

    return [0, 2, 4]; // Default reminder offsets (T+0, T+2, T+4)
  } catch (error) {
    logger.error('Failed to get reminder offsets', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [0, 2, 4]; // Default fallback
  }
}