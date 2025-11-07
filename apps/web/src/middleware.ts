import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware that just passes through all requests
// Using async function with comprehensive error handling
export async function middleware(request: NextRequest) {
  try {
    // Skip webhook endpoints immediately to avoid any processing
    if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
      return NextResponse.next();
    }

    // For all other routes, pass through
    return NextResponse.next();
  } catch (error) {
    // If middleware fails, log and allow request to proceed
    // This prevents MIDDLEWARE_INVOCATION_FAILED errors
    console.error('Middleware error:', error);
    return NextResponse.next();
  }
}

// Explicitly set edge runtime (required for middleware)
export const runtime = 'experimental-edge';

// Match all routes except static files and Next.js internals
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

