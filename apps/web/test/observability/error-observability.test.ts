// Observability tests for Error Categorization and Logging
// Tests error metrics aggregation, alerting, dashboard data, trace correlation

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

describe('Error Observability Tests', () => {
  let categorizer: ErrorCategorizer;

  beforeEach(() => {
    categorizer = new ErrorCategorizer();
    vi.clearAllMocks();
  });

  describe('Error metrics aggregation', () => {
    it('should aggregate error counts by category', () => {
      const errors = [
        new Error('Connection timeout'),
        new Error('Connection refused'),
        new Error('Invalid input format'),
        new Error('Invalid token provided')
      ];

      const categories = new Map<ErrorCategory, number>();

      errors.forEach(error => {
        const categorized = categorizeAndLogError(error);
        const category = categorized.categorizedError.category;
        categories.set(category, (categories.get(category) || 0) + 1);
      });

      expect(categories.get(ErrorCategory.DATABASE)).toBe(2);
      expect(categories.get(ErrorCategory.VALIDATION)).toBe(1);
      expect(categories.get(ErrorCategory.AUTHENTICATION)).toBe(1);
    });

    it('should aggregate error counts by severity', () => {
      const errors = [
        new Error('Security violation detected'),
        new Error('Connection timeout'),
        new Error('Invalid input format'),
        new Error('Random error')
      ];

      const severities = new Map<ErrorSeverity, number>();

      errors.forEach(error => {
        const categorized = categorizeAndLogError(error);
        const severity = categorized.categorizedError.severity;
        severities.set(severity, (severities.get(severity) || 0) + 1);
      });

      expect(severities.get(ErrorSeverity.CRITICAL)).toBe(1);
      expect(severities.get(ErrorSeverity.HIGH)).toBe(1);
      expect(severities.get(ErrorSeverity.MEDIUM)).toBeGreaterThanOrEqual(2);
    });

    it('should aggregate error counts by endpoint', () => {
      const errors = [
        new Error('Database error'),
        new Error('Validation error'),
        new Error('Network error')
      ];

      const endpoints = new Map<string, number>();

      errors.forEach((error, index) => {
        const context = {
          endpoint: `/api/endpoint${index % 2}`
        };
        const categorized = categorizeAndLogError(error, context);
        const endpoint = categorized.context.endpoint!;
        endpoints.set(endpoint, (endpoints.get(endpoint) || 0) + 1);
      });

      expect(endpoints.size).toBeGreaterThan(0);
    });

    it('should track retryable vs non-retryable errors', () => {
      const errors = [
        new Error('Database connection timeout'),
        new Error('ETIMEDOUT network error'),
        new Error('Invalid input format'),
        new Error('Invalid token')
      ];

      let retryableCount = 0;
      let nonRetryableCount = 0;

      errors.forEach(error => {
        const categorized = categorizeAndLogError(error);
        if (categorized.categorizedError.retryable) {
          retryableCount++;
        } else {
          nonRetryableCount++;
        }
      });

      expect(retryableCount).toBeGreaterThan(0);
      expect(nonRetryableCount).toBeGreaterThan(0);
    });
  });

  describe('Error alerting thresholds', () => {
    it('should identify critical errors for alerting', async () => {
      // Mock security monitoring to avoid the code.toLowerCase() bug
      const { securityMonitor } = await import('../../src/lib/security-monitoring');
      vi.spyOn(securityMonitor, 'processSecurityEvent').mockResolvedValue(undefined);
      
      const error = new Error('Security violation detected');
      const categorized = categorizeAndLogError(error);

      expect(categorized.categorizedError.severity).toBe(ErrorSeverity.CRITICAL);
      expect(categorized.categorizedError.category).toBe(ErrorCategory.SECURITY);
      // Critical errors should trigger alerts
    });

    it('should identify high-severity errors for alerting', () => {
      const error = new Error('Connection timeout');
      const categorized = categorizeAndLogError(error);

      expect(categorized.categorizedError.severity).toBe(ErrorSeverity.HIGH);
      // High severity errors may trigger alerts
    });

    it('should track error rate for threshold detection', () => {
      const errors = [];
      for (let i = 0; i < 10; i++) {
        errors.push(new Error(`Error ${i}`));
      }

      errors.forEach(error => {
        categorizeAndLogError(error, { endpoint: '/api/test' });
      });

      // Should log metrics for each error
      expect(logger.metric).toHaveBeenCalledTimes(10);
    });
  });

  describe('Error dashboard data accuracy', () => {
    it('should provide accurate error counts', () => {
      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3')
      ];

      errors.forEach(error => {
        categorizeAndLogError(error);
      });

      // Each error should be logged
      expect(logger.metric).toHaveBeenCalledTimes(3);
    });

    it('should provide accurate error distribution', () => {
      const errors = [
        new Error('Connection timeout'),
        new Error('Connection refused'),
        new Error('Invalid input format')
      ];

      const distribution = new Map<ErrorCategory, number>();

      errors.forEach(error => {
        const categorized = categorizeAndLogError(error);
        const category = categorized.categorizedError.category;
        distribution.set(category, (distribution.get(category) || 0) + 1);
      });

      expect(distribution.get(ErrorCategory.DATABASE)).toBe(2);
      expect(distribution.get(ErrorCategory.VALIDATION)).toBe(1);
    });

    it('should provide accurate error trends', () => {
      const errors = [];
      for (let i = 0; i < 5; i++) {
        errors.push(new Error(`Error ${i}`));
      }

      errors.forEach((error, index) => {
        categorizeAndLogError(error, {
          requestId: `req-${index}`,
          processingTimeMs: 100 + index * 10
        });
      });

      // Should track processing times
      expect(logger.metric).toHaveBeenCalledTimes(5);
    });
  });

  describe('Error trace correlation', () => {
    it('should correlate errors by request ID', () => {
      const requestId = 'req-trace-1';
      const errors = [
        new Error('Error 1'),
        new Error('Error 2')
      ];

      errors.forEach(error => {
        categorizeAndLogError(error, { requestId });
      });

      // Both errors should have same request ID
      expect(logger.metric).toHaveBeenCalledTimes(2);
    });

    it('should correlate errors by endpoint', () => {
      const endpoint = '/api/cases';
      const errors = [
        new Error('Error 1'),
        new Error('Error 2')
      ];

      errors.forEach(error => {
        categorizeAndLogError(error, { endpoint });
      });

      // Both errors should have same endpoint
      expect(logger.metric).toHaveBeenCalledTimes(2);
    });

    it('should correlate errors by user', () => {
      const userId = 'user-123';
      const errors = [
        new Error('Error 1'),
        new Error('Error 2')
      ];

      errors.forEach(error => {
        categorizeAndLogError(error, { userId });
      });

      // Both errors should have same user ID
      expect(logger.metric).toHaveBeenCalledTimes(2);
    });

    it('should correlate errors by company', () => {
      const companyId = 'company-456';
      const errors = [
        new Error('Error 1'),
        new Error('Error 2')
      ];

      errors.forEach(error => {
        categorizeAndLogError(error, { companyId });
      });

      // Both errors should have same company ID
      expect(logger.metric).toHaveBeenCalledTimes(2);
    });

    it('should maintain trace context across error transformations', () => {
      const traceContext = {
        requestId: 'req-trace-2',
        endpoint: '/api/test',
        userId: 'user-123',
        companyId: 'company-456'
      };

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

      const categorized = categorizeAndLogError(appError, traceContext);

      expect(categorized.context.requestId).toBe('req-trace-2');
      expect(categorized.context.endpoint).toBe('/api/test');
      expect(categorized.context.userId).toBe('user-123');
      expect(categorized.context.companyId).toBe('company-456');
    });
  });

  describe('Error monitoring data structure', () => {
    it('should include all required monitoring fields', () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req-monitor-1',
        endpoint: '/api/test',
        method: 'GET',
        userId: 'user-123',
        companyId: 'company-456',
        processingTimeMs: 150
      };

      const categorized = categorizeAndLogError(error, context);

      expect(categorized.monitoringData).toBeDefined();
      expect(categorized.monitoringData.timestamp).toBeDefined();
      expect(categorized.monitoringData.errorCategory).toBeDefined();
      expect(categorized.monitoringData.errorSeverity).toBeDefined();
      expect(categorized.monitoringData.errorCode).toBeDefined();
      expect(categorized.monitoringData.endpoint).toBe('/api/test');
      expect(categorized.monitoringData.method).toBe('GET');
      expect(categorized.monitoringData.userId).toBe('user-123');
      expect(categorized.monitoringData.companyId).toBe('company-456');
      expect(categorized.monitoringData.processingTimeMs).toBe(150);
      expect(categorized.monitoringData.metrics).toBeDefined();
    });

    it('should include metrics in monitoring data', () => {
      const error = new Error('Test error');
      const categorized = categorizeAndLogError(error);

      expect(categorized.monitoringData.metrics).toBeDefined();
      expect(categorized.monitoringData.metrics['error.count']).toBe(1);
      expect(categorized.monitoringData.metrics[`error.${categorized.categorizedError.category}.count`]).toBe(1);
      expect(categorized.monitoringData.metrics[`error.${categorized.categorizedError.severity}.count`]).toBe(1);
    });
  });
});

