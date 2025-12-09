import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function deprecatedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'deprecated_endpoint',
      message: 'Use /api/webhooks/whop instead of /api/lean/webhooks/whop.'
    },
    { status: 410 }
  );
}

export async function POST(): Promise<NextResponse> {
  logger.warn('Deprecated Whop webhook endpoint called', {
    path: '/api/lean/webhooks/whop'
  });
  return deprecatedResponse();
}

export async function GET(): Promise<NextResponse> {
  return deprecatedResponse();
}

export async function PUT(): Promise<NextResponse> {
  return deprecatedResponse();
}

export async function DELETE(): Promise<NextResponse> {
  return deprecatedResponse();
}

