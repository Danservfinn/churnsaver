// Push notification service
// Handles sending push notifications for recovery nudges

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { sendWhopPushNotification, PushNotificationPayload as WhopPushPayload } from './notifications/whop';
import { logRecoveryAction } from './cases';

// Structured error codes for push notifications
export enum PushErrorCode {
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  RATE_LIMITED = 'RATE_LIMITED',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Metric counters for observability
class PushMetrics {
  private counters = new Map<string, number>();
  private lastReset = Date.now();

  increment(key: string, value: number = 1): void {
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  get(key: string): number {
    return this.counters.get(key) || 0;
  }

  getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.counters) {
      result[key] = value;
    }
    return result;
  }

  reset(): void {
    this.counters.clear();
    this.lastReset = Date.now();
  }

  getLastReset(): Date {
    return new Date(this.lastReset);
  }
}

const pushMetrics = new PushMetrics();

export interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>; // Additional data for deep linking
  membershipId?: string; // For tracking/analytics
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: PushErrorCode;
  sampled?: boolean; // Flag indicating if this failure was sampled for detailed logging
}

// Mock push service for local development
// In production, this would integrate with:
// - Firebase Cloud Messaging (FCM)
// - Apple Push Notification Service (APNS)
// - Web Push API
// - Whop's internal push system

class MockPushService {
  private sentNotifications: PushNotificationPayload[] = [];

  async sendNotification(payload: PushNotificationPayload): Promise<PushResult> {
    const startTime = Date.now();
    const sampled = Math.random() < 0.1; // 10% sampling for detailed failure logging

    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Simulate occasional failures for testing
      if (Math.random() < 0.05) { // 5% failure rate
        throw new Error('Simulated push service failure');
      }

      // Store for testing/debugging
      this.sentNotifications.push(payload);

      const messageId = `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Increment success metrics
      pushMetrics.increment('mock_success_total');
      pushMetrics.increment('mock_success_duration', Date.now() - startTime);

      logger.info('Push notification sent (mock)', {
        userId: payload.userId,
        messageId,
        membershipId: payload.membershipId,
        duration_ms: Date.now() - startTime,
      });

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = this.classifyError(errorMessage);

      // Increment failure metrics
      pushMetrics.increment('mock_failure_total');
      pushMetrics.increment(`mock_failure_${errorCode}`);
      pushMetrics.increment('mock_failure_duration', Date.now() - startTime);

      const logData = {
        userId: payload.userId,
        error: errorMessage,
        errorCode,
        membershipId: payload.membershipId,
        duration_ms: Date.now() - startTime,
        sampled,
      };

      if (sampled) {
        logger.error('Push notification failed (mock) - sampled', logData);
      } else {
        logger.warn('Push notification failed (mock)', logData);
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
        sampled,
      };
    }
  }

  private classifyError(errorMessage: string): PushErrorCode {
    if (errorMessage.includes('timeout')) return PushErrorCode.TIMEOUT;
    if (errorMessage.includes('network')) return PushErrorCode.NETWORK_ERROR;
    if (errorMessage.includes('auth')) return PushErrorCode.AUTHENTICATION_FAILED;
    if (errorMessage.includes('rate')) return PushErrorCode.RATE_LIMITED;
    if (errorMessage.includes('invalid')) return PushErrorCode.INVALID_PAYLOAD;
    if (errorMessage.includes('unavailable')) return PushErrorCode.PROVIDER_UNAVAILABLE;
    return PushErrorCode.UNKNOWN_ERROR;
  }

  // For testing/debugging
  getSentNotifications(): PushNotificationPayload[] {
    return [...this.sentNotifications];
  }

  clearSentNotifications(): void {
    this.sentNotifications = [];
  }
}

// Firebase Cloud Messaging implementation (for production)
// Uncomment and configure when FCM credentials are available
/*
class FirebasePushService {
  async sendNotification(payload: PushNotificationPayload): Promise<PushResult> {
    // Firebase FCM implementation would go here
    // Requires FCM server key and device tokens
    throw new Error('Firebase FCM not implemented');
  }
}
*/

const pushService = new MockPushService();

// Main push notification function with retry logic and provider routing
export async function sendPushNotification(
  payload: PushNotificationPayload,
  maxRetries: number = 3
): Promise<PushResult> {
  if (!env.ENABLE_PUSH) {
    logger.info('Push notifications disabled', { userId: payload.userId });
    return { success: true, messageId: 'disabled' };
  }

  // Route to Whop provider in production, fallback to mock for local development
  if (process.env.NODE_ENV === 'production' || process.env.AGENT_FORCE_WHOP_PROVIDERS) {
    return await sendWhopPushNotification(payload, maxRetries);
  } else {
    // Local development fallback to mock service
    let lastResult: PushResult | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await pushService.sendNotification(payload);
        lastResult = result;

        if (result.success) {
          // Log successful push notification with metrics
          logger.reminder('sent', {
            caseId: payload.data?.caseId,
            membershipId: payload.membershipId || 'unknown',
            companyId: payload.data?.companyId,
            channel: 'push',
            attemptNumber: attempt,
            success: true,
            messageId: result.messageId
          });

          logger.info('Push notification sent successfully (mock)', {
            userId: payload.userId,
            messageId: result.messageId,
            attempt,
          });
          return result;
        } else {
          // Log failed push notification with error
          logger.reminder('failed', {
            caseId: payload.data?.caseId,
            membershipId: payload.membershipId || 'unknown',
            companyId: payload.data?.companyId,
            channel: 'push',
            attemptNumber: attempt,
            success: false,
            error: result.error,
            error_category: 'provider_failure'
          });
        }

        // If failed and we have retries left, wait before retrying
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          logger.warn('Push notification failed, retrying (mock)', {
            userId: payload.userId,
            attempt,
            maxRetries,
            delay,
            error: result.error,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        lastResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };

        logger.error('Push notification error (mock)', {
          userId: payload.userId,
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // All retries exhausted
    logger.error('Push notification failed after all retries (mock)', {
      userId: payload.userId,
      maxRetries,
      finalError: lastResult?.error,
    });

    return lastResult || { success: false, error: 'All retries exhausted' };
  }
}

// Helper to create recovery nudge push notifications
export async function sendRecoveryNudgePush(
  userId: string,
  membershipId: string,
  manageUrl: string,
  attemptNumber: number,
  caseId?: string,
  companyId?: string
): Promise<PushResult> {
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

// For testing/debugging
export function getMockService(): MockPushService {
  return pushService;
}

// Export metrics for observability
export function getPushMetrics(): Record<string, number> {
  return pushMetrics.getAll();
}

export function resetPushMetrics(): void {
  pushMetrics.reset();
}

export function getPushMetricsLastReset(): Date {
  return pushMetrics.getLastReset();
}

