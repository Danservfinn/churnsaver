import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errorResponses, apiSuccess } from '@/lib/apiResponse';
import ConsentManagementService from '@/server/services/consentManagement';
import { 
  CreateConsentRequest, 
  ConsentSearchFilters,
  ConsentValidationError 
} from '@/types/consentManagement';

export interface ConsentResponse {
  consents: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    consent_type?: string;
    status?: string;
    granted_after?: string;
    granted_before?: string;
    expires_after?: string;
    expires_before?: string;
  };
}

/**
 * GET /api/consent - Retrieve user consents
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get context from middleware headers (set by authentication middleware)
    const companyId = request.headers.get('x-company-id');
    const userId = request.headers.get('x-user-id');
    const isAuthenticated = request.headers.get('x-authenticated') === 'true';
    const requestId = request.headers.get('x-request-id');

    // Validate required context
    if (!companyId || !userId) {
      logger.error('Missing required context in consent request', { requestId });
      return errorResponses.unauthorizedResponse('User and company context required');
    }

    // Enforce authentication for consent access
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to consent endpoint', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Apply rate limiting for consent operations (60/min per user)
    const rateLimitResult = await checkRateLimit(
      `consent_read:${userId}`,
      RATE_LIMIT_CONFIGS.apiRead
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    const { searchParams } = new URL(request.url);

    // Parse pagination parameters
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10)));

    // Parse filters
    const filters: ConsentSearchFilters = {
      page,
      limit,
      consent_type: searchParams.get('consent_type') || undefined,
      status: searchParams.get('status') as any || undefined,
      granted_after: searchParams.get('granted_after') ? new Date(searchParams.get('granted_after')!) : undefined,
      granted_before: searchParams.get('granted_before') ? new Date(searchParams.get('granted_before')!) : undefined,
      expires_after: searchParams.get('expires_after') ? new Date(searchParams.get('expires_after')!) : undefined,
      expires_before: searchParams.get('expires_before') ? new Date(searchParams.get('expires_before')!) : undefined,
    };

    logger.info('Fetching user consents', {
      userId,
      companyId,
      page,
      limit,
      filters,
      requestId
    });

    // Get consents from service
    const { consents, total } = await ConsentManagementService.getUserConsents(
      userId,
      companyId,
      filters,
      { requestId }
    );

    const totalPages = Math.ceil(total / limit);

    const response: ConsentResponse = {
      consents,
      total,
      page,
      limit,
      totalPages,
      filters: {
        ...(filters.consent_type && { consent_type: filters.consent_type }),
        ...(filters.status && { status: filters.status }),
        ...(filters.granted_after && { granted_after: filters.granted_after.toISOString() }),
        ...(filters.granted_before && { granted_before: filters.granted_before.toISOString() }),
        ...(filters.expires_after && { expires_after: filters.expires_after.toISOString() }),
        ...(filters.expires_before && { expires_before: filters.expires_before.toISOString() }),
      }
    };

    logger.info('User consents fetched successfully', {
      userId,
      companyId,
      total,
      returned: consents.length,
      page,
      totalPages,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(response);

  } catch (error) {
    logger.error('Failed to fetch user consents', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
      requestId: request.headers.get('x-request-id')
    });

    if (error instanceof ConsentValidationError) {
      return errorResponses.badRequestResponse(error.message, error.details);
    }

    return errorResponses.internalServerErrorResponse('Failed to fetch consents');
  }
}

/**
 * POST /api/consent - Create new consent record
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

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
      logger.error('Missing required context in consent creation request', { requestId });
      return errorResponses.unauthorizedResponse('User and company context required');
    }

    // Enforce authentication for consent creation
    if (!isAuthenticated) {
      logger.warn('Unauthorized request to create consent', { requestId });
      return errorResponses.unauthorizedResponse('Authentication required');
    }

    // Apply rate limiting for consent creation (10/min per user)
    const rateLimitResult = await checkRateLimit(
      `consent_create:${userId}`,
      { ...RATE_LIMIT_CONFIGS.consentCreate, windowMs: 60000 } // 1 minute window
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Parse request body
    const body: CreateConsentRequest = await request.json();

    // Validate request body
    if (!body || typeof body !== 'object') {
      return errorResponses.badRequestResponse('Invalid request body');
    }

    logger.info('Creating new consent', {
      userId,
      companyId,
      templateId: body.template_id,
      consentType: body.consent_type,
      ipAddress,
      requestId
    });

    // Create consent through service
    const newConsent = await ConsentManagementService.createConsent(
      userId,
      companyId,
      body,
      { ipAddress, userAgent, requestId }
    );

    if (!newConsent) {
      return errorResponses.internalServerErrorResponse('Failed to create consent');
    }

    logger.info('Consent created successfully', {
      consentId: newConsent.id,
      userId,
      companyId,
      consentType: newConsent.consent_type,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(newConsent);

  } catch (error) {
    logger.error('Failed to create consent', {
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

    return errorResponses.internalServerErrorResponse('Failed to create consent');
  }
}

/**
 * PUT /api/consent - Update consent records (batch operations)
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

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

    // Apply rate limiting for consent updates (20/min per user)
    const rateLimitResult = await checkRateLimit(
      `consent_update:${userId}`,
      { ...RATE_LIMIT_CONFIGS.consentUpdate, windowMs: 60000 } // 1 minute window
    );

    if (!rateLimitResult.allowed) {
      return errorResponses.unprocessableEntityResponse('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    // Parse request body for batch operations
    const body = await request.json();

    if (!body || typeof body !== 'object' || !body.operations) {
      return errorResponses.badRequestResponse('Invalid request body. Expected { operations: [...] }');
    }

    const { operations } = body;

    if (!Array.isArray(operations) || operations.length === 0) {
      return errorResponses.badRequestResponse('Operations must be a non-empty array');
    }

    if (operations.length > 10) {
      return errorResponses.badRequestResponse('Maximum 10 operations allowed per request');
    }

    logger.info('Processing batch consent update', {
      userId,
      companyId,
      operationCount: operations.length,
      requestId
    });

    // Process operations in parallel with error handling
    const results = await Promise.allSettled(
      operations.map(async (operation: any, index: number) => {
        try {
          // Validate operation structure
          if (!operation.consent_id || !operation.action) {
            throw new Error('Missing consent_id or action in operation');
          }

          if (operation.action === 'withdraw' && !operation.reason) {
            throw new Error('Reason is required for withdrawal operations');
          }

          // Process the operation
          let result;
          switch (operation.action) {
            case 'withdraw':
              result = await ConsentManagementService.withdrawConsent(
                operation.consent_id,
                userId,
                companyId,
                { reason: operation.reason },
                { ipAddress, userAgent, requestId }
              );
              break;
            
            case 'renew':
              result = await ConsentManagementService.updateConsent(
                operation.consent_id,
                userId,
                companyId,
                { status: 'active' },
                { ipAddress, userAgent, requestId }
              );
              break;
            
            default:
              throw new Error(`Unsupported operation: ${operation.action}`);
          }

          return { success: true, data: result, index };
        } catch (error) {
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error), 
            index 
          };
        }
      })
    );

    // Separate successful and failed operations
    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success);
    const failed = results.filter(r => r.status === 'rejected' || !(r.value as any).success);

    const response = {
      successful_operations: successful.map(r => (r.value as any).data),
      failed_operations: failed.map(r => {
        if (r.status === 'rejected') {
          return { index: -1, error: r.reason };
        }
        return r.value;
      }),
      total_processed: operations.length,
      success_count: successful.length,
      failure_count: failed.length
    };

    logger.info('Batch consent update completed', {
      userId,
      companyId,
      totalProcessed: operations.length,
      successCount: successful.length,
      failureCount: failed.length,
      processingTimeMs: Date.now() - startTime,
      requestId
    });

    return apiSuccess(response);

  } catch (error) {
    logger.error('Failed to process batch consent update', {
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

    return errorResponses.internalServerErrorResponse('Failed to process consent update');
  }
}