// Shared ReminderNotifier utility for consolidating notification logic
// Reduces duplication between sendImmediateRecoveryNudge and nudgeCaseAgain

import { logger } from '@/lib/logger';
import { dispatchReminder, ReminderChannelSettings } from '../reminders/notifier';
import { logRecoveryAction } from '../cases';
import type { RecoveryCase } from '../cases';

export type ReminderCaseSnapshot = Pick<
  RecoveryCase,
  'id' | 'company_id' | 'membership_id' | 'user_id' | 'incentive_days'
>;

export interface ReminderNotificationRequest {
  caseSnapshot: ReminderCaseSnapshot;
  settings: ReminderChannelSettings;
  attemptNumber: number;
  trigger: 'immediate' | 'scheduled' | 'manual';
  manageUrl?: string;
  allowIncentive?: boolean;
  recordAttempt?: boolean; // Whether to record the attempt in the database
}

export interface ReminderNotificationResult {
  pushSent: boolean;
  dmSent: boolean;
  incentiveApplied: boolean;
  manageUrl?: string;
  error?: string;
}

export class ReminderNotifier {
  /**
   * Send a reminder notification with common logic for logging, attempt recording, and error handling
   */
  static async sendReminder(
    request: ReminderNotificationRequest
  ): Promise<ReminderNotificationResult> {
    const { caseSnapshot, settings, attemptNumber, trigger, allowIncentive = true } = request;

    try {
      logger.info(`Sending ${trigger} recovery reminder`, {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        companyId: caseSnapshot.company_id,
        attemptNumber,
        settings,
      });

      // Use the shared dispatcher for consistent channel handling, incentives, and logging
      const dispatchResult = await dispatchReminder({
        attemptNumber,
        caseSnapshot,
        settings,
        trigger,
        manageUrl: request.manageUrl,
        allowIncentive,
        onChannelSuccess: async (channel, metadata) => {
          // Log channel-specific success for audit trail
          await logRecoveryAction(
            caseSnapshot.company_id,
            caseSnapshot.id,
            caseSnapshot.membership_id,
            caseSnapshot.user_id,
            `nudge_${channel}`,
            channel,
            {
              attemptNumber,
              trigger,
              messageId: metadata.messageId,
            }
          );
        },
        onIncentiveApplied: async (daysAdded) => {
          // Log incentive application for audit trail
          await logRecoveryAction(
            caseSnapshot.company_id,
            caseSnapshot.id,
            caseSnapshot.membership_id,
            caseSnapshot.user_id,
            'incentive_applied',
            undefined,
            {
              daysAdded,
              attemptNumber,
              trigger,
            }
          );
        },
      });

      if (dispatchResult.error === 'MANAGE_URL_UNAVAILABLE') {
        return {
          pushSent: dispatchResult.pushSent,
          dmSent: dispatchResult.dmSent,
          incentiveApplied: dispatchResult.incentiveApplied,
          manageUrl: dispatchResult.manageUrl,
          error: dispatchResult.error,
        };
      }

      logger.info(`${trigger} recovery reminder completed`, {
        caseId: caseSnapshot.id,
        pushSent: dispatchResult.pushSent,
        dmSent: dispatchResult.dmSent,
        incentiveApplied: dispatchResult.incentiveApplied,
        attemptNumber,
      });

      return {
        pushSent: dispatchResult.pushSent,
        dmSent: dispatchResult.dmSent,
        incentiveApplied: dispatchResult.incentiveApplied,
        manageUrl: dispatchResult.manageUrl,
      };
    } catch (error) {
      logger.error(`${trigger} recovery reminder failed`, {
        caseId: caseSnapshot.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        pushSent: false,
        dmSent: false,
        incentiveApplied: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}