import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware that just passes through all requests
// This is required because Vercel expects middleware to exist if it was previously deployed
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

// Match all routes to ensure middleware is invoked for everything
export const config = {
  matcher: '/:path*',
};

