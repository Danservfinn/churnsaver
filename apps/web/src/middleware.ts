import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware that just passes through all requests
// Using async function and explicit edge runtime
export async function middleware(request: NextRequest) {
  console.log('middleware: invoked', {
    pathname: request.nextUrl.pathname,
    timestamp: Date.now(),
  });

  const response = NextResponse.next();

  console.log('middleware: completed', {
    pathname: request.nextUrl.pathname,
    timestamp: Date.now(),
  });

  return response;
}

// Explicitly set edge runtime (required for middleware)
export const runtime = 'experimental-edge';

// Match all routes
export const config = {
  matcher: '/:path*',
};

