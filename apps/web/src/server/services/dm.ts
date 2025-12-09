// Direct Message service
// Handles sending direct messages for recovery nudges

import { logger } from '@/lib/logger';
import { notificationDispatcher, DirectMessagePayload, NotificationResult } from './shared/notificationDispatcher';
import { logRecoveryAction } from './cases';
import { createRecoveryLink } from './recoveryLinks';

// Re-export types for backward compatibility
export type { DirectMessagePayload, NotificationResult };

// Structured error codes for direct messages (kept for backward compatibility)
export enum DMErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Main DM function using shared dispatcher
export async function sendDirectMessage(
  payload: DirectMessagePayload,
  maxRetries: number = 2
): Promise<NotificationResult> {
  return await notificationDispatcher.sendDM(payload);
}

// Helper to create recovery nudge DMs with proper formatting
export async function sendRecoveryNudgeDM(
  userId: string,
  membershipId: string,
  manageUrl: string,
  attemptNumber: number,
  caseId?: string,
  companyId?: string
): Promise<NotificationResult> {
  let trackedUrl = manageUrl;

  if (caseId && companyId) {
    try {
      const link = await createRecoveryLink({
        caseId,
        companyId,
        membershipId,
        userId,
        channel: 'dm',
        whopManageUrl: manageUrl,
      });
      trackedUrl = link.trackingUrl;
    } catch (error) {
      logger.warn('Failed to create tracked DM recovery link, falling back to raw URL', {
        error: error instanceof Error ? error.message : String(error),
        caseId,
        membershipId,
      });
    }
  }

  const message = createRecoveryNudgeMessage(trackedUrl, attemptNumber);

  const result = await sendDirectMessage({
    userId,
    membershipId,
    message,
  });

  // Log successful nudge for audit trail
  if (result.success && companyId && caseId) {
    await logRecoveryAction(companyId, caseId, membershipId, userId, 'nudge_dm', 'dm', {
      attemptNumber,
      messageId: result.messageId,
      manageUrl: trackedUrl
    });
  }

  return result;
}

// Create formatted recovery nudge message
function createRecoveryNudgeMessage(
  manageUrl: string,
  attemptNumber: number
): string {
  const baseMessage = attemptNumber === 1
    ? `⚠️ **Payment Failed**

Hi! Your recent payment didn't process. Update your payment method now to keep your subscription active:

🔗 **Update Payment:** ${manageUrl}

No interruption yet, but let's fix this quickly!`
    : `⏰ **Payment Still Pending**

Your payment method needs to be updated to avoid subscription interruption.

🔗 **Update Payment:** ${manageUrl}

This is reminder #${attemptNumber}. Your access continues until we resolve this!`;

  return baseMessage;
}

// Export metrics for observability (now using shared dispatcher)
export function getDMMetrics() {
  return notificationDispatcher.getDMMetrics();
}

export function resetDMMetrics(): void {
  notificationDispatcher.resetMetrics();
}

// Legacy exports for backward compatibility
export function getDMMetricsLastReset(): Date {
  return notificationDispatcher.getDMMetrics().lastReset;
}





