import { requestSizeLimitMiddleware } from '@/middleware/requestSizeLimit';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { logger } from '@/lib/logger';
import { setRequestContext, clearRequestContext } from '@/lib/db-rls';

export async function middleware(request: NextRequest) {
  try {
    // Skip all middleware processing for webhook endpoints
    if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
      return NextResponse.next();
    }

    // Check request size limits first (before other processing)
    const sizeCheck = await requestSizeLimitMiddleware(request);
    if (sizeCheck) {
      return sizeCheck; // Return early if request size exceeds limits
    }
  } catch (error) {
    // If middleware fails for webhooks, allow them through
    if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
      return NextResponse.next();
    }
    // For other routes, log and continue
    console.error('Middleware error:', error instanceof Error ? error.message : String(error));
  }

  // Only apply security headers to API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const isProduction = process.env.NODE_ENV === 'production';

  // Generate or extract correlation ID
  // Use a simple UUID-like string generator compatible with edge runtime
  const requestId = request.headers.get('x-request-id') || 
    `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  response.headers.set('x-request-id', requestId);

  // Enhanced CORS headers with production hardening
  const allowedOrigins = process.env.ALLOWED_ORIGIN
    ? [process.env.ALLOWED_ORIGIN]
    : isProduction
      ? ['https://app.example.com']
      : ['http://localhost:3000', 'https://app.example.com'];
  
  const origin = request.headers.get('origin');
  if (allowedOrigins.includes(origin || '')) {
    response.headers.set('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
    response.headers.set('Vary', 'Origin');
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Whop-User-Token, X-Request-ID');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }

  // Skip authentication for health check and webhook endpoints
  if (request.nextUrl.pathname.startsWith('/api/health') || 
      request.nextUrl.pathname.startsWith('/api/webhooks')) {
    return applySecurityHeaders(response, isProduction, requestId);
  }

  // Authenticate Whop token for all other API routes
  return authenticateWhopToken(request, response, isProduction, requestId);
}

async function authenticateWhopToken(request: NextRequest, response: NextResponse, isProduction: boolean, requestId: string): Promise<NextResponse> {
  try {
    // Get request context from Whop token
    const context = await getRequestContextSDK({
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === 'x-whop-user-token') {
            return request.headers.get('x-whop-user-token');
          }
          if (key.toLowerCase() === 'x-forwarded-for') {
            return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
          }
          if (key.toLowerCase() === 'x-real-ip') {
            return request.headers.get('x-real-ip');
          }
          if (key.toLowerCase() === 'user-agent') {
            return request.headers.get('user-agent');
          }
          return null;
        }
      }
    });

    // Set RLS context for database operations
    setRequestContext({
      companyId: context.companyId,
      userId: context.userId,
      isAuthenticated: context.isAuthenticated
    });

    // Set context headers for downstream handlers
    response.headers.set('x-company-id', context.companyId);
    response.headers.set('x-user-id', context.userId);
    response.headers.set('x-authenticated', context.isAuthenticated.toString());
    response.headers.set('x-rls-context-set', 'true');

    // Log authentication result with correlation ID
    if (context.isAuthenticated) {
      logger.info('API request authenticated with RLS context', {
        request_id: requestId,
        companyId: context.companyId,
        userId: context.userId,
        path: request.nextUrl.pathname,
        method: request.method
      });
    } else {
      logger.warn('API request with anonymous access', {
        request_id: requestId,
        companyId: context.companyId,
        path: request.nextUrl.pathname,
        method: request.method,
        reason: 'no_valid_token'
      });
    }

    return applySecurityHeaders(response, isProduction, requestId);

  } catch (error) {
    logger.error('Authentication middleware error', {
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
      path: request.nextUrl.pathname,
      method: request.method
    });

    // Set error headers for RLS context failure
    response.headers.set('x-rls-context-set', 'false');
    response.headers.set('x-rls-error', 'auth_failed');

    // Return 401 for authentication failures
    const errorResponse = NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
    return applySecurityHeaders(errorResponse, isProduction, requestId);
  }
}

function applySecurityHeaders(response: NextResponse, isProduction: boolean, requestId: string): NextResponse {
  // Comprehensive security headers for production
  if (isProduction) {
    // Strict Content Security Policy with Whop iframe support
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'", // Needed for Next.js
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.whop.com https://api.whop.dev",
        "frame-ancestors 'self' https://whop.com",
        "form-action 'self'",
        "base-uri 'self'",
        "manifest-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
        "worker-src 'self'",
        "child-src 'none'"
      ].join('; ')
    );

    // Cross-Origin-Embedder-Policy for additional security
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    // HTTP Strict Transport Security (HSTS)
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    // Additional security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
    );
    
    // Remove server information
    response.headers.set('Server', '');
    
    // Content type protection
    response.headers.set('X-Download-Options', 'noopen');
    response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
    
    // Cache control for API responses
    if (response.status === 200) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
    }

  } else {
    // Development CSP - more relaxed for debugging with Whop iframe support
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' https://api.whop.com https://api.whop.dev ws: wss:; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'self' https://whop.com'"
    );
    
    response.headers.set('Strict-Transport-Security', 'max-age=3600'); // 1 hour for dev
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
  }

  // Security monitoring headers
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Response-Time', Date.now().toString());

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '!/api/webhooks/:path*', // Exclude webhook endpoints from middleware
  ],
};

export const runtime = 'experimental-edge';

// Note: In Edge Runtime, cleanup happens automatically at the end of request
// process.on is not available in Edge Runtime, so we rely on automatic cleanup