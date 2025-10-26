import { logger } from '@/lib/logger';
import { applyRecoveryIncentive } from '@/server/services/incentives';
import { sendRecoveryNudgeDM } from '@/server/services/dm';
import { sendRecoveryNudgePush } from '@/server/services/push';
import { getMembershipManageUrlResult } from '@/server/services/memberships';
import type { RecoveryCase } from '@/server/services/cases';

// Shared reminder settings structure reused by callers to avoid bespoke booleans everywhere.
export interface ReminderChannelSettings {
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
}

// Narrowed case payload keeps the helper agnostic of the full RecoveryCase shape while
// still providing everything required for notifications and incentives.
export type ReminderCaseSnapshot = Pick<
  RecoveryCase,
  'id' | 'company_id' | 'membership_id' | 'user_id' | 'incentive_days'
>;

export interface ReminderDispatchRequest {
  readonly attemptNumber: number;
  readonly caseSnapshot: ReminderCaseSnapshot;
  readonly settings: ReminderChannelSettings;
  readonly trigger: 'immediate' | 'scheduled' | 'manual';
  readonly manageUrl?: string;
  readonly allowIncentive?: boolean;
  readonly onChannelSuccess?: (
    channel: 'push' | 'dm',
    metadata: { messageId?: string }
  ) => Promise<void> | void;
  readonly onIncentiveApplied?: (daysAdded: number) => Promise<void> | void;
}

export interface ReminderDispatchResult {
  readonly pushSent: boolean;
  readonly dmSent: boolean;
  readonly incentiveApplied: boolean;
  readonly manageUrl?: string;
  readonly error?: string;
}

// Centralised reminder orchestration ensures consistent logging, retry semantics,
// and incentive handling across T+0, scheduled, and manual reminder flows.
export async function dispatchReminder(
  request: ReminderDispatchRequest
): Promise<ReminderDispatchResult> {
  const { caseSnapshot, attemptNumber, settings, trigger } = request;

  const ensureManageUrl = async (): Promise<string | undefined> => {
    if (request.manageUrl) {
      return request.manageUrl;
    }

    const manageUrlResult = await getMembershipManageUrlResult(caseSnapshot.membership_id);

    if (!manageUrlResult.success || !manageUrlResult.url) {
      logger.warn('Reminder skipped - no manage URL available', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        error: manageUrlResult.error,
      });

      return undefined;
    }

    return manageUrlResult.url;
  };

  const manageUrl = await ensureManageUrl();

  if (!manageUrl) {
    return {
      pushSent: false,
      dmSent: false,
      incentiveApplied: false,
      error: 'MANAGE_URL_UNAVAILABLE',
    };
  }

  let pushSent = false;
  let dmSent = false;
  let incentiveApplied = false;

  if (settings.enable_push) {
    const pushResult = await sendRecoveryNudgePush(
      caseSnapshot.user_id,
      caseSnapshot.membership_id,
      manageUrl,
      attemptNumber,
      caseSnapshot.id,
      caseSnapshot.company_id
    );

    pushSent = pushResult.success;

    if (pushResult.success) {
      logger.info('Reminder push notification sent', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        attemptNumber,
        messageId: pushResult.messageId,
      });

      await request.onChannelSuccess?.('push', { messageId: pushResult.messageId });
    } else {
      logger.warn('Reminder push notification failed', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        attemptNumber,
        error: pushResult.error,
      });
    }
  }

  if (settings.enable_dm) {
    const dmResult = await sendRecoveryNudgeDM(
      caseSnapshot.user_id,
      caseSnapshot.membership_id,
      manageUrl,
      attemptNumber,
      caseSnapshot.id,
      caseSnapshot.company_id
    );

    dmSent = dmResult.success;

    if (dmResult.success) {
      logger.info('Reminder direct message sent', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        attemptNumber,
        messageId: dmResult.messageId,
      });

      await request.onChannelSuccess?.('dm', { messageId: dmResult.messageId });
    } else {
      logger.warn('Reminder direct message failed', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        attemptNumber,
        error: dmResult.error,
      });
    }
  }

  const shouldAttemptIncentive =
    request.allowIncentive !== false &&
    settings.incentive_days > 0 &&
    caseSnapshot.incentive_days === 0 &&
    attemptNumber === 1;

  if (shouldAttemptIncentive) {
    const incentiveResult = await applyRecoveryIncentive(
      caseSnapshot.membership_id,
      caseSnapshot.id,
      caseSnapshot.company_id
    );

    if (incentiveResult.success) {
      incentiveApplied = true;

      logger.info('Reminder incentive applied', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        attemptNumber,
        daysAdded: incentiveResult.daysAdded,
      });

      if (incentiveResult.daysAdded) {
        await request.onIncentiveApplied?.(incentiveResult.daysAdded);
      }
    } else {
      logger.warn('Reminder incentive application failed', {
        caseId: caseSnapshot.id,
        membershipId: caseSnapshot.membership_id,
        trigger,
        attemptNumber,
        error: incentiveResult.error,
      });
    }
  }

  return {
    pushSent,
    dmSent,
    incentiveApplied,
    manageUrl,
  };
}