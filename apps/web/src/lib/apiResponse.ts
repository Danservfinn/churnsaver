// API Response utilities
// Provides standardized response handling and error categorization

import { NextResponse } from 'next/server';

/**
 * Error codes for API responses
 */
export enum ErrorCode {
  // Success codes
  SUCCESS = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,

  // Client error codes
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,

  // Server error codes
  INTERNAL_SERVER_ERROR = 500,
  NOT_IMPLEMENTED = 501,
  BAD_GATEWAY = 502,
  SERVICE_UNAVAILABLE = 503,
  GATEWAY_TIMEOUT = 504,

  // Authentication specific codes
  INVALID_TOKEN = 401,
  TOKEN_EXPIRED = 401,
  INSUFFICIENT_PERMISSIONS = 403,

  // Validation specific codes
  VALIDATION_ERROR = 400,
  MISSING_REQUIRED_FIELD = 400,
  INVALID_FORMAT = 400
}

/**
 * Error categories for logging and monitoring
 */
export enum ErrorCategory {
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
  SECURITY = 'security',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Application error class
 */
export class AppError extends Error {
  public code: ErrorCode;
  public category: ErrorCategory;
  public severity: ErrorSeverity;
  public statusCode: number;
  public isOperational: boolean;
  public retryable: boolean;
  public details?: any;

  constructor(
    message: string,
    code: ErrorCode,
    category: ErrorCategory,
    severity: ErrorSeverity,
    statusCode: number = 500,
    isOperational: boolean = true,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.code = code;
    this.category = category;
    this.severity = severity;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.retryable = retryable;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      retryable: this.retryable,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * API response interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: AppError;
  meta?: {
    requestId?: string;
    timestamp?: string;
    version?: string;
    pagination?: {
      page?: number;
      limit?: number;
      total?: number;
      totalPages?: number;
    };
  };
}

/**
 * Request context for API calls
 */
export interface RequestContext {
  requestId: string;
  startTime: number;
  method: string;
  url: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Create request context
 */
export function createRequestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  
  return {
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    startTime: Date.now(),
    method: request.method,
    url: url.pathname + url.search,
    ip: request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown'
  };
}

/**
 * Create successful API response
 */
export function apiSuccess<T = any>(
  data: T,
  context?: RequestContext,
  meta?: Partial<ApiResponse<T>['meta']>
): NextResponse<ApiResponse<T>> {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: context?.requestId,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      ...meta
    }
  };

  return NextResponse.json(response);
}

/**
 * Create error API response
 */
export function apiError(
  error: AppError,
  context?: RequestContext
): NextResponse<ApiResponse<null>> {
  const response: ApiResponse<null> = {
    success: false,
    error,
    meta: {
      requestId: context?.requestId,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };

  return NextResponse.json(response, { 
    status: error.statusCode 
  });
}

/**
 * Error factory functions
 */
export const errors = {
  badRequest: (message: string = 'Bad request', details?: any) => 
    new AppError(message, ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 400, true, false, details),
  
  unauthorized: (message: string = 'Unauthorized', details?: any) => 
    new AppError(message, ErrorCode.UNAUTHORIZED, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, true, false, details),
  
  forbidden: (message: string = 'Forbidden', details?: any) => 
    new AppError(message, ErrorCode.FORBIDDEN, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403, true, false, details),
  
  notFound: (message: string = 'Not found', details?: any) => 
    new AppError(message, ErrorCode.NOT_FOUND, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, 404, true, false, details),
  
  methodNotAllowed: (message: string = 'Method not allowed', details?: any) => 
    new AppError(message, ErrorCode.METHOD_NOT_ALLOWED, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 405, true, false, details),
  
  conflict: (message: string = 'Conflict', details?: any) => 
    new AppError(message, ErrorCode.CONFLICT, ErrorCategory.BUSINESS_LOGIC, ErrorSeverity.MEDIUM, 409, true, false, details),
  
  unprocessableEntity: (message: string = 'Unprocessable entity', details?: any) => 
    new AppError(message, ErrorCode.UNPROCESSABLE_ENTITY, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 422, true, false, details),
  
  tooManyRequests: (message: string = 'Too many requests', details?: any) => 
    new AppError(message, ErrorCode.TOO_MANY_REQUESTS, ErrorCategory.RATE_LIMIT, ErrorSeverity.HIGH, 429, true, false, details),
  
  internalServerError: (message: string = 'Internal server error', details?: any) => 
    new AppError(message, ErrorCode.INTERNAL_SERVER_ERROR, ErrorCategory.SYSTEM, ErrorSeverity.HIGH, 500, false, true, details),
  
  notImplemented: (message: string = 'Not implemented', details?: any) => 
    new AppError(message, ErrorCode.NOT_IMPLEMENTED, ErrorCategory.SYSTEM, ErrorSeverity.MEDIUM, 501, true, false, details),
  
  badGateway: (message: string = 'Bad gateway', details?: any) => 
    new AppError(message, ErrorCode.BAD_GATEWAY, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, 502, true, false, details),
  
  serviceUnavailable: (message: string = 'Service unavailable', details?: any) => 
    new AppError(message, ErrorCode.SERVICE_UNAVAILABLE, ErrorCategory.EXTERNAL_SERVICE, ErrorSeverity.HIGH, 503, true, false, details),
  
  gatewayTimeout: (message: string = 'Gateway timeout', details?: any) => 
    new AppError(message, ErrorCode.GATEWAY_TIMEOUT, ErrorCategory.NETWORK, ErrorSeverity.MEDIUM, 504, true, false, details),
  
  invalidToken: (message: string = 'Invalid token', details?: any) => 
    new AppError(message, ErrorCode.INVALID_TOKEN, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, true, false, details),
  
  tokenExpired: (message: string = 'Token expired', details?: any) => 
    new AppError(message, ErrorCode.TOKEN_EXPIRED, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM, 401, true, false, details),
  
  insufficientPermissions: (message: string = 'Insufficient permissions', details?: any) => 
    new AppError(message, ErrorCode.INSUFFICIENT_PERMISSIONS, ErrorCategory.AUTHORIZATION, ErrorSeverity.MEDIUM, 403, true, false, details),
  
  validationError: (message: string = 'Validation error', details?: any) => 
    new AppError(message, ErrorCode.VALIDATION_ERROR, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 400, true, false, details),
  
  missingRequiredField: (message: string = 'Missing required field', details?: any) => 
    new AppError(message, ErrorCode.MISSING_REQUIRED_FIELD, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 400, true, false, details),
  
  invalidFormat: (message: string = 'Invalid format', details?: any) => 
    new AppError(message, ErrorCode.INVALID_FORMAT, ErrorCategory.VALIDATION, ErrorSeverity.MEDIUM, 400, true, false, details),
  
  rateLimited: (message: string = 'Rate limited', details?: any) => 
    new AppError(message, ErrorCode.TOO_MANY_REQUESTS, ErrorCategory.RATE_LIMIT, ErrorSeverity.HIGH, 429, true, false, details)
};