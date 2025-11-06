// Push notification service
// Handles sending push notifications for recovery nudges

import { logger } from '@/lib/logger';
import { notificationDispatcher, PushNotificationPayload, NotificationResult } from './shared/notificationDispatcher';
import { logRecoveryAction } from './cases';

// Re-export types for backward compatibility
export type { PushNotificationPayload, NotificationResult };

// Structured error codes for push notifications (kept for backward compatibility)
export enum PushErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Main push notification function using shared dispatcher
export async function sendPushNotification(
  payload: PushNotificationPayload,
  maxRetries: number = 3
): Promise<NotificationResult> {
  return await notificationDispatcher.sendPush(payload);
}

// Helper to create recovery nudge push notifications
export async function sendRecoveryNudgePush(
  userId: string,
  membershipId: string,
  manageUrl: string,
  attemptNumber: number,
  caseId?: string,
  companyId?: string
): Promise<NotificationResult> {
  const title = attemptNumber === 1
    ? "Payment Failed - Fix Now to Avoid Pause"
    : `Payment Failed - Action Required (${attemptNumber}x reminder)`;

  const body = attemptNumber === 1
    ? "Your payment didn't go through. Update details now to keep access ➡️"
    : "Subscription will pause soon. Update payment method to continue ➡️";

  const result = await sendPushNotification({
    userId,
    membershipId,
    title,
    body,
    data: {
      type: 'payment_recovery',
      manageUrl,
      membershipId,
      attemptNumber,
      caseId,
      companyId,
    },
  });

  // Log successful nudge for audit trail
  if (result.success && companyId && caseId) {
    await logRecoveryAction(companyId, caseId, membershipId, userId, 'nudge_push', 'push', {
      attemptNumber,
      messageId: result.messageId,
      manageUrl
    });
  }

  return result;
}

// Export metrics for observability (now using shared dispatcher)
export function getPushMetrics() {
  return notificationDispatcher.getPushMetrics();
}

export function resetPushMetrics(): void {
  notificationDispatcher.resetMetrics();
}

// Legacy exports for backward compatibility
export function getPushMetricsLastReset(): Date {
  return notificationDispatcher.getPushMetrics().lastReset;
}





