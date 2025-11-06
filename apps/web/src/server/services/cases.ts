// Recovery case management service
// Handles payment_failed → recovery case mapping and merging

import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { env, additionalEnv } from '@/lib/env';
import { getMembershipManageUrlResult, terminateMembership as terminateMembershipForCase } from './memberships';
import { getSettingsForCompany } from './settings';
import { ReminderChannelSettings } from './reminders/notifier';
import { ReminderNotifier } from './shared/reminderNotifier';
import {
  errorHandler,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  createDatabaseError,
  createBusinessLogicError,
  AppError
} from '@/lib/errorHandler';

// Helper function to execute database operations with RLS context
async function executeWithRLS<T>(
  operation: (companyId: string) => Promise<T>,
  companyId: string
): Promise<T> {
  // Set RLS context for this operation
  // Note: setRequestContext is not imported - this appears to be a placeholder
  // that should be implemented or removed based on actual RLS middleware

  try {
    return await operation(companyId);
  } finally {
    // Clear context after operation
    // Note: In a real implementation, this would be handled by middleware
  }
}

// Constants for better maintainability
const DEFAULT_ATTEMPT_COUNT = 0;
const DEFAULT_INCENTIVE_DAYS = 0;
const OPEN_CASE_STATUS = 'open';
const RECOVERED_STATUS = 'recovered';
const CLOSED_NO_RECOVERY_STATUS = 'closed_no_recovery';

/**
 * Logs recovery action audit events to the database
 * @param companyId - The company ID associated with the action
 * @param caseId - The recovery case ID (optional)
 * @param membershipId - The membership ID affected
 * @param userId - The user ID affected
 * @param type - The type of recovery action
 * @param channel - The communication channel used (optional)
 * @param metadata - Additional metadata for the action (optional)
 */
// Recovery action audit logging helper (exported for use in notification services)
export async function logRecoveryAction(
  companyId: string,
  caseId: string | null,
  membershipId: string,
  userId: string,
  type: string,
  channel?: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await sqlWithRLS.execute(
      `INSERT INTO recovery_actions (company_id, case_id, membership_id, user_id, type, channel, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, caseId, membershipId, userId, type, channel || null, JSON.stringify(metadata || {})]
    );
  } catch (error) {
    logger.error('Failed to log recovery action', {
      companyId,
      caseId,
      membershipId,
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    // Log the error but don't fail the operation
  }
}
/**
 * RecoveryCase interface
 *
 * Data structure representing a recovery case in the database
 * @param id - Unique identifier for the recovery case
 * @param company_id - Company identifier associated with the case
 * @param membership_id - Membership identifier for the case
 * @param user_id - User identifier for the case
 * @param first_failure_at - Timestamp of the first payment failure
 * @param last_nudge_at - Timestamp of the last reminder sent (null if none)
 * @param attempts - Number of recovery attempts made
 * @param incentive_days - Number of free days applied as incentive
 * @param status - Current status of the recovery case
 * @param failure_reason - Reason for the payment failure (null if unknown)
 * @param recovered_amount_cents - Amount recovered in cents
 * @param created_at - Timestamp when the case was created
 */

export interface RecoveryCase {
   id: string;
   company_id: string;
   membership_id: string;
   user_id: string;
   first_failure_at: Date;
   last_nudge_at: Date | null;
   attempts: number;
   incentive_days: number;
   status: 'open' | 'recovered' | 'closed_no_recovery';
   failure_reason: string | null;
   recovered_amount_cents: number;
   created_at: Date;
}

/**
 * Data structure for membership valid webhook events
 */
export interface PaymentFailedEvent {
   eventId: string;
   membershipId: string;
   userId: string;
   reason?: string;
   amount?: number;
   currency?: string;
   companyId?: string; // May need to be derived from context
}

export interface PaymentSucceededEvent {
  eventId: string;
  membershipId: string;
  userId: string;
  amount: number; // Amount that was successfully collected
/**
 * createRecoveryCase function
 *
 * Creates a new recovery case from a payment failure event
 * @param event - The payment failed event data
 * @param companyId - The company ID associated with the case
 * @returns The created recovery case or null if creation failed
 */
  currency?: string;
  companyId?: string; // May need to be derived from context
}

export interface MembershipValidEvent {
  eventId: string;
  membershipId: string;
  userId: string;
  companyId?: string; // May need to be derived from context
}

export interface MembershipInvalidEvent {
   eventId: string;
   membershipId: string;
   userId: string;
   companyId?: string; // May need to be derived from context
}
/**
 * Creates a new recovery case from a payment failure event
 * @param event - The payment failed event data
 * @param companyId - The company ID associated with the case
 * @returns The created recovery case or null if creation failed
 */

// Find existing open recovery case for membership within attribution window
export async function findExistingCase(
  membershipId: string,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS
): Promise<RecoveryCase | null> {
  const result = await errorHandler.wrapAsync(
    async () => {
      const cutoffDate = calculateCutoffDate(attributionWindowDays);

      const cases = await sql.select<RecoveryCase>(
        `SELECT * FROM recovery_cases
         WHERE membership_id = $1
           AND status = $2
           AND first_failure_at >= $3
         ORDER BY first_failure_at DESC
         LIMIT 1`,
        [membershipId, OPEN_CASE_STATUS, cutoffDate]
      );

      return cases[0] || null;
    },
    ErrorCode.DATABASE_QUERY_ERROR,
    { membershipId, attributionWindowDays }
  );

  if (!result.success) {
    // Error already logged by errorHandler
    return null;
  }

  return result.data!;
}

// Helper function to calculate cutoff date
function calculateCutoffDate(attributionWindowDays: number): Date {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);
  return cutoffDate;
}

// Create new recovery case from payment failure
export async function createRecoveryCase(
  event: PaymentFailedEvent,
  companyId: string
): Promise<RecoveryCase | null> {
  const result = await errorHandler.wrapAsync(
    async () => {
      // Generate a proper UUID for the case ID
      const caseId = randomUUID();

      const newCase = await sql.insert<RecoveryCase>(
        `INSERT INTO recovery_cases (
          id, company_id, membership_id, user_id, first_failure_at,
          status, failure_reason, attempts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          caseId,
          companyId,
          event.membershipId,
          event.userId,
          new Date(), // first_failure_at
          'open',
          event.reason || 'payment_failed',
          0 // attempts start at 0, will be incremented when first nudge is sent
        ]
      );

      if (newCase) {
        logger.info('Created new recovery case', {
          caseId: newCase.id,
          membershipId: event.membershipId,
          userId: event.userId,
          reason: event.reason
        });
      }

      return newCase;
    },
    ErrorCode.DATABASE_QUERY_ERROR,
    {
      membershipId: event.membershipId,
      userId: event.userId,
      companyId,
      reason: event.reason
    }
  );

  if (!result.success) {
    // Error already logged by errorHandler
    return null;
  }

  return result.data!;
}

// Update existing recovery case with new failure
export async function updateRecoveryCase(
  existingCase: RecoveryCase,
  event: PaymentFailedEvent
): Promise<RecoveryCase | null> {
  const result = await errorHandler.wrapAsync(
    async () => {
      const updatedCase = await sql.insert<RecoveryCase>(
        `UPDATE recovery_cases
         SET attempts = attempts + 1,
             last_nudge_at = $2,
             failure_reason = COALESCE($3, failure_reason),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          existingCase.id,
          new Date(),
          event.reason || null
        ]
      );

      if (updatedCase) {
        logger.info('Updated existing recovery case', {
          caseId: existingCase.id,
          membershipId: event.membershipId,
          previousAttempts: existingCase.attempts,
          newAttempts: updatedCase.attempts
        });
      }

      return updatedCase;
    },
    ErrorCode.DATABASE_QUERY_ERROR,
    {
      caseId: existingCase.id,
      membershipId: event.membershipId,
      reason: event.reason
    }
  );

  if (!result.success) {
    // Error already logged by errorHandler
    return null;
  }

  return result.data!;
}

// Main function: Process payment_failed event into recovery case
export async function processPaymentFailedEvent(
  event: PaymentFailedEvent,
  companyId: string
): Promise<RecoveryCase | null> {
  try {
    logger.info('Processing payment_failed event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      userId: event.userId
    });

    // Check for existing open case within attribution window
    const existingCase = await findExistingCase(event.membershipId);

    let recoveryCase: RecoveryCase | null;

    if (existingCase) {
      // Merge with existing case
      logger.info('Merging with existing recovery case', {
        existingCaseId: existingCase.id,
        membershipId: event.membershipId
      });
      recoveryCase = await updateRecoveryCase(existingCase, event);
    } else {
      // Create new case
      logger.info('Creating new recovery case', {
        membershipId: event.membershipId,
        userId: event.userId
      });
      recoveryCase = await createRecoveryCase(event, companyId);

      // Fire T+0 nudges and incentives for new cases only
      if (recoveryCase) {
        try {
          const settings = await getSettingsForCompany(companyId);
          const nudgeResult = await sendImmediateRecoveryNudge(recoveryCase, {
            enable_push: settings.enable_push,
            enable_dm: settings.enable_dm,
            incentive_days: settings.incentive_days
          });

          logger.info('T+0 nudge completed for new case', {
            caseId: recoveryCase.id,
            pushSent: nudgeResult.pushSent,
            dmSent: nudgeResult.dmSent,
            incentiveApplied: nudgeResult.incentiveApplied
          });
        } catch (nudgeError) {
          logger.error('T+0 nudge failed for new case', {
            caseId: recoveryCase.id,
            error: nudgeError instanceof Error ? nudgeError.message : String(nudgeError)
          });
          // Don't fail the case creation if nudge fails
        }
      }
    }

    return recoveryCase;

  } catch (error) {
    logger.error('Failed to process payment_failed event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Mark case as recovered with amount attribution
export async function markCaseRecovered(
  caseId: string,
  amountCents: number
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    async () => {
      const dbResult = await sql.execute(
        `UPDATE recovery_cases
         SET status = $1,
             recovered_amount_cents = $2,
             updated_at = NOW()
         WHERE id = $3 AND status = $4`,
        [RECOVERED_STATUS, amountCents, caseId, OPEN_CASE_STATUS]
      );

      const success = dbResult > 0;
      if (success) {
        logger.info('Marked case as recovered', { caseId, amountCents });
      }

      return success;
    },
    ErrorCode.DATABASE_QUERY_ERROR,
    { caseId, amountCents }
  );

  if (!result.success) {
    // Error already logged by errorHandler
    return false;
  }

  return result.data!;
}

// Get recovery cases for dashboard
export async function getRecoveryCases(
  companyId: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<RecoveryCase[]> {
  try {
    const { query, params } = buildRecoveryCasesQuery(companyId, status, limit, offset);
    return await sql.select<RecoveryCase>(query, params);
  } catch (error) {
    logger.error('Failed to get recovery cases', {
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

// Helper function to build query for recovery cases
function buildRecoveryCasesQuery(
  companyId: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): { query: string; params: (string | number)[] } {
  let query = `SELECT * FROM recovery_cases WHERE company_id = $1`;
  const params: (string | number)[] = [companyId];

  if (status) {
    query += ` AND status = $2`;
    params.push(status);
  }

  query += ` ORDER BY first_failure_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  return { query, params };
}

// Get case by membership ID (for quick lookup)
export async function getCaseByMembershipId(
  membershipId: string,
  companyId: string
): Promise<RecoveryCase | null> {
  try {
    const cases = await sql.select<RecoveryCase>(
      `SELECT * FROM recovery_cases
       WHERE membership_id = $1 AND company_id = $2
       ORDER BY first_failure_at DESC
       LIMIT 1`,
      [membershipId, companyId]
    );

    return cases[0] || null;
  } catch (error) {
    logger.error('Failed to get case by membership ID', {
      membershipId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Get manage URL for a recovery case (used by nudging services)
export async function getCaseManageUrl(
  membershipId: string
): Promise<string | null> {
  const result = await getMembershipManageUrlResult(membershipId);
  return result.success ? result.url || null : null;
}

// Mark a recovery case as recovered by membership ID (successful payment attribution)
export async function markCaseRecoveredByMembership(
  membershipId: string,
  recoveredAmountCents: number,
  successTime?: Date,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS
): Promise<boolean> {
  try {
    logger.info('Marking case as recovered by membership', {
      membershipId,
      recoveredAmountCents,
      successTime: successTime?.toISOString(),
      attributionWindowDays
    });

    // If successTime is provided, enforce the attribution window based on the time difference
    if (successTime) {
      // Find the open case for this membership
      const cases = await sql.select<RecoveryCase>(
        `SELECT id, membership_id, user_id, first_failure_at, status
         FROM recovery_cases
         WHERE membership_id = $1 AND status = 'open'
         ORDER BY first_failure_at DESC
         LIMIT 1`,
        [membershipId]
      );

      if (cases.length === 0) {
        logger.warn('No open case found for membership', { membershipId });
        return false;
      }

      const case_ = cases[0];
      const firstFailureTime = new Date(case_.first_failure_at);
      const timeDiffDays = (successTime.getTime() - firstFailureTime.getTime()) / (1000 * 60 * 60 * 24);

      if (timeDiffDays > attributionWindowDays) {
        logger.warn('Success event outside attribution window', {
          caseId: case_.id,
          membershipId,
          firstFailureAt: firstFailureTime.toISOString(),
          successTime: successTime.toISOString(),
          timeDiffDays,
          attributionWindowDays
        });
        return false;
      }

      // Update the specific case that matches the attribution window
      const result = await sql.select<{
        id: string;
        membership_id: string;
        status: string;
        recovered_amount_cents: number;
      }>(
        `UPDATE recovery_cases
         SET status = 'recovered',
             recovered_amount_cents = $1
         WHERE id = $2 AND status = 'open'
         RETURNING id, membership_id, status, recovered_amount_cents`,
        [recoveredAmountCents, case_.id]
      );

      if (result.length > 0) {
        logger.info('Case marked as recovered by membership with time validation', {
          caseId: result[0].id,
          membershipId: result[0].membership_id,
          recoveredAmountCents: result[0].recovered_amount_cents,
          timeDiffDays
        });
        return true;
      }
    } else {
      // Fallback to original logic if no successTime provided
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

      const result = await sql.select<{
        id: string;
        membership_id: string;
        status: string;
        recovered_amount_cents: number;
      }>(
        `UPDATE recovery_cases
         SET status = 'recovered',
             recovered_amount_cents = $1
         WHERE membership_id = $2
           AND status = 'open'
           AND first_failure_at >= $3
         RETURNING id, membership_id, status, recovered_amount_cents`,
        [recoveredAmountCents, membershipId, cutoffDate]
      );

      if (result.length > 0) {
        logger.info('Case marked as recovered by membership (fallback)', {
          caseId: result[0].id,
          membershipId: result[0].membership_id,
          recoveredAmountCents: result[0].recovered_amount_cents,
        });
        return true;
      }
    }

    logger.warn('No open case found to recover', {
      membershipId,
      successTime: successTime?.toISOString(),
      attributionWindowDays
    });
    return false;

  } catch (error) {
    logger.error('Failed to mark case as recovered by membership', {
      membershipId,
      recoveredAmountCents,
      successTime: successTime?.toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Check if a membership has an active recovery case
export async function hasActiveRecoveryCase(
  membershipId: string,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS
): Promise<boolean> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

    const result = await sql.select<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM recovery_cases
       WHERE membership_id = $1
         AND status = 'open'
         AND first_failure_at >= $2`,
      [membershipId, cutoffDate]
    );

    return result[0].count > 0;
  } catch (error) {
    logger.error('Failed to check for active recovery case', {
      membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Process payment succeeded event (recovery attribution)
export async function processPaymentSucceededEvent(
  event: PaymentSucceededEvent,
  successTime?: Date
): Promise<boolean> {
  try {
    logger.info('Processing payment succeeded event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      userId: event.userId,
      amount: event.amount,
      currency: event.currency,
      successTime: successTime?.toISOString(),
    });

    // Convert amount to cents (assuming USD if no currency specified)
    const amountCents = Math.round(event.amount * 100);

    // Mark the case as recovered with proper attribution window check
    const recovered = await markCaseRecoveredByMembership(
      event.membershipId,
      amountCents,
      successTime
    );

    if (recovered) {
      logger.info('Payment succeeded event processed - recovery attributed', {
        eventId: event.eventId,
        membershipId: event.membershipId,
        recoveredAmountCents: amountCents,
        successTime: successTime?.toISOString(),
      });
      return true;
    } else {
      logger.info('Payment succeeded event processed - no active case to recover within window', {
        eventId: event.eventId,
        membershipId: event.membershipId,
        amountCents,
        successTime: successTime?.toISOString(),
      });
      // This is still successful processing, just no case was found to recover
      return true;
    }
  } catch (error) {
    logger.error('Failed to process payment succeeded event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Process membership went valid event (recovery attribution)
export async function processMembershipValidEvent(
  event: MembershipValidEvent,
  successTime?: Date
): Promise<boolean> {
  try {
    logger.info('Processing membership valid event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      userId: event.userId,
      successTime: successTime?.toISOString(),
    });

    // Mark the case as recovered (no amount attribution for valid events)
    const recovered = await markCaseRecoveredByMembership(
      event.membershipId,
      0,
      successTime
    );

    if (recovered) {
      logger.info('Membership valid event processed - recovery attributed', {
        eventId: event.eventId,
        membershipId: event.membershipId,
        successTime: successTime?.toISOString(),
      });
      return true;
    } else {
      logger.info('Membership valid event processed - no active case to recover within window', {
        eventId: event.eventId,
        membershipId: event.membershipId,
        successTime: successTime?.toISOString(),
      });
      // This is still successful processing, just no case was found to recover
      return true;
    }
  } catch (error) {
    logger.error('Failed to process membership valid event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Process membership went invalid event (create recovery case if needed)
export async function processMembershipInvalidEvent(
  event: MembershipInvalidEvent,
  companyId: string
): Promise<boolean> {
  try {
    logger.info('Processing membership invalid event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      userId: event.userId,
    });

    // Check if there's already an active case
    const existingCase = await findExistingCase(event.membershipId);

    if (existingCase) {
      logger.info('Membership invalid event processed - case already exists', {
        eventId: event.eventId,
        membershipId: event.membershipId,
        existingCaseId: existingCase.id,
      });
      return true;
    }

    // Create a new case for membership invalidation
    const newCase = await createRecoveryCase({
      eventId: event.eventId,
      membershipId: event.membershipId,
      userId: event.userId,
      reason: 'membership_invalidated',
    }, companyId);

    if (newCase) {
      logger.info('Membership invalid event processed - new case created', {
        eventId: event.eventId,
        membershipId: event.membershipId,
        newCaseId: newCase.id,
      });

      // Optionally trigger T+0 nudges here too
      try {
        const settings = await getSettingsForCompany(companyId);
        
        // Note: setRequestContext calls removed due to missing import
        const nudgeResult = await sendImmediateRecoveryNudge(newCase, {
          enable_push: settings.enable_push,
          enable_dm: settings.enable_dm,
          incentive_days: settings.incentive_days
        });

        logger.info('T+0 nudge completed for membership invalid case', {
          caseId: newCase.id,
          pushSent: nudgeResult.pushSent,
          dmSent: nudgeResult.dmSent,
          incentiveApplied: nudgeResult.incentiveApplied
        });
      } catch (nudgeError) {
        logger.error('T+0 nudge failed for membership invalid case', {
          caseId: newCase.id,
          error: nudgeError instanceof Error ? nudgeError.message : String(nudgeError)
        });
        // Don't fail the case creation if nudge fails
      }
    } else {
      logger.warn('Membership invalid event processed - failed to create case', {
        eventId: event.eventId,
        membershipId: event.membershipId,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Failed to process membership invalid event', {
      eventId: event.eventId,
      membershipId: event.membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Record a reminder attempt on a case
export async function recordReminderAttempt(caseId: string, attemptNumber: number, companyId: string): Promise<boolean> {
  try {
    const result = await sql.execute(
      `UPDATE recovery_cases
       SET attempts = $1,
           last_nudge_at = NOW()
       WHERE id = $2 AND company_id = $3`,
      [attemptNumber, caseId, companyId]
    );

    const success = result > 0;
    if (success) {
      logger.info('Recorded reminder attempt', { caseId, attemptNumber, companyId });
    } else {
      logger.warn('Failed to record reminder attempt - case not found', { caseId, companyId });
    }

    return success;
  } catch (error) {
    logger.error('Failed to record reminder attempt', {
      caseId,
      attemptNumber,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Send T+0 recovery nudges and apply incentive (called immediately after payment_failed case creation)
export async function sendImmediateRecoveryNudge(
  case_: RecoveryCase,
  settings: ReminderChannelSettings
): Promise<{ pushSent: boolean; dmSent: boolean; incentiveApplied: boolean }> {
  const result = await ReminderNotifier.sendReminder({
    caseSnapshot: {
      id: case_.id,
      company_id: case_.company_id,
      membership_id: case_.membership_id,
      user_id: case_.user_id,
      incentive_days: case_.incentive_days,
    },
    settings,
    attemptNumber: 1,
    trigger: 'immediate',
  });

  if (!result.error || result.error !== 'MANAGE_URL_UNAVAILABLE') {
    await recordReminderAttempt(case_.id, 1, case_.company_id);
  }

  return {
    pushSent: result.pushSent,
    dmSent: result.dmSent,
    incentiveApplied: result.incentiveApplied,
  };
}


// Manual case actions (server actions)

// Send another nudge for a specific case
export async function nudgeCaseAgain(
  caseId: string,
  companyId: string,
  actorType: string = 'user',
  actorId: string = 'anonymous'
): Promise<boolean> {
  try {
    // Get the case details and validate company ownership
    const cases = await sql.select<RecoveryCase>(
      `SELECT id, membership_id, user_id, status, attempts, company_id
       FROM recovery_cases
       WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [caseId, companyId]
    );

    if (cases.length === 0) {
      logger.warn('Case not found or not open for nudging', { caseId });
      return false;
    }

    const case_ = cases[0];

    // Get manage URL for the membership with structured error handling
    const urlResult = await getMembershipManageUrlResult(case_.membership_id);
    if (!urlResult.success) {
      logger.warn('Could not get manage URL for case nudge', {
        caseId,
        membershipId: case_.membership_id,
        error: urlResult.error
      });
      return false;
    }
    const manageUrl = urlResult.url!;

    // Get company settings to determine which channels to use
    const settings = await getSettingsForCompany(companyId);
    
    // Note: setRequestContext calls removed due to missing import

    // Send nudge notifications with shared dispatcher
    const newAttemptNumber = case_.attempts + 1;

    // Use the shared ReminderNotifier for consistent handling
    const dispatchResult = await ReminderNotifier.sendReminder({
      caseSnapshot: {
        id: case_.id,
        company_id: case_.company_id,
        membership_id: case_.membership_id,
        user_id: case_.user_id,
        incentive_days: case_.incentive_days,
      },
      settings,
      attemptNumber: newAttemptNumber,
      trigger: 'manual',
      manageUrl,
      allowIncentive: false,
    });

    if (!(dispatchResult.pushSent || dispatchResult.dmSent)) {
      logger.warn('Failed to send nudge notifications', {
        caseId,
        membershipId: case_.membership_id,
      });
      return false;
    }

    // Make sure attempts/last_nudge_at stay accurate for scheduler decisions.
    const reminderRecorded = await recordReminderAttempt(caseId, newAttemptNumber, companyId);

    if (!reminderRecorded) {
      logger.warn('Failed to record manual reminder attempt', {
        caseId,
        companyId,
        attemptNumber: newAttemptNumber,
      });
      return false;
    }

    logger.info('Manual nudge sent successfully', {
      caseId,
      membershipId: case_.membership_id,
      pushSent: dispatchResult.pushSent,
      dmSent: dispatchResult.dmSent,
      newAttempts: newAttemptNumber,
      loggedActions: (dispatchResult.pushSent ? 1 : 0) + (dispatchResult.dmSent ? 1 : 0),
    });
    return true;
  } catch (error) {
    logger.error('Failed to send manual nudge', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Cancel a recovery case (stop future reminders)
export async function cancelRecoveryCase(caseId: string, companyId: string, actorType: string = 'user', actorId: string = 'anonymous'): Promise<boolean> {
  try {
    // Get case details first for audit logging
    const cases = await sql.select<RecoveryCase>(
      `SELECT id, membership_id, user_id FROM recovery_cases WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [caseId, companyId]
    );

    const result = await sql.execute(
      `UPDATE recovery_cases
       SET status = 'closed_no_recovery'
       WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [caseId, companyId]
    );

    // Check if update was successful (sql.execute returns number of affected rows)
    if (typeof result === 'number' && result > 0) {
      logger.info('Recovery case cancelled', { caseId, affectedRows: result });

      // Log cancellation
      if (cases.length > 0) {
        await logRecoveryAction(companyId, caseId, cases[0].membership_id, cases[0].user_id, 'case_cancelled', undefined, {
          manualAction: true,
          actorType,
          actorId
        });
      }

      return true;
    } else {
      logger.warn('Case not found or already closed', { caseId, result });
      return false;
    }
  } catch (error) {
    logger.error('Failed to cancel recovery case', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Terminate membership (cancel subscription via Whop API)
export async function terminateMembership(caseId: string, companyId: string, actorType: string = 'user', actorId: string = 'anonymous'): Promise<boolean> {
  try {
    // Get the case details and validate company ownership
    const cases = await sql.select<RecoveryCase>(
      `SELECT id, membership_id, user_id, status, company_id
       FROM recovery_cases
       WHERE id = $1 AND company_id = $2`,
      [caseId, companyId]
    );

    if (cases.length === 0) {
      logger.warn('Case not found for termination', { caseId });
      return false;
    }

    const case_ = cases[0];

    // Terminate the membership via Whop API
    const terminated = await terminateMembershipForCase(case_.membership_id);

    if (terminated) {
      // Update case status to reflect termination
      await sql.execute(
        `UPDATE recovery_cases
         SET status = 'closed_no_recovery'
         WHERE id = $1`,
        [caseId]
      );

      logger.info('Membership terminated successfully', {
        caseId,
        membershipId: case_.membership_id
      });

      // Log termination
      await logRecoveryAction(companyId, caseId, case_.membership_id, case_.user_id, 'membership_terminated', undefined, {
        manualAction: true,
        actorType,
        actorId
      });

      return true;
    } else {
      logger.warn('Failed to terminate membership via Whop API', {
        caseId,
        membershipId: case_.membership_id
      });
      return false;
    }
  } catch (error) {
    logger.error('Failed to terminate membership', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
