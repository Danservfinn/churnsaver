// Nudge case API with hardened authentication and rate limiting
// POST /api/cases/[caseId]/nudge

import { NextRequest, NextResponse } from 'next/server';
import { nudgeCaseAgain } from '@/server/services/cases';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { CaseIdParamSchema, validateAndTransform } from '@/lib/validation';
import { errorResponses } from '@/lib/apiResponse';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // First resolve params for rate limiting key
    const { caseId } = await params;

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `cases:action:${caseId}`,
      RATE_LIMIT_CONFIGS.caseActionsPerCompany
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Use hardened SDK verification for authentication
    const context = await getRequestContextSDK(request);

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to case nudge - missing/failed SDK auth token');
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    const companyId = context.companyId;

    // Validate caseId parameter using zod schema
    const paramValidation = validateAndTransform(CaseIdParamSchema, { caseId });
    if (!paramValidation.success) {
      logger.warn('Case ID parameter validation failed', { caseId, error: paramValidation.error });
      return errorResponses.badRequestResponse(`Invalid case ID format: ${paramValidation.error}`);
    }

    const { caseId: validatedCaseId } = paramValidation.data;

    logger.info('API: Nudge case requested (SDK auth)', { caseId, companyId, userId: context.userId });

    const success = await nudgeCaseAgain(validatedCaseId, companyId, 'user', context.userId);

    if (success) {
      logger.info('API: Nudge sent successfully (SDK auth)', { caseId, processingTimeMs: Date.now() - startTime });
      return NextResponse.json({
        success: true,
        message: 'Nudge sent successfully'
      });
    } else {
      logger.warn('API: Failed to send nudge (SDK auth)', { caseId, processingTimeMs: Date.now() - startTime });
      return errorResponses.badRequestResponse('Failed to send nudge');
    }
  } catch (error) {
    logger.error('API: Nudge case failed (SDK auth)', {
      caseId: (await params).caseId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errorResponses.internalServerErrorResponse('An error occurred while sending nudge');
  }
}
