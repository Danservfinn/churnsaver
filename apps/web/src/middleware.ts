import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware - just pass through everything
// Webhooks are excluded via matcher pattern
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

// Only match API routes, but exclude webhooks explicitly
export const config = {
  matcher: [
    '/api/:path*',
    '!/api/webhooks/:path*', // Explicitly exclude webhooks
  ],
};

