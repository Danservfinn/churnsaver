import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { whopsdk } from '@/lib/whop-sdk';
import { getRequestContextSDK } from '@/lib/whop-sdk';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ experienceId: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();
  const { experienceId } = await params;

  try {
    // Verify user is authenticated
    const context = await getRequestContextSDK(request);

    if (!context.isAuthenticated) {
      logger.warn('Unauthenticated request to experience API', {
        experienceId,
        userId: context.userId,
      });
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fetch experience from Whop SDK
    logger.info('Fetching experience from Whop', {
      experienceId,
      userId: context.userId,
    });

    const experience = await whopsdk.experiences.retrieve(experienceId);

    if (!experience) {
      logger.warn('Experience not found', { experienceId });
      return NextResponse.json(
        { error: 'Experience not found' },
        { status: 404 }
      );
    }

    // Extract company_id from experience
    // The Whop SDK returns experience with company_id field
    const companyId = (experience as any).company_id ||
                      (experience as any).companyId ||
                      (experience as any).company?.id;

    if (!companyId) {
      logger.warn('Experience has no company_id', {
        experienceId,
        experienceKeys: Object.keys(experience),
      });
      return NextResponse.json(
        { error: 'Experience has no associated company' },
        { status: 400 }
      );
    }

    const responseData = {
      id: experienceId,
      company_id: companyId,
      name: (experience as any).name || (experience as any).title || null,
    };

    logger.info('Experience retrieved successfully', {
      experienceId,
      companyId,
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json(responseData);

  } catch (error) {
    logger.error('Failed to fetch experience', {
      experienceId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: 'Failed to fetch experience' },
      { status: 500 }
    );
  }
}
