// Cancel case API
// POST /api/cases/[caseId]/cancel

import { NextRequest, NextResponse } from 'next/server';
import { cancelRecoveryCase } from '@/server/services/cases';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();

  const { caseId } = await params;

  try {
    // Get company context from request
    const context = await getRequestContextSDK(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to cancel case - missing valid auth token');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `cases:action:${companyId}`,
      RATE_LIMIT_CONFIGS.caseActionsPerCompany
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter, resetAt: rateLimitResult.resetAt.toISOString() },
        { status: 422 }
      );
    }

    if (!caseId) {
      return NextResponse.json(
        { error: 'Case ID is required' },
        { status: 400 }
      );
    }

    logger.info('API: Cancel case requested', { caseId, companyId });

    const success = await cancelRecoveryCase(caseId, companyId);
    logger.info('API: Cancel function returned', { caseId, success });

    if (success) {
      logger.info('API: Case cancelled successfully', { caseId, processingTimeMs: Date.now() - startTime });
      return NextResponse.json({
        success: true,
        message: 'Case cancelled successfully'
      });
    } else {
      logger.warn('API: Failed to cancel case (may already be closed)', { caseId, processingTimeMs: Date.now() - startTime });
      return NextResponse.json(
        { error: 'Failed to cancel case (may already be closed)' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('API: Cancel case failed', {
      caseId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(
      { error: 'An error occurred while cancelling case' },
      { status: 500 }
    );
  }
}
