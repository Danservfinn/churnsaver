import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { logger } from '@/lib/logger';
import { apiSuccess, errors } from '@/lib/apiResponse';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get request context from Whop token
    const context = await getRequestContextSDK({
      headers: {
        get: (key: string) => {
          if (key.toLowerCase() === 'x-whop-user-token') {
            return request.headers.get('x-whop-user-token');
          }
          if (key.toLowerCase() === 'x-forwarded-for') {
            return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
          }
          if (key.toLowerCase() === 'x-real-ip') {
            return request.headers.get('x-real-ip');
          }
          if (key.toLowerCase() === 'user-agent') {
            return request.headers.get('user-agent');
          }
          return null;
        }
      }
    });

    logger.info('Context API called', {
      companyId: context.companyId,
      userId: context.userId,
      isAuthenticated: context.isAuthenticated,
      path: '/api/health/context'
    });

    return apiSuccess({
      companyId: context.companyId,
      userId: context.userId,
      isAuthenticated: context.isAuthenticated,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Context API error', {
      error: error instanceof Error ? error.message : String(error),
      path: '/api/health/context'
    });

    return NextResponse.json(
      { error: 'Failed to get context' },
      { status: 500 }
    );
  }
}