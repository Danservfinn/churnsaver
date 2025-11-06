// Export File Download API Endpoint
// GET /api/data/export/[id]/download - Download export file

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { apiError, createRequestContext, errors } from '@/lib/apiResponse';
import {
  getExportFile,
  DataExportError
} from '@/server/services/dataExport';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/data/export/[id]/download - Download export file
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
      logger.security('Unauthorized request to download export file - missing valid auth token', {
        requestId: context.requestId,
        ip: context.ip,
        exportId: id
      });
      return apiError(
        errors.unauthorized('Authentication required'),
        context
      );
    }

    // Apply rate limiting for file downloads
    const rateLimitResult = await checkRateLimit(
      `data_export_download:${userId}:${id}`,
      RATE_LIMIT_CONFIGS.dataExportDownload
    );

    if (!rateLimitResult.allowed) {
      logger.security('Data export download rate limit exceeded', {
        requestId: context.requestId,
        userId,
        companyId,
        exportId: id,
        ip: context.ip
      });
      return apiError(
        errors.tooManyRequests('Download rate limit exceeded', {
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString()
        }),
        context
      );
    }

    // Get export file
    const exportFile = await getExportFile(id, userId, companyId, context.ip);

    if (!exportFile) {
      logger.warn('Export file not found or not accessible', {
        requestId: context.requestId,
        userId,
        companyId,
        exportId: id
      });
      return apiError(
        errors.notFound('Export file not found or not accessible'),
        context
      );
    }

    logger.info('Export file downloaded successfully', {
      requestId: context.requestId,
      userId,
      companyId,
      exportId: id,
      fileId: exportFile.file_id,
      filename: exportFile.filename,
      fileSizeBytes: exportFile.file_size_bytes,
      downloadCount: exportFile.download_count,
      maxDownloads: exportFile.max_downloads,
      processingTimeMs: Date.now() - startTime
    });

    // Return file as download
    return new NextResponse(exportFile.file_data as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': exportFile.mime_type,
        'Content-Disposition': `attachment; filename="${exportFile.filename}"`,
        'Content-Length': exportFile.file_size_bytes.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Export-File-ID': exportFile.file_id,
        'X-Export-Request-ID': id,
        'X-Download-Count': exportFile.download_count.toString(),
        'X-Max-Downloads': exportFile.max_downloads.toString(),
        'X-Expires-At': exportFile.expires_at.toISOString()
      }
    });

  } catch (error) {
    if (error instanceof DataExportError) {
      logger.error('Failed to download export file', {
        requestId: context.requestId,
        exportId: id,
        error: error.message,
        code: error.code,
        category: error.category,
        processingTimeMs: Date.now() - startTime
      });

      // Map error codes to appropriate API errors
      let apiErrorResponse;
      switch (error.code) {
        case 'NOT_FOUND':
        case 'FILE_NOT_FOUND':
          apiErrorResponse = errors.notFound(error.message, error.details);
          break;
        case 'NOT_COMPLETED':
          apiErrorResponse = errors.badRequest(error.message, error.details);
          break;
        case 'EXPIRED':
          apiErrorResponse = errors.badRequest(error.message, error.details);
          break;
        case 'DOWNLOAD_LIMIT_EXCEEDED':
          apiErrorResponse = errors.badRequest(error.message, error.details);
          break;
        case 'DOWNLOAD_FAILED':
          apiErrorResponse = errors.internalServerError(error.message, error.details);
          break;
        default:
          apiErrorResponse = errors.internalServerError('Failed to download export file', error.details);
      }

      return apiError(apiErrorResponse, context);
    }

    logger.error('Unexpected error in downloading export file', {
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