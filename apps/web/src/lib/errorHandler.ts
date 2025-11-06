// Standardized Error Handling Utility
// Provides consistent error handling, logging, and response formatting across the application

import { randomUUID } from 'crypto';
import { logger } from './logger';
import { env } from './env';
import { AppError as AppErrorClass, ErrorCode as ApiErrorCode, ErrorCategory as ApiErrorCategory, ErrorSeverity as ApiErrorSeverity } from './apiResponse';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Error categories for better organization and monitoring
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  DATABASE = 'database',
  EXTERNAL_API = 'external_api',
  NETWORK = 'network',
  CONFIGURATION = 'configuration',
  BUSINESS_LOGIC = 'business_logic',
  SECURITY = 'security',
  PERFORMANCE = 'performance'
}

// Standardized error codes
export enum ErrorCode {
  // Authentication & Authorization
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Validation
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',

  // Database
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR = 'DATABASE_QUERY_ERROR',
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD = 'DUPLICATE_RECORD',

  // External APIs
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  EXTERNAL_API_TIMEOUT = 'EXTERNAL_API_TIMEOUT',
  EXTERNAL_API_RATE_LIMIT = 'EXTERNAL_API_RATE_LIMIT',

  // Business Logic
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  OPERATION_NOT_ALLOWED = 'OPERATION_NOT_ALLOWED',

  // System
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

// Use AppError class from apiResponse
type AppError = AppErrorClass;

// Error response interface for API responses
export interface ErrorResponse {
  error: {
    code: ErrorCode | ApiErrorCode | string | number;
    message: string;
    correlationId: string;
    details?: Record<string, any>;
  };
}

// Error handler configuration
interface ErrorHandlerConfig {
  includeStackTrace: boolean;
  includeDetails: boolean;
  logLevel: 'error' | 'warn' | 'info';
}

// Default configuration based on environment
const getDefaultConfig = (): ErrorHandlerConfig => ({
  includeStackTrace: env.NODE_ENV === 'development',
  includeDetails: env.NODE_ENV === 'development',
  logLevel: 'error'
});

/**
 * Main ErrorHandler class for standardized error handling
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  /**
   * Create a standardized AppError from various error sources
   */
  createError(
    code: ErrorCode,
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    details?: Record<string, any>,
    cause?: Error
  ): AppError {
    const statusCode = this.getStatusCodeForErrorCode(code);
    const correlationId = randomUUID();
    // Map local ErrorCode strings to apiResponse ErrorCode numbers
    const apiCode = this.mapErrorCodeToApiErrorCode(code);
    // Map local ErrorCategory to apiResponse ErrorCategory
    const apiCategory = this.mapErrorCategoryToApiErrorCategory(category);
    // Map local ErrorSeverity to apiResponse ErrorSeverity
    const apiSeverity = this.mapErrorSeverityToApiErrorSeverity(severity);
    const error = new AppErrorClass(
      message,
      apiCode,
      apiCategory,
      apiSeverity,
      statusCode,
      true,
      false,
      { ...details, correlationId, cause, timestamp: new Date() }
    );
    // Add correlationId and timestamp as properties for compatibility
    (error as any).correlationId = correlationId;
    (error as any).timestamp = new Date();
    return error;
  }

  private mapErrorCodeToApiErrorCode(code: ErrorCode): ApiErrorCode {
    const codeMap: Record<string, ApiErrorCode> = {
      'INVALID_CREDENTIALS': ApiErrorCode.INVALID_TOKEN,
      'UNAUTHORIZED_ACCESS': ApiErrorCode.UNAUTHORIZED,
      'TOKEN_EXPIRED': ApiErrorCode.TOKEN_EXPIRED,
      'INSUFFICIENT_PERMISSIONS': ApiErrorCode.INSUFFICIENT_PERMISSIONS,
      'INVALID_INPUT': ApiErrorCode.BAD_REQUEST,
      'MISSING_REQUIRED_FIELD': ApiErrorCode.MISSING_REQUIRED_FIELD,
      'INVALID_FORMAT': ApiErrorCode.INVALID_FORMAT,
      'DATABASE_CONNECTION_ERROR': ApiErrorCode.DATABASE_ERROR,
      'DATABASE_QUERY_ERROR': ApiErrorCode.DATABASE_ERROR,
      'RECORD_NOT_FOUND': ApiErrorCode.NOT_FOUND,
      'DUPLICATE_RECORD': ApiErrorCode.CONFLICT,
      'EXTERNAL_API_ERROR': ApiErrorCode.BAD_GATEWAY,
      'EXTERNAL_API_TIMEOUT': ApiErrorCode.GATEWAY_TIMEOUT,
      'EXTERNAL_API_RATE_LIMIT': ApiErrorCode.TOO_MANY_REQUESTS,
      'BUSINESS_RULE_VIOLATION': ApiErrorCode.UNPROCESSABLE_ENTITY,
      'OPERATION_NOT_ALLOWED': ApiErrorCode.FORBIDDEN,
      'INTERNAL_SERVER_ERROR': ApiErrorCode.INTERNAL_SERVER_ERROR,
      'CONFIGURATION_ERROR': ApiErrorCode.INTERNAL_SERVER_ERROR,
      'SERVICE_UNAVAILABLE': ApiErrorCode.SERVICE_UNAVAILABLE
    };
    return codeMap[code] || ApiErrorCode.INTERNAL_SERVER_ERROR;
  }

  private mapErrorCategoryToApiErrorCategory(category: ErrorCategory): ApiErrorCategory {
    const categoryMap: Record<string, ApiErrorCategory> = {
      'authentication': ApiErrorCategory.AUTHENTICATION,
      'authorization': ApiErrorCategory.AUTHORIZATION,
      'validation': ApiErrorCategory.VALIDATION,
      'database': ApiErrorCategory.DATABASE,
      'external_api': ApiErrorCategory.EXTERNAL_SERVICE,
      'business_logic': ApiErrorCategory.BUSINESS_LOGIC,
      'system': ApiErrorCategory.SYSTEM,
      'configuration': ApiErrorCategory.SYSTEM,
      'network': ApiErrorCategory.NETWORK,
      'security': ApiErrorCategory.SECURITY,
      'performance': ApiErrorCategory.SYSTEM
    };
    return categoryMap[category] || ApiErrorCategory.SYSTEM;
  }

  private mapErrorSeverityToApiErrorSeverity(severity: ErrorSeverity): ApiErrorSeverity {
    const severityMap: Record<string, ApiErrorSeverity> = {
      'low': ApiErrorSeverity.LOW,
      'medium': ApiErrorSeverity.MEDIUM,
      'high': ApiErrorSeverity.HIGH,
      'critical': ApiErrorSeverity.CRITICAL
    };
    return severityMap[severity] || ApiErrorSeverity.MEDIUM;
  }

  private getStatusCodeForErrorCode(code: ErrorCode): number {
    const statusCodeMap: Record<ErrorCode, number> = {
      [ErrorCode.INVALID_CREDENTIALS]: 401,
      [ErrorCode.UNAUTHORIZED_ACCESS]: 401,
      [ErrorCode.TOKEN_EXPIRED]: 401,
      [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
      [ErrorCode.INVALID_INPUT]: 400,
      [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
      [ErrorCode.INVALID_FORMAT]: 400,
      [ErrorCode.DATABASE_CONNECTION_ERROR]: 500,
      [ErrorCode.DATABASE_QUERY_ERROR]: 500,
      [ErrorCode.RECORD_NOT_FOUND]: 404,
      [ErrorCode.DUPLICATE_RECORD]: 409,
      [ErrorCode.EXTERNAL_API_ERROR]: 502,
      [ErrorCode.EXTERNAL_API_TIMEOUT]: 504,
      [ErrorCode.EXTERNAL_API_RATE_LIMIT]: 429,
      [ErrorCode.BUSINESS_RULE_VIOLATION]: 422,
      [ErrorCode.OPERATION_NOT_ALLOWED]: 403,
      [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
      [ErrorCode.CONFIGURATION_ERROR]: 500,
      [ErrorCode.SERVICE_UNAVAILABLE]: 503
    };
    return statusCodeMap[code] || 500;
  }

  /**
   * Handle and standardize errors from various sources
   */
  handle(error: unknown, context?: Record<string, any>): AppError {
    // If it's already an AppError, return it
    if (this.isAppError(error)) {
      return error;
    }

    // Handle Error instances
    if (error instanceof Error) {
      const appError = this.createError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        error.message,
        ErrorCategory.BUSINESS_LOGIC,
        ErrorSeverity.MEDIUM,
        {
          ...context,
          stack: this.config.includeStackTrace ? error.stack : undefined
        },
        error
      );

      this.logError(appError);
      return appError;
    }

    // Handle string errors
    if (typeof error === 'string') {
      const appError = this.createError(
        ErrorCode.INTERNAL_SERVER_ERROR,
        error,
        ErrorCategory.BUSINESS_LOGIC,
        ErrorSeverity.MEDIUM,
        context
      );

      this.logError(appError);
      return appError;
    }

    // Handle unknown errors
    const appError = this.createError(
      ErrorCode.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred',
      ErrorCategory.BUSINESS_LOGIC,
      ErrorSeverity.MEDIUM,
      { ...context, originalError: String(error) }
    );

    this.logError(appError);
    return appError;
  }

  /**
   * Map error codes to appropriate categories
   */
  mapErrorCategory(code: ErrorCode): ErrorCategory {
    const categoryMap: Record<ErrorCode, ErrorCategory> = {
      [ErrorCode.INVALID_CREDENTIALS]: ErrorCategory.AUTHENTICATION,
      [ErrorCode.UNAUTHORIZED_ACCESS]: ErrorCategory.AUTHORIZATION,
      [ErrorCode.TOKEN_EXPIRED]: ErrorCategory.AUTHENTICATION,
      [ErrorCode.INSUFFICIENT_PERMISSIONS]: ErrorCategory.AUTHORIZATION,

      [ErrorCode.INVALID_INPUT]: ErrorCategory.VALIDATION,
      [ErrorCode.MISSING_REQUIRED_FIELD]: ErrorCategory.VALIDATION,
      [ErrorCode.INVALID_FORMAT]: ErrorCategory.VALIDATION,

      [ErrorCode.DATABASE_CONNECTION_ERROR]: ErrorCategory.DATABASE,
      [ErrorCode.DATABASE_QUERY_ERROR]: ErrorCategory.DATABASE,
      [ErrorCode.RECORD_NOT_FOUND]: ErrorCategory.DATABASE,
      [ErrorCode.DUPLICATE_RECORD]: ErrorCategory.DATABASE,

      [ErrorCode.EXTERNAL_API_ERROR]: ErrorCategory.EXTERNAL_API,
      [ErrorCode.EXTERNAL_API_TIMEOUT]: ErrorCategory.EXTERNAL_API,
      [ErrorCode.EXTERNAL_API_RATE_LIMIT]: ErrorCategory.EXTERNAL_API,

      [ErrorCode.BUSINESS_RULE_VIOLATION]: ErrorCategory.BUSINESS_LOGIC,
      [ErrorCode.OPERATION_NOT_ALLOWED]: ErrorCategory.BUSINESS_LOGIC,

      [ErrorCode.INTERNAL_SERVER_ERROR]: ErrorCategory.BUSINESS_LOGIC,
      [ErrorCode.CONFIGURATION_ERROR]: ErrorCategory.CONFIGURATION,
      [ErrorCode.SERVICE_UNAVAILABLE]: ErrorCategory.NETWORK
    };

    return categoryMap[code] || ErrorCategory.BUSINESS_LOGIC;
  }

  /**
   * Format error for API response (environment-aware)
   */
  formatErrorResponse(appError: AppError): ErrorResponse {
    const correlationId = (appError as any).correlationId || randomUUID();
    const response: ErrorResponse = {
      error: {
        code: appError.code as any,
        message: appError.message,
        correlationId
      }
    };

    // Include additional details in development
    if (this.config.includeDetails && appError.details) {
      response.error.details = appError.details;
    }

    return response;
  }

  /**
   * Log error with consistent formatting and correlation ID
   */
  private logError(appError: AppError): void {
    const correlationId = (appError as any).correlationId || randomUUID();
    const timestamp = (appError as any).timestamp || new Date();
    const logData = {
      correlationId,
      code: appError.code,
      category: appError.category,
      severity: appError.severity,
      message: appError.message,
      details: appError.details,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : new Date().toISOString(),
      stack: (appError as any).cause?.stack
    };

    // Log at appropriate level based on severity
    switch (appError.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error(`[${appError.category.toUpperCase()}] ${appError.message}`, logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error(`[${appError.category.toUpperCase()}] ${appError.message}`, logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn(`[${appError.category.toUpperCase()}] ${appError.message}`, logData);
        break;
      case ErrorSeverity.LOW:
        logger.info(`[${appError.category.toUpperCase()}] ${appError.message}`, logData);
        break;
    }
  }

  /**
   * Check if an error is already an AppError
   */
  private isAppError(error: unknown): error is AppError {
    return (
      error instanceof AppErrorClass ||
      (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'category' in error &&
        'severity' in error
      )
    );
  }

  /**
   * Wrap async operations with standardized error handling
   */
  async wrapAsync<T>(
    operation: () => Promise<T>,
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    context?: Record<string, any>
  ): Promise<{ success: boolean; data?: T; error?: AppError }> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const appError = this.handle(error, context);
      // Override the error code if specified - map to ApiErrorCode
      appError.code = this.mapErrorCodeToApiErrorCode(errorCode) as any;
      appError.category = this.mapErrorCategoryToApiErrorCategory(this.mapErrorCategory(errorCode));
      return { success: false, error: appError };
    }
  }

  /**
   * Wrap synchronous operations with standardized error handling
   */
  wrapSync<T>(
    operation: () => T,
    errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    context?: Record<string, any>
  ): { success: boolean; data?: T; error?: AppError } {
    try {
      const data = operation();
      return { success: true, data };
    } catch (error) {
      const appError = this.handle(error, context);
      // Override the error code if specified - map to ApiErrorCode
      appError.code = this.mapErrorCodeToApiErrorCode(errorCode) as any;
      appError.category = this.mapErrorCategoryToApiErrorCategory(this.mapErrorCategory(errorCode));
      return { success: false, error: appError };
    }
  }
}

// Default error handler instance
export const errorHandler = new ErrorHandler();

// Utility functions for common error scenarios

/**
 * Create database-related errors
 */
export const createDatabaseError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, any>
): AppError => {
  return errorHandler.createError(
    code,
    message,
    ErrorCategory.DATABASE,
    ErrorSeverity.MEDIUM,
    details
  );
};

/**
 * Create validation errors
 */
export const createValidationError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, any>
): AppError => {
  return errorHandler.createError(
    code,
    message,
    ErrorCategory.VALIDATION,
    ErrorSeverity.LOW,
    details
  );
};

/**
 * Create external API errors
 */
export const createExternalApiError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, any>
): AppError => {
  return errorHandler.createError(
    code,
    message,
    ErrorCategory.EXTERNAL_API,
    ErrorSeverity.MEDIUM,
    details
  );
};

/**
 * Create business logic errors
 */
export const createBusinessLogicError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, any>
): AppError => {
  return errorHandler.createError(
    code,
    message,
    ErrorCategory.BUSINESS_LOGIC,
    ErrorSeverity.MEDIUM,
    details
  );
};

// Export types and utilities
export type { ErrorHandlerConfig };
export { AppError } from './apiResponse';