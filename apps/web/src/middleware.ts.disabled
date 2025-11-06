import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // CRITICAL: Skip all middleware processing for webhook endpoints FIRST
  // This must be checked before any other imports or code execution
  if (request.nextUrl.pathname.startsWith('/api/webhooks')) {
    return NextResponse.next();
  }

  // For all other routes, just pass through for now
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
