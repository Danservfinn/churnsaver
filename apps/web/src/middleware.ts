import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal pass-through middleware
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

// Exclude webhooks from middleware
export const config = {
  matcher: '/api/((?!webhooks).)*',
};
