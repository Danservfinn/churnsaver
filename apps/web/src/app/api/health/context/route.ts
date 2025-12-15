import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { logger } from '@/lib/logger';
import { apiSuccess, errors } from '@/lib/apiResponse';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get request context from Whop token
    // Extract token from various sources: headers, cookies
    const whopToken = request.headers.get('x-whop-user-token');
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    // Also check for Whop token in cookies (used in iframe context)
    // Whop sets various token cookies that may contain the user token
    const cookieToken = request.cookies.get('whop_frosted_token')?.value ||
                       request.cookies.get('whop_user_token')?.value ||
                       request.cookies.get('whop_token')?.value;

    const token = whopToken || bearerToken || cookieToken;

    logger.debug('Context API token extraction', {
      hasHeaderToken: !!whopToken,
      hasBearerToken: !!bearerToken,
      hasCookieToken: !!cookieToken,
      tokenSource: whopToken ? 'header' : bearerToken ? 'bearer' : cookieToken ? 'cookie' : 'none',
      cookieNames: Array.from(request.cookies.getAll()).map(c => c.name),
    });

    // Get companyId from header if provided (used when URL has companyId but token doesn't)
    const headerCompanyId = request.headers.get('x-company-id');

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

          // Company ID from header (for iframe context)
          if (lowerKey === 'x-company-id') {
            return headerCompanyId || null;
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

    // Determine final companyId - prefer context but fall back to header
    const finalCompanyId = context.companyId || headerCompanyId || null;

    logger.info('Context API called', {
      companyId: finalCompanyId,
      userId: context.userId,
      isAuthenticated: context.isAuthenticated,
      tokenSource: whopToken ? 'header' : bearerToken ? 'bearer' : cookieToken ? 'cookie' : 'none',
      hasHeaderCompanyId: !!headerCompanyId,
      path: '/api/health/context'
    });

    return apiSuccess({
      companyId: finalCompanyId,
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