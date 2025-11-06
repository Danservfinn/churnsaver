import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errorResponses, apiSuccess } from '@/lib/apiResponse';
import ConsentManagementService, { ConsentValidationError } from '@/server/services/consentManagement';
import {
  UpdateConsentRequest,
  WithdrawConsentRequest
} from '@/types/consentManagement';

interface ConsentDetailResponse {
  consent: any;
  audit_log: any[];
  total_audit_entries: number;
}

/**
 * GET /api/consent/[id] - Get specific consent by ID
 */
export async function GET(
   request: NextRequest,
   { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
   const startTime = Date.now();
   const { id } = await params;

  try {
    // Initialize database connection
    await initDb();

        // Validate consent ID first
    if (!id || typeof id !== 'string') {
      return errorResponses.badRequestResponse('Valid consent ID is required');
    }

    // Get context from middleware headers
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');

    // Validate required context
    if (!companyId || !userId) {
      logger.error('Missing required context in consent detail request', { requestId });
      return errorResponses.unauthorizedResponse('User and company context required');
    }

    // Enforce authentication for consent access
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to consent detail', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Apply rate limiting for consent reads (120/min per user)
    const rateLimitResult = await checkRateLimit(
      `consent_detail:${userId}`,
      RATE_LIMIT_CONFIGS.apiRead
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    const { searchParams } = new URL(request.url);

    // Parse audit log pagination
    const auditPage = Math.max(1, parseInt(searchParams.get('audit_page') || '1', 10));
    const auditLimit = Math.max(1, Math.min(50, parseInt(searchParams.get('audit_limit') || '20', 10)));

    logger.info('Fetching consent details', {
      consentId: id,
      userId,
      companyId,
      auditPage,
      auditLimit,
      requestId
    });

    // Get consent and audit log in parallel
    const [consent, auditResult] = await Promise.all([
      ConsentManagementService.getConsentById(id, userId, companyId, { requestId: requestId || undefined }),
      ConsentManagementService.getConsentAuditLog(id, userId, companyId, {
        page: auditPage,
        limit: auditLimit
      }, { requestId: requestId || undefined })
    ]);

    if (!consent) {
      return errorResponses.notFoundResponse('Consent not found');
    }

    const response: ConsentDetailResponse = {
      consent,
      audit_log: auditResult.logs,
      total_audit_entries: auditResult.total
    };

    logger.info('Consent details fetched successfully', {
      consentId: id,
      userId,
      companyId,
      auditEntries: auditResult.logs.length,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(response);

  } catch (error) {
    logger.error('Failed to fetch consent details', {
      consentId: id,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    if (error instanceof ConsentValidationError) {
      return errorResponses.badRequestResponse(error.message, error.details);
    }

    return errorResponses.internalServerErrorResponse('Failed to fetch consent details');
  }
}

/**
 * PUT /api/consent/[id] - Update specific consent
 */
export async function PUT(
   request: NextRequest,
   { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
   const startTime = Date.now();
   const { id } = await params;

  try {
    // Initialize database connection
    await initDb();

    // Get context from middleware headers
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');
    const ipAddress = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate required context
    if (!companyId || !userId) {
      logger.error('Missing required context in consent update request', { requestId });
      return errorResponses.unauthorizedResponse('User and company context required');
    }

    // Enforce authentication for consent updates
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to update consent', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Validate consent ID
    if (!id || typeof id !== 'string') {
      return errorResponses.badRequestResponse('Valid consent ID is required');
    }

    // Apply rate limiting for consent updates (30/min per user)
    const rateLimitResult = await checkRateLimit(
      `consent_update:${userId}`,
      RATE_LIMIT_CONFIGS.consentUpdate
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Parse request body
    const body: UpdateConsentRequest = await request.json();

    // Validate request body
    if (!body || typeof body !== 'object') {
      return errorResponses.badRequestResponse('Invalid request body');
    }

    logger.info('Updating consent', {
      consentId: id,
      userId,
      companyId,
      updates: Object.keys(body),
      ipAddress,
      requestId
    });

    // Update consent through service
    const updatedConsent = await ConsentManagementService.updateConsent(
      id,
      userId,
      companyId,
      body,
      { ipAddress, userAgent, requestId: requestId || undefined }
    );

    if (!updatedConsent) {
      return errorResponses.notFoundResponse('Consent not found or update failed');
    }

    logger.info('Consent updated successfully', {
      consentId: id,
      userId,
      companyId,
      previousStatus: body.status,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(updatedConsent);

  } catch (error) {
    logger.error('Failed to update consent', {
      consentId: id,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    if (error instanceof ConsentValidationError) {
      return errorResponses.badRequestResponse(error.message, error.details);
    }

    if (error instanceof SyntaxError) {
      return errorResponses.badRequestResponse('Invalid JSON in request body');
    }

    return errorResponses.internalServerErrorResponse('Failed to update consent');
  }
}

/**
 * DELETE /api/consent/[id] - Withdraw specific consent
 */
export async function DELETE(
   request: NextRequest,
   { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
   const startTime = Date.now();
   const { id } = await params;

  try {
    // Initialize database connection
    await initDb();

    // Get context from middleware headers
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');
    const ipAddress = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Validate required context
    if (!companyId || !userId) {
      logger.error('Missing required context in consent withdrawal request', { requestId });
      return errorResponses.unauthorizedResponse('User and company context required');
    }

    // Enforce authentication for consent withdrawal
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to withdraw consent', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Validate consent ID
    if (!id || typeof id !== 'string') {
      return errorResponses.badRequestResponse('Valid consent ID is required');
    }

    // Apply rate limiting for consent withdrawals (10/min per user)
    const rateLimitResult = await checkRateLimit(
      `consent_withdraw:${userId}`,
      { ...RATE_LIMIT_CONFIGS.consentCreate, windowMs: 60000 } // 1 minute window
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Parse request body for withdrawal reason (optional)
    let withdrawalData: WithdrawConsentRequest = {};
    try {
      const body = await request.json();
      withdrawalData = body || {};
    } catch (error) {
      // Body is optional for DELETE, continue with empty data
      withdrawalData = {};
    }

    logger.info('Withdrawing consent', {
      consentId: id,
      userId,
      companyId,
      reason: withdrawalData.reason,
      ipAddress,
      requestId
    });

    // Withdraw consent through service (immediate and irreversible)
    const withdrawnConsent = await ConsentManagementService.withdrawConsent(
      id,
      userId,
      companyId,
      withdrawalData,
      { ipAddress, userAgent, requestId: requestId || undefined }
    );

    if (!withdrawnConsent) {
      return errorResponses.notFoundResponse('Consent not found or withdrawal failed');
    }

    logger.info('Consent withdrawn successfully', {
      consentId: id,
      userId,
      companyId,
      reason: withdrawalData.reason,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    // Return success with withdrawal confirmation
    return apiSuccess({
      consent: withdrawnConsent,
      withdrawal_confirmed: true,
      withdrawal_time: withdrawnConsent.withdrawn_at,
      message: 'Consent has been withdrawn and is irreversible'
    });

  } catch (error) {
    logger.error('Failed to withdraw consent', {
      consentId: id,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    if (error instanceof ConsentValidationError) {
      return errorResponses.badRequestResponse(error.message, error.details);
    }

    if (error instanceof SyntaxError) {
      return errorResponses.badRequestResponse('Invalid JSON in request body');
    }

    return errorResponses.internalServerErrorResponse('Failed to withdraw consent');
  }
}