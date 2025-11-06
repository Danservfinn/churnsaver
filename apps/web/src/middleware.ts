import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware that just passes through all requests
// Using async function and explicit edge runtime
export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

// Explicitly set edge runtime (required for middleware)
export const runtime = 'edge';

// Match all routes
export const config = {
  matcher: '/:path*',
};

