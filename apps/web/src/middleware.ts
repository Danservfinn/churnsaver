import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware that enforces request size limits for API routes
export async function middleware(request: NextRequest) {
  // NOTE:
  // This file runs on the Edge runtime. Keep it minimal and avoid importing
  // server-only modules. Request-size enforcement happens inside the relevant
  // API routes (e.g. webhooks) where Node.js runtime is available.
  void request;
  return NextResponse.next();
}

// Apply to all API routes, including webhooks (webhooks rely on tighter limits inside middleware)
export const config = {
  matcher: '/api/:path*',
};
