import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware that just passes through all requests
// Let Next.js handle runtime automatically (don't specify runtime export)
export function middleware(request: NextRequest) {
  // Skip webhook endpoints immediately to avoid any processing
  if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
    return NextResponse.next();
  }

  // For all other routes, pass through
  return NextResponse.next();
}

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

