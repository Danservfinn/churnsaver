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

// Temporarily disable middleware matcher to bypass edge runtime issues
// Webhook routes will work without middleware
export const config = {
  matcher: [],
};
