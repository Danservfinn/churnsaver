// User Deletion API Endpoint
// Implements GDPR "right to be forgotten" functionality

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, type MiddlewareAuthContext } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, createRequestContext, errors } from '@/lib/apiResponse';
import { checkRateLimit } from '@/server/middleware/rateLimit';
import { logger } from '@/lib/logger';
import { userDeletionService } from '@/server/services/userDeletion';
import {
  DeleteUserRequest,
  DeleteUserResponse,
  GetDeletionStatusResponse,
  UserDeletionStatus,
  UserDeletionErrorType,
  createUserDeletionError
} from '@/types/userDeletion';

/**
 * Rate limit configuration for user deletion endpoint
 * 1 request per 24 hours per user
 */
const USER_DELETION_RATE_LIMIT = {
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 1, // Only 1 deletion request per day
  keyPrefix: 'user_deletion'
};

/**
 * POST /api/user/delete - Request user data deletion
 */
async function handleDeleteRequest(
  request: NextRequest,
  context: MiddlewareAuthContext
): Promise<NextResponse> {
  const requestContext = createRequestContext(request);
  
  try {
    // Parse request body
    const body: DeleteUserRequest = await request.json();
    
    // Validate request
    const validationResult = validateDeleteRequest(body);
    if (!validationResult.valid) {
      return apiError(
        errors.validationError(validationResult.error || 'Invalid request'),
        requestContext
      );
    }

    // Extract user information from auth context
    const { userId, companyId } = context;

    if (!userId || !companyId) {
      return apiError(
        errors.unauthorized('Authentication required'),
        requestContext
      );
    }

    // Get client information for audit
    const clientIP = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    logger.info('User deletion request received', {
      requestId: requestContext.requestId,
      userId,
      companyId,
      consentGiven: body.consent,
      reason: body.reason,
      clientIP,
      userAgent: userAgent.substring(0, 200) // Limit length for security
    });

    // Create deletion request
    const deletionRequest = await userDeletionService.createDeletionRequest({
      userId,
      companyId,
      consentGiven: body.consent,
      requestIp: clientIP,
      userAgent: userAgent.substring(0, 500), // Limit length
      metadata: {
        reason: body.reason,
        requestId: requestContext.requestId,
        endpoint: '/api/user/delete'
      }
    });

    // Estimate completion time (typically 5-10 minutes)
    const estimatedCompletionTime = new Date(Date.now() + 10 * 60 * 1000);

    // Log successful request creation
    logger.info('User deletion request created successfully', {
      requestId: requestContext.requestId,
      deletionRequestId: deletionRequest.id,
      userId,
      companyId,
      status: deletionRequest.status,
      estimatedCompletionTime: estimatedCompletionTime.toISOString()
    });

    const response: DeleteUserResponse = {
      success: true,
      requestId: deletionRequest.id,
      message: 'Deletion request received and is being processed',
      status: deletionRequest.status,
      estimatedCompletionTime
    };

    return apiSuccess(response, requestContext);

  } catch (error) {
    // Handle user deletion errors specifically
    if (error instanceof Error && 'type' in error) {
      const userError = error as any;
      
      logger.security('User deletion request failed', {
        category: 'user_deletion',
        severity: 'medium',
        requestId: requestContext.requestId,
        userId: context.userId,
        companyId: context.companyId,
        errorType: userError.type,
        errorMessage: userError.message,
        details: userError.details
      });

      // Map error types to appropriate API errors
      switch (userError.type) {
        case UserDeletionErrorType.RATE_LIMITED:
          return apiError(
            errors.tooManyRequests(userError.message, userError.details),
            requestContext
          );
        
        case UserDeletionErrorType.INVALID_CONSENT:
          return apiError(
            errors.badRequest(userError.message, userError.details),
            requestContext
          );
        
        case UserDeletionErrorType.VALIDATION_ERROR:
          return apiError(
            errors.validationError(userError.message, userError.details),
            requestContext
          );
        
        case UserDeletionErrorType.DELETION_IN_PROGRESS:
          return apiError(
            errors.conflict(userError.message, userError.details),
            requestContext
          );
        
        default:
          return apiError(
            errors.internalServerError('Failed to process deletion request', userError.details),
            requestContext
          );
      }
    }

    // Handle unexpected errors
    logger.error('Unexpected error in user deletion request', {
      requestId: requestContext.requestId,
      userId: context.userId,
      companyId: context.companyId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return apiError(
      errors.internalServerError('Internal server error'),
      requestContext
    );
  }
}

/**
 * GET /api/user/delete - Get deletion request status
 */
async function handleGetStatus(
  request: NextRequest,
  context: MiddlewareAuthContext
): Promise<NextResponse> {
  const requestContext = createRequestContext(request);
  
  try {
    // Extract user information from auth context
    const { userId, companyId } = context;

    if (!userId || !companyId) {
      return apiError(
        errors.unauthorized('Authentication required'),
        requestContext
      );
    }

    // Get URL parameters
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');

    if (!requestId) {
      // Get latest deletion request for user
      const userRequests = await userDeletionService.getUserDeletionRequests(userId, companyId);
      
      if (userRequests.length === 0) {
        return apiError(
          errors.notFound('No deletion requests found'),
          requestContext
        );
      }

      const latestRequest = userRequests[0];
      
      const response: GetDeletionStatusResponse = {
        requestId: latestRequest.id,
        status: latestRequest.status,
        requestedAt: latestRequest.requestedAt,
        processedAt: latestRequest.processedAt,
        completedAt: latestRequest.completedAt,
        errorMessage: latestRequest.errorMessage,
        retryCount: latestRequest.retryCount
      };

      return apiSuccess(response, requestContext);
    }

    // Get specific deletion request
    const deletionRequest = await userDeletionService.getDeletionRequest(requestId);
    
    if (!deletionRequest) {
      return apiError(
        errors.notFound('Deletion request not found'),
        requestContext
      );
    }

    // Verify user owns this request
    if (deletionRequest.userId !== userId || deletionRequest.companyId !== companyId) {
      logger.security('Unauthorized access to deletion request', {
        category: 'authorization',
        severity: 'high',
        requestId: requestContext.requestId,
        userId,
        companyId,
        targetRequestId: requestId
      });

      return apiError(
        errors.forbidden('Access denied to this deletion request'),
        requestContext
      );
    }

    const response: GetDeletionStatusResponse = {
      requestId: deletionRequest.id,
      status: deletionRequest.status,
      requestedAt: deletionRequest.requestedAt,
      processedAt: deletionRequest.processedAt,
      completedAt: deletionRequest.completedAt,
      errorMessage: deletionRequest.errorMessage,
      retryCount: deletionRequest.retryCount
    };

    return apiSuccess(response, requestContext);

  } catch (error) {
    logger.error('Error getting deletion request status', {
      requestId: requestContext.requestId,
      userId: context.userId,
      companyId: context.companyId,
      error: error instanceof Error ? error.message : String(error)
    });

    return apiError(
      errors.internalServerError('Failed to get deletion request status'),
      requestContext
    );
  }
}

/**
 * Validate delete request body
 */
function validateDeleteRequest(body: DeleteUserRequest): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  if (typeof body.consent !== 'boolean') {
    return { valid: false, error: 'Consent must be a boolean value' };
  }

  if (!body.consent) {
    return { valid: false, error: 'Explicit consent is required for data deletion' };
  }

  if (body.reason && typeof body.reason !== 'string') {
    return { valid: false, error: 'Reason must be a string' };
  }

  if (body.reason && body.reason.length > 500) {
    return { valid: false, error: 'Reason must be less than 500 characters' };
  }

  return { valid: true };
}

/**
 * Build rate limit identifier for the authenticated user.
 */
function getRateLimitKey(context: MiddlewareAuthContext): string {
  return context.userId
    ? `${USER_DELETION_RATE_LIMIT.keyPrefix}:${context.userId}`
    : `${USER_DELETION_RATE_LIMIT.keyPrefix}:anonymous`;
}

type RouteParams = { params: Promise<Record<string, never>> };

// Export route handlers with authentication and rate limiting
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  await params;

  const authOutcome = await requireAuth(request);
  if (!authOutcome || authOutcome instanceof NextResponse) {
    return authOutcome ?? apiError(errors.unauthorized('Authentication required'), createRequestContext(request));
  }
  if (!authOutcome.userId) {
    const requestContext = createRequestContext(request);
    return apiError(errors.unauthorized('Authentication required'), requestContext);
  }

  const rateLimitResult = await checkRateLimit(getRateLimitKey(authOutcome), USER_DELETION_RATE_LIMIT);
  if (!rateLimitResult.allowed) {
    const requestContext = createRequestContext(request);
    return apiError(
      errors.tooManyRequests('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }),
      requestContext
    );
  }

  return handleDeleteRequest(request, authOutcome);
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  await params;

  const authOutcome = await requireAuth(request);
  if (!authOutcome || authOutcome instanceof NextResponse) {
    return authOutcome ?? apiError(errors.unauthorized('Authentication required'), createRequestContext(request));
  }
  if (!authOutcome.userId) {
    const requestContext = createRequestContext(request);
    return apiError(errors.unauthorized('Authentication required'), requestContext);
  }

  return handleGetStatus(request, authOutcome);
}

// Method not allowed for other HTTP methods
export async function PUT(): Promise<NextResponse> {
  return apiError(
    errors.methodNotAllowed('Method not allowed'),
    createRequestContext({} as Request)
  );
}

export async function DELETE(): Promise<NextResponse> {
  return apiError(
    errors.methodNotAllowed('Method not allowed'),
    createRequestContext({} as Request)
  );
}

export async function PATCH(): Promise<NextResponse> {
  return apiError(
    errors.methodNotAllowed('Method not allowed'),
    createRequestContext({} as Request)
  );
}