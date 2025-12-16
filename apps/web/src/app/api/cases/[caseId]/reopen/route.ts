// Reopen case API
// POST /api/cases/[caseId]/reopen

import { NextRequest, NextResponse } from 'next/server';
import { reopenRecoveryCase } from '@/server/services/cases';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { isProductionLikeEnvironment } from '@/lib/env';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
): Promise<NextResponse> {
  const startTime = Date.now();

  const { caseId } = await params;

  try {
    // Get company context from request
    const context = await getRequestContextSDK(request);
    const companyId = context.companyId ?? undefined;

    // Enforce authentication in production for creator-facing endpoints
    if (isProductionLikeEnvironment() && !context.isAuthenticated) {
      logger.warn('Unauthorized request to reopen case - missing valid auth token');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (!companyId) {
      logger.warn('Missing company context for reopen case request');
      return NextResponse.json(
        { error: 'Company context required' },
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

    logger.info('API: Reopen case requested', { caseId, companyId });

    const success = await reopenRecoveryCase(caseId, companyId);
    logger.info('API: Reopen function returned', { caseId, success });

    if (success) {
      logger.info('API: Case reopened successfully', { caseId, processingTimeMs: Date.now() - startTime });
      return NextResponse.json({
        success: true,
        message: 'Case reopened successfully'
      });
    } else {
      logger.warn('API: Failed to reopen case (may not be closed)', { caseId, processingTimeMs: Date.now() - startTime });
      return NextResponse.json(
        { error: 'Failed to reopen case (case may not be in closed state)' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error('API: Reopen case failed', {
      caseId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(
      { error: 'An error occurred while reopening case' },
      { status: 500 }
    );
  }
}
