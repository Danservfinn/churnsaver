// Whop Authentication Middleware
// Provides easy-to-use authentication guards for API routes

import { NextRequest, NextResponse } from 'next/server';
import { whopAuthService, type AuthContext, type AuthOptions } from './auth';
import { createRequestContext, apiError, errors } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';

/**
 * Authentication middleware configuration
 */
export interface AuthMiddlewareConfig {
  requireAuth?: boolean;
  permissions?: string[];
  validateSession?: boolean;
  onAuthFailed?: (error: any, context: any) => NextResponse;
  onAuthSuccess?: (context: AuthContext) => void | Promise<void>;
  skipPaths?: string[];
}

/**
 * Enhanced authentication context for middleware
 */
export interface MiddlewareAuthContext extends AuthContext {
  requestId: string;
  startTime: number;
  method: string;
  url: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig = {}) {
  return async (request: NextRequest) => {
    const startTime = Date.now();
    const requestContext = createRequestContext(request);
    
    try {
      // Check if path should be skipped
      if (config.skipPaths) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        
        if (config.skipPaths.some(path => pathname.startsWith(path))) {
          logger.debug('Skipping authentication for path', { pathname });
          return null; // Continue to next handler
        }
      }

      // Extract token from various sources
      const token = extractToken(request);
      
      // Create auth options
      const authOptions: AuthOptions = {
        token,
        validateSession: config.validateSession !== false,
        checkPermissions: config.permissions,
        timeout: 30000 // 30 seconds default
      };

      // Authenticate
      const authContext = await whopAuthService.authenticate(request, authOptions);
      
      // Check if authentication is required
      if (config.requireAuth && !authContext.isAuthenticated) {
        const error = errors.unauthorized('Authentication required');
        
        if (config.onAuthFailed) {
          return config.onAuthFailed(error, requestContext);
        }
        
        return apiError(error, requestContext);
      }

      // Check permissions if required
      if (config.permissions && config.permissions.length > 0) {
        const userPermissions = authContext.permissions || [];
        const hasAllPermissions = config.permissions.every(permission => 
          userPermissions.includes(permission) || 
          userPermissions.includes('*') || 
          userPermissions.includes('admin')
        );

        if (!hasAllPermissions) {
          const error = errors.forbidden('Insufficient permissions', {
            required: config.permissions,
            userPermissions
          });
          
          if (config.onAuthFailed) {
            return config.onAuthFailed(error, requestContext);
          }
          
          return apiError(error, requestContext);
        }
      }

      // Create enhanced context
      const middlewareContext: MiddlewareAuthContext = {
        ...authContext,
        requestId: requestContext.requestId,
        startTime: requestContext.startTime,
        method: requestContext.method,
        url: requestContext.url,
        ip: requestContext.ip,
        userAgent: requestContext.userAgent
      };

      // Call success handler if provided
      if (config.onAuthSuccess) {
        await config.onAuthSuccess(middlewareContext);
      }

      // Log successful authentication
      logger.info('Middleware authentication successful', {
        requestId: middlewareContext.requestId,
        userId: middlewareContext.userId,
        companyId: middlewareContext.companyId,
        isAuthenticated: middlewareContext.isAuthenticated,
        permissionCount: middlewareContext.permissions?.length || 0,
        duration: Date.now() - startTime
      });

      // Return context to be used by route handler
      return middlewareContext;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.security('Middleware authentication failed', {
        category: 'authentication',
        severity: 'high',
        requestId: requestContext.requestId,
        url: request.url,
        method: request.method,
        error: error instanceof Error ? error.message : String(error),
        duration
      });

      if (config.onAuthFailed) {
        return config.onAuthFailed(error, requestContext);
      }

      // Default error handling
      if (error instanceof errors.unauthorized().constructor) {
        return apiError(error, requestContext);
      }

      return apiError(
        errors.internalServerError('Authentication middleware error', { originalError: error }),
        requestContext
      );
    }
  };
}

/**
 * Require authentication middleware
 */
export const requireAuth = createAuthMiddleware({
  requireAuth: true,
  validateSession: true
});

/**
 * Require specific permissions middleware
 */
export function requirePermissions(permissions: string[]) {
  return createAuthMiddleware({
    requireAuth: true,
    permissions,
    validateSession: true
  });
}

/**
 * Optional authentication middleware
 */
export const optionalAuth = createAuthMiddleware({
  requireAuth: false,
  validateSession: false
});

/**
 * Application-level authentication middleware (for service-to-service)
 */
export const appAuth = createAuthMiddleware({
  requireAuth: true,
  validateSession: false, // Apps don't need sessions
  skipPaths: ['/health', '/metrics'] // Skip health checks
});

/**
 * Extract token from request
 */
function extractToken(request: NextRequest): string | undefined {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try Whop-specific header
  const whopToken = request.headers.get('x-whop-user-token');
  if (whopToken) {
    return whopToken;
  }

  // Try query parameter (for development/webhook scenarios)
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  if (tokenParam) {
    return tokenParam;
  }

  return undefined;
}

/**
 * Helper function to wrap API route handlers with authentication
 */
export function withAuth<T = any>(
  handler: (request: NextRequest, context: MiddlewareAuthContext) => Promise<NextResponse<T>>,
  config: AuthMiddlewareConfig = {}
) {
  const middleware = createAuthMiddleware(config);
  
  return async (request: NextRequest): Promise<NextResponse<T>> => {
    const context = await middleware(request);
    
    // If middleware returned a response (error case), return it
    if (context instanceof NextResponse) {
      return context;
    }
    
    // Otherwise, call the handler with the context
    return await handler(request, context as MiddlewareAuthContext);
  };
}

/**
 * Helper function to create authenticated API route handlers
 */
export function authenticatedRoute<T = any>(
  handler: (request: NextRequest, context: MiddlewareAuthContext) => Promise<NextResponse<T>>,
  options: { permissions?: string[] } = {}
) {
  return withAuth(handler, {
    requireAuth: true,
    validateSession: true,
    permissions: options.permissions
  });
}

/**
 * Helper function to create application-level API route handlers
 */
export function applicationRoute<T = any>(
  handler: (request: NextRequest, context: MiddlewareAuthContext) => Promise<NextResponse<T>>
) {
  return withAuth(handler, {
    requireAuth: true,
    validateSession: false
  });
}

/**
 * Helper function to create optional auth API route handlers
 */
export function optionalAuthRoute<T = any>(
  handler: (request: NextRequest, context: MiddlewareAuthContext) => Promise<NextResponse<T>>
) {
  return withAuth(handler, {
    requireAuth: false,
    validateSession: false
  });
}

/**
 * Token introspection utility for API routes
 */
export async function introspectToken(request: NextRequest): Promise<{
  valid: boolean;
  userId?: string;
  companyId?: string;
  expiresAt?: number;
  permissions?: string[];
  error?: string;
}> {
  try {
    const token = extractToken(request);
    
    if (!token) {
      return { valid: false, error: 'No token provided' };
    }

    const authContext = await whopAuthService.authenticate(request, { 
      token, 
      validateSession: false 
    });

    if (!authContext.isAuthenticated || !authContext.tokenInfo) {
      return { valid: false, error: 'Invalid token' };
    }

    return {
      valid: true,
      userId: authContext.userId,
      companyId: authContext.companyId,
      expiresAt: authContext.tokenInfo.expiresAt,
      permissions: authContext.permissions
    };

  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Validate token utility
 */
export async function validateToken(token: string): Promise<{
  valid: boolean;
  payload?: any;
  error?: string;
}> {
  try {
    const tokenInfo = await whopAuthService.verifyToken(token);
    
    return {
      valid: true,
      payload: tokenInfo.payload
    };

  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get current user from request
 */
export async function getCurrentUser(request: NextRequest): Promise<{
  id?: string;
  companyId?: string;
  permissions?: string[];
} | null> {
  try {
    const authContext = await whopAuthService.authenticate(request, {
      validateSession: false
    });

    if (!authContext.isAuthenticated) {
      return null;
    }

    return {
      id: authContext.userId,
      companyId: authContext.companyId,
      permissions: authContext.permissions
    };

  } catch (error) {
    return null;
  }
}

/**
 * Check if user has specific permission
 */
export async function hasPermission(
  request: NextRequest, 
  permission: string
): Promise<boolean> {
  try {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return false;
    }

    const permissions = user.permissions || [];
    return permissions.includes(permission) || 
           permissions.includes('*') || 
           permissions.includes('admin');

  } catch (error) {
    return false;
  }
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  request: NextRequest, 
  permissions: string[]
): Promise<boolean> {
  try {
    const user = await getCurrentUser(request);
    
    if (!user) {
      return false;
    }

    const userPermissions = user.permissions || [];
    
    // Check for admin wildcard
    if (userPermissions.includes('*') || userPermissions.includes('admin')) {
      return true;
    }

    // Check for any required permission
    return permissions.some(permission => userPermissions.includes(permission));

  } catch (error) {
    return false;
  }
}

// Export types for external use
// Export types for external use