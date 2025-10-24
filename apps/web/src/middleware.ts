import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRequestContextSDK } from '@/lib/auth/whop-sdk';
import { logger } from '@/lib/logger';

export function middleware(request: NextRequest) {
  // Only apply security headers to API routes
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const isProduction = process.env.NODE_ENV === 'production';

  // Enhanced CORS headers with production hardening
  const allowedOrigins = isProduction
    ? [process.env.ALLOWED_ORIGIN || 'https://app.example.com']
    : ['http://localhost:3000', 'https://app.example.com'];
  
  const origin = request.headers.get('origin');
  if (allowedOrigins.includes(origin || '')) {
    response.headers.set('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Whop-User-Token');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 200, headers: response.headers });
  }

  // Skip authentication for health check endpoints
  if (request.nextUrl.pathname.startsWith('/api/health')) {
    return applySecurityHeaders(response, isProduction);
  }

  // Authenticate Whop token for all other API routes
  return authenticateWhopToken(request, response, isProduction);
}

async function authenticateWhopToken(request: NextRequest, response: NextResponse, isProduction: boolean): Promise<NextResponse> {
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

    // Set context headers for downstream handlers
    response.headers.set('x-company-id', context.companyId);
    response.headers.set('x-user-id', context.userId);
    response.headers.set('x-authenticated', context.isAuthenticated.toString());

    // Log authentication result
    if (context.isAuthenticated) {
      logger.info('API request authenticated', {
        companyId: context.companyId,
        userId: context.userId,
        path: request.nextUrl.pathname,
        method: request.method
      });
    } else {
      logger.warn('API request with anonymous access', {
        companyId: context.companyId,
        path: request.nextUrl.pathname,
        method: request.method,
        reason: 'no_valid_token'
      });
    }

    return applySecurityHeaders(response, isProduction);

  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error instanceof Error ? error.message : String(error),
      path: request.nextUrl.pathname,
      method: request.method
    });

    // Return 401 for authentication failures
    const errorResponse = NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
    return applySecurityHeaders(errorResponse, isProduction);
  }
}

function applySecurityHeaders(response: NextResponse, isProduction: boolean): NextResponse {
  // Comprehensive security headers for production
  if (isProduction) {
    // Strict Content Security Policy
    response.headers.set(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Only if absolutely necessary
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.whop.com https://*.vercel.app",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "manifest-src 'self'",
        "media-src 'self'",
        "object-src 'none'",
        "worker-src 'self'",
        "child-src 'none'"
      ].join('; ')
    );

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
    // Development CSP - more relaxed for debugging
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' https://api.whop.com ws: wss:; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'none'"
    );
    
    response.headers.set('Strict-Transport-Security', 'max-age=3600'); // 1 hour for dev
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
  }

  // Security monitoring headers
  response.headers.set('X-Request-ID', crypto.randomUUID());
  response.headers.set('X-Response-Time', Date.now().toString());

  return response;
}

export const config = {
  matcher: '/api/:path*',
};

export const runtime = 'experimental-edge';