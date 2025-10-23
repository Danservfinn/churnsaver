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
  toBeUndefined: () => {
    if (actual !== undefined) {
      throw new Error(`Expected undefined, but got ${actual}`);
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

import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '../src/lib/apiResponse';

// Import the helper functions directly since they're not exported
// We'll need to access them through the module or make them available for testing
const { buildAppErrorFromUnknown, getAppVersion } = require('../src/lib/apiResponse');

// Mock process.env.npm_package_version
const originalEnv = process.env;

describe('apiResponse helpers', () => {
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
  });

  describe('buildAppErrorFromUnknown', () => {
    it('should return AppError instance unchanged when passed an AppError', () => {
      const originalError = new AppError(
        'Test error',
        ErrorCode.BAD_REQUEST,
        ErrorCategory.VALIDATION,
        ErrorSeverity.LOW,
        400,
        false,
        undefined,
        { customField: 'value' }
      );

      const result = buildAppErrorFromUnknown(originalError);

      expect(result).toBe(originalError);
      expect(result.message).toBe('Test error');
      expect(result.code).toBe(ErrorCode.BAD_REQUEST);
      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.statusCode).toBe(400);
      expect(result.retryable).toBe(false);
      expect(result.context).toEqual({ customField: 'value' });
    });

    it('should convert Error instance to AppError with default properties', () => {
      const originalError = new Error('Standard error message');
      originalError.name = 'CustomError';
      originalError.stack = 'Error stack trace';

      const result = buildAppErrorFromUnknown(originalError);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Standard error message');
      expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.statusCode).toBe(500);
      expect(result.retryable).toBe(false);
      expect(result.context).toEqual({
        originalError: 'CustomError',
        stack: 'Error stack trace'
      });
    });

    it('should convert Error instance to AppError with custom details', () => {
      const originalError = new Error('Error with details');
      const customDetails = { userId: 123, action: 'login' };

      const result = buildAppErrorFromUnknown(originalError, customDetails);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Error with details');
      expect(result.context).toEqual({
        originalError: 'Error',
        stack: originalError.stack,
        ...customDetails
      });
    });

    it('should convert string to AppError with default properties', () => {
      const errorString = 'Simple error string';

      const result = buildAppErrorFromUnknown(errorString);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('Simple error string');
      expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.statusCode).toBe(500);
      expect(result.retryable).toBe(false);
      expect(result.context).toBeUndefined();
    });

    it('should convert string to AppError with custom details', () => {
      const errorString = 'String error with details';
      const customDetails = { endpoint: '/api/test', method: 'POST' };

      const result = buildAppErrorFromUnknown(errorString, customDetails);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('String error with details');
      expect(result.context).toEqual(customDetails);
    });

    it('should convert null to AppError as string', () => {
      const result = buildAppErrorFromUnknown(null);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('null');
      expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.statusCode).toBe(500);
    });

    it('should convert undefined to AppError as string', () => {
      const result = buildAppErrorFromUnknown(undefined);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('undefined');
      expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.statusCode).toBe(500);
    });

    it('should convert number to AppError as string', () => {
      const result = buildAppErrorFromUnknown(42);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('42');
      expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.statusCode).toBe(500);
    });

    it('should convert object to AppError as string', () => {
      const errorObject = { message: 'Object error', code: 'CUSTOM_ERROR' };

      const result = buildAppErrorFromUnknown(errorObject);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('[object Object]');
      expect(result.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.statusCode).toBe(500);
    });

    it('should handle Error instances without stack property', () => {
      const errorWithoutStack = new Error('No stack');
      delete (errorWithoutStack as any).stack;

      const result = buildAppErrorFromUnknown(errorWithoutStack);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('No stack');
      expect(result.context).toEqual({
        originalError: 'Error'
      });
    });
  });

  describe('getAppVersion', () => {
    it('should return npm_package_version when set', () => {
      process.env.npm_package_version = '2.1.3';

      const result = getAppVersion();

      expect(result).toBe('2.1.3');
    });

    it('should return default version when npm_package_version is not set', () => {
      delete process.env.npm_package_version;

      const result = getAppVersion();

      expect(result).toBe('1.0.0');
    });

    it('should return default version when npm_package_version is empty string', () => {
      process.env.npm_package_version = '';

      const result = getAppVersion();

      expect(result).toBe('1.0.0');
    });

    it('should return npm_package_version even with complex version strings', () => {
      process.env.npm_package_version = '1.0.0-beta.1';

      const result = getAppVersion();

      expect(result).toBe('1.0.0-beta.1');
    });

    it('should return npm_package_version with build metadata', () => {
      process.env.npm_package_version = '1.2.3+build.456';

      const result = getAppVersion();

      expect(result).toBe('1.2.3+build.456');
    });
  });
});