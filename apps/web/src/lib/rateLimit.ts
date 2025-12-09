// Postgres-backed rate limiting (no Redis dependency)
// Uses fixed-window buckets stored in the rate_limits table.

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export interface RateLimitResult {
  allowed: boolean;
  resetAt: Date;
  remaining: number;
  retryAfter?: number;
}

/**
 * Core Postgres rate limit check.
 */
async function checkRateLimitPostgres(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = new Date();

  const bucketStartMs = Math.floor(now.getTime() / config.windowMs) * config.windowMs;
  const windowBucketStart = new Date(bucketStartMs);
  const nextBucketStart = new Date(bucketStartMs + config.windowMs);

  await sql.execute(
    `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
    [windowBucketStart]
  );

  const rows = await sql.select<{ count: number }>(
    `SELECT count FROM rate_limits WHERE company_key = $1 AND window_bucket_start = $2`,
    [identifier, windowBucketStart]
  );

  const currentCount = rows.length > 0 ? rows[0].count : 0;

  if (currentCount >= config.maxRequests) {
    return {
      allowed: false,
      resetAt: nextBucketStart,
      remaining: 0,
      retryAfter: Math.ceil((nextBucketStart.getTime() - now.getTime()) / 1000),
    };
  }

  await sql.execute(
    `
    INSERT INTO rate_limits (company_key, window_bucket_start, count, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (company_key, window_bucket_start)
    DO UPDATE SET
      count = rate_limits.count + 1,
      updated_at = now()
  `,
    [identifier, windowBucketStart, 1]
  );

  const remaining = config.maxRequests - currentCount - 1;

  return {
    allowed: true,
    resetAt: nextBucketStart,
    remaining,
  };
}

/**
 * Public rate limit entry point (Postgres-only).
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const result = await checkRateLimitPostgres(identifier, config);

    logger.debug('Rate limit check (Postgres)', {
      identifier,
      remaining: result.remaining,
      resetAt: result.resetAt.toISOString(),
    });

    return result;
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('Rate limit check failed, blocking request (fail-closed)', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        allowed: false,
        resetAt: new Date(Date.now() + config.windowMs),
        remaining: 0,
        retryAfter: Math.ceil(config.windowMs / 1000),
      };
    }

    logger.error('Rate limit check failed, allowing request (development/test mode)', {
      identifier,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      allowed: true,
      resetAt: new Date(Date.now() + config.windowMs),
      remaining: config.maxRequests - 1,
    };
  }
}

// Legacy compatibility: indicate Redis is not used.
export async function isRedisHealthy(): Promise<boolean> {
  return false;
}

// Compatibility no-ops for tests that previously inspected Redis keys.
export async function cleanupRateLimitKeys(_pattern: string): Promise<number> {
  return 0;
}

export async function getRateLimitKeys(_pattern: string): Promise<string[]> {
  return [];
}

