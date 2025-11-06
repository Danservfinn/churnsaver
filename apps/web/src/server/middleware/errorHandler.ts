// Error handling middleware for Next.js API routes
// Provides consistent error handling, logging, and response formatting

import { NextRequest, NextResponse } from 'next/server';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity, RequestContext, createRequestContext, apiError, apiSuccess } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';
import { securityMonitor } from '@/lib/security-monitoring';

// Error handler configuration
export interface ErrorHandlerConfig {
  enableSecurityMonitoring?: boolean;
  enableDetailedLogging?: boolean;
  enablePerformanceMonitoring?: boolean;
  sanitizeErrors?: boolean;
  retryConfig?: {
    maxRetries: number;
    retryableCategories: ErrorCategory[];
    baseDelay: number;
  };
}

// Default configuration
const defaultConfig: ErrorHandlerConfig = {
  enableSecurityMonitoring: true,
  enableDetailedLogging: true,
  enablePerformanceMonitoring: true,
  sanitizeErrors: true,
  retryConfig: {
    maxRetries: 3,
    retryableCategories: [ErrorCategory.EXTERNAL_SERVICE, ErrorCategory.NETWORK, ErrorCategory.DATABASE],
    baseDelay: 1000
  }
};

// Enhanced error information for logging
export interface ErrorInfo {
  error: AppError;
  context: RequestContext;
  statusCode: number;
  isRetryable: boolean;
  processingTime: number;
  additionalContext?: Record<string, any>;
}

// Error handler class
export class ErrorHandler {
  private config: ErrorHandlerConfig;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // Main error handling middleware
  async handleRequest(
    request: NextRequest,
    handler: (request: NextRequest, context: RequestContext) => Promise<NextResponse>,
    additionalContext?: Record<string, any>
  ): Promise<NextResponse> {
    const context = createRequestContext(request);
    const startTime = Date.now();

    try {
      // Execute the request handler
      const response = await handler(request, context);

      // Log successful request if performance monitoring is enabled
      if (this.config.enablePerformanceMonitoring) {
        const processingTime = Date.now() - startTime;
        this.logSuccess(context, response.status, processingTime, additionalContext);
      }

      // Add request ID to response headers if not already present
      if (!response.headers.get('X-Request-ID')) {
        response.headers.set('X-Request-ID', context.requestId);
      }

      return response;

    } catch (error) {
      return this.handleError(error, context, startTime, additionalContext);
    }
  }

  // Handle individual errors
  private async handleError(
    error: unknown,
    context: RequestContext,
    startTime: number,
    additionalContext?: Record<string, any>
  ): Promise<NextResponse> {
    const processingTime = Date.now() - startTime;
    let appError: AppError;

    // Convert unknown error to AppError
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new AppError(
        error.message,
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.MEDIUM,
        500,
        false,
        undefined,
        { originalError: error.name, stack: error.stack }
      );
    } else {
      appError = new AppError(
        String(error),
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500,
        false,
        undefined,
        { originalError: String(error) }
      );
    }

    // Create error info for logging
    const errorInfo: ErrorInfo = {
      error: appError,
      context,
      statusCode: appError.statusCode,
      isRetryable: this.isRetryable(appError),
      processingTime,
      additionalContext
    };

    // Log the error
    await this.logError(errorInfo);

    // Report to security monitoring if enabled and error is security-related
    if (this.config.enableSecurityMonitoring && this.isSecurityError(appError)) {
      await this.reportSecurityError(appError, context);
    }

    // Sanitize error details if configured
    const sanitizedError = this.config.sanitizeErrors ? 
      this.sanitizeError(appError) : appError;

    // Create and return error response
    return apiError(sanitizedError, context);
  }

  // Determine if error is retryable
  private isRetryable(error: AppError): boolean {
    if (!error.retryable) return false;
    
    return this.config.retryConfig?.retryableCategories.includes(error.category) ?? false;
  }

  // Determine if error is security-related
  private isSecurityError(error: AppError): boolean {
    return error.category === ErrorCategory.SECURITY ||
           error.category === ErrorCategory.AUTHENTICATION ||
           error.category === ErrorCategory.AUTHORIZATION ||
           error.statusCode === 401 ||
           error.statusCode === 403;
  }

  // Log successful requests
  private logSuccess(
    context: RequestContext,
    statusCode: number,
    processingTime: number,
    additionalContext?: Record<string, any>
  ): void {
    logger.api('called', {
      endpoint: context.url,
      method: context.method,
      status_code: statusCode,
      company_id: context.companyId,
      user_id: context.userId,
      duration_ms: processingTime,
      error_category: undefined,
      ...additionalContext
    });
  }

  // Log errors with appropriate context
  private async logError(errorInfo: ErrorInfo): Promise<void> {
    const { error, context, statusCode, processingTime, additionalContext } = errorInfo;

    // Determine log level based on error severity
    const logLevel = error.severity === ErrorSeverity.CRITICAL || 
                    error.severity === ErrorSeverity.HIGH ? 'error' : 'warn';

    // Log the error
    logger[logLevel]('API request failed', {
      requestId: context.requestId,
      method: context.method,
      url: context.url,
      ip: context.ip,
      statusCode,
      error: error.message,
      errorCode: error.code,
      errorCategory: error.category,
      severity: error.severity,
      processingTimeMs: processingTime,
      isRetryable: errorInfo.isRetryable,
      company_id: context.companyId,
      user_id: context.userId,
      stack: error.stack || (error.details as any)?.stack,
      ...additionalContext
    });

    // Log to monitoring systems
    if (this.config.enableDetailedLogging) {
      logger.metric('api.error.count', 1, {
        error_code: error.code,
        error_category: error.category,
        severity: error.severity,
        status_code: statusCode.toString()
      });
    }
  }

  // Report security errors to monitoring
  private async reportSecurityError(error: AppError, context: RequestContext): Promise<void> {
    try {
      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: error.severity === ErrorSeverity.CRITICAL ? 'critical' : 'high',
        type: String(error.code).toLowerCase(),
        description: error.message,
        ip: context.ip,
        userAgent: context.userAgent,
        endpoint: context.url,
        userId: context.userId,
        companyId: context.companyId,
        metadata: {
          requestId: context.requestId,
          errorCode: error.code,
          errorCategory: error.category,
          method: context.method
        }
      });
    } catch (monitoringError) {
      // Don't let monitoring errors break the main flow
      logger.error('Failed to report security error', {
        error: monitoringError instanceof Error ? monitoringError.message : String(monitoringError),
        originalError: error.message,
        requestId: context.requestId
      });
    }
  }

  // Sanitize error details for client responses
  private sanitizeError(error: AppError): AppError {
    // Remove sensitive information from error details
    const sanitizedDetails = error.details ? { ...error.details } : {};
    
    // Remove potential sensitive fields
    const sensitiveFields = ['password', 'secret', 'token', 'key', 'signature', 'stack'];
    sensitiveFields.forEach(field => {
      if (sanitizedDetails && field in sanitizedDetails) {
        sanitizedDetails[field] = '[REDACTED]';
      }
    });

    // Create sanitized error
    return new AppError(
      error.message,
      error.code,
      error.category,
      error.severity,
      error.statusCode,
      error.isOperational,
      error.retryable,
      sanitizedDetails
    );
  }
}

// Default error handler instance
export const errorHandler = new ErrorHandler();

// Wrapper function for easy use in API routes
export function withErrorHandler(
  handler: (request: NextRequest, context: RequestContext) => Promise<NextResponse>,
  config?: Partial<ErrorHandlerConfig>
) {
  const handlerInstance = new ErrorHandler(config);
  
  return async (request: NextRequest): Promise<NextResponse> => {
    return handlerInstance.handleRequest(request, handler);
  };
}

// Specific error handlers for common patterns
export const handlers = {
  // Handler for authentication errors
  authError: (message: string = 'Authentication required') => 
    new AppError(message, ErrorCode.UNAUTHORIZED, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401),

  // Handler for authorization errors  
  authzError: (message: string = 'Access forbidden') =>
    new AppError(message, ErrorCode.FORBIDDEN, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403),

  // Handler for validation errors
  validationError: (message: string, details?: any) =>
    new AppError(message, ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, false, undefined, details),

  // Handler for database errors
  databaseError: (message: string = 'Database operation failed', details?: any) =>
    new AppError(message, ErrorCode.DATABASE_ERROR, ErrorCategory.DATABASE, ErrorSeverity.HIGH, 500, false, undefined, details),

  // Handler for external service errors
  externalServiceError: (service: string, message: string = 'External service error', details?: any) =>
    new AppError(`${service}: ${message}`, ErrorCode.BAD_GATEWAY, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, 500, true, false, { service, ...details }),

  // Handler for rate limiting
  rateLimitError: (retryAfter: number, details?: any) =>
    new AppError('Rate limit exceeded', ErrorCode.TOO_MANY_REQUESTS, ErrorCategory.RATE_LIMIT, ErrorSeverity.MEDIUM, 429, true, false, { retryAfter, ...details }),

  // Handler for request size limits
  payloadTooLargeError: (limit: string, actualSize: string, details?: any) =>
    new AppError('Request payload too large', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 413, false, undefined, {
      limit,
      actualSize,
      suggestion: `Maximum allowed size is ${limit}`,
      ...details
    })
};

// Utility function to create standardized success responses
export function createSuccessResponse<T>(
  data: T,
  context: RequestContext,
  statusCode: number = 200
): NextResponse {
  return apiSuccess(data, context);
}

// Utility function to create standardized error responses
export function createErrorResponse(
  error: AppError | string,
  context: RequestContext,
  details?: any
): NextResponse {
  if (typeof error === 'string') {
    const appError = new AppError(error, ErrorCode.INTERNAL_SERVER_ERROR, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, 500, false, undefined, details);
    return apiError(appError, context);
  }
  return apiError(error, context);
}