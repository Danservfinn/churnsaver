// RLS Middleware for automatic company context setting
// Ensures Row Level Security context is set for all database operations

import { NextRequest, NextResponse } from 'next/server';
import { setRequestContext, clearRequestContext, extractCompanyContext } from './db-rls';
import { getRequestContextSDK } from './whop-sdk';
import { logger } from './logger';

/**
 * RLS middleware to automatically set company context for requests
 * This middleware extracts company context from authentication tokens
 * and ensures it's available for all database operations
 */
export async function withRLSContext(
  handler: (request: NextRequest, context: RLSContext) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const startTime = Date.now();
    let contextSet = false;
    
    try {
      // Extract company context from request
      const companyId = await extractCompanyContext(request);
      
      // Get full request context from authentication
      const authContext = await getRequestContextSDK(request);
      
      // Create RLS context
      const rlsContext: RLSContext = {
        companyId: companyId || undefined,
        userId: authContext.userId,
        isAuthenticated: authContext.isAuthenticated,
        requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
        path: request.nextUrl.pathname,
        method: request.method
      };

      // Set request context for database operations
      setRequestContext(rlsContext);
      contextSet = true;

      logger.debug('RLS context established', {
        requestId: rlsContext.requestId,
        companyId: rlsContext.companyId,
        userId: rlsContext.userId,
        isAuthenticated: rlsContext.isAuthenticated,
        path: rlsContext.path,
        method: rlsContext.method
      });

      // Execute the handler with RLS context
      const response = await handler(request, rlsContext);

      // Add security headers
      response.headers.set('X-RLS-Context-Set', 'true');
      response.headers.set('X-Company-ID', rlsContext.companyId || 'none');
      response.headers.set('X-Request-ID', rlsContext.requestId);

      // Log successful processing
      const processingTime = Date.now() - startTime;
      logger.debug('Request processed with RLS context', {
        requestId: rlsContext.requestId,
        processingTimeMs: processingTime,
        companyId: rlsContext.companyId
      });

      return response;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const processingTime = Date.now() - startTime;
      
      logger.error('RLS middleware error', {
        error: errorMessage,
        processingTimeMs: processingTime,
        path: request.nextUrl.pathname,
        method: request.method,
        contextSet
      });

      // Clear context on error
      if (contextSet) {
        clearRequestContext();
      }

      return NextResponse.json(
        { 
          error: 'Request processing failed',
          requestId: request.headers.get('x-request-id') || 'unknown'
        },
        { 
          status: 500,
          headers: {
            'X-RLS-Context-Set': 'false',
            'X-Error': 'rls_middleware_error'
          }
        }
      );
    } finally {
      // Always clear context at the end of request
      if (contextSet) {
        clearRequestContext();
      }
    }
  };
}

/**
 * RLS context interface
 */
export interface RLSContext {
  companyId?: string;
  userId?: string;
  isAuthenticated: boolean;
  requestId: string;
  path: string;
  method: string;
}

/**
 * Higher-order function for API routes to ensure RLS context
 * Usage: export const GET = withRLSContext(async (request, context) => { ... });
 */
export function withRLSProtection(
  handler: (request: NextRequest, context: RLSContext) => Promise<NextResponse>,
  options?: {
    requireAuth?: boolean;
    requireCompany?: boolean;
    skipPaths?: string[];
  }
) {
  const requireAuth = options?.requireAuth !== false;
  const requireCompany = options?.requireCompany !== false;
  const skipPaths = options?.skipPaths || [];

  return withRLSContext(async (request: NextRequest, context: RLSContext): Promise<NextResponse> => {
    // Check if path should be skipped
    if (skipPaths.some(path => request.nextUrl.pathname.startsWith(path))) {
      return handler(request, context);
    }

    // Validate authentication if required
    if (requireAuth && !context.isAuthenticated) {
      logger.warn('Unauthorized access attempt', {
        requestId: context.requestId,
        path: context.path,
        method: context.method,
        companyId: context.companyId
      });

      return NextResponse.json(
        { 
          error: 'Authentication required',
          requestId: context.requestId
        },
        { 
          status: 401,
          headers: {
            'X-Request-ID': context.requestId
          }
        }
      );
    }

    // Validate company context if required
    if (requireCompany && !context.companyId) {
      logger.warn('Access attempt without company context', {
        requestId: context.requestId,
        path: context.path,
        method: context.method,
        userId: context.userId,
        isAuthenticated: context.isAuthenticated
      });

      return NextResponse.json(
        { 
          error: 'Company context required',
          requestId: context.requestId
        },
        { 
          status: 400,
          headers: {
            'X-Request-ID': context.requestId
          }
        }
      );
    }

    // Execute the protected handler
    return handler(request, context);
  });
}

/**
 * Middleware for server-side operations (cron jobs, webhooks, etc.)
 * Sets company context for system operations
 */
export function withSystemRLSContext(
  operation: () => Promise<void>,
  context?: {
    companyId?: string;
    userId?: string;
    operationType?: string;
  }
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    let contextSet = false;
    
    try {
      // Set system context
      const systemContext = {
        companyId: context?.companyId || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID || process.env.WHOP_APP_ID,
        userId: context?.userId || 'system',
        isAuthenticated: true
      };

      setRequestContext(systemContext);
      contextSet = true;

      logger.info('System RLS context established', {
        companyId: systemContext.companyId,
        userId: systemContext.userId,
        operationType: context?.operationType || 'unknown'
      });

      // Execute the operation
      await operation();

      const processingTime = Date.now() - startTime;
      logger.debug('System operation completed with RLS context', {
        companyId: systemContext.companyId,
        operationType: context?.operationType,
        processingTimeMs: processingTime
      });

      resolve();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const processingTime = Date.now() - startTime;
      
      logger.error('System RLS context error', {
        error: errorMessage,
        processingTimeMs: processingTime,
        operationType: context?.operationType,
        contextSet
      });

      reject(error);
    } finally {
      // Always clear context
      if (contextSet) {
        clearRequestContext();
      }
    }
  });
}

/**
 * Validate RLS context for critical operations
 */
export function validateRLSContext(context: RLSContext): {
  isValid: boolean;
  error?: string;
} {
  if (!context.isAuthenticated) {
    return {
      isValid: false,
      error: 'Authentication required for RLS-protected operation'
    };
  }

  if (!context.companyId) {
    return {
      isValid: false,
      error: 'Company context required for tenant-scoped operation'
    };
  }

  // Additional validation for production
  if (process.env.NODE_ENV === 'production') {
    if (context.companyId === 'unknown' || context.companyId === 'dev') {
      return {
        isValid: false,
        error: 'Invalid company context for production environment'
      };
    }
  }

  return { isValid: true };
}

/**
 * Get current RLS context (for debugging and monitoring)
 */
export function getCurrentRLSContext(): RLSContext | null {
  // This would typically be stored in a request-scoped variable
  // For now, return null as it should be accessed via middleware parameters
  return null;
}