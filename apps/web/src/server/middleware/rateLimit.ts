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
 * Implements fixed time bucketing to avoid race conditions
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const now = new Date();
    
    // Calculate fixed time bucket using floor division
    // This ensures all requests in the same window use the same bucket
    const bucketStartTimeMs = Math.floor(now.getTime() / config.windowMs) * config.windowMs;
    const windowBucketStart = new Date(bucketStartTimeMs);
    
    // Calculate when the next bucket starts (for reset time)
    const nextBucketStart = new Date(bucketStartTimeMs + config.windowMs);

    // First, clean up expired buckets (older than current bucket)
    await sql.execute(
      `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
      [windowBucketStart]
    );

    // Get current count for this identifier in the current bucket
    const rows = await sql.select<{ count: number }>(
      `SELECT count FROM rate_limits WHERE company_key = $1 AND window_bucket_start = $2`,
      [identifier, windowBucketStart]
    );

    const currentCount = rows.length > 0 ? rows[0].count : 0;

    if (currentCount >= config.maxRequests) {
      // Rate limit exceeded
      return {
        allowed: false,
        resetAt: nextBucketStart,
        remaining: 0,
        retryAfter: Math.ceil((nextBucketStart.getTime() - now.getTime()) / 1000),
      };
    }

    // Increment the count using composite primary key
    await sql.execute(`
      INSERT INTO rate_limits (company_key, window_bucket_start, count, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (company_key, window_bucket_start)
      DO UPDATE SET
        count = rate_limits.count + 1,
        updated_at = now()
    `, [identifier, windowBucketStart, 1]);

    const remaining = config.maxRequests - currentCount - 1;

    logger.info('Rate limit check passed', {
      identifier,
      currentCount: currentCount + 1,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      remaining,
      windowBucketStart: windowBucketStart.toISOString(),
    });

    return {
      allowed: true,
      resetAt: nextBucketStart,
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
  // Generic API reads used by several endpoints
  apiRead: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 reads per minute per user
    keyPrefix: 'api_read'
  },
  // Consent-specific
  consentCreate: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 consent creations per minute per user
    keyPrefix: 'consent_create'
  },
  consentUpdate: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 consent updates per minute per user
    keyPrefix: 'consent_update'
  },
  consentRead: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 consent reads per minute per user
    keyPrefix: 'consent_read'
  },
  consentDetail: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 consent detail reads per minute per user
    keyPrefix: 'consent_detail'
  },
  // Template-specific
  templateCreate: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 5, // 5 template creations per 5 minutes per user
    keyPrefix: 'template_create'
  },
  templateUpdate: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10, // 10 template updates per 5 minutes per user
    keyPrefix: 'template_update'
  },
  templateRead: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 template reads per minute per user/IP
    keyPrefix: 'template_read'
  },
// Data export specific rate limits
dataExport: {
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 1, // 1 export request per 24 hours per user
  keyPrefix: 'data_export'
},
dataExportDownload: {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 downloads per hour per file
  keyPrefix: 'data_export_download'
},
dataExportDelete: {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // 10 deletions per hour per user
  keyPrefix: 'data_export_delete'
  },
  // Security dashboard specific rate limits
  securityDashboard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 security dashboard requests per minute per user
    keyPrefix: 'security_dashboard'
  },
  alertActions: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 alert actions per minute per user
    keyPrefix: 'alert_resolve'
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

      // In development, allow request but log error
      logger.error('Rate limiting middleware failed, allowing request (development mode)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return await handler(request, context);
    }
  };
}