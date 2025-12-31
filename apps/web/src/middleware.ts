import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware configuration for ChurnSaver
 *
 * This middleware handles:
 * 1. Public route access (landing, pricing, etc.)
 * 2. Webhook endpoint passthrough
 * 3. API route handling
 * 4. Static asset passthrough
 */

// Routes that should be publicly accessible without authentication
const PUBLIC_ROUTES = [
  '/',              // Landing page
  '/pricing',       // Pricing page
  '/about',         // About page (if exists)
  '/contact',       // Contact page (if exists)
  '/privacy',       // Privacy policy
  '/terms',         // Terms of service
];

// Route prefixes that should bypass auth
const PUBLIC_PREFIXES = [
  '/api/webhooks',  // Webhook endpoints
  '/api/health',    // Health check endpoints
  '/_next',         // Next.js assets
  '/favicon',       // Favicon
  '/images',        // Static images
  '/fonts',         // Fonts
];

// API routes that require authentication (for reference)
const PROTECTED_API_PREFIXES = [
  '/api/cases',
  '/api/dashboard',
  '/api/settings',
  '/api/export',
];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Always allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // Files with extensions (css, js, images, etc.)
  ) {
    return NextResponse.next();
  }

  // 2. Always allow webhook endpoints (no auth required - uses HMAC signature)
  if (pathname.startsWith('/api/webhooks')) {
    const response = NextResponse.next();
    // Ensure no caching for webhooks
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
  }

  // 3. Allow health check endpoints
  if (pathname.startsWith('/api/health')) {
    return NextResponse.next();
  }

  // 4. Check if route is explicitly public
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isPublicPrefix = PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));

  if (isPublicRoute || isPublicPrefix) {
    return NextResponse.next();
  }

  // 5. For all other routes, just pass through
  // Authentication is handled at the component/API level using WhopContext
  return NextResponse.next();
}

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
