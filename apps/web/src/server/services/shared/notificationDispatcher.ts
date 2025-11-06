// Shared NotificationDispatcher with pluggable channel providers
// Consolidates push/DM delivery scaffolding with retry/backoff policy and metrics

import { env, additionalEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { NotificationMetrics, shouldSampleForDetailedLogging, classifyNotificationError } from './metrics';
import { sendWhopPushNotification, PushNotificationPayload as WhopPushPayload } from '../notifications/whop';
import { sendWhopDirectMessage, DirectMessagePayload as WhopDMPayload } from '../notifications/whop';

// Base notification payload interface
export interface BaseNotificationPayload {
  userId: string;
  membershipId?: string;
  caseId?: string;
  companyId?: string;
}

// Push-specific payload
export interface PushNotificationPayload extends BaseNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

// DM-specific payload
export interface DirectMessagePayload extends BaseNotificationPayload {
  message: string;
}

// Common result interface for all channels
export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  sampled?: boolean;
  duration?: number;
}

// Channel provider interface for dependency injection
export interface NotificationChannel<T extends BaseNotificationPayload> {
  send(payload: T, maxRetries?: number): Promise<NotificationResult>;
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

// Default retry configurations by channel type
const DEFAULT_RETRY_CONFIGS: Record<string, RetryConfig> = {
  push: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000
  },
  dm: {
    maxRetries: 2,
    baseDelay: 2000,
    maxDelay: 10000
  }
};

// Mock provider for local development
class MockNotificationProvider<T extends BaseNotificationPayload> implements NotificationChannel<T> {
  private sentNotifications: T[] = [];
  private channelName: string;
  private metrics: NotificationMetrics;
  private failureRate: number;

  constructor(channelName: string, metrics: NotificationMetrics, failureRate: number = 0.05) {
    this.channelName = channelName;
    this.metrics = metrics;
    this.failureRate = failureRate;
  }

  async send(payload: T, maxRetries: number = 3): Promise<NotificationResult> {
    const startTime = Date.now();
    const sampled = shouldSampleForDetailedLogging();

    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, this.channelName === 'push' ? 100 : 150));

      // Simulate occasional failures for testing
      if (Math.random() < this.failureRate) {
        throw new Error(`Simulated ${this.channelName} service failure`);
      }

      // Store for testing/debugging
      this.sentNotifications.push(payload);

      const messageId = `${this.channelName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Increment success metrics
      this.metrics.increment('mock_success_total');
      this.metrics.increment('mock_success_duration', Date.now() - startTime);

      this.metrics.logSuccess(`${this.channelName} notification sent (mock)`, {
        userId: payload.userId,
        messageId,
        membershipId: payload.membershipId,
        duration_ms: Date.now() - startTime,
      });

      return {
        success: true,
        messageId,
        duration: Date.now() - startTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = classifyNotificationError(errorMessage);

      // Increment failure metrics
      this.metrics.increment('mock_failure_total');
      this.metrics.increment(`mock_failure_${errorCode}`);
      this.metrics.increment('mock_failure_duration', Date.now() - startTime);

      this.metrics.logSampledFailure(
        `${this.channelName} notification`,
        errorMessage,
        sampled,
        {
          userId: payload.userId,
          errorCode,
          membershipId: payload.membershipId,
          duration_ms: Date.now() - startTime,
        }
      );

      return {
        success: false,
        error: errorMessage,
        errorCode,
        sampled,
        duration: Date.now() - startTime
      };
    }
  }

  // For testing/debugging
  getSentNotifications(): T[] {
    return [...this.sentNotifications];
  }

  clearSentNotifications(): void {
    this.sentNotifications = [];
  }
}

// Whop provider wrapper for push notifications
class WhopPushProvider implements NotificationChannel<PushNotificationPayload> {
  private metrics: NotificationMetrics;

  constructor(metrics: NotificationMetrics) {
    this.metrics = metrics;
  }

  async send(payload: PushNotificationPayload, maxRetries: number = 3): Promise<NotificationResult> {
    const startTime = Date.now();
    const sampled = shouldSampleForDetailedLogging();

    try {
      const whopPayload: WhopPushPayload = {
        userId: payload.userId,
        title: payload.title,
        body: payload.body,
        data: {
          ...payload.data,
          membershipId: payload.membershipId,
          caseId: payload.caseId,
          companyId: payload.companyId,
          type: 'churn_recovery_nudge',
        },
      };

      const result = await sendWhopPushNotification(whopPayload, maxRetries);
      const duration = Date.now() - startTime;

      if (result.success) {
        this.metrics.increment('whop_success_total');
        this.metrics.increment('whop_success_duration', duration);

        this.metrics.logSuccess('Whop push notification', {
          userId: payload.userId,
          messageId: result.messageId,
          membershipId: payload.membershipId,
          duration_ms: duration,
        });

        return {
          success: true,
          messageId: result.messageId,
          duration
        };
      } else {
        throw new Error(result.error || 'Unknown Whop push error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = classifyNotificationError(errorMessage);
      const duration = Date.now() - startTime;

      this.metrics.increment('whop_failure_total');
      this.metrics.increment(`whop_failure_${errorCode}`);
      this.metrics.increment('whop_failure_duration', duration);

      this.metrics.logSampledFailure(
        'Whop push notification',
        errorMessage,
        sampled,
        {
          userId: payload.userId,
          errorCode,
          membershipId: payload.membershipId,
          duration_ms: duration,
        }
      );

      return {
        success: false,
        error: errorMessage,
        errorCode,
        sampled,
        duration
      };
    }
  }
}

// Whop provider wrapper for direct messages
class WhopDMProvider implements NotificationChannel<DirectMessagePayload> {
  private metrics: NotificationMetrics;

  constructor(metrics: NotificationMetrics) {
    this.metrics = metrics;
  }

  async send(payload: DirectMessagePayload, maxRetries: number = 2): Promise<NotificationResult> {
    const startTime = Date.now();
    const sampled = shouldSampleForDetailedLogging();

    try {
      const whopPayload: WhopDMPayload = {
        userId: payload.userId,
        message: payload.message,
        membershipId: payload.membershipId,
      };

      const result = await sendWhopDirectMessage(whopPayload, maxRetries);
      const duration = Date.now() - startTime;

      if (result.success) {
        this.metrics.increment('whop_success_total');
        this.metrics.increment('whop_success_duration', duration);

        this.metrics.logSuccess('Whop direct message', {
          userId: payload.userId,
          messageId: result.messageId,
          membershipId: payload.membershipId,
          messageLength: payload.message.length,
          duration_ms: duration,
        });

        return {
          success: true,
          messageId: result.messageId,
          duration
        };
      } else {
        throw new Error(result.error || 'Unknown Whop DM error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = classifyNotificationError(errorMessage);
      const duration = Date.now() - startTime;

      this.metrics.increment('whop_failure_total');
      this.metrics.increment(`whop_failure_${errorCode}`);
      this.metrics.increment('whop_failure_duration', duration);

      this.metrics.logSampledFailure(
        'Whop direct message',
        errorMessage,
        sampled,
        {
          userId: payload.userId,
          errorCode,
          membershipId: payload.membershipId,
          messageLength: payload.message.length,
          duration_ms: duration,
        }
      );

      return {
        success: false,
        error: errorMessage,
        errorCode,
        sampled,
        duration
      };
    }
  }
}

// Main NotificationDispatcher class
export class NotificationDispatcher {
  private pushProvider: NotificationChannel<PushNotificationPayload>;
  private dmProvider: NotificationChannel<DirectMessagePayload>;
  private pushMetrics: NotificationMetrics;
  private dmMetrics: NotificationMetrics;

  constructor() {
    this.pushMetrics = new NotificationMetrics();
    this.dmMetrics = new NotificationMetrics();

    // Route to appropriate providers based on environment
    const useWhopProviders = process.env.NODE_ENV === 'production' || process.env.AGENT_FORCE_WHOP_PROVIDERS;

    if (useWhopProviders) {
      this.pushProvider = new WhopPushProvider(this.pushMetrics);
      this.dmProvider = new WhopDMProvider(this.dmMetrics);
    } else {
      // Local development fallback to mock services
      this.pushProvider = new MockNotificationProvider('push', this.pushMetrics, 0.05);
      this.dmProvider = new MockNotificationProvider('dm', this.dmMetrics, 0.03);
    }
  }

  // Send push notification with retry logic
  async sendPush(payload: PushNotificationPayload): Promise<NotificationResult> {
    if (!additionalEnv.ENABLE_PUSH) {
      logger.info('Push notifications disabled', { userId: payload.userId });
      return { success: true, messageId: 'disabled' };
    }

    const config = DEFAULT_RETRY_CONFIGS.push;
    return this.sendWithRetry(this.pushProvider, payload, config);
  }

  // Send direct message with retry logic
  async sendDM(payload: DirectMessagePayload): Promise<NotificationResult> {
    if (!additionalEnv.ENABLE_DM) {
      logger.info('Direct messages disabled', { userId: payload.userId });
      return { success: true, messageId: 'disabled' };
    }

    const config = DEFAULT_RETRY_CONFIGS.dm;
    return this.sendWithRetry(this.dmProvider, payload, config);
  }

  // Generic retry logic with exponential backoff
  private async sendWithRetry<T extends BaseNotificationPayload>(
    provider: NotificationChannel<T>,
    payload: T,
    config: RetryConfig
  ): Promise<NotificationResult> {
    let lastResult: NotificationResult | null = null;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await provider.send(payload, config.maxRetries);
        lastResult = result;

        if (result.success) {
          return result;
        }

        // If failed and we have retries left, wait before retrying
        if (attempt < config.maxRetries) {
          const delay = Math.min(
            config.baseDelay * Math.pow(2, attempt - 1),
            config.maxDelay
          );

          logger.warn('Notification failed, retrying', {
            userId: payload.userId,
            attempt,
            maxRetries: config.maxRetries,
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

        logger.error('Notification error', {
          userId: payload.userId,
          attempt,
          maxRetries: config.maxRetries,
          error: lastResult.error,
        });
      }
    }

    // All retries exhausted
    logger.error('Notification failed after all retries', {
      userId: payload.userId,
      maxRetries: config.maxRetries,
      finalError: lastResult?.error,
    });

    return lastResult || { success: false, error: 'All retries exhausted' };
  }

  // Get metrics for observability
  getPushMetrics() {
    return this.pushMetrics.getSnapshot();
  }

  getDMMetrics() {
    return this.dmMetrics.getSnapshot();
  }

  resetMetrics(): void {
    this.pushMetrics.reset();
    this.dmMetrics.reset();
  }

  // For testing/debugging
  getMockProviders() {
    return {
      push: this.pushProvider instanceof MockNotificationProvider ? this.pushProvider : null,
      dm: this.dmProvider instanceof MockNotificationProvider ? this.dmProvider : null
    };
  }
}

// Singleton instance
export const notificationDispatcher = new NotificationDispatcher();