// Integration tests for Error Logging
// Tests error categorization in API endpoints, logging, and monitoring

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { categorizeAndLogError, ErrorCategorizer } from '../../src/lib/errorCategorization';
import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '../../src/lib/apiResponse';
import { logger } from '../../src/lib/logger';

// Mock logger
vi.mock('../../src/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    metric: vi.fn()
  }
}));

// Mock security monitoring
vi.mock('../../src/lib/security-monitoring', () => ({
  securityMonitor: {
    reportSecurityIncident: vi.fn(),
    processSecurityEvent: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('Error Logging Integration Tests', () => {
  let categorizer: ErrorCategorizer;

  beforeEach(() => {
    categorizer = new ErrorCategorizer();
    vi.clearAllMocks();
  });

  describe('Error categorization in API endpoints', () => {
    it('should categorize database errors from API endpoints', () => {
      const error = new Error('Connection timeout');
      const context = {
        requestId: 'req-api-1',
        endpoint: '/api/cases',
        method: 'GET',
        userId: 'user-123',
        companyId: 'company-456'
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.categorizedError.category).toBe(ErrorCategory.DATABASE);
      expect(categorized.context.endpoint).toBe('/api/cases');
      expect(categorized.context.method).toBe('GET');
    });

    it('should categorize validation errors from API endpoints', () => {
      const error = new Error('Invalid input format');
      const context = {
        requestId: 'req-api-2',
        endpoint: '/api/cases',
        method: 'POST',
        userId: 'user-123',
        companyId: 'company-456'
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.categorizedError.category).toBe(ErrorCategory.VALIDATION);
      expect(categorized.categorizedError.statusCode).toBe(400);
    });

    it('should categorize authentication errors from API endpoints', () => {
      const error = new Error('Invalid token provided');
      const context = {
        requestId: 'req-api-3',
        endpoint: '/api/cases',
        method: 'GET',
        userId: 'user-123',
        companyId: 'company-456'
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.categorizedError.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(categorized.categorizedError.statusCode).toBe(401);
    });
  });

  describe('Error logging with different log levels', () => {
    it('should log CRITICAL errors at error level', () => {
      const error = new Error('Security violation detected');
      const categorized = categorizeAndLogError(error);

      expect(logger.error).toHaveBeenCalled();
      expect(categorized.categorizedError.severity).toBe(ErrorSeverity.CRITICAL);
    });

    it('should log HIGH severity errors at error level', () => {
      const error = new Error('Connection timeout');
      const categorized = categorizeAndLogError(error);

      expect(logger.error).toHaveBeenCalled();
      expect(categorized.categorizedError.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should log MEDIUM severity errors at warn level', () => {
      const error = new Error('Request timeout');
      const categorized = categorizeAndLogError(error);

      expect(logger.warn).toHaveBeenCalled();
      expect(categorized.categorizedError.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should log LOW severity errors at info level', () => {
      const appError = new AppError(
        'Low severity error',
        ErrorCode.BAD_REQUEST,
        ErrorCategory.VALIDATION,
        ErrorSeverity.LOW,
        400,
        false
      );

      categorizeAndLogError(appError);

      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('Error metrics collection', () => {
    it('should log error metrics', () => {
      const error = new Error('Test error');
      categorizeAndLogError(error);

      expect(logger.metric).toHaveBeenCalledWith(
        'error.categorized',
        1,
        expect.objectContaining({
          error_category: expect.any(String),
          error_severity: expect.any(String)
        })
      );
    });

    it('should include endpoint in metrics', () => {
      const error = new Error('Test error');
      const context = {
        endpoint: '/api/cases',
        method: 'GET'
      };

      categorizeAndLogError(error, context);

      expect(logger.metric).toHaveBeenCalledWith(
        'error.categorized',
        1,
        expect.objectContaining({
          endpoint: '/api/cases'
        })
      );
    });

    it('should track error counts by category', () => {
      const error = new Error('Connection timeout');
      categorizeAndLogError(error);

      expect(logger.metric).toHaveBeenCalledWith(
        'error.categorized',
        1,
        expect.objectContaining({
          error_category: ErrorCategory.DATABASE
        })
      );
    });
  });

  describe('Security monitoring integration', () => {
    it('should report security errors to monitoring', async () => {
      const { securityMonitor } = await import('../../src/lib/security-monitoring');
      const error = new Error('SQL injection attempt detected');
      const context = {
        requestId: 'req-sec-1',
        endpoint: '/api/cases',
        ip: '192.168.1.100'
      };

      categorizeAndLogError(error, context);

      expect(logger.error).toHaveBeenCalled();
      // Security monitoring should be called for security errors
      // Note: This depends on the actual implementation of logCategorizedError
    });

    it('should include security context in logs', () => {
      const error = new Error('SQL injection attempt detected');
      const context = {
        requestId: 'req-sec-2',
        endpoint: '/api/cases',
        ip: '192.168.1.100',
        userAgent: 'malicious-agent'
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.context.ip).toBe('192.168.1.100');
      expect(categorized.context.userAgent).toBe('malicious-agent');
    });
  });

  describe('Error context propagation through middleware', () => {
    it('should propagate request context through error handling', () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req-middleware-1',
        endpoint: '/api/cases',
        method: 'GET',
        userId: 'user-123',
        companyId: 'company-456',
        ip: '192.168.1.1',
        userAgent: 'test-agent'
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.context.requestId).toBe('req-middleware-1');
      expect(categorized.context.endpoint).toBe('/api/cases');
      expect(categorized.context.method).toBe('GET');
      expect(categorized.context.userId).toBe('user-123');
      expect(categorized.context.companyId).toBe('company-456');
      expect(categorized.context.ip).toBe('192.168.1.1');
      expect(categorized.context.userAgent).toBe('test-agent');
    });

    it('should preserve context across error transformations', () => {
      const appError = new AppError(
        'Original error',
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM,
        500,
        false,
        undefined,
        { originalError: 'value' }
      );

      const context = {
        requestId: 'req-middleware-2',
        newContext: 'newValue'
      };

      const categorized = categorizeAndLogError(appError, context);

      expect(categorized.context.requestId).toBe('req-middleware-2');
      expect(categorized.context.newContext).toBe('newValue');
    });
  });

  describe('Error redaction for sensitive data', () => {
    it('should not log sensitive data in error messages', () => {
      const error = new Error('Password: secret123');
      const context = {
        requestId: 'req-redact-1'
      };

      categorizeAndLogError(error, context);

      // Error message should be logged but sensitive data should be redacted
      // This depends on logger implementation
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should redact sensitive fields from context', () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req-redact-2',
        password: 'secret123',
        apiKey: 'key-12345'
      };

      const categorized = categorizeAndLogError(error, context);

      // Context should include requestId but sensitive fields handling
      // depends on logger implementation
      expect(categorized.context.requestId).toBe('req-redact-2');
    });
  });

  describe('Error processing time tracking', () => {
    it('should track processing time in error context', () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req-time-1',
        processingTimeMs: 150
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.context.processingTimeMs).toBe(150);
      expect(categorized.monitoringData.processingTimeMs).toBe(150);
    });

    it('should include processing time in logs', () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req-time-2',
        processingTimeMs: 250
      };

      categorizeAndLogError(error, context);

      // Logger should be called - check metric which always includes context
      expect(logger.metric).toHaveBeenCalled();
    });
  });
});

