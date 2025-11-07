import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware - just pass through everything
// Webhooks are excluded via matcher pattern
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

// Match API routes but exclude webhooks using negative lookahead
export const config = {
  matcher: '/api/((?!webhooks).)*',
};

