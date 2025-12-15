// Legacy Whop authentication module
// Delegates to jose-based implementation in whop-sdk.ts for backward compatibility

import { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getRequestContextSDK, RequestContext } from '@/lib/whop-sdk';

/**
 * Extract Whop token from various sources (headers, cookies)
 */
function extractWhopToken(request: { headers: { get: (key: string) => string | null }, cookies?: { get: (key: string) => { value: string } | undefined } }): string | null {
  // Try header first
  const headerToken = request.headers.get('x-whop-user-token');
  if (headerToken) return headerToken;

  // Try authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) return token;
  }

  // Try cookies (for iframe context where HttpOnly cookies are used)
  if (request.cookies) {
    const cookieToken = request.cookies.get('whop_frosted_token')?.value ||
                       request.cookies.get('whop_user_token')?.value ||
                       request.cookies.get('whop_token')?.value;
    if (cookieToken) return cookieToken;
  }

  return null;
}

// Single source of truth function for Whop authentication
// Delegates to jose-based verification from whop-sdk.ts
export async function getRequestContext(request: NextRequest | { headers: { get: (key: string) => string | null } }): Promise<RequestContext> {
  const startTime = Date.now();

  try {
    // Extract token from headers or cookies
    const token = extractWhopToken(request as any);

    // Get company ID from header (used when URL has companyId but token doesn't)
    const headerCompanyId = request.headers.get('x-company-id');

    logger.debug('getRequestContext token extraction', {
      hasToken: !!token,
      tokenLength: token?.length,
      hasHeaderCompanyId: !!headerCompanyId,
    });

    // Create a header proxy that includes the extracted token
    const headersProxy = {
      get: (key: string) => {
        const lowerKey = key.toLowerCase();

        // Token from any source (header, cookie)
        if (lowerKey === 'x-whop-user-token') {
          return token;
        }
        if (lowerKey === 'authorization') {
          return token ? `Bearer ${token}` : null;
        }

        // Company ID from header
        if (lowerKey === 'x-company-id') {
          return headerCompanyId;
        }

        // Pass through other headers
        return request.headers.get(key);
      }
    };

    // Delegate to jose-based verification from whop-sdk.ts
    const context = await getRequestContextSDK({ headers: headersProxy });

    logger.info('Whop token verification successful via jose delegation', {
      category: 'authentication',
      severity: 'info',
      userId: context.userId,
      companyId: context.companyId,
      isAuthenticated: context.isAuthenticated,
      hasToken: !!token,
      hasHeaderCompanyId: !!headerCompanyId,
      verificationTimeMs: Date.now() - startTime
    });

    return context;
  } catch (error) {
    // On verification failure, log warning and return safe fallback
    logger.warn('Whop token verification failed, using fallback context', {
      category: 'authentication',
      severity: 'medium',
      error: error instanceof Error ? error.message : String(error),
      verificationTimeMs: Date.now() - startTime
    });

    return {
      companyId: null,
      userId: null,
      isAuthenticated: false
    };
  }
}

// Export types for backward compatibility
export type { RequestContext };









