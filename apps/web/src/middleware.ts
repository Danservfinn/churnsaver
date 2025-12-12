import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requestSizeLimitMiddleware } from './middleware/requestSizeLimit';

// Middleware that enforces request size limits for API routes
export async function middleware(request: NextRequest) {
  // Check request size limits (returns null if OK, or NextResponse with error if exceeded)
  const sizeCheckResult = await requestSizeLimitMiddleware(request);
  if (sizeCheckResult) {
    return sizeCheckResult;
  }

  return NextResponse.next();
}

// Apply to all API routes, including webhooks (webhooks rely on tighter limits inside middleware)
export const config = {
  matcher: '/api/:path*',
};
