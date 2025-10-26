// Shared metrics helper for consistent observability across notification channels
// Replaces duplicated metrics classes in push.ts and dm.ts

import { logger } from '@/lib/logger';

export interface MetricSnapshot {
  [key: string]: number;
}

export interface MetricsSnapshot {
  metrics: MetricSnapshot;
  lastReset: Date;
}

// Generic metrics counter with reset capability and sampling support
export class NotificationMetrics {
  private counters = new Map<string, number>();
  private lastReset = Date.now();

  increment(key: string, value: number = 1): void {
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  get(key: string): number {
    return this.counters.get(key) || 0;
  }

  getAll(): MetricSnapshot {
    const result: MetricSnapshot = {};
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

  getSnapshot(): MetricsSnapshot {
    return {
      metrics: this.getAll(),
      lastReset: this.getLastReset()
    };
  }

  // Helper for logging sampled failures
  logSampledFailure(
    channel: string,
    error: string,
    sampled: boolean,
    context?: Record<string, any>
  ): void {
    const logData = {
      channel,
      error,
      sampled,
      ...context
    };

    if (sampled) {
      logger.error(`${channel} notification failed - sampled`, logData);
    } else {
      logger.warn(`${channel} notification failed`, logData);
    }
  }

  // Helper for logging successes
  logSuccess(
    channel: string,
    context: Record<string, any>
  ): void {
    logger.info(`${channel} notification sent successfully`, context);
  }
}

// Singleton instances for different channels
export const pushMetrics = new NotificationMetrics();
export const dmMetrics = new NotificationMetrics();

// Helper to determine if a failure should be sampled for detailed logging
export function shouldSampleForDetailedLogging(): boolean {
  return Math.random() < 0.1; // 10% sampling rate
}

// Helper to classify common error types across channels
export function classifyNotificationError(errorMessage: string): string {
  if (errorMessage.includes('timeout')) return 'TIMEOUT';
  if (errorMessage.includes('network')) return 'NETWORK_ERROR';
  if (errorMessage.includes('auth')) return 'AUTHENTICATION_FAILED';
  if (errorMessage.includes('rate')) return 'RATE_LIMITED';
  if (errorMessage.includes('invalid')) return 'INVALID_PAYLOAD';
  if (errorMessage.includes('channel')) return 'CHANNEL_NOT_FOUND';
  if (errorMessage.includes('user')) return 'USER_NOT_FOUND';
  if (errorMessage.includes('unavailable')) return 'PROVIDER_UNAVAILABLE';
  return 'UNKNOWN_ERROR';
}