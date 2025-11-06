// Request Size Limit Middleware
// Prevents DoS attacks and resource exhaustion by enforcing request size limits

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { securityMonitor } from '@/lib/security-monitoring';
import { createRequestContext, apiError, AppError } from '@/lib/apiResponse';
import { ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';

// Configuration for request size limits
export interface RequestSizeLimits {
  // General API requests (default)
  default: number;
  // Webhook payloads (smaller limit for security)
  webhook: number;
  // File upload endpoints (larger limit)
  upload: number;
}

// Default limits in bytes
const DEFAULT_LIMITS: RequestSizeLimits = {
  default: 10 * 1024 * 1024, // 10MB
  webhook: 1 * 1024 * 1024,  // 1MB
  upload: 50 * 1024 * 1024,  // 50MB
};

// Get configurable limits from environment
function getConfiguredLimits(): RequestSizeLimits {
  const limits = { ...DEFAULT_LIMITS };

  // Allow environment variable overrides
  if (process.env.MAX_REQUEST_SIZE_DEFAULT_MB) {
    const mb = parseInt(process.env.MAX_REQUEST_SIZE_DEFAULT_MB, 10);
    if (mb > 0 && mb <= 100) { // Max 100MB for safety
      limits.default = mb * 1024 * 1024;
    }
  }

  if (process.env.MAX_REQUEST_SIZE_WEBHOOK_MB) {
    const mb = parseInt(process.env.MAX_REQUEST_SIZE_WEBHOOK_MB, 10);
    if (mb > 0 && mb <= 10) { // Max 10MB for webhooks
      limits.webhook = mb * 1024 * 1024;
    }
  }

  if (process.env.MAX_REQUEST_SIZE_UPLOAD_MB) {
    const mb = parseInt(process.env.MAX_REQUEST_SIZE_UPLOAD_MB, 10);
    if (mb > 0 && mb <= 500) { // Max 500MB for uploads
      limits.upload = mb * 1024 * 1024;
    }
  }

  return limits;
}

// Determine request type based on path
function getRequestType(pathname: string): keyof RequestSizeLimits {
  if (pathname.includes('/webhook')) {
    return 'webhook';
  }

  if (pathname.includes('/upload') || pathname.includes('/import')) {
    return 'upload';
  }

  return 'default';
}

// Get content length from request headers
function getContentLength(request: NextRequest): number | null {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return null;

  const length = parseInt(contentLength, 10);
  return isNaN(length) ? null : length;
}

// Format bytes for logging
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
}

// Security logging for oversized requests
async function logSecurityEvent(
  request: NextRequest,
  requestSize: number,
  limit: number,
  requestType: keyof RequestSizeLimits
): Promise<void> {
  const context = createRequestContext(request);

  try {
    await securityMonitor.processSecurityEvent({
      category: 'intrusion',
      severity: 'medium',
      type: 'oversized_request',
      description: `Request size limit exceeded for ${requestType} endpoint`,
      ip: context.ip,
      userAgent: context.userAgent,
      endpoint: context.url,
      userId: context.userId,
      companyId: context.companyId,
      metadata: {
        requestId: context.requestId,
        requestSize: formatBytes(requestSize),
        limit: formatBytes(limit),
        requestType,
        method: context.method,
        pathname: new URL(request.url).pathname,
        contentType: request.headers.get('content-type'),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    // Don't let security monitoring errors break the middleware
    logger.error('Failed to log security event for oversized request', {
      error: error instanceof Error ? error.message : String(error),
      requestId: context.requestId
    });
  }

  // Also log to application logs
  logger.security('Request size limit exceeded', {
    category: 'dos_prevention',
    severity: 'medium',
    requestId: context.requestId,
    requestSize: formatBytes(requestSize),
    limit: formatBytes(limit),
    requestType,
    method: context.method,
    url: context.url,
    ip: context.ip,
    userAgent: context.userAgent,
    userId: context.userId,
    companyId: context.companyId
  });
}

// Check if request size is within limits
export async function checkRequestSize(request: NextRequest): Promise<NextResponse | null> {
  const limits = getConfiguredLimits();
  const pathname = new URL(request.url).pathname;
  const requestType = getRequestType(pathname);
  const limit = limits[requestType];

  // Get content length from header
  const contentLength = getContentLength(request);

  if (contentLength === null) {
    // If no content-length header, we can't check size upfront
    // This will be handled by streaming the request body if needed
    return null;
  }

  if (contentLength > limit) {
    // Log security event
    await logSecurityEvent(request, contentLength, limit, requestType);

    // Return 413 Payload Too Large error
    const context = createRequestContext(request);
    const error = new AppError(
      'Request payload too large',
      ErrorCode.BAD_REQUEST,
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      413,
      true,
      false,
      {
        limit: formatBytes(limit),
        actualSize: formatBytes(contentLength),
        requestType,
        suggestion: `Maximum allowed size for ${requestType} requests is ${formatBytes(limit)}`
      }
    );

    return apiError(error, context);
  }

  return null; // Request size is OK
}

// Middleware function for Next.js
export async function requestSizeLimitMiddleware(request: NextRequest): Promise<NextResponse | null> {
  // Only check size for API routes and methods that have bodies
  if (!request.nextUrl.pathname.startsWith('/api')) {
    return null;
  }

  // Skip size checking for safe methods without bodies
  const method = request.method;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return null;
  }

  // Check request size
  return await checkRequestSize(request);
}

// Utility function to get current limits (for configuration validation)
export function getCurrentLimits(): RequestSizeLimits {
  return getConfiguredLimits();
}

// Export limits for use in other parts of the application
export { DEFAULT_LIMITS };