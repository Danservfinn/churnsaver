// Debug Session API Endpoint
// Provides endpoints for managing debug sessions

import { NextRequest, NextResponse } from 'next/server';
import { authenticatedRoute } from '@/lib/whop/authMiddleware';
import { apiSuccess, apiError, errors, createRequestContext } from '@/lib/apiResponse';
import { withRateLimit } from '@/server/middleware/rateLimit';
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

// Rate limit configuration for debug session operations
const DEBUG_SESSION_RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 operations per minute per user
  keyPrefix: 'debug_session'
};

/**
 * POST /api/debug/session - Create new debug session
 */
async function createSessionHandler(request: NextRequest, context: any) {
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
      userId: context.userId,
      companyId: context.companyId,
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
      userId: context.userId,
      companyId: context.companyId,
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
async function getSessionsHandler(request: NextRequest, context: any) {
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
      userId: context.userId,
      companyId: context.companyId,
      requestId: context.requestId,
      environment: DebugEnvironment.DEVELOPMENT,
      ipAddress: context.ip,
      userAgent: context.userAgent,
      permissions: context.permissions || []
    };

    // Get debug sessions
    const result = await debugService.getSessions(query, debugContext);

    logger.info('Debug sessions retrieved via API', {
      userId: context.userId,
      companyId: context.companyId,
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
async function updateSessionHandler(request: NextRequest, context: any) {
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
      userId: context.userId,
      companyId: context.companyId,
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
async function endSessionHandler(request: NextRequest, context: any) {
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
      userId: context.userId,
      companyId: context.companyId,
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
async function getSessionHandler(request: NextRequest, context: any) {
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
      userId: context.userId,
      companyId: context.companyId,
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

// Apply rate limiting and authentication to all handlers
const createSessionWithRateLimit = withRateLimit(
  authenticatedRoute(createSessionHandler),
  DEBUG_SESSION_RATE_LIMIT,
  (request) => `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${request.headers.get('x-user-id') || 'anonymous'}`
);

const getSessionsWithRateLimit = withRateLimit(
  authenticatedRoute(getSessionsHandler),
  DEBUG_SESSION_RATE_LIMIT,
  (request) => `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${request.headers.get('x-user-id') || 'anonymous'}`
);

const updateSessionWithRateLimit = withRateLimit(
  authenticatedRoute(updateSessionHandler),
  DEBUG_SESSION_RATE_LIMIT,
  (request) => `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${request.headers.get('x-user-id') || 'anonymous'}`
);

const endSessionWithRateLimit = withRateLimit(
  authenticatedRoute(endSessionHandler),
  DEBUG_SESSION_RATE_LIMIT,
  (request) => `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${request.headers.get('x-user-id') || 'anonymous'}`
);

const getSessionWithRateLimit = withRateLimit(
  authenticatedRoute(getSessionHandler),
  DEBUG_SESSION_RATE_LIMIT,
  (request) => `${DEBUG_SESSION_RATE_LIMIT.keyPrefix}:${request.headers.get('x-user-id') || 'anonymous'}`
);

// Main handler function
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Route based on query parameters
  if (searchParams.get('sessionId')) {
    return getSessionWithRateLimit(request);
  } else {
    return getSessionsWithRateLimit(request);
  }
}

export async function POST(request: NextRequest) {
  return createSessionWithRateLimit(request);
}

export async function PUT(request: NextRequest) {
  return updateSessionWithRateLimit(request);
}

export async function DELETE(request: NextRequest) {
  return endSessionWithRateLimit(request);
}