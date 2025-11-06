// Legacy Whop authentication module
// Delegates to jose-based implementation in whop-sdk.ts for backward compatibility

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getRequestContextSDK, RequestContext } from '@/lib/whop-sdk';

// Single source of truth function for Whop authentication
// Delegates to jose-based verification from whop-sdk.ts
export async function getRequestContext(request: { headers: { get: (key: string) => string | null } }): Promise<RequestContext> {
  const startTime = Date.now();

  try {
    // Delegate to jose-based verification from whop-sdk.ts
    const context = await getRequestContextSDK(request);

    logger.info('Whop token verification successful via jose delegation', {
      category: 'authentication',
      severity: 'info',
      userId: context.userId,
      companyId: context.companyId,
      isAuthenticated: context.isAuthenticated,
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
      companyId: env.WHOP_APP_ID || env.NEXT_PUBLIC_WHOP_APP_ID || 'unknown',
      userId: 'anonymous',
      isAuthenticated: false
    };
  }
}

// Export types for backward compatibility
export type { RequestContext };









