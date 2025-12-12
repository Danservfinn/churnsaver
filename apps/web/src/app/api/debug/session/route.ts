// Debug Session API Endpoint
// Provides endpoints for managing debug sessions

import { NextRequest, NextResponse } from 'next/server';
import { authenticatedRoute, type MiddlewareAuthContext } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors, createRequestContext } from '@/lib/apiResponse';
import { checkRateLimit } from '@/server/middleware/rateLimit';
import { debugService } from '@/server/services/debugService';
import { 
  CreateDebugSessionRequest, 
  UpdateDebugSessionRequest,
  DebugSessionQuery,
  DebugContext,
  DebugLevel,
  DebugSessionStatus,
  DebugEnvironment
} from '@/types/debugging';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';


// Rate limit configuration for debug session operations
const DEBUG_SESSION_RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 operations per minute per user
  keyPrefix: 'debug_session'
};

/**
 * POST /api/debug/session - Create new debug session
 */
async function createSessionHandler(request: NextRequest, context: MiddlewareAuthContext): Promise<NextResponse<any>> {
  // Check rate limit
  const userId = context.userId || 'anonymous';
  const rateLimitResult = await checkRateLimit(
    `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${userId}`,
    DEBUG_SESSION_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return apiError(
      errors.tooManyRequests('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }),
      createRequestContext(request)
    );
  }

  try {
    const body = await request.json() as CreateDebugSessionRequest;

    // Validate request body
    if (!body.title || !body.debugLevel) {
      return apiError(
        errors.missingRequiredField('title and debugLevel are required'),
        createRequestContext(request)
      );
    }

    // Validate debug level
    if (!Object.values(DebugLevel).includes(body.debugLevel)) {
      return apiError(
        errors.validationError('Invalid debug level'),
        createRequestContext(request)
      );
    }

    // Validate environment if provided
    if (body.environment && !Object.values(DebugEnvironment).includes(body.environment)) {
      return apiError(
        errors.validationError('Invalid environment'),
        createRequestContext(request)
      );
    }

    // Create debug context
    const debugContext: DebugContext = {
      userId: context.userId || '',
      companyId: context.companyId || '',
      requestId: context.requestId,
      environment: body.environment || DebugEnvironment.DEVELOPMENT,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      permissions: context.permissions || []
    };

    // Create debug session
    const session = await debugService.createSession(body, debugContext);

    logger.info('Debug session created via API', {
      sessionId: session.sessionId,
      userId: context.userId || '',
      companyId: context.companyId || '',
      debugLevel: body.debugLevel
    });

    return apiSuccess(session, createRequestContext(request));
  } catch (error) {
    logger.error('Failed to create debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.userId,
      companyId: context.companyId
    });

    return apiError(
      errors.internalServerError('Failed to create debug session'),
      createRequestContext(request)
    );
  }
}

/**
 * GET /api/debug/session - Get debug sessions with pagination and filtering
 */
async function getSessionsHandler(request: NextRequest, context: MiddlewareAuthContext): Promise<NextResponse<any>> {
  // Check rate limit
  const userId = context.userId || 'anonymous';
  const rateLimitResult = await checkRateLimit(
    `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${userId}`,
    DEBUG_SESSION_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return apiError(
      errors.tooManyRequests('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }),
      createRequestContext(request)
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const query: DebugSessionQuery = {
      status: searchParams.get('status') as DebugSessionStatus || undefined,
      environment: searchParams.get('environment') as DebugEnvironment || undefined,
      debugLevel: searchParams.get('debugLevel') as DebugLevel || undefined,
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      sortBy: searchParams.get('sortBy') as any || undefined,
      sortOrder: searchParams.get('sortOrder') as any || undefined
    };

    // Create debug context
    const debugContext: DebugContext = {
      userId: context.userId || '',
      companyId: context.companyId || '',
      requestId: context.requestId,
      environment: DebugEnvironment.DEVELOPMENT,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      permissions: context.permissions || []
    };

    // Get debug sessions
    const result = await debugService.getSessions(query, debugContext);

    logger.info('Debug sessions retrieved via API', {
      userId: context.userId || '',
      companyId: context.companyId || '',
      sessionCount: result.sessions.length,
      totalSessions: result.total
    });

    return apiSuccess(result, createRequestContext(request));
  } catch (error) {
    logger.error('Failed to get debug sessions', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.userId,
      companyId: context.companyId
    });

    return apiError(
      errors.internalServerError('Failed to get debug sessions'),
      createRequestContext(request)
    );
  }
}

/**
 * PUT /api/debug/session - Update debug session
 */
async function updateSessionHandler(request: NextRequest, context: MiddlewareAuthContext): Promise<NextResponse<any>> {
  // Check rate limit
  const userId = context.userId || 'anonymous';
  const rateLimitResult = await checkRateLimit(
    `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${userId}`,
    DEBUG_SESSION_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return apiError(
      errors.tooManyRequests('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }),
      createRequestContext(request)
    );
  }
  try {
    const body = await request.json() as UpdateDebugSessionRequest & { sessionId: string };

    if (!body.sessionId) {
      return apiError(
        errors.missingRequiredField('sessionId is required'),
        createRequestContext(request)
      );
    }

    // Validate debug level if provided
    if (body.debugLevel && !Object.values(DebugLevel).includes(body.debugLevel)) {
      return apiError(
        errors.validationError('Invalid debug level'),
        createRequestContext(request)
      );
    }

    // Validate status if provided
    if (body.status && !Object.values(DebugSessionStatus).includes(body.status)) {
      return apiError(
        errors.validationError('Invalid session status'),
        createRequestContext(request)
      );
    }

    // Create debug context
    const debugContext: DebugContext = {
      userId: context.userId || '',
      companyId: context.companyId || '',
      requestId: context.requestId,
      environment: DebugEnvironment.DEVELOPMENT,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      permissions: context.permissions || []
    };

    // Update debug session
    const session = await debugService.updateSession(
      body.sessionId,
      {
        title: body.title,
        description: body.description,
        debugLevel: body.debugLevel,
        status: body.status,
        filters: body.filters,
        metadata: body.metadata,
        expiresAt: body.expiresAt
      },
      debugContext
    );

    if (!session) {
      return apiError(
        errors.notFound('Debug session not found'),
        createRequestContext(request)
      );
    }

    logger.info('Debug session updated via API', {
      sessionId: body.sessionId,
      userId: context.userId,
      companyId: context.companyId
    });

    return apiSuccess(session, createRequestContext(request));
  } catch (error) {
    logger.error('Failed to update debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.userId,
      companyId: context.companyId
    });

    return apiError(
      errors.internalServerError('Failed to update debug session'),
      createRequestContext(request)
    );
  }
}

/**
 * DELETE /api/debug/session - End debug session
 */
async function endSessionHandler(request: NextRequest, context: MiddlewareAuthContext): Promise<NextResponse<any>> {
  // Check rate limit
  const userId = context.userId || 'anonymous';
  const rateLimitResult = await checkRateLimit(
    `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${userId}`,
    DEBUG_SESSION_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return apiError(
      errors.tooManyRequests('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }),
      createRequestContext(request)
    );
  }
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return apiError(
        errors.missingRequiredField('sessionId is required'),
        createRequestContext(request)
      );
    }

    // Create debug context
    const debugContext: DebugContext = {
      userId: context.userId || '',
      companyId: context.companyId || '',
      requestId: context.requestId,
      environment: DebugEnvironment.DEVELOPMENT,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      permissions: context.permissions || []
    };

    // End debug session
    const success = await debugService.endSession(sessionId, debugContext);

    if (!success) {
      return apiError(
        errors.notFound('Debug session not found'),
        createRequestContext(request)
      );
    }

    logger.info('Debug session ended via API', {
      sessionId,
      userId: context.userId,
      companyId: context.companyId
    });

    return apiSuccess({ success: true }, createRequestContext(request));
  } catch (error) {
    logger.error('Failed to end debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.userId,
      companyId: context.companyId
    });

    return apiError(
      errors.internalServerError('Failed to end debug session'),
      createRequestContext(request)
    );
  }
}

/**
 * GET /api/debug/session/:sessionId - Get specific debug session
 */
async function getSessionHandler(request: NextRequest, context: MiddlewareAuthContext): Promise<NextResponse<any>> {
  // Check rate limit
  const userId = context.userId || 'anonymous';
  const rateLimitResult = await checkRateLimit(
    `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${userId}`,
    DEBUG_SESSION_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return apiError(
      errors.tooManyRequests('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }),
      createRequestContext(request)
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return apiError(
        errors.missingRequiredField('sessionId is required'),
        createRequestContext(request)
      );
    }

    // Create debug context
    const debugContext: DebugContext = {
      userId: context.userId || '',
      companyId: context.companyId || '',
      requestId: context.requestId,
      environment: DebugEnvironment.DEVELOPMENT,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      permissions: context.permissions || []
    };

    // Get debug session
    const session = await debugService.getSession(sessionId, debugContext);

    if (!session) {
      return apiError(
        errors.notFound('Debug session not found'),
        createRequestContext(request)
      );
    }

    logger.info('Debug session retrieved via API', {
      sessionId,
      userId: context.userId,
      companyId: context.companyId
    });

    return apiSuccess(session, createRequestContext(request));
  } catch (error) {
    logger.error('Failed to get debug session', {
      error: error instanceof Error ? error.message : String(error),
      userId: context.userId,
      companyId: context.companyId
    });

    return apiError(
      errors.internalServerError('Failed to get debug session'),
      createRequestContext(request)
    );
  }
}

// Disable debug endpoints in production unless explicitly enabled
function isDebugEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return process.env.ENABLE_DEBUG_ENDPOINTS === 'true';
  }
  return true;
}

function verifyAdminToken(request: NextRequest): boolean {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const providedToken = request.headers.get('x-admin-token');

  if (!adminToken || adminToken.length < 32) {
    return false;
  }

  if (!providedToken) {
    return false;
  }

  try {
    const adminTokenBuffer = Buffer.from(adminToken, 'utf8');
    const providedTokenBuffer = Buffer.from(providedToken, 'utf8');

    if (adminTokenBuffer.length !== providedTokenBuffer.length) {
      return false;
    }

    return timingSafeEqual(adminTokenBuffer, providedTokenBuffer);
  } catch {
    return false;
  }
}

function requireAdminIfProduction(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) {
    if (!verifyAdminToken(request)) {
      const clientIp =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        'unknown';

      logger.warn('Unauthorized attempt to access debug endpoint', {
        ip: clientIp,
        hasToken: !!request.headers.get('x-admin-token')
      });

      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }
  return null;
}

// Main handler function
export async function GET(
  request: NextRequest
): Promise<NextResponse> {
  if (!isDebugEnabled()) {
    return NextResponse.json(
      { error: 'Debug endpoints are disabled in production' },
      { status: 403 }
    );
  }

  const adminCheck = requireAdminIfProduction(request);
  if (adminCheck) return adminCheck;

  const handler = async (req: NextRequest, context: MiddlewareAuthContext): Promise<NextResponse<any>> => {
    const { searchParams } = new URL(req.url);
  if (searchParams.get('sessionId')) {
      return await getSessionHandler(req, context);
  }
    return await getSessionsHandler(req, context);
  };
  return authenticatedRoute(handler as any)(request);
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  if (!isDebugEnabled()) {
    return NextResponse.json(
      { error: 'Debug endpoints are disabled in production' },
      { status: 403 }
    );
  }
  const adminCheck = requireAdminIfProduction(request);
  if (adminCheck) return adminCheck;
  return authenticatedRoute(createSessionHandler as any)(request);
}

export async function PUT(
  request: NextRequest
): Promise<NextResponse> {
  if (!isDebugEnabled()) {
    return NextResponse.json(
      { error: 'Debug endpoints are disabled in production' },
      { status: 403 }
    );
  }
  const adminCheck = requireAdminIfProduction(request);
  if (adminCheck) return adminCheck;
  return authenticatedRoute(updateSessionHandler as any)(request);
}

export async function DELETE(
  request: NextRequest
): Promise<NextResponse> {
  if (!isDebugEnabled()) {
    return NextResponse.json(
      { error: 'Debug endpoints are disabled in production' },
      { status: 403 }
    );
  }
  const adminCheck = requireAdminIfProduction(request);
  if (adminCheck) return adminCheck;
  return authenticatedRoute(endSessionHandler as any)(request);
}