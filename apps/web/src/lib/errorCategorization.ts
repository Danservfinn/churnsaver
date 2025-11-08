// Error categorization and logging system
// Provides intelligent error classification, enhanced logging, and monitoring integration

import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';
import { securityMonitor } from '@/lib/security-monitoring';

// Error pattern matching for automatic categorization
export interface ErrorPattern {
  pattern: RegExp | string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code?: ErrorCode;
  retryable?: boolean;
  description?: string;
}

// Error context information
export interface ErrorContext {
  requestId?: string;
  endpoint?: string;
  method?: string;
  userId?: string;
  companyId?: string;
  ip?: string;
  userAgent?: string;
  processingTimeMs?: number;
  additionalData?: Record<string, any>;
}

// Enhanced error information
export interface CategorizedError {
  originalError: Error | AppError;
  categorizedError: AppError;
  context: ErrorContext;
  detectedPatterns: string[];
  suggestedActions: string[];
  monitoringData: Record<string, any>;
}

// Error patterns for automatic classification
const ERROR_PATTERNS: ErrorPattern[] = [
  // Database errors
  {
    pattern: /connection.*timeout|connection.*refused|database.*unreachable/i,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    code: ErrorCode.DATABASE_ERROR,
    retryable: true,
    description: 'Database connectivity issue'
  },
  {
    pattern: /duplicate.*key|unique.*constraint|violation.*unique/i,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    code: ErrorCode.CONFLICT,
    retryable: false,
    description: 'Database constraint violation'
  },
  {
    pattern: /syntax.*error|invalid.*sql|query.*failed/i,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    code: ErrorCode.DATABASE_ERROR,
    retryable: false,
    description: 'Database syntax error'
  },

  // Network errors
  {
    pattern: /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|network.*error/i,
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.HIGH,
    code: ErrorCode.NETWORK_ERROR,
    retryable: true,
    description: 'Network connectivity issue'
  },
  {
    pattern: /timeout|request.*timeout|socket.*timeout/i,
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    code: ErrorCode.NETWORK_ERROR,
    retryable: true,
    description: 'Request timeout'
  },

  // Authentication/Authorization errors
  {
    pattern: /unauthorized|authentication.*failed|invalid.*token/i,
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.MEDIUM,
    code: ErrorCode.UNAUTHORIZED,
    retryable: false,
    description: 'Authentication failure'
  },
  {
    pattern: /forbidden|access.*denied|insufficient.*permissions/i,
    category: ErrorCategory.AUTHORIZATION,
    severity: ErrorSeverity.MEDIUM,
    code: ErrorCode.FORBIDDEN,
    retryable: false,
    description: 'Authorization failure'
  },

  // Validation errors
  {
    pattern: /validation.*failed|invalid.*input|bad.*request/i,
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.LOW,
    code: ErrorCode.BAD_REQUEST,
    retryable: false,
    description: 'Input validation error'
  },
  {
    pattern: /required.*field|missing.*parameter/i,
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.LOW,
    code: ErrorCode.MISSING_REQUIRED_FIELD,
    retryable: false,
    description: 'Missing required field'
  },

  // External service errors
  {
    pattern: /api.*limit|rate.*limit|quota.*exceeded/i,
    category: ErrorCategory.RATE_LIMIT,
    severity: ErrorSeverity.MEDIUM,
    code: ErrorCode.TOO_MANY_REQUESTS,
    retryable: true,
    description: 'Rate limit exceeded'
  },
  {
    pattern: /service.*unavailable|maintenance.*mode/i,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.HIGH,
    code: ErrorCode.SERVICE_UNAVAILABLE,
    retryable: true,
    description: 'External service unavailable'
  },

  // Security errors
  {
    pattern: /suspicious.*activity|potential.*attack|security.*violation/i,
    category: ErrorCategory.SECURITY,
    severity: ErrorSeverity.CRITICAL,
    code: ErrorCode.FORBIDDEN,
    retryable: false,
    description: 'Security violation detected'
  }
];

// Error categorizer class
export class ErrorCategorizer {
  private patterns: ErrorPattern[];

  constructor(customPatterns: ErrorPattern[] = []) {
    this.patterns = [...ERROR_PATTERNS, ...customPatterns];
  }

  // Categorize an error based on patterns and context
  categorizeError(
    error: Error | AppError,
    context: ErrorContext = {}
  ): CategorizedError {
    const errorMessage = error.message.toLowerCase();
    const detectedPatterns: string[] = [];
    let categorizedError: AppError;
    let suggestedActions: string[] = [];

    // If it's already an AppError, use it as base
    if (error instanceof AppError) {
      categorizedError = error;
    } else {
      // Try to categorize based on patterns
      const matchedPattern = this.findMatchingPattern(errorMessage);
      
      if (matchedPattern) {
        detectedPatterns.push(matchedPattern.description || matchedPattern.category);
        categorizedError = new AppError(
          error.message,
          matchedPattern.code || ErrorCode.INTERNAL_SERVER_ERROR,
          matchedPattern.category,
          matchedPattern.severity,
          this.getStatusCodeForCategory(matchedPattern.category),
          true,
          matchedPattern.retryable || false,
          { originalError: error.name, stack: error.stack }
        );
        suggestedActions = this.getSuggestedActions(matchedPattern);
      } else {
        // Default categorization
        categorizedError = new AppError(
          error.message,
          ErrorCode.INTERNAL_SERVER_ERROR,
          ErrorCategory.UNKNOWN,
          ErrorSeverity.MEDIUM,
          500,
          false,
          undefined,
          { originalError: error.name, stack: error.stack }
        );
        suggestedActions = ['Investigate the error details', 'Check system logs', 'Monitor for recurrence'];
      }
    }

    // Add context to the error by creating a new AppError with combined context
    categorizedError = new AppError(
      categorizedError.message,
      categorizedError.code,
      categorizedError.category,
      categorizedError.severity,
      categorizedError.statusCode,
      categorizedError.isOperational ?? true,
      categorizedError.retryable,
      {
        ...(categorizedError.details || {}),
        ...context
      }
    );

    // Generate monitoring data
    const monitoringData = this.generateMonitoringData(categorizedError, context);

    return {
      originalError: error,
      categorizedError,
      context,
      detectedPatterns,
      suggestedActions,
      monitoringData
    };
  }

  // Find matching pattern for error message
  private findMatchingPattern(errorMessage: string): ErrorPattern | null {
    return this.patterns.find(pattern => {
      if (pattern.pattern instanceof RegExp) {
        return pattern.pattern.test(errorMessage);
      } else {
        return errorMessage.includes(pattern.pattern.toLowerCase());
      }
    }) || null;
  }

  // Get HTTP status code for error category
  private getStatusCodeForCategory(category: ErrorCategory): number {
    switch (category) {
      case ErrorCategory.VALIDATION:
        return 400;
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
        return 403;
      case ErrorCategory.RATE_LIMIT:
        return 422;
      case ErrorCategory.DATABASE:
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.NETWORK:
      case ErrorCategory.SYSTEM:
        return 500;
      case ErrorCategory.SECURITY:
        return 403;
      default:
        return 500;
    }
  }

  // Get suggested actions for error pattern
  private getSuggestedActions(pattern: ErrorPattern): string[] {
    const actions = ACTIONS_BY_CATEGORY[pattern.category] || ACTIONS_BY_CATEGORY[ErrorCategory.UNKNOWN];
    return actions
      .filter(action => !action.action) // Filter out recovery actions (those with action property)
      .map(action => action.description);
  }

  // Generate monitoring data for the error
  private generateMonitoringData(error: AppError, context: ErrorContext): Record<string, any> {
    return {
      timestamp: new Date().toISOString(),
      errorCategory: error.category,
      errorSeverity: error.severity,
      errorCode: error.code,
      endpoint: context.endpoint,
      method: context.method,
      userId: context.userId,
      companyId: context.companyId,
      processingTimeMs: context.processingTimeMs,
      isRetryable: error.retryable,
      // Additional metrics for monitoring
      metrics: {
        'error.count': 1,
        [`error.${error.category}.count`]: 1,
        [`error.${error.severity}.count`]: 1,
        [`error.${error.code}.count`]: 1
      }
    };
  }

  // Add custom error patterns
  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern);
  }

  // Remove error pattern
  removePattern(index: number): void {
    this.patterns.splice(index, 1);
  }

  // Get all patterns
  getPatterns(): ErrorPattern[] {
    return [...this.patterns];
  }
}

// Default categorizer instance
export const errorCategorizer = new ErrorCategorizer();

// Enhanced error logging function
export function logCategorizedError(categorizedError: CategorizedError): void {
  const { categorizedError: error, context, detectedPatterns, suggestedActions } = categorizedError;

  // Determine log level based on severity
  const logLevel = error.severity === ErrorSeverity.CRITICAL ? 'error' :
                   error.severity === ErrorSeverity.HIGH ? 'error' :
                   error.severity === ErrorSeverity.MEDIUM ? 'warn' : 'info';

  // Log the error with enhanced context
  logger[logLevel](`Categorized error: ${error.category}`, {
    requestId: context.requestId,
    endpoint: context.endpoint,
    method: context.method,
    error: error.message,
    errorCode: error.code,
    errorCategory: error.category,
    errorSeverity: error.severity,
    detectedPatterns,
    suggestedActions,
    isRetryable: error.retryable,
    processingTimeMs: context.processingTimeMs,
    company_id: context.companyId,
    user_id: context.userId,
    ip: context.ip,
    ...context.additionalData
  });

  // Log metrics
  logger.metric('error.categorized', 1, {
    error_category: error.category,
    error_severity: error.severity,
    error_code: error.code,
    ...(context.endpoint && { endpoint: context.endpoint })
  });

  // Report to security monitoring if security error
  if (error.category === ErrorCategory.SECURITY) {
    // Check for deduplication if enabled (simplified check - in real implementation would need access to config)
    // For now, assume deduplication is handled at the monitoring integration level
    securityMonitor.processSecurityEvent({
      category: 'intrusion',
      severity: error.severity === ErrorSeverity.CRITICAL ? 'critical' : 'high',
      type: String(error.code).toLowerCase(),
      description: error.message,
      ip: context.ip,
      userAgent: context.userAgent,
      endpoint: context.endpoint,
      userId: context.userId,
      companyId: context.companyId,
      metadata: {
        requestId: context.requestId,
        detectedPatterns,
        suggestedActions,
        method: context.method
      }
    }).catch(monitoringError => {
      logger.error('Failed to report security error', {
        error: monitoringError instanceof Error ? monitoringError.message : String(monitoringError),
        originalError: error.message,
        requestId: context.requestId
      });
    });

    // Mark as reported for deduplication (if enabled in monitoring integration)
    // This is a simplified implementation - the full deduplication logic is in errorMonitoringIntegration.ts
    if (context.additionalData) {
      context.additionalData.securityReported = true;
    }
  }
}

// Utility function to categorize and log errors in one step
export function categorizeAndLogError(
  error: Error | AppError,
  context: ErrorContext = {}
): CategorizedError {
  const categorizedError = errorCategorizer.categorizeError(error, context);
  logCategorizedError(categorizedError);
  return categorizedError;
}

// Action definition for unified catalog
export interface ActionDefinition {
  description: string;
  automated: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedTime?: string;
  action?: string;
}

// Unified action catalog
export const ACTIONS_BY_CATEGORY: Record<ErrorCategory, ActionDefinition[]> = {
  [ErrorCategory.DATABASE]: [
    // Suggested actions (from getSuggestedActions)
    { description: 'Check database connection', automated: false, priority: 'high' },
    { description: 'Verify database credentials', automated: false, priority: 'high' },
    { description: 'Monitor database performance', automated: false, priority: 'medium' },
    { description: 'Check for deadlocks or connection pool exhaustion', automated: false, priority: 'medium' },
    // Recovery actions (from getRecoveryActions)
    { action: 'check_database_connection', description: 'Verify database connectivity and credentials', automated: true, priority: 'high', estimatedTime: '30s' },
    { action: 'restart_connection_pool', description: 'Restart database connection pool if needed', automated: true, priority: 'medium', estimatedTime: '10s' }
  ],
  [ErrorCategory.NETWORK]: [
    // Suggested actions
    { description: 'Check network connectivity', automated: false, priority: 'high' },
    { description: 'Verify external service availability', automated: false, priority: 'high' },
    { description: 'Implement retry logic with exponential backoff', automated: false, priority: 'medium' },
    { description: 'Consider circuit breaker pattern', automated: false, priority: 'low' },
    // Recovery actions
    { action: 'retry_with_backoff', description: 'Retry the operation with exponential backoff', automated: true, priority: 'high', estimatedTime: '1-5s' },
    { action: 'check_service_health', description: 'Verify external service health status', automated: true, priority: 'medium', estimatedTime: '5s' }
  ],
  [ErrorCategory.AUTHENTICATION]: [
    // Suggested actions
    { description: 'Verify authentication token', automated: false, priority: 'high' },
    { description: 'Check token expiration', automated: false, priority: 'high' },
    { description: 'Review authentication configuration', automated: false, priority: 'medium' },
    { description: 'Monitor for brute force attempts', automated: false, priority: 'medium' }
  ],
  [ErrorCategory.AUTHORIZATION]: [
    // Suggested actions
    { description: 'Verify user permissions', automated: false, priority: 'high' },
    { description: 'Check role-based access control', automated: false, priority: 'high' },
    { description: 'Review authorization policies', automated: false, priority: 'medium' },
    { description: 'Audit access logs', automated: false, priority: 'medium' }
  ],
  [ErrorCategory.VALIDATION]: [
    // Suggested actions
    { description: 'Review input validation rules', automated: false, priority: 'medium' },
    { description: 'Check request format', automated: false, priority: 'medium' },
    { description: 'Validate required fields', automated: false, priority: 'medium' },
    { description: 'Update API documentation', automated: false, priority: 'low' }
  ],
  [ErrorCategory.RATE_LIMIT]: [
    // Suggested actions
    { description: 'Implement rate limiting headers', automated: false, priority: 'medium' },
    { description: 'Add retry-after logic', automated: false, priority: 'medium' },
    { description: 'Monitor usage patterns', automated: false, priority: 'medium' },
    { description: 'Consider rate limit adjustments', automated: false, priority: 'low' },
    // Recovery actions
    { action: 'wait_retry_after', description: 'Wait for the specified retry-after duration', automated: true, priority: 'high' },
    { action: 'reduce_request_rate', description: 'Implement client-side rate limiting', automated: false, priority: 'medium' }
  ],
  [ErrorCategory.EXTERNAL_SERVICE]: [
    // Suggested actions
    { description: 'Check external service status', automated: false, priority: 'high' },
    { description: 'Verify API credentials', automated: false, priority: 'high' },
    { description: 'Implement fallback mechanisms', automated: false, priority: 'medium' },
    { description: 'Monitor service level agreements', automated: false, priority: 'medium' },
    // Recovery actions
    { action: 'enable_fallback', description: 'Switch to fallback service or cached data', automated: true, priority: 'high' },
    { action: 'check_service_status', description: 'Verify external service status page', automated: false, priority: 'medium' }
  ],
  [ErrorCategory.SECURITY]: [
    // Suggested actions
    { description: 'Immediate security review required', automated: false, priority: 'critical' },
    { description: 'Check for suspicious activity patterns', automated: false, priority: 'critical' },
    { description: 'Review access logs', automated: false, priority: 'high' },
    { description: 'Consider temporary IP blocking', automated: false, priority: 'high' }
  ],
  [ErrorCategory.SYSTEM]: [
    // Suggested actions
    { description: 'Investigate error details', automated: false, priority: 'high' },
    { description: 'Check system logs', automated: false, priority: 'high' },
    { description: 'Monitor for recurrence', automated: false, priority: 'medium' },
    { description: 'Escalate if persistent', automated: false, priority: 'medium' }
  ],
  [ErrorCategory.UNKNOWN]: [
    // Suggested actions
    { description: 'Investigate error details', automated: false, priority: 'high' },
    { description: 'Check system logs', automated: false, priority: 'high' },
    { description: 'Monitor for recurrence', automated: false, priority: 'medium' },
    { description: 'Escalate if persistent', automated: false, priority: 'medium' }
  ],
  [ErrorCategory.BUSINESS_LOGIC]: [
    // Suggested actions
    { description: 'Review business logic rules', automated: false, priority: 'medium' },
    { description: 'Check input data validation', automated: false, priority: 'medium' },
    { description: 'Verify business requirements', automated: false, priority: 'medium' },
    { description: 'Update business logic documentation', automated: false, priority: 'low' }
  ]
};

// Error recovery suggestions
export interface RecoveryAction {
  action: string;
  description: string;
  automated: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedTime?: string;
}

// Get recovery actions for categorized error
export function getRecoveryActions(categorizedError: CategorizedError): RecoveryAction[] {
  const { categorizedError: error } = categorizedError;
  const actions = ACTIONS_BY_CATEGORY[error.category] || [];

  return actions
    .filter(action => action.action) // Filter to recovery actions (those with action property)
    .map(action => ({
      action: action.action!,
      description: action.description,
      automated: action.automated,
      priority: action.priority,
      estimatedTime: action.estimatedTime
    }));
}

// Get suggested actions for categorized error
export function getSuggestedActions(categorizedError: CategorizedError): string[] {
  const { categorizedError: error } = categorizedError;
  const actions = ACTIONS_BY_CATEGORY[error.category] || ACTIONS_BY_CATEGORY[ErrorCategory.UNKNOWN];
  
  return actions
    .filter(action => !action.action) // Filter out recovery actions (those with action property)
    .map(action => action.description);
}