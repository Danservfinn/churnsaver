// Recovery case management service
// Handles payment_failed → recovery case mapping and merging

import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { getMembershipManageUrl, getMembershipManageUrlResult, terminateMembership as terminateMembershipForCase } from './memberships';
import { sendRecoveryNudgePush } from './push';
import { sendRecoveryNudgeDM } from './dm';
import { applyRecoveryIncentive } from './incentives';
import { getSettingsForCompany } from './settings';

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
    await sql.execute(
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

// Find existing open recovery case for membership within attribution window
export async function findExistingCase(
  membershipId: string,
  attributionWindowDays: number = env.KPI_ATTRIBUTION_WINDOW_DAYS
): Promise<RecoveryCase | null> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

    const cases = await sql.select<RecoveryCase>(
      `SELECT * FROM recovery_cases
       WHERE membership_id = $1
         AND status = 'open'
         AND first_failure_at >= $2
       ORDER BY first_failure_at DESC
       LIMIT 1`,
      [membershipId, cutoffDate]
    );

    return cases[0] || null;
  } catch (error) {
    logger.error('Failed to find existing case', {
      membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Create new recovery case from payment failure
export async function createRecoveryCase(
  event: PaymentFailedEvent,
  companyId: string
): Promise<RecoveryCase | null> {
  try {
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
  } catch (error) {
    logger.error('Failed to create recovery case', {
      membershipId: event.membershipId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Update existing recovery case with new failure
export async function updateRecoveryCase(
  existingCase: RecoveryCase,
  event: PaymentFailedEvent
): Promise<RecoveryCase | null> {
  try {
    // Update attempts and last failure timestamp
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
        new Date(), // last_nudge_at
        event.reason || existingCase.failure_reason
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
  } catch (error) {
    logger.error('Failed to update recovery case', {
      caseId: existingCase.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
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
  try {
    const result = await sql.execute(
      `UPDATE recovery_cases
       SET status = 'recovered',
           recovered_amount_cents = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'open'`,
      [caseId, amountCents]
    );

    const success = result > 0;
    if (success) {
      logger.info('Marked case as recovered', { caseId, amountCents });
    }

    return success;
  } catch (error) {
    logger.error('Failed to mark case as recovered', {
      caseId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Get recovery cases for dashboard
export async function getRecoveryCases(
  companyId: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<RecoveryCase[]> {
  try {
    let query = `SELECT * FROM recovery_cases WHERE company_id = $1`;
    const params: (string | number)[] = [companyId];

    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY first_failure_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    return await sql.select<RecoveryCase>(query, params);
  } catch (error) {
    logger.error('Failed to get recovery cases', {
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
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
  attributionWindowDays: number = env.KPI_ATTRIBUTION_WINDOW_DAYS
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
      const result = await sql.execute(
        `UPDATE recovery_cases
         SET status = 'recovered',
             recovered_amount_cents = $1
         WHERE id = $2 AND status = 'open'
         RETURNING id, membership_id, status, recovered_amount_cents`,
        [recoveredAmountCents, case_.id]
      );

      if (result.rows.length > 0) {
        logger.info('Case marked as recovered by membership with time validation', {
          caseId: result.rows[0].id,
          membershipId: result.rows[0].membership_id,
          recoveredAmountCents: result.rows[0].recovered_amount_cents,
          timeDiffDays
        });
        return true;
      }
    } else {
      // Fallback to original logic if no successTime provided
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

      const result = await sql.execute(
        `UPDATE recovery_cases
         SET status = 'recovered',
             recovered_amount_cents = $1
         WHERE membership_id = $2
           AND status = 'open'
           AND first_failure_at >= $3
         RETURNING id, membership_id, status, recovered_amount_cents`,
        [recoveredAmountCents, membershipId, cutoffDate]
      );

      if (result.rows.length > 0) {
        logger.info('Case marked as recovered by membership (fallback)', {
          caseId: result.rows[0].id,
          membershipId: result.rows[0].membership_id,
          recoveredAmountCents: result.rows[0].recovered_amount_cents,
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
  attributionWindowDays: number = env.KPI_ATTRIBUTION_WINDOW_DAYS
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
  settings: { enable_push: boolean; enable_dm: boolean; incentive_days: number }
): Promise<{ pushSent: boolean; dmSent: boolean; incentiveApplied: boolean }> {
  const result = {
    pushSent: false,
    dmSent: false,
    incentiveApplied: false
  };

  try {
    logger.info('Sending T+0 recovery nudge', {
      caseId: case_.id,
      membershipId: case_.membership_id,
      companyId: case_.company_id,
      settings
    });

    // Get manage URL with structured error handling
    const urlResult = await getMembershipManageUrlResult(case_.membership_id);
    if (!urlResult.success) {
      logger.warn('No manage URL available for T+0 nudge', {
        caseId: case_.id,
        membershipId: case_.membership_id,
        error: urlResult.error
      });
      return result;
    }
    const manageUrl = urlResult.url!;

    // Send push notification
    if (settings.enable_push) {
      const pushResult = await sendRecoveryNudgePush(
        case_.user_id,
        case_.membership_id,
        manageUrl,
        1, // attemptNumber = 1 for T+0
        case_.id, // caseId for audit
        case_.company_id // companyId for audit
      );
      result.pushSent = pushResult.success;
      if (pushResult.success) {
        logger.info('T+0 push nudge sent', {
          caseId: case_.id,
          messageId: pushResult.messageId
        });
      } else {
        logger.warn('T+0 push nudge failed', {
          caseId: case_.id,
          error: pushResult.error
        });
      }
    }

    // Send direct message
    if (settings.enable_dm) {
      const dmResult = await sendRecoveryNudgeDM(
        case_.user_id,
        case_.membership_id,
        manageUrl,
        1, // attemptNumber = 1 for T+0
        case_.id, // caseId for audit
        case_.company_id // companyId for audit
      );
      result.dmSent = dmResult.success;
      if (dmResult.success) {
        logger.info('T+0 DM nudge sent', {
          caseId: case_.id,
          messageId: dmResult.messageId
        });
      } else {
        logger.warn('T+0 DM nudge failed', {
          caseId: case_.id,
          error: dmResult.error
        });
      }
    }

    // Apply incentive if configured and not already applied
    if (settings.incentive_days > 0 && case_.incentive_days === 0) {
      const incentiveResult = await applyRecoveryIncentive(
        case_.membership_id,
        case_.id,
        case_.company_id
      );
      result.incentiveApplied = incentiveResult.success;
      if (incentiveResult.success) {
        logger.info('T+0 incentive applied', {
          caseId: case_.id,
          daysAdded: incentiveResult.daysAdded
        });
        // Log incentive application
        await logRecoveryAction(case_.company_id, case_.id, case_.membership_id, case_.user_id, 'incentive_applied', undefined, {
          daysAdded: incentiveResult.daysAdded,
          attemptNumber: 1
        });
      } else {
        logger.warn('T+0 incentive failed', {
          caseId: case_.id,
          error: incentiveResult.error
        });
      }
    }

    // Record attempt 1 and last_nudge_at
    await recordReminderAttempt(case_.id, 1, case_.company_id);

    logger.info('T+0 recovery nudge completed', {
      caseId: case_.id,
      pushSent: result.pushSent,
      dmSent: result.dmSent,
      incentiveApplied: result.incentiveApplied
    });

    return result;

  } catch (error) {
    logger.error('T+0 recovery nudge failed', {
      caseId: case_.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return result;
  }
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

    // Send nudge notifications
    const newAttemptNumber = case_.attempts + 1;
    let pushResult: any = null;
    let dmResult: any = null;
    let pushSent = false;
    let dmSent = false;

    if (settings.enable_push) {
      pushResult = await sendRecoveryNudgePush(case_.user_id, case_.membership_id, manageUrl, newAttemptNumber, caseId, companyId);
      pushSent = pushResult.success;
    }

    if (settings.enable_dm) {
      dmResult = await sendRecoveryNudgeDM(case_.user_id, case_.membership_id, manageUrl, newAttemptNumber, caseId, companyId);
      dmSent = dmResult.success;
    }

    if (pushSent || dmSent) {
      // Update attempts and last_nudge_at
      await sql.execute(
        `UPDATE recovery_cases
         SET attempts = attempts + 1,
             last_nudge_at = NOW()
         WHERE id = $1`,
        [caseId]
      );

      // Log manual nudge attempts to recovery_actions
      const logActorType = actorType;
      const logActorId = actorId;

      if (pushSent) {
        await logRecoveryAction(companyId, caseId, case_.membership_id, case_.user_id, 'nudge_push', 'push', {
          attemptNumber: newAttemptNumber,
          manual: true,
          actorType,
          actorId,
          messageId: pushResult.messageId
        });
      }

      if (dmSent) {
        await logRecoveryAction(companyId, caseId, case_.membership_id, case_.user_id, 'nudge_dm', 'dm', {
          attemptNumber: newAttemptNumber,
          manual: true,
          actorType,
          actorId,
          messageId: dmResult.messageId
        });
      }

      logger.info('Manual nudge sent successfully', {
        caseId,
        membershipId: case_.membership_id,
        pushSent,
        dmSent,
        newAttempts: newAttemptNumber,
        loggedActions: (pushSent ? 1 : 0) + (dmSent ? 1 : 0)
      });
      return true;
    } else {
      logger.warn('Failed to send nudge notifications', { caseId, membershipId: case_.membership_id });
      return false;
    }
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
