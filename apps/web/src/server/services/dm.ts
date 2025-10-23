// Direct Message service
// Handles sending direct messages for recovery nudges

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { sendWhopDirectMessage, DirectMessagePayload as WhopDMPayload } from './notifications/whop';
import { logRecoveryAction } from './cases';

// Structured error codes for direct messages
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

// Metric counters for observability
class DMMetrics {
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

const dmMetrics = new DMMetrics();

export interface DirectMessagePayload {
  userId: string;
  message: string;
  membershipId?: string; // For tracking/analytics
}

export interface DMResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: DMErrorCode;
  sampled?: boolean; // Flag indicating if this failure was sampled for detailed logging
}

// Mock DM service for local development
// In production, this would integrate with:
// - Discord API (for Whop Discord bots)
// - WhatsApp Business API
// - Telegram Bot API
// - Email service (as fallback)

class MockDMService {
  private sentMessages: DirectMessagePayload[] = [];

  async sendMessage(payload: DirectMessagePayload): Promise<DMResult> {
    const startTime = Date.now();
    const sampled = Math.random() < 0.1; // 10% sampling for detailed failure logging

    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 150));

      // Simulate occasional failures for testing
      if (Math.random() < 0.03) { // 3% failure rate
        throw new Error('Simulated DM service failure');
      }

      // Store for testing/debugging
      this.sentMessages.push(payload);

      const messageId = `dm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Increment success metrics
      dmMetrics.increment('mock_success_total');
      dmMetrics.increment('mock_success_duration', Date.now() - startTime);

      logger.info('Direct message sent (mock)', {
        userId: payload.userId,
        messageId,
        membershipId: payload.membershipId,
        messageLength: payload.message.length,
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
      dmMetrics.increment('mock_failure_total');
      dmMetrics.increment(`mock_failure_${errorCode}`);
      dmMetrics.increment('mock_failure_duration', Date.now() - startTime);

      const logData = {
        userId: payload.userId,
        error: errorMessage,
        errorCode,
        membershipId: payload.membershipId,
        messageLength: payload.message.length,
        duration_ms: Date.now() - startTime,
        sampled,
      };

      if (sampled) {
        logger.error('Direct message failed (mock) - sampled', logData);
      } else {
        logger.warn('Direct message failed (mock)', logData);
      }

      return {
        success: false,
        error: errorMessage,
        errorCode,
        sampled,
      };
    }
  }

  private classifyError(errorMessage: string): DMErrorCode {
    if (errorMessage.includes('timeout')) return DMErrorCode.TIMEOUT;
    if (errorMessage.includes('network')) return DMErrorCode.NETWORK_ERROR;
    if (errorMessage.includes('auth')) return DMErrorCode.AUTHENTICATION_FAILED;
    if (errorMessage.includes('rate')) return DMErrorCode.RATE_LIMITED;
    if (errorMessage.includes('channel')) return DMErrorCode.CHANNEL_NOT_FOUND;
    if (errorMessage.includes('user')) return DMErrorCode.USER_NOT_FOUND;
    if (errorMessage.includes('invalid')) return DMErrorCode.INVALID_PAYLOAD;
    if (errorMessage.includes('unavailable')) return DMErrorCode.PROVIDER_UNAVAILABLE;
    return DMErrorCode.UNKNOWN_ERROR;
  }

  // For testing/debugging
  getSentMessages(): DirectMessagePayload[] {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

// Discord Bot implementation (for Whop Discord integration)
// Uncomment and configure when Discord bot token is available
/*
class DiscordDMService {
  async sendMessage(payload: DirectMessagePayload): Promise<DMResult> {
    // Discord API implementation would go here
    // Requires Discord bot token and user DM channel ID
    throw new Error('Discord DM not implemented');
  }
}
*/

const dmService = new MockDMService();

// Main DM function with retry logic and provider routing
export async function sendDirectMessage(
  payload: DirectMessagePayload,
  maxRetries: number = 2
): Promise<DMResult> {
  if (!env.ENABLE_DM) {
    logger.info('Direct messages disabled', { userId: payload.userId });
    return { success: true, messageId: 'disabled' };
  }

  // Route to Whop provider in production, fallback to mock for local development
  if (process.env.NODE_ENV === 'production' || process.env.AGENT_FORCE_WHOP_PROVIDERS) {
    return await sendWhopDirectMessage(payload, maxRetries);
  } else {
    // Local development fallback to mock service
    let lastResult: DMResult | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await dmService.sendMessage(payload);
        lastResult = result;

        if (result.success) {
          // Log successful DM with metrics
          logger.reminder('sent', {
            caseId: 'unknown', // For new DM service calls, case ID might not be available yet
            membershipId: payload.membershipId || 'unknown',
            companyId: undefined, // Will be added when calling sendRecoveryNudgeDM
            channel: 'dm',
            attemptNumber: attempt,
            success: true,
            messageId: result.messageId
          });

          logger.info('Direct message sent successfully (mock)', {
            userId: payload.userId,
            messageId: result.messageId,
            attempt,
          });
          return result;
        } else {
          // Log failed DM notification with error
          logger.reminder('failed', {
            caseId: 'unknown',
            membershipId: payload.membershipId || 'unknown',
            companyId: undefined,
            channel: 'dm',
            attemptNumber: attempt,
            success: false,
            error: result.error,
            error_category: 'provider_failure'
          });
        }

        // If failed and we have retries left, wait before retrying
        if (attempt < maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
          logger.warn('Direct message failed, retrying (mock)', {
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

        logger.error('Direct message error (mock)', {
          userId: payload.userId,
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // All retries exhausted
    logger.error('Direct message failed after all retries (mock)', {
      userId: payload.userId,
      maxRetries,
      finalError: lastResult?.error,
    });

    return lastResult || { success: false, error: 'All retries exhausted' };
  }
}

// Helper to create recovery nudge DMs with proper formatting
export async function sendRecoveryNudgeDM(
  userId: string,
  membershipId: string,
  manageUrl: string,
  attemptNumber: number,
  caseId?: string,
  companyId?: string
): Promise<DMResult> {
  const message = createRecoveryNudgeMessage(manageUrl, attemptNumber);

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
      manageUrl
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

// For testing/debugging
export function getMockService(): MockDMService {
  return dmService;
}

// Export metrics for observability
export function getDMMetrics(): Record<string, number> {
  return dmMetrics.getAll();
}

export function resetDMMetrics(): void {
  dmMetrics.reset();
}

export function getDMMetricsLastReset(): Date {
  return dmMetrics.getLastReset();
}

