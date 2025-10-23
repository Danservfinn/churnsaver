import { ErrorMonitoringIntegration, ErrorMetrics } from '../src/lib/errorMonitoringIntegration';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '../src/lib/apiResponse';
import { CategorizedError } from '../src/lib/errorCategorization';

// Test framework following the pattern from existing tests
const test = (name: string, fn: () => void) => {
  console.log(`🧪 ${name}`);
  try {
    fn();
    console.log(`✅ ${name} - PASSED`);
  } catch (error) {
    console.log(`❌ ${name} - FAILED: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

const describe = (name: string, fn: () => void) => {
  console.log(`\n📋 ${name}`);
  fn();
};

const it = test;
const expect = (actual: any) => ({
  toBe: (expected: any) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, but got ${actual}`);
    }
  },
  toBeInstanceOf: (expected: any) => {
    if (!(actual instanceof expected)) {
      throw new Error(`Expected instance of ${expected.name}, but got ${actual.constructor.name}`);
    }
  },
  toEqual: (expected: any) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
    }
  },
  toBeGreaterThan: (expected: any) => {
    if (!(actual > expected)) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toBeCloseTo: (expected: any, precision: number = 2) => {
    const diff = Math.abs(actual - expected);
    const tolerance = Math.pow(10, -precision);
    if (diff > tolerance) {
      throw new Error(`Expected ${actual} to be close to ${expected} (within ${tolerance})`);
    }
  },
  toBeLessThan: (expected: any) => {
    if (!(actual < expected)) {
      throw new Error(`Expected ${actual} to be less than ${expected}`);
    }
  }
});

const beforeEach = (fn: () => void) => {
  // Simple beforeEach implementation
  fn();
};

const afterEach = (fn: () => void) => {
  // Simple afterEach implementation
  fn();
};

// Helper function to create a proper CategorizedError for testing
function createTestCategorizedError(error: AppError): CategorizedError {
  return {
    originalError: error,
    categorizedError: error,
    context: {},
    detectedPatterns: [],
    suggestedActions: [],
    monitoringData: {}
  };
}

describe('ErrorMonitoringIntegration Metrics', () => {
  let monitoring: ErrorMonitoringIntegration;

  beforeEach(() => {
    monitoring = new ErrorMonitoringIntegration({
      enableMetrics: true,
      enableAlerting: false,
      enableSecurityMonitoring: false,
      enablePerformanceTracking: false
    });
  });

  afterEach(() => {
    monitoring.resetMetrics();
  });

  describe('categoryCounts Map', () => {
    it('should initialize all error categories to 0', () => {
      const metrics = monitoring.getCurrentMetrics();

      Object.values(ErrorCategory).forEach(category => {
        expect(metrics.errorsByCategory[category]).toBe(0);
      });
    });

    it('should increment category count when error is processed', async () => {
      const error = new AppError('Test error', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION);
      const categorizedError: CategorizedError = createTestCategorizedError(error);

      await monitoring.processError(categorizedError);

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.DATABASE]).toBe(0);
    });

    it('should increment multiple categories correctly', async () => {
      const validationError = new AppError('Validation error', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION);
      const dbError = new AppError('DB error', ErrorCode.DATABASE_ERROR, ErrorCategory.DATABASE);

      await monitoring.processError(createTestCategorizedError(validationError));
      await monitoring.processError(createTestCategorizedError(dbError));
      await monitoring.processError(createTestCategorizedError(validationError));

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(2);
      expect(metrics.errorsByCategory[ErrorCategory.DATABASE]).toBe(1);
    });
  });

  describe('severityCounts Map', () => {
    it('should initialize all error severities to 0', () => {
      const metrics = monitoring.getCurrentMetrics();

      Object.values(ErrorSeverity).forEach(severity => {
        expect(metrics.errorsBySeverity[severity]).toBe(0);
      });
    });

    it('should increment severity count when error is processed', async () => {
      const error = new AppError('Critical error', ErrorCode.INTERNAL_SERVER_ERROR, ErrorCategory.SYSTEM, ErrorSeverity.CRITICAL);
      const categorizedError: CategorizedError = createTestCategorizedError(error);

      await monitoring.processError({ categorizedError: error, context: {} });

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(metrics.errorsBySeverity[ErrorSeverity.HIGH]).toBe(0);
    });

    it('should increment multiple severities correctly', async () => {
      const lowError = new AppError('Low error', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION, ErrorSeverity.LOW);
      const highError = new AppError('High error', ErrorCode.INTERNAL_SERVER_ERROR, ErrorCategory.SYSTEM, ErrorSeverity.HIGH);

      await monitoring.processError(createTestCategorizedError(lowError));
      await monitoring.processError(createTestCategorizedError(highError));
      await monitoring.processError(createTestCategorizedError(lowError));

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.errorsBySeverity[ErrorSeverity.LOW]).toBe(2);
      expect(metrics.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(metrics.errorsBySeverity[ErrorSeverity.CRITICAL]).toBe(0);
    });
  });

  describe('codeCounts Map', () => {
    it('should initialize all error codes to 0', () => {
      const metrics = monitoring.getCurrentMetrics();

      Object.values(ErrorCode).forEach(code => {
        expect(metrics.errorsByCode[code]).toBe(0);
      });
    });

    it('should increment code count when error is processed', async () => {
      const error = new AppError('Rate limited', ErrorCode.RATE_LIMITED, ErrorCategory.RATE_LIMIT);
      const categorizedError: CategorizedError = createTestCategorizedError(error);

      await monitoring.processError({ categorizedError: error, context: {} });

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.errorsByCode[ErrorCode.RATE_LIMITED]).toBe(1);
      expect(metrics.errorsByCode[ErrorCode.BAD_REQUEST]).toBe(0);
    });

    it('should increment multiple codes correctly', async () => {
      const rateLimitError = new AppError('Rate limited', ErrorCode.RATE_LIMITED, ErrorCategory.RATE_LIMIT);
      const badRequestError = new AppError('Bad request', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION);

      await monitoring.processError(createTestCategorizedError(rateLimitError));
      await monitoring.processError(createTestCategorizedError(badRequestError));
      await monitoring.processError(createTestCategorizedError(rateLimitError));

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.errorsByCode[ErrorCode.RATE_LIMITED]).toBe(2);
      expect(metrics.errorsByCode[ErrorCode.BAD_REQUEST]).toBe(1);
      expect(metrics.errorsByCode[ErrorCode.INTERNAL_SERVER_ERROR]).toBe(0);
    });
  });

  describe('getCurrentMetrics()', () => {
    it('should return ErrorMetrics interface with correct structure', () => {
      const metrics = monitoring.getCurrentMetrics();

      expect(metrics).toBeInstanceOf(Object);
      expect(typeof metrics.timestamp).toBe('string');
      expect(typeof metrics.totalRequests).toBe('number');
      expect(typeof metrics.totalErrors).toBe('number');
      expect(typeof metrics.errorRate).toBe('number');
      expect(metrics.errorsByCategory).toBeInstanceOf(Object);
      expect(metrics.errorsBySeverity).toBeInstanceOf(Object);
      expect(metrics.errorsByCode).toBeInstanceOf(Object);
      expect(typeof metrics.averageResponseTime).toBe('number');
      expect(typeof metrics.securityEvents).toBe('number');
      expect(metrics.circuitBreakerStatus).toBeInstanceOf(Object);
    });

    it('should calculate error rate correctly', async () => {
      // Process 3 errors, simulate 100 total requests
      for (let i = 0; i < 3; i++) {
        const error = new AppError(`Error ${i}`, ErrorCode.INTERNAL_SERVER_ERROR);
        await monitoring.processError({ categorizedError: error, context: {} });
      }

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.totalErrors).toBe(3);
      expect(metrics.totalRequests).toBe(103); // 3 errors + 100 estimated requests
      expect(metrics.errorRate).toBeCloseTo(2.91, 2); // 3/103 ≈ 2.91%
    });

    it('should calculate error rate as 0 when no errors', () => {
      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.totalRequests).toBe(100); // Estimated requests
      expect(metrics.errorRate).toBe(0);
    });

    it('should aggregate all error counts correctly', async () => {
      const errors = [
        new AppError('Validation', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION, ErrorSeverity.LOW),
        new AppError('Auth', ErrorCode.UNAUTHORIZED, ErrorCategory.AUTHENTICATION, ErrorSeverity.MEDIUM),
        new AppError('DB', ErrorCode.DATABASE_ERROR, ErrorCategory.DATABASE, ErrorSeverity.HIGH),
        new AppError('Validation 2', ErrorCode.INVALID_INPUT, ErrorCategory.VALIDATION, ErrorSeverity.LOW),
      ];

      for (const error of errors) {
        await monitoring.processError(createTestCategorizedError(error));
      }

      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.totalErrors).toBe(4);
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(2);
      expect(metrics.errorsByCategory[ErrorCategory.AUTHENTICATION]).toBe(1);
      expect(metrics.errorsByCategory[ErrorCategory.DATABASE]).toBe(1);
      expect(metrics.errorsBySeverity[ErrorSeverity.LOW]).toBe(2);
      expect(metrics.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(metrics.errorsBySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(metrics.errorsByCode[ErrorCode.BAD_REQUEST]).toBe(1);
      expect(metrics.errorsByCode[ErrorCode.INVALID_INPUT]).toBe(1);
      expect(metrics.errorsByCode[ErrorCode.UNAUTHORIZED]).toBe(1);
      expect(metrics.errorsByCode[ErrorCode.DATABASE_ERROR]).toBe(1);
    });

    it('should include timestamp in ISO format', () => {
      const before = new Date().toISOString();
      const metrics = monitoring.getCurrentMetrics();
      const after = new Date().toISOString();

      expect(metrics.timestamp).toBeGreaterThan(before);
      expect(metrics.timestamp).toBeLessThan(after);
      expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(metrics.timestamp)).toBe(true);
    });

    it('should initialize averageResponseTime to 0 when no performance data', () => {
      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.averageResponseTime).toBe(0);
    });

    it('should initialize securityEvents to 0', () => {
      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.securityEvents).toBe(0);
    });

    it('should initialize circuitBreakerStatus as empty object', () => {
      const metrics = monitoring.getCurrentMetrics();
      expect(metrics.circuitBreakerStatus).toEqual({});
    });
  });

  describe('resetMetrics()', () => {
    it('should reset all error counts to 0', async () => {
      const error = new AppError('Test error', ErrorCode.BAD_REQUEST, ErrorCategory.VALIDATION);
      await monitoring.processError(createTestCategorizedError(error));

      let metrics = monitoring.getCurrentMetrics();
      expect(metrics.totalErrors).toBe(1);

      monitoring.resetMetrics();

      metrics = monitoring.getCurrentMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorsByCategory[ErrorCategory.VALIDATION]).toBe(0);
      expect(metrics.errorsBySeverity[ErrorSeverity.MEDIUM]).toBe(0);
      expect(metrics.errorsByCode[ErrorCode.BAD_REQUEST]).toBe(0);
    });
  });
});