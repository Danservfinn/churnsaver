// Rate limiting middleware using Postgres-backed token bucket algorithm
// Serverless-safe (no in-memory state), supports per-company and per-endpoint limits

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface RateLimitConfig {
  windowMs: number; // Window size in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix: string; // Prefix for rate limit keys (e.g., "webhook", "case_action")
}

export interface RateLimitResult {
  allowed: boolean;
  resetAt: Date; // When the limit resets
  remaining: number; // Remaining requests in current window
  retryAfter?: number; // Seconds to wait before retrying (429 status)
}

/**
 * Check and consume rate limit for a given identifier
 * Uses Postgres for storage to be serverless-compatible
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - config.windowMs);

    // First, clean up expired windows using the new composite index
    await sql.execute(
      `DELETE FROM rate_limits WHERE window_start < $1`,
      [windowStart]
    );

    // Get current count for this identifier
    const rows = await sql.select<{ count: number }>(
      `SELECT count FROM rate_limits WHERE company_key = $1 AND window_start >= $2`,
      [identifier, windowStart]
    );

    const currentCount = rows.length > 0 ? rows[0].count : 0;

    if (currentCount >= config.maxRequests) {
      // Rate limit exceeded
      const resetAt = new Date(windowStart.getTime() + config.windowMs);
      return {
        allowed: false,
        resetAt,
        remaining: 0,
        retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
      };
    }

    // Increment the count
    await sql.execute(`
      INSERT INTO rate_limits (company_key, window_start, count, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (company_key)
      DO UPDATE SET
        count = rate_limits.count + 1,
        updated_at = now()
    `, [identifier, windowStart, 1]);

    const remaining = config.maxRequests - currentCount - 1;
    const resetAt = new Date(windowStart.getTime() + config.windowMs);

    logger.info('Rate limit check passed', {
      identifier,
      currentCount: currentCount + 1,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      remaining,
    });

    return {
      allowed: true,
      resetAt,
      remaining,
    };

  } catch (error) {
    // In production, fail-closed for security
    if (process.env.NODE_ENV === 'production') {
      logger.error('Rate limit check failed, blocking request (fail-closed)', {
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });

      // Block the request on error in production (fail-closed)
      return {
        allowed: false,
        resetAt: new Date(Date.now() + config.windowMs),
        remaining: 0,
        retryAfter: Math.ceil(config.windowMs / 1000),
      };
    }

    // In development, allow the request but log the error (fail-open for debugging)
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
 * Standard rate limit configurations for different endpoints
 */
export const RATE_LIMIT_CONFIGS = {
  webhooks: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300, // 300 webhooks per minute (globally)
    keyPrefix: 'webhook'
  },
  caseActions: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 case actions per minute per company
    keyPrefix: 'case_action'
  },
  caseActionsPerCompany: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 case actions per minute per company
    keyPrefix: 'cases:action'
  },
  scheduler: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20, // 20 scheduler calls per 5 minutes (globally)
    keyPrefix: 'scheduler'
  },
} as const;

/**
 * Middleware function for rate limiting Next.js API routes
 */
export function withRateLimit(
  handler: (request: Request, context?: any) => Promise<Response>,
  config: RateLimitConfig,
  getIdentifier?: (request: Request) => string
) {
  return async (request: Request, context?: any) => {
    try {
      // Default identifier function (uses company header or global)
      const identifierFn = getIdentifier || ((req: Request) => {
        const companyId = req.headers.get('x-company-id') || req.headers.get('X-Company-Id');
        return companyId ? `${config.keyPrefix}:${companyId}` : `${config.keyPrefix}:global`;
      });

      const identifier = identifierFn(request);

      const rateLimitResult = await checkRateLimit(identifier, config);

      if (!rateLimitResult.allowed) {
        // Return 429 Too Many Requests
        const response = new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString(),
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-Rate-Limit-Reset': String(Math.floor(rateLimitResult.resetAt.getTime() / 1000)),
            'X-Rate-Limit-Remaining': String(rateLimitResult.remaining),
          },
        });

        logger.warn('Rate limit exceeded', {
          identifier,
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString(),
        });

        return response;
      }

      // Rate limit passed, proceed with handler
      return await handler(request, context);

    } catch (error) {
      // In production, fail-closed for security
      if (process.env.NODE_ENV === 'production') {
        logger.error('Rate limiting middleware failed, blocking request (fail-closed)', {
          error: error instanceof Error ? error.message : String(error),
        });

        // Return 503 Service Unavailable with retry header
        return new Response(JSON.stringify({
          error: 'Service temporarily unavailable - rate limiting error',
          retryAfter: 60,
        }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
          },
        });
      }

      // In development, allow the request but log the error
      logger.error('Rate limiting middleware failed, allowing request (development mode)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await handler(request, context);
    }
  };
}
