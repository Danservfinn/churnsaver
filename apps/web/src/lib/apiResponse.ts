import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Error categories for consistent classification
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  DATABASE = 'database',
  EXTERNAL_SERVICE = 'external_service',
  NETWORK = 'network',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  SECURITY = 'security',
  UNKNOWN = 'unknown'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Standard error codes
export enum ErrorCode {
  // Validation errors (400)
  BAD_REQUEST = 'BAD_REQUEST',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  MISSING_TOKEN = 'MISSING_TOKEN',
  
  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Not found errors (404)
  NOT_FOUND = 'NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  
  // Method errors (405)
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  
  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  
  // Rate limiting errors (422)
  RATE_LIMITED = 'RATE_LIMITED',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  
  // Server errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  
  // Service unavailable (503)
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  
  // Security errors
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY'
}

// Enhanced error interface
export interface StandardError {
  error: string;
  code: ErrorCode;
  details?: any;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: string;
  requestId: string;
  retryable?: boolean;
  retryAfter?: number;
}

// Enhanced API response interface
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: StandardError;
  meta?: {
    requestId: string;
    timestamp: string;
    version: string;
    processingTimeMs?: number;
  };
}

// Request context interface
export interface RequestContext {
  requestId: string;
  startTime: number;
  method: string;
  url: string;
  ip?: string;
  userAgent?: string;
  companyId?: string;
  userId?: string;
}

// Error class for structured error handling
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly retryAfter?: number;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    statusCode: number = 500,
    retryable: boolean = false,
    retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON(): StandardError {
    return {
      error: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      timestamp: new Date().toISOString(),
      requestId: this.context?.requestId || 'unknown',
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      details: this.context
    };
  }
}

// Create request context
export function createRequestContext(request: NextRequest): RequestContext {
  return {
    requestId: randomUUID(),
    startTime: Date.now(),
    method: request.method,
    url: request.url,
    ip: request.headers.get('x-forwarded-for') ||
        request.headers.get('x-real-ip') ||
        'unknown',
    userAgent: request.headers.get('user-agent')?.substring(0, 200) || 'unknown',
    companyId: request.headers.get('x-company-id') || undefined,
    userId: request.headers.get('x-user-id') || undefined
  };
}

// Helper to build AppError from unknown input
function buildAppErrorFromUnknown(u: unknown, details?: any): AppError {
  if (u instanceof AppError) {
    return u;
  } else if (u instanceof Error) {
    return new AppError(
      u.message,
      ErrorCode.INTERNAL_SERVER_ERROR,
      ErrorCategory.SYSTEM,
      ErrorSeverity.MEDIUM,
      500,
      false,
      undefined,
      { originalError: u.name, stack: u.stack, ...details }
    );
  } else {
    return new AppError(
      String(u),
      ErrorCode.INTERNAL_SERVER_ERROR,
      ErrorCategory.SYSTEM,
      ErrorSeverity.MEDIUM,
      500,
      false,
      undefined,
      details
    );
  }
}

// Helper to get app version
function getAppVersion(): string {
  return process.env.npm_package_version || '1.0.0';
}

// Creates a standardized error response
export function apiError(
  error: AppError | Error | string,
  context?: RequestContext,
  details?: any
): NextResponse<ApiResponse> {
  const appError = buildAppErrorFromUnknown(error, details);
  const standardError = appError.toJSON();
  const statusCode = appError.statusCode;

  // Add request context if provided
  if (context) {
    standardError.requestId = context.requestId;
  }

  const response: ApiResponse = {
    success: false,
    error: standardError,
    meta: {
      requestId: standardError.requestId,
      timestamp: standardError.timestamp,
      version: getAppVersion(),
      processingTimeMs: context ? Date.now() - context.startTime : undefined
    }
  };

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'X-Request-ID': standardError.requestId,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

// Creates a standardized success response
export function apiSuccess<T>(
  data: T,
  context?: RequestContext,
  statusCode: number = 200
): NextResponse<ApiResponse<T>> {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: context?.requestId || 'unknown',
      timestamp: new Date().toISOString(),
      version: getAppVersion(),
      processingTimeMs: context ? Date.now() - context.startTime : undefined
    }
  };

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'X-Request-ID': context?.requestId || 'unknown',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

// Common error creators with proper categorization
export const errors = {
  // Validation errors (400)
  badRequest: (message: string, details?: any) =>
    new AppError(message, ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, false, undefined, details),
  
  invalidInput: (message: string, details?: any) =>
    new AppError(message, ErrorCode.INVALID_INPUT, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, false, undefined, details),
  
  missingRequiredField: (field: string, details?: any) =>
    new AppError(`Missing required field: ${field}`, ErrorCode.MISSING_REQUIRED_FIELD, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 400, false, undefined, { field, ...details }),

  // Authentication errors (401)
  unauthorized: (message: string = 'Authentication required', details?: any) =>
    new AppError(message, ErrorCode.UNAUTHORIZED, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, false, undefined, details),
  
  invalidToken: (details?: any) =>
    new AppError('Invalid authentication token', ErrorCode.INVALID_TOKEN, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, false, undefined, details),
  
  tokenExpired: (details?: any) =>
    new AppError('Authentication token has expired', ErrorCode.TOKEN_EXPIRED, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, false, undefined, details),

  // Authorization errors (403)
  forbidden: (message: string = 'Access forbidden', details?: any) =>
    new AppError(message, ErrorCode.FORBIDDEN, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403, false, undefined, details),

  // Not found errors (404)
  notFound: (resource: string = 'Resource', details?: any) =>
    new AppError(`${resource} not found`, ErrorCode.NOT_FOUND, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.LOW, 404, false, undefined, details),

  // Method errors (405)
  methodNotAllowed: (method: string, details?: any) =>
    new AppError(`Method ${method} not allowed`, ErrorCode.METHOD_NOT_ALLOWED, ErrorCategory.VALIDATION, ErrorSeverity.LOW, 405, false, undefined, details),

  // Conflict errors (409)
  conflict: (message: string, details?: any) =>
    new AppError(message, ErrorCode.CONFLICT, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, 409, false, undefined, details),

  // Rate limiting errors (422)
  rateLimited: (retryAfter: number, details?: any) =>
    new AppError('Rate limit exceeded', ErrorCode.RATE_LIMITED, ErrorCategory.RATE_LIMIT, ErrorSeverity.MEDIUM, 422, true, retryAfter, details),
  
  unprocessableEntity: (message: string, details?: any) =>
    new AppError(message, ErrorCode.UNPROCESSABLE_ENTITY, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 422, false, undefined, details),

  // Server errors (500)
  internalServerError: (message: string = 'Internal server error', details?: any) =>
    new AppError(message, ErrorCode.INTERNAL_SERVER_ERROR, ErrorCategory.SYSTEM, ErrorSeverity.HIGH, 500, false, undefined, details),
  
  databaseError: (message: string = 'Database operation failed', details?: any) =>
    new AppError(message, ErrorCode.DATABASE_ERROR, ErrorCategory.DATABASE, ErrorSeverity.HIGH, 500, false, undefined, details),
  
  externalServiceError: (service: string, message: string = 'External service error', details?: any) =>
    new AppError(`${service}: ${message}`, ErrorCode.EXTERNAL_SERVICE_ERROR, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, 500, true, undefined, { service, ...details }),
  
  networkError: (message: string = 'Network error', details?: any) =>
    new AppError(message, ErrorCode.NETWORK_ERROR, ErrorCategory.NETWORK, ErrorSeverity.HIGH, 500, true, undefined, details),

  // Service unavailable (503)
  serviceUnavailable: (message: string = 'Service temporarily unavailable', details?: any) =>
    new AppError(message, ErrorCode.SERVICE_UNAVAILABLE, ErrorCategory.SYSTEM, ErrorSeverity.HIGH, 503, true, 30, details),
  
  maintenanceMode: (details?: any) =>
    new AppError('Service is under maintenance', ErrorCode.MAINTENANCE_MODE, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, 503, true, 300, details),

  // Security errors
  securityViolation: (message: string, details?: any) =>
    new AppError(message, ErrorCode.SECURITY_VIOLATION, ErrorCategory.SECURITY, ErrorSeverity.CRITICAL, 403, false, undefined, details),
  
  suspiciousActivity: (message: string, details?: any) =>
    new AppError(message, ErrorCode.SUSPICIOUS_ACTIVITY, ErrorCategory.SECURITY, ErrorSeverity.HIGH, 403, false, undefined, details)
};

// Legacy compatibility functions for existing API endpoints
export function createLegacyErrorResponse(error: AppError, context?: RequestContext): NextResponse {
  return apiError(error, context);
}

export function createLegacySuccessResponse<T>(data: T, context?: RequestContext): NextResponse<ApiResponse<T>> {
  return apiSuccess(data, context);
}

// Legacy interface for backward compatibility
export interface ApiError {
  error: string;
  code?: string;
  details?: any;
}

// Legacy wrapper functions to maintain compatibility with existing code
// These functions convert AppError instances to NextResponse objects
export const legacyErrors = {
  badRequest: (message: string, details?: any) => apiError(errors.badRequest(message, details)),
  unauthorized: (message: string = 'Unauthorized', details?: any) => apiError(errors.unauthorized(message, details)),
  forbidden: (message: string = 'Forbidden', details?: any) => apiError(errors.forbidden(message, details)),
  notFound: (message: string = 'Not Found', details?: any) => apiError(errors.notFound(message, details)),
  methodNotAllowed: (message: string = 'Method Not Allowed', details?: any) => apiError(errors.methodNotAllowed('UNKNOWN', details)),
  conflict: (message: string = 'Conflict', details?: any) => apiError(errors.conflict(message, details)),
  unprocessableEntity: (message: string = 'Unprocessable Entity', details?: any) => apiError(errors.unprocessableEntity(message, details)),
  internalServerError: (message: string = 'Internal Server Error', details?: any) => apiError(errors.internalServerError(message, details)),
  serviceUnavailable: (message: string = 'Service Unavailable', details?: any) => apiError(errors.serviceUnavailable(message, details)),
};

// Override the existing errors export to maintain backward compatibility
// while providing the new enhanced error handling
export const errorResponses = {
  ...errors,
  // Legacy wrappers that return NextResponse objects
  badRequestResponse: (message: string, details?: any) => apiError(errors.badRequest(message, details)),
  unauthorizedResponse: (message: string = 'Unauthorized', details?: any) => apiError(errors.unauthorized(message, details)),
  forbiddenResponse: (message: string = 'Forbidden', details?: any) => apiError(errors.forbidden(message, details)),
  notFoundResponse: (message: string = 'Not Found', details?: any) => apiError(errors.notFound(message, details)),
  methodNotAllowedResponse: (method: string, details?: any) => apiError(errors.methodNotAllowed(method, details)),
  conflictResponse: (message: string, details?: any) => apiError(errors.conflict(message, details)),
  unprocessableEntityResponse: (message: string, details?: any) => apiError(errors.unprocessableEntity(message, details)),
  internalServerErrorResponse: (message: string = 'Internal Server Error', details?: any) => apiError(errors.internalServerError(message, details)),
  serviceUnavailableResponse: (message: string = 'Service Unavailable', details?: any) => apiError(errors.serviceUnavailable(message, details)),
};