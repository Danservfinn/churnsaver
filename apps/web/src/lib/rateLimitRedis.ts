// Distributed rate limiting using Redis for high-performance scaling
// Falls back to Postgres if Redis is unavailable for backward compatibility

import { Redis } from 'ioredis';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface RateLimitConfig {
  windowMs: number; // Window size in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix: string; // Prefix for rate limit keys
}

export interface RateLimitResult {
  allowed: boolean;
  resetAt: Date; // When the limit resets
  remaining: number; // Remaining requests in current window
  retryAfter?: number; // Seconds to wait before retrying (429 status)
}

// Redis client singleton
let redisClient: Redis | null = null;

/**
 * Get or initialize Redis client
 */
function getRedisClient(): Redis | null {
  if (!redisClient && process.env.REDIS_URL) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
      } as any);

      redisClient.on('error', (err) => {
        logger.warn('Redis connection error, falling back to Postgres', {
          error: err.message
        });
      });

      redisClient.on('connect', () => {
        logger.info('Redis connected for rate limiting');
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis client', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return redisClient;
}

/**
 * Check if Redis is available and healthy
 */
async function isRedisHealthy(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.ping();
    return true;
  } catch (error) {
    logger.warn('Redis health check failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Generate Redis key for rate limiting
 */
function generateRedisKey(identifier: string, windowStart: Date): string {
  return `ratelimit:${identifier}:${windowStart.getTime()}`;
}

/**
 * Check rate limit using Redis (high-performance path)
 */
async function checkRateLimitRedis(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const client = getRedisClient();
  if (!client) {
    throw new Error('Redis client not available');
  }

  const now = new Date();
  const windowStartMs = Math.floor(now.getTime() / config.windowMs) * config.windowMs;
  const windowStart = new Date(windowStartMs);
  const nextWindowStart = new Date(windowStartMs + config.windowMs);

  const redisKey = generateRedisKey(identifier, windowStart);

  try {
    // Use Redis pipeline for atomic operations
    const pipeline = client.multi();

    // Increment counter and set expiry if it doesn't exist
    pipeline.incr(redisKey);
    pipeline.expire(redisKey, Math.ceil(config.windowMs / 1000));

    const results = await pipeline.exec();
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    const currentCount = results[0][1] as number;

    if (currentCount > config.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        resetAt: nextWindowStart,
        remaining: 0,
        retryAfter: Math.ceil((nextWindowStart.getTime() - now.getTime()) / 1000),
      };
    }

    return {
      allowed: true,
      resetAt: nextWindowStart,
      remaining: config.maxRequests - currentCount,
    };

  } catch (error) {
    logger.error('Redis rate limit check failed', {
      identifier,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error; // Let caller handle fallback
  }
}

/**
 * Check rate limit using Postgres (fallback path)
 */
async function checkRateLimitPostgres(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = new Date();

  // Calculate fixed time bucket using floor division
  const bucketStartTimeMs = Math.floor(now.getTime() / config.windowMs) * config.windowMs;
  const windowBucketStart = new Date(bucketStartTimeMs);
  const nextBucketStart = new Date(bucketStartTimeMs + config.windowMs);

  // Clean up expired buckets
  await sql.execute(
    `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
    [windowBucketStart]
  );

  // Get current count
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

  // Increment the count
  await sql.execute(`
    INSERT INTO rate_limits (company_key, window_bucket_start, count, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (company_key, window_bucket_start)
    DO UPDATE SET
      count = rate_limits.count + 1,
      updated_at = now()
  `, [identifier, windowBucketStart, 1]);

  const remaining = config.maxRequests - currentCount - 1;

  return {
    allowed: true,
    resetAt: nextBucketStart,
    remaining,
  };
}

/**
 * Distributed rate limit check with Redis primary and Postgres fallback
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    // Try Redis first for high performance
    if (await isRedisHealthy()) {
      try {
        const result = await checkRateLimitRedis(identifier, config);

        logger.debug('Rate limit check passed (Redis)', {
          identifier,
          remaining: result.remaining,
          resetAt: result.resetAt.toISOString(),
        });

        return result;
      } catch (redisError) {
        logger.warn('Redis rate limit check failed, falling back to Postgres', {
          identifier,
          redisError: redisError instanceof Error ? redisError.message : String(redisError)
        });
      }
    }

    // Fallback to Postgres
    const result = await checkRateLimitPostgres(identifier, config);

    logger.debug('Rate limit check passed (Postgres)', {
      identifier,
      remaining: result.remaining,
      resetAt: result.resetAt.toISOString(),
    });

    return result;

  } catch (error) {
    // Final fallback - fail-closed in production, fail-open in development
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

    // Development mode - allow request but log error
    logger.error('Rate limit check failed, allowing request (development mode)', {
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

/**
 * Gracefully close Redis connection on app shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

// Handle graceful shutdown
process.on('SIGTERM', closeRedisConnection);
process.on('SIGINT', closeRedisConnection);