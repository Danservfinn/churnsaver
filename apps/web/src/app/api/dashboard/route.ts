import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { verifyUserToken } from '@/lib/whop-sdk';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const requestHeaders = await headers();
    const user = await verifyUserToken(requestHeaders);

    const userId = (user as any)?.user_id;
    if (!user || !userId) {
      return NextResponse.json(
        { error: 'Authentication required', status: 401 },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        user_id: userId,
        authenticated: true,
        message: 'Dashboard data loaded successfully',
        status: 200,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Error handling /api/dashboard', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: 'Internal server error', status: 500 },
      { status: 500 }
    );
  }
}
