// Individual Export Operations API Endpoint
// GET /api/data/export/[id]/download - Download export file
// DELETE /api/data/export/[id] - Delete export request

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { apiSuccess, apiError, createRequestContext, errors } from '@/lib/apiResponse';
import {
  getExportRequest,
  getExportFile,
  deleteExportRequest,
  DataExportError,
  ExportStatus
} from '@/server/services/dataExport';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/data/export/[id] - Get export request details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const startTime = Date.now();
  const context = createRequestContext(request);
  const { id } = await params;

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const sdkContext = await getRequestContextSDK(request);
    const companyId = sdkContext.companyId;
    const userId = sdkContext.userId;

    // Enforce authentication in production
    if (process.env.NODE_ENV === 'production' && !sdkContext.isAuthenticated) {
      logger.security('Unauthorized request to get export details - missing valid auth token', {
        requestId: context.requestId,
        ip: context.ip,
        exportId: id
      });
      return apiError(
        errors.unauthorized('Authentication required'),
        context
      );
    }

    // Get export request
    const exportRequest = await getExportRequest(id, userId, companyId);

    if (!exportRequest) {
      logger.warn('Export request not found', {
        requestId: context.requestId,
        userId,
        companyId,
        exportId: id
      });
      return apiError(
        errors.notFound('Export request not found'),
        context
      );
    }

    logger.info('Export request details retrieved successfully', {
      requestId: context.requestId,
      userId,
      companyId,
      exportId: id,
      exportStatus: exportRequest.status,
      processingTimeMs: Date.now() - startTime
    });

    return apiSuccess(exportRequest, context);

  } catch (error) {
    if (error instanceof DataExportError) {
      logger.error('Failed to get export request details', {
        requestId: context.requestId,
        exportId: id,
        error: error.message,
        code: error.code,
        category: error.category,
        processingTimeMs: Date.now() - startTime
      });

      // Map error codes to appropriate API errors
      let errorObj;
      switch (error.code) {
        case 'NOT_FOUND':
          errorObj = errors.notFound(error.message, error.details);
          break;
        case 'GET_FAILED':
          errorObj = errors.internalServerError(error.message, error.details);
          break;
        default:
          errorObj = errors.internalServerError('Failed to get export request', error.details);
      }

      return apiError(errorObj, context);
    }

    logger.error('Unexpected error in getting export request', {
      requestId: context.requestId,
      exportId: id,
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
 * DELETE /api/data/export/[id] - Delete export request
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const startTime = Date.now();
  const context = createRequestContext(request);
  const { id } = await params;

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const sdkContext = await getRequestContextSDK(request);
    const companyId = sdkContext.companyId;
    const userId = sdkContext.userId;

    // Enforce authentication in production
    if (process.env.NODE_ENV === 'production' && !sdkContext.isAuthenticated) {
      logger.security('Unauthorized request to delete export - missing valid auth token', {
        requestId: context.requestId,
        ip: context.ip,
        exportId: id
      });
      return apiError(
        errors.unauthorized('Authentication required'),
        context
      );
    }

    // Apply rate limiting for delete operations
    const rateLimitResult = await checkRateLimit(
      `data_export_delete:${userId}`,
      RATE_LIMIT_CONFIGS.dataExportDelete
    );

    if (!rateLimitResult.allowed) {
      logger.security('Data export delete rate limit exceeded', {
        requestId: context.requestId,
        userId,
        companyId,
        exportId: id,
        ip: context.ip
      });
      return apiError(
        errors.tooManyRequests('Delete rate limit exceeded', {
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString()
        }),
        context
      );
    }

    // Delete export request
    const deleted = await deleteExportRequest(id, userId, companyId);

    if (!deleted) {
      logger.warn('Export request not found for deletion', {
        requestId: context.requestId,
        userId,
        companyId,
        exportId: id
      });
      return apiError(
        errors.notFound('Export request not found'),
        context
      );
    }

    logger.info('Export request deleted successfully', {
      requestId: context.requestId,
      userId,
      companyId,
      exportId: id,
      processingTimeMs: Date.now() - startTime
    });

    return apiSuccess(
      {
        message: 'Export request deleted successfully',
        export_id: id
      },
      context
    );

  } catch (error) {
    if (error instanceof DataExportError) {
      logger.error('Failed to delete export request', {
        requestId: context.requestId,
        exportId: id,
        error: error.message,
        code: error.code,
        category: error.category,
        processingTimeMs: Date.now() - startTime
      });

      // Map error codes to appropriate API errors
      let errorObj;
      switch (error.code) {
        case 'DELETE_FAILED':
          errorObj = errors.internalServerError(error.message, error.details);
          break;
        default:
          errorObj = errors.internalServerError('Failed to delete export request', error.details);
      }

      return apiError(errorObj, context);
    }

    logger.error('Unexpected error in deleting export request', {
      requestId: context.requestId,
      exportId: id,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return apiError(
      errors.internalServerError('Internal server error'),
      context
    );
  }
}
