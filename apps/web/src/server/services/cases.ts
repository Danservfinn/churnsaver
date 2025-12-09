// Recovery case management service
// Handles payment_failed → recovery case mapping and merging

import { randomUUID } from 'crypto';
import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { env, additionalEnv } from '@/lib/env';
import { getMembershipManageUrlResult, terminateMembership as terminateMembershipForCase } from './memberships';
import { getSettingsForCompany } from './settings';
import { ReminderChannelSettings } from './reminders/notifier';
import { ReminderNotifier } from './shared/reminderNotifier';
import { checkRecoveryAllowed, recordRecoveryWithClient } from './subscriptions';
import {
  errorHandler,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  createDatabaseError,
  createBusinessLogicError,
  AppError
} from '@/lib/errorHandler';

// Constants for better maintainability
const DEFAULT_ATTEMPT_COUNT = 0;
const DEFAULT_INCENTIVE_DAYS = 0;
const OPEN_CASE_STATUS = 'open';
const RECOVERED_STATUS = 'recovered';
const CLOSED_NO_RECOVERY_STATUS = 'closed_no_recovery';
const EXPIRED_STATUS = 'expired';
const CLICK_THROUGH = 'CLICK_THROUGH';
const ORGANIC = 'ORGANIC';
const LEGACY_UNKNOWN = 'LEGACY_UNKNOWN';
const UNIQUE_OPEN_CASE_INDEX = 'idx_recovery_cases_one_open_per_membership';

interface QualifyingClick {
  id: string;
  clicked_at: Date;
  is_bot_suspected: boolean;
}

async function findOpenCaseForMembership(
  companyId: string,
  membershipId: string,
  paymentTime: Date,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS
): Promise<RecoveryCase | null> {
  const cutoffDate = new Date(paymentTime);
  cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

  const cases = await sqlWithRLS.select<RecoveryCase>(
    `SELECT id, company_id, membership_id, user_id, first_failure_at, status
     FROM recovery_cases
     WHERE company_id = $1
       AND membership_id = $2
       AND status = 'open'
       AND first_failure_at >= $3
     ORDER BY first_failure_at DESC
     LIMIT 1`,
    [companyId, membershipId, cutoffDate],
    { companyId }
  );
  return cases[0] || null;
}

async function findQualifyingClick(
  caseId: string,
  membershipId: string,
  paymentTime: Date,
  attributionWindowDays: number,
  companyId: string
): Promise<QualifyingClick | null> {
  const windowStart = new Date(paymentTime.getTime() - attributionWindowDays * 24 * 60 * 60 * 1000);

  const clicks = await sqlWithRLS.select<QualifyingClick>(
    `SELECT c.id, c.clicked_at, c.is_bot_suspected
     FROM recovery_click_events c
     INNER JOIN recovery_link_sends ls ON c.link_send_id = ls.id
     WHERE ls.membership_id = $1
       AND ls.case_id = $2
       AND ls.company_id = $5
       AND c.clicked_at < $3
       AND c.clicked_at >= $4
     ORDER BY c.clicked_at DESC
     LIMIT 1`,
    [membershipId, caseId, paymentTime, windowStart, companyId],
    { companyId }
  );

  return clicks[0] || null;
}

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
      [companyId, caseId, membershipId, userId, type, channel || null, JSON.stringify(metadata || {})],
      { companyId }
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
  status: 'open' | 'recovered' | 'closed_no_recovery' | 'expired';
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
   occurredAt?: Date;
}

export interface PaymentSucceededEvent {
  eventId: string;
  membershipId: string;
  userId: string;
  amount: number; // Amount that was successfully collected
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
   occurredAt?: Date;
}
/**
 * Creates a new recovery case from a payment failure event
 * @param event - The payment failed event data
 * @param companyId - The company ID associated with the case
 * @returns The created recovery case or null if creation failed
 */

// Find existing open recovery case for membership within attribution window
export async function findExistingCase(
  companyId: string,
  membershipId: string,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS,
  referenceTime: Date = new Date()
): Promise<RecoveryCase | null> {
  const result = await errorHandler.wrapAsync(
    async () => {
      const cutoffDate = calculateCutoffDate(attributionWindowDays, referenceTime);

      const cases = await sqlWithRLS.select<RecoveryCase>(
        `SELECT * FROM recovery_cases
         WHERE company_id = $1
           AND membership_id = $2
           AND status = $3
           AND first_failure_at >= $4
         ORDER BY first_failure_at DESC
         LIMIT 1`,
        [companyId, membershipId, OPEN_CASE_STATUS, cutoffDate],
        { companyId }
      );

      return cases[0] || null;
    },
    ErrorCode.DATABASE_QUERY_ERROR,
    { companyId, membershipId, attributionWindowDays }
  );

  if (!result.success) {
    // Error already logged by errorHandler
    return null;
  }

  return result.data!;
}

// Fetch the most recent open case for a membership without an attribution window filter
async function findAnyOpenCase(
  companyId: string,
  membershipId: string
): Promise<RecoveryCase | null> {
  const cases = await sqlWithRLS.select<RecoveryCase>(
    `SELECT * FROM recovery_cases
     WHERE company_id = $1
       AND membership_id = $2
       AND status = 'open'
     ORDER BY first_failure_at DESC
     LIMIT 1`,
    [companyId, membershipId],
    { companyId }
  );

  return cases[0] || null;
}

function isUniqueOpenCaseViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const pgError = error as { code?: string; constraint?: string; detail?: string };
  if (pgError.code !== '23505') {
    return false;
  }

  const matchesConstraint = pgError.constraint === UNIQUE_OPEN_CASE_INDEX;
  const matchesDetail = pgError.detail?.includes(UNIQUE_OPEN_CASE_INDEX);

  return matchesConstraint || Boolean(matchesDetail);
}

// Helper function to calculate cutoff date
function calculateCutoffDate(attributionWindowDays: number, referenceTime: Date = new Date()): Date {
  const cutoffDate = new Date(referenceTime);
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

      try {
        const newCase = await sqlWithRLS.insert<RecoveryCase>(
          `INSERT INTO recovery_cases (
            id, company_id, membership_id, user_id, first_failure_at,
            status, failure_reason, attempts
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (company_id, membership_id) WHERE status = 'open'
          DO NOTHING
          RETURNING *`,
          [
            caseId,
            companyId,
            event.membershipId,
            event.userId,
            event.occurredAt || new Date(), // Use event time, fallback to now
            'open',
            event.reason || 'payment_failed',
            0 // attempts start at 0, will be incremented when first nudge is sent
          ],
          { companyId }
        );

        if (newCase) {
          logger.info('Created new recovery case', {
            caseId: newCase.id,
            membershipId: event.membershipId,
            userId: event.userId,
            reason: event.reason
          });
        } else {
          logger.warn('Open recovery case already exists, returning existing', {
            membershipId: event.membershipId,
            companyId,
            constraint: UNIQUE_OPEN_CASE_INDEX,
          });

          const existingOpenCase = await findAnyOpenCase(companyId, event.membershipId);
          if (existingOpenCase) {
            return existingOpenCase;
          }
        }

        return newCase;
      } catch (error) {
        if (isUniqueOpenCaseViolation(error)) {
          logger.warn('Race detected: open recovery case already exists', {
            membershipId: event.membershipId,
            companyId,
            constraint: UNIQUE_OPEN_CASE_INDEX,
          });

          const existingOpenCase = await findAnyOpenCase(companyId, event.membershipId);
          if (existingOpenCase) {
            return existingOpenCase;
          }
        }

        throw error;
      }
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
      const updatedCase = await sqlWithRLS.insert<RecoveryCase>(
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
        ],
        { companyId: existingCase.company_id }
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
    const existingCase = await findExistingCase(
      companyId,
      event.membershipId,
      additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS,
      event.occurredAt || new Date()
    );

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
  amountCents: number,
  companyId: string
): Promise<boolean> {
  const result = await errorHandler.wrapAsync(
    async () => {
      const dbResult = await sqlWithRLS.execute(
        `UPDATE recovery_cases
         SET status = $1,
             recovered_amount_cents = $2,
             updated_at = NOW()
         WHERE id = $3 AND status = $4 AND company_id = $5`,
        [RECOVERED_STATUS, amountCents, caseId, OPEN_CASE_STATUS, companyId],
        { companyId }
      );

      const success = dbResult.rowCount > 0;
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
    return await sqlWithRLS.select<RecoveryCase>(query, params, { companyId });
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
    const cases = await sqlWithRLS.select<RecoveryCase>(
      `SELECT * FROM recovery_cases
       WHERE membership_id = $1 AND company_id = $2
       ORDER BY first_failure_at DESC
       LIMIT 1`,
      [membershipId, companyId],
      { companyId }
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
  companyId: string,
  membershipId: string,
  recoveredAmountCents: number,
  successTime?: Date,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS,
  eventId?: string
): Promise<boolean> {
  try {
    logger.info('Marking case as recovered by membership', {
      companyId,
      membershipId,
      recoveredAmountCents,
      successTime: successTime?.toISOString(),
      attributionWindowDays,
      eventId
    });

    const paymentTime = successTime ?? new Date();
    const openCase = await findOpenCaseForMembership(
      companyId,
      membershipId,
      paymentTime,
      attributionWindowDays
    );

    if (!openCase) {
      logger.warn('No open case found for membership', { membershipId, companyId });
      return false;
    }

    const expiryCutoff = new Date(paymentTime.getTime() - additionalEnv.CASE_EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // If the open case is outside expiry window, treat as organic/late and skip usage updates
    if (openCase.first_failure_at < expiryCutoff) {
      await sqlWithRLS.execute(
        `UPDATE recovery_cases
         SET status = 'expired',
             recovery_type = 'ORGANIC',
             updated_at = NOW()
         WHERE id = $1 AND company_id = $2 AND status = 'open'`,
        [openCase.id, companyId],
        { companyId }
      );

      logger.info('Late success outside expiry window treated as organic (case expired)', {
        companyId,
        membershipId,
        eventId,
        caseId: openCase.id,
        firstFailureAt: openCase.first_failure_at,
        paymentTime: paymentTime.toISOString(),
        expiryCutoff: expiryCutoff.toISOString()
      });
      return true;
    }

    const qualifyingClick = await findQualifyingClick(
      openCase.id,
      membershipId,
      paymentTime,
      attributionWindowDays,
      companyId
    );

    let recoveryType: string =
      qualifyingClick && !qualifyingClick.is_bot_suspected ? CLICK_THROUGH : ORGANIC;
    let attributedClickId: string | null =
      qualifyingClick && !qualifyingClick.is_bot_suspected ? qualifyingClick.id : null;
    let allowance:
      | {
          allowed: boolean;
          reason?: string;
        }
      | null = null;

    if (recoveryType === CLICK_THROUGH) {
      try {
        allowance = await checkRecoveryAllowed(openCase.company_id, recoveredAmountCents);
        if (!allowance.allowed) {
          logger.warn('Recovery exceeds current tier limits, downgrading to ORGANIC', {
            companyId: openCase.company_id,
            membershipId,
            reason: allowance.reason,
            amountCents: recoveredAmountCents,
          });
          recoveryType = ORGANIC;
          attributedClickId = null;
        }
      } catch (error) {
        logger.error('Failed to check recovery allowance; aborting recovery to allow retry', {
          error: error instanceof Error ? error.message : String(error),
          companyId: openCase.company_id,
          membershipId,
        });
        // Propagate to allow caller/job retry instead of silently closing case
        throw error;
      }
    }

    const amountToPersist = recoveryType === CLICK_THROUGH ? recoveredAmountCents : 0;

    const transactionResult = await sqlWithRLS.transaction(
      async (client) => {
      // Idempotency check inside transaction to prevent races
      if (eventId) {
        const existingSource = await client.query<{ exists: boolean }>(
          `SELECT 1 FROM recovery_cases WHERE company_id = $1 AND recovery_source_event_id = $2 LIMIT 1`,
          [companyId, eventId]
        );

        if ((existingSource.rowCount ?? 0) > 0) {
          return { success: true as const, alreadyProcessed: true as const };
        }
      }

        const updateResult = await client.query<{
          id: string;
          membership_id: string;
          status: string;
          recovered_amount_cents: number;
          recovery_type: string | null;
          attributed_click_id: string | null;
          attribution_window_days: number | null;
          recovery_source_event_id: string | null;
        }>(
          `UPDATE recovery_cases
           SET status = 'recovered',
               recovered_amount_cents = $1,
               recovery_type = $2,
               attributed_click_id = $3,
               attribution_window_days = $4,
               recovery_source_event_id = $5,
               updated_at = NOW()
           WHERE id = $6
             AND company_id = $7
             AND status = 'open'
             AND first_failure_at >= $8
           RETURNING id, membership_id, status, recovered_amount_cents, recovery_type, attributed_click_id, attribution_window_days, recovery_source_event_id`,
          [
            amountToPersist,
            recoveryType,
            attributedClickId,
            attributionWindowDays,
            eventId ?? null,
            openCase.id,
            companyId,
            expiryCutoff,
          ]
        );

        const updatedCase = updateResult.rows[0];
        if (!updatedCase) {
        return { success: false as const, alreadyProcessed: false as const };
        }

        if (recoveryType === CLICK_THROUGH && allowance?.allowed) {
          await recordRecoveryWithClient(client, openCase.company_id, recoveredAmountCents);
        }

        return {
          success: true as const,
        alreadyProcessed: false as const,
          updatedCase,
        };
      },
      { companyId }
    );

  if (transactionResult.alreadyProcessed) {
    logger.info('Recovery source event already processed inside transaction', {
      companyId,
      membershipId,
      eventId,
    });
    return true;
  }

  if (transactionResult.success) {
      logger.info('Case marked as recovered with attribution', {
        caseId: transactionResult.updatedCase.id,
        membershipId: transactionResult.updatedCase.membership_id,
        recoveredAmountCents: transactionResult.updatedCase.recovered_amount_cents,
        recoveryType: transactionResult.updatedCase.recovery_type,
        attributedClickId: transactionResult.updatedCase.attributed_click_id,
        attributionWindowDays,
      });
      return true;
    }

    logger.warn('No open case found to recover during update', {
      membershipId,
      successTime: successTime?.toISOString(),
      attributionWindowDays,
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

export async function isEventAlreadyUsedForRecovery(
  companyId: string,
  eventId: string
): Promise<boolean> {
  if (!eventId) {
    return false;
  }

  try {
    const existing = await sqlWithRLS.select<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM recovery_cases
         WHERE company_id = $1
           AND recovery_source_event_id = $2
       ) AS exists`,
      [companyId, eventId],
      { companyId }
    );

    return existing.length > 0 && existing[0].exists === true;
  } catch (error) {
    logger.error('Failed to check if event already used for recovery', {
      companyId,
      eventId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Check if a membership has an active recovery case
export async function hasActiveRecoveryCase(
  companyId: string,
  membershipId: string,
  attributionWindowDays: number = additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS
): Promise<boolean> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

    const result = await sqlWithRLS.select<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM recovery_cases
       WHERE company_id = $1
         AND membership_id = $2
         AND status = 'open'
         AND first_failure_at >= $3`,
      [companyId, membershipId, cutoffDate],
      { companyId }
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
  companyId: string,
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
      companyId,
      event.membershipId,
      amountCents,
      successTime,
      additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS,
      event.eventId
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
  companyId: string,
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
      companyId,
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
    const existingCase = await findExistingCase(
      companyId,
      event.membershipId,
      additionalEnv.KPI_ATTRIBUTION_WINDOW_DAYS,
      event.occurredAt || new Date()
    );

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
    const result = await sqlWithRLS.execute(
      `UPDATE recovery_cases
       SET attempts = $1,
           last_nudge_at = NOW()
       WHERE id = $2 AND company_id = $3`,
      [attemptNumber, caseId, companyId],
      { companyId }
    );

    const success = result.rowCount > 0;
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

  await logRecoveryAction(
    case_.company_id,
    case_.id,
    case_.membership_id,
    case_.user_id,
    't0_nudge_status',
    undefined,
    {
      pushSent: result.pushSent,
      dmSent: result.dmSent,
      incentiveApplied: result.incentiveApplied,
      error: result.error
    }
  );

  if (!(result.pushSent || result.dmSent || result.incentiveApplied)) {
    logger.warn('T+0 nudge sent no channels', { caseId: case_.id });
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
    const cases = await sqlWithRLS.select<RecoveryCase>(
      `SELECT id, membership_id, user_id, status, attempts, company_id
       FROM recovery_cases
       WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [caseId, companyId],
      { companyId }
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
    const cases = await sqlWithRLS.select<RecoveryCase>(
      `SELECT id, membership_id, user_id FROM recovery_cases WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [caseId, companyId],
      { companyId }
    );

    const result = await sqlWithRLS.execute(
      `UPDATE recovery_cases
       SET status = 'closed_no_recovery'
       WHERE id = $1 AND company_id = $2 AND status = 'open'`,
      [caseId, companyId],
      { companyId }
    );

    // Check if update was successful (sql.execute returns number of affected rows)
    if (typeof result === 'object' && result.rowCount > 0) {
      logger.info('Recovery case cancelled', { caseId, affectedRows: result.rowCount });

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
    const cases = await sqlWithRLS.select<RecoveryCase>(
      `SELECT id, membership_id, user_id, status, company_id
       FROM recovery_cases
       WHERE id = $1 AND company_id = $2`,
      [caseId, companyId],
      { companyId }
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
      await sqlWithRLS.execute(
        `UPDATE recovery_cases
         SET status = 'closed_no_recovery'
         WHERE id = $1`,
        [caseId],
        { companyId }
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
