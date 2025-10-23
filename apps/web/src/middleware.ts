import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
    if (request.nextUrl.pathname.startsWith('/api/health')) {
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