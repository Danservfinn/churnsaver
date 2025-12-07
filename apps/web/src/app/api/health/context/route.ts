import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { logger } from '@/lib/logger';
import { apiSuccess, errors } from '@/lib/apiResponse';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get request context from Whop token
    // Extract token from various header sources
    const whopToken = request.headers.get('x-whop-user-token');
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const token = whopToken || bearerToken;

    const context = await getRequestContextSDK({
      headers: {
        get: (key: string) => {
          const lowerKey = key.toLowerCase();
          
          // Token sources
          if (lowerKey === 'x-whop-user-token') {
            return token || null;
          }
          if (lowerKey === 'authorization') {
            return token ? `Bearer ${token}` : null;
          }
          
          // Other headers
          if (lowerKey === 'x-forwarded-for') {
            return request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
          }
          if (lowerKey === 'x-real-ip') {
            return request.headers.get('x-real-ip');
          }
          if (lowerKey === 'user-agent') {
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