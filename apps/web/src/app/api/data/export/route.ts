// Data Export API Endpoint
// POST /api/data/export - Request data export
// GET /api/data/export - List export requests

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { apiSuccess, apiError, createRequestContext, errors } from '@/lib/apiResponse';
import {
  createExportRequest,
  listExportRequests,
  validateExportRequest,
  DataExportError,
  CreateExportRequestRequest,
  ExportFormat,
  ExportDataType
} from '@/server/services/dataExport';

/**
 * POST /api/data/export - Request data export
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const context = createRequestContext(request);

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const sdkContext = await getRequestContextSDK(request);
    const companyId = sdkContext.companyId;
    const userId = sdkContext.userId;

    // Enforce authentication in production
    if (process.env.NODE_ENV === 'production' && !sdkContext.isAuthenticated) {
      logger.security('Unauthorized request to data export - missing valid auth token', {
        requestId: context.requestId,
        ip: context.ip
      });
      return apiError(
        errors.unauthorized('Authentication required'),
        context
      );
    }

    // Apply rate limiting for data export requests
    const rateLimitResult = await checkRateLimit(
      `data_export:${userId}:${companyId}`,
      RATE_LIMIT_CONFIGS.dataExport
    );

    if (!rateLimitResult.allowed) {
      logger.security('Data export rate limit exceeded', {
        requestId: context.requestId,
        userId,
        companyId,
        ip: context.ip
      });
      return apiError(
        errors.tooManyRequests('Rate limit exceeded', {
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString()
        }),
        context
      );
    }

    // Parse request body
    const body = await request.json();
    const exportRequest: CreateExportRequestRequest = {
      export_format: body.export_format,
      data_types: body.data_types,
      date_range_start: body.date_range_start ? new Date(body.date_range_start) : undefined,
      date_range_end: body.date_range_end ? new Date(body.date_range_end) : undefined,
      metadata: body.metadata || {}
    };

    // Validate request parameters
    const validation = validateExportRequest(exportRequest);
    if (!validation.valid) {
      logger.warn('Invalid export request', {
        requestId: context.requestId,
        userId,
        companyId,
        errors: validation.errors,
        warnings: validation.warnings
      });
      return apiError(
        errors.validationError('Invalid export request', {
          errors: validation.errors,
          warnings: validation.warnings
        }),
        context
      );
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      logger.warn('Export request warnings', {
        requestId: context.requestId,
        userId,
        companyId,
        warnings: validation.warnings
      });
    }

    // Create export request
    const result = await createExportRequest(
      userId,
      companyId,
      exportRequest,
      context.ip,
      context.userAgent
    );

    logger.info('Data export request created successfully', {
      requestId: context.requestId,
      userId,
      companyId,
      exportRequestId: result.request_id,
      exportFormat: exportRequest.export_format,
      dataTypes: exportRequest.data_types,
      processingTimeMs: Date.now() - startTime
    });

    return apiSuccess(result, context);

  } catch (error) {
    if (error instanceof DataExportError) {
      logger.error('Data export request failed', {
        requestId: context.requestId,
        error: error.message,
        code: error.code,
        category: error.category,
        processingTimeMs: Date.now() - startTime
      });

      // Map error codes to appropriate API errors
      let errorObj;
      switch (error.code) {
        case 'INVALID_REQUEST':
        errorObj = errors.validationError(error.message, error.details);
          break;
        case 'RATE_LIMIT_EXCEEDED':
          errorObj = errors.tooManyRequests(error.message, error.details);
          break;
        case 'CREATION_FAILED':
          errorObj = errors.internalServerError(error.message, error.details);
          break;
        default:
          errorObj = errors.internalServerError('Failed to create export request', error.details);
      }

      return apiError(errorObj, context);
    }

    logger.error('Unexpected error in data export request', {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return apiError(
      errors.internalServerError('Internal server error'),
      context
    );
  }
}

/**
 * GET /api/data/export - List export requests
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const context = createRequestContext(request);

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const sdkContext = await getRequestContextSDK(request);
    const companyId = sdkContext.companyId;
    const userId = sdkContext.userId;

    // Enforce authentication in production
    if (process.env.NODE_ENV === 'production' && !sdkContext.isAuthenticated) {
      logger.security('Unauthorized request to list data exports - missing valid auth token', {
        requestId: context.requestId,
        ip: context.ip
      });
      return apiError(
        errors.unauthorized('Authentication required'),
        context
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100 per page
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const status = searchParams.get('status');

    // List export requests
    const result = await listExportRequests(userId, companyId, limit, offset);

    // Filter by status if provided
    let filteredRequests = result.requests;
    if (status) {
      filteredRequests = result.requests.filter(req => req.status === status);
    }

    logger.info('Data export requests listed successfully', {
      requestId: context.requestId,
      userId,
      companyId,
      totalRequests: result.total,
      filteredRequests: filteredRequests.length,
      limit,
      offset,
      status,
      processingTimeMs: Date.now() - startTime
    });

    return apiSuccess({
      requests: filteredRequests,
      total: filteredRequests.length,
      page: Math.floor(offset / limit) + 1,
      limit,
      hasMore: offset + filteredRequests.length < result.total
    }, context);

  } catch (error) {
    if (error instanceof DataExportError) {
      logger.error('Failed to list export requests', {
        requestId: context.requestId,
        error: error.message,
        code: error.code,
        category: error.category,
        processingTimeMs: Date.now() - startTime
      });

      // Map error codes to appropriate API errors
      let errorObj;
      switch (error.code) {
        case 'LIST_FAILED':
          errorObj = errors.internalServerError(error.message, error.details);
          break;
        default:
          errorObj = errors.internalServerError('Failed to list export requests', error.details);
      }

      return apiError(errorObj, context);
    }

    logger.error('Unexpected error in listing export requests', {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return apiError(
      errors.internalServerError('Internal server error'),
      context
    );
  }
}