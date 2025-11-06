// Cancel membership at period end API
// POST /api/cases/[caseId]/cancel-membership

import { NextRequest, NextResponse } from 'next/server';
import { cancelMembershipAtPeriodEnd } from '@/server/services/memberships';
import { cancelRecoveryCase } from '@/server/services/cases';
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
      logger.warn('Unauthorized request to cancel membership - missing valid auth token');
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `case_action:cancel_membership_${companyId}`,
      RATE_LIMIT_CONFIGS.caseActions
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

    logger.info('API: Cancel membership at period end requested', { caseId, companyId });

    // First cancel the recovery case to stop reminders
    const caseCancelled = await cancelRecoveryCase(caseId, companyId);
    if (!caseCancelled) {
      logger.warn('API: Failed to cancel recovery case before membership cancellation', { caseId, companyId });
      return errorResponses.badRequestResponse('Failed to cancel recovery case');
    }

    // Get the case details to extract membership ID
    const { sql } = await import('@/lib/db');
    const cases = await sql.select(
      'SELECT membership_id FROM recovery_cases WHERE id = $1 AND company_id = $2',
      [caseId, companyId]
    );

    if (cases.length === 0) {
      logger.warn('Case not found for membership cancellation', { caseId, companyId });
      return errorResponses.notFoundResponse('Case not found');
    }

    const membershipId = (cases[0] as { membership_id: string }).membership_id;

    // Cancel the membership at period end via Whop API
    const result = await cancelMembershipAtPeriodEnd(membershipId);

    if (result.success) {
      logger.info('API: Membership cancelled at period end successfully', {
        caseId,
        membershipId,
        processingTimeMs: Date.now() - startTime
      });
      return NextResponse.json({
        success: true,
        message: 'Membership will be cancelled at the end of the current billing period'
      });
    } else {
      logger.warn('API: Failed to cancel membership at period end', {
        caseId,
        membershipId,
        error: result.error,
        processingTimeMs: Date.now() - startTime
      });
      return errorResponses.badRequestResponse(result.error || 'Failed to cancel membership');
    }
  } catch (error) {
    logger.error('API: Cancel membership at period end failed', {
      caseId: (await params).caseId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errorResponses.internalServerErrorResponse('An error occurred while cancelling membership');
  }
}











