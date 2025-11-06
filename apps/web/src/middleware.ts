import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Skip webhook endpoints completely
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/webhooks')) {
    return NextResponse.next();
  }
  
  // For all other API routes, just pass through
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }
  
  // For non-API routes, pass through
  return NextResponse.next();
}

// Only match API routes, excluding webhooks via early return
export const config = {
  matcher: '/api/:path*',
};
