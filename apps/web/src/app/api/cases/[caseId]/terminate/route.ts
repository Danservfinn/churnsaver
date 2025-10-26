// Terminate membership API
// POST /api/cases/[caseId]/terminate

import { NextRequest, NextResponse } from 'next/server';
import { terminateMembership } from '@/server/services/cases';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errorResponses } from '@/lib/apiResponse';

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
      logger.warn('Unauthorized request to terminate membership - missing valid auth token');
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `cases:action:${companyId}`,
      RATE_LIMIT_CONFIGS.caseActionsPerCompany
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    if (!caseId) {
      return errorResponses.badRequestResponse('Case ID is required');
    }

    logger.info('API: Terminate membership requested', { caseId, companyId });

    const success = await terminateMembership(caseId, companyId);

    if (success) {
      logger.info('API: Membership terminated successfully', { caseId, processingTimeMs: Date.now() - startTime });
      return NextResponse.json({
        success: true,
        message: 'Membership terminated successfully'
      });
    } else {
      logger.warn('API: Failed to terminate membership', { caseId, processingTimeMs: Date.now() - startTime });
      return errorResponses.badRequestResponse('Failed to terminate membership');
    }
  } catch (error) {
    logger.error('API: Terminate membership failed', {
      caseId: (await params).caseId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errorResponses.internalServerErrorResponse('An error occurred while terminating membership');
  }
}
