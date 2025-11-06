// Whop native Push and DM notification provider
// Implementation: https://docs.whop.com/dev-kit/notifications

import { whopApiRequest } from '@/server/services/memberships';
import { logger } from '@/lib/logger';
import { env, additionalEnv } from '@/lib/env';

export interface PushNotificationPayload {
  userId?: string; // Optional - will use default agent if not provided
  title: string;
  body: string;
  data?: Record<string, any>; // Additional data for deep linking
  membershipId?: string; // For tracking/analytics
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface DirectMessagePayload {
  userId?: string; // Optional - will use default agent if not provided
  message: string;
  membershipId?: string; // For tracking/analytics
}

export interface DMResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a push notification via Whop's native API
 * Reference: https://docs.whop.com/dev-kit/notifications
 */
export async function sendWhopPushNotification(
  payload: PushNotificationPayload,
  maxRetries: number = 3
): Promise<PushResult> {
  let lastError: string | undefined;

  // Use default agent user ID if no userId provided
  const targetUserId = payload.userId || (process.env.NEXT_PUBLIC_WHOP_AGENT_USER_ID as string | undefined);
  
  if (!targetUserId) {
    const error = 'No userId provided and no NEXT_PUBLIC_WHOP_AGENT_USER_ID configured';
    logger.error('Cannot send push notification', { error });
    return { success: false, error };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apiPayload = {
        user_id: targetUserId,
        title: payload.title,
        body: payload.body,
        data: {
          ...payload.data,
          membershipId: payload.membershipId,
          type: 'churn_recovery_nudge',
        },
      };

      const response = await whopApiRequest('/notifications/send_push_notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
      });

      // Whop returns message_id on success
      if (response?.message_id) {
        logger.info('Whop push notification sent successfully', {
          userId: targetUserId,
          messageId: response.message_id,
          membershipId: payload.membershipId,
          attempt,
        });

        return {
          success: true,
          messageId: response.message_id,
        };
      } else {
        throw new Error('No message_id in response');
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn('Whop push notification attempt failed', {
        userId: targetUserId,
        membershipId: payload.membershipId,
        attempt,
        maxRetries,
        error: lastError,
      });

      if (attempt < maxRetries) {
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error('Whop push notification failed after all retries', {
    userId: targetUserId,
    membershipId: payload.membershipId,
    maxRetries,
    finalError: lastError,
  });

  return {
    success: false,
    error: lastError,
  };
}

/**
 * Send a direct message via Whop's native API
 * Reference: https://docs.whop.com/dev-kit/messages
 */
export async function sendWhopDirectMessage(
  payload: DirectMessagePayload,
  maxRetries: number = 2
): Promise<DMResult> {
  let lastError: string | undefined;

  // Use default agent user ID if no userId provided
  const targetUserId = payload.userId || (process.env.NEXT_PUBLIC_WHOP_AGENT_USER_ID as string | undefined);
  
  if (!targetUserId) {
    const error = 'No userId provided and no NEXT_PUBLIC_WHOP_AGENT_USER_ID configured';
    logger.error('Cannot send direct message', { error });
    return { success: false, error };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apiPayload = {
        user_id: targetUserId,
        message: payload.message,
        metadata: {
          membershipId: payload.membershipId,
          type: 'churn_recovery_nudge',
        },
      };

      const response = await whopApiRequest('/messages/send_direct_message_to_user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
      });

      // Whop returns message_id on success
      if (response?.message_id) {
        logger.info('Whop direct message sent successfully', {
          userId: targetUserId,
          messageId: response.message_id,
          membershipId: payload.membershipId,
          messageLength: payload.message.length,
          attempt,
        });

        return {
          success: true,
          messageId: response.message_id,
        };
      } else {
        throw new Error('No message_id in response');
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn('Whop direct message attempt failed', {
        userId: targetUserId,
        membershipId: payload.membershipId,
        attempt,
        maxRetries,
        error: lastError,
      });

      if (attempt < maxRetries) {
        // Exponential backoff for retries (DMs have longer delays)
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error('Whop direct message failed after all retries', {
    userId: targetUserId,
    membershipId: payload.membershipId,
    maxRetries,
    finalError: lastError,
  });

  return {
    success: false,
    error: lastError,
  };
}
