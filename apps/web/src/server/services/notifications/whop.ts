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
  senderUserId?: string | null; // Optional - merchant's Whop user ID to send notification as
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
  senderUserId?: string | null; // Optional - merchant's Whop user ID to send message as
}

export interface DMResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a push notification via Whop's native API
 * Reference: https://docs.whop.com/api-reference/notifications/create-notification
 * Endpoint: POST /api/v1/notifications
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

  // Get company ID from payload data or environment
  const companyId = payload.data?.companyId as string | undefined;
  if (!companyId) {
    const error = 'No companyId provided in payload data';
    logger.error('Cannot send push notification', { error });
    return { success: false, error };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Build the notification payload per Whop API spec
      // https://docs.whop.com/api-reference/notifications/create-notification
      const apiPayload: Record<string, unknown> = {
        company_id: companyId,
        title: payload.title,
        content: payload.body,
        user_ids: [targetUserId], // Target specific user
      };

      // Add icon_user_id if senderUserId provided (shows sender's profile pic)
      if (payload.senderUserId) {
        apiPayload.icon_user_id = payload.senderUserId;
      }

      // Correct endpoint: POST /notifications (whopApiRequest prepends /api/v1)
      const response = await whopApiRequest('/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiPayload),
      });

      // Whop returns { success: true } on successful queue
      if (response?.success) {
        logger.info('Whop push notification sent successfully', {
          userId: targetUserId,
          companyId,
          membershipId: payload.membershipId,
          attempt,
        });

        return {
          success: true,
          messageId: `notif_${Date.now()}`, // Generate a reference ID since API doesn't return one
        };
      } else {
        throw new Error(response?.error || 'Notification not queued');
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn('Whop push notification attempt failed', {
        userId: targetUserId,
        companyId,
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
 * Reference: https://docs.whop.com/api-reference/support-channels/create-support-channel
 *            https://docs.whop.com/api-reference/messages/create-message
 *
 * Flow: 1) Create/get support channel for user  2) Send message to channel
 */
export async function sendWhopDirectMessage(
  payload: DirectMessagePayload & { companyId?: string },
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

  // Company ID is required for creating support channels
  const companyId = payload.companyId;
  if (!companyId) {
    const error = 'No companyId provided - required for DMs';
    logger.error('Cannot send direct message', { error });
    return { success: false, error };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Step 1: Create or get existing support channel for this user
      const channelResponse = await whopApiRequest('/support_channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: companyId,
          user_id: targetUserId,
        }),
      });

      const channelId = channelResponse?.id;
      if (!channelId) {
        throw new Error('Failed to create/get support channel');
      }

      logger.info('Support channel ready for DM', {
        channelId,
        userId: targetUserId,
        companyId,
      });

      // Step 2: Send message to the support channel
      const messageResponse = await whopApiRequest('/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel_id: channelId,
          content: payload.message,
        }),
      });

      // Check for success (message created)
      if (messageResponse?.id) {
        logger.info('Whop direct message sent successfully', {
          userId: targetUserId,
          channelId,
          messageId: messageResponse.id,
          membershipId: payload.membershipId,
          messageLength: payload.message.length,
          attempt,
        });

        return {
          success: true,
          messageId: messageResponse.id,
        };
      } else {
        throw new Error('No message id in response');
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger.warn('Whop direct message attempt failed', {
        userId: targetUserId,
        companyId,
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
