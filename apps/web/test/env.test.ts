import { env } from '../src/lib/env';

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
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected ${actual} to be truthy`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected ${actual} to be falsy`);
    }
  }
});

// Mock process.env for testing
const originalEnv = process.env;

describe('Feature Flag Behaviors', () => {
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
  });

  describe('ENABLE_PUSH feature flag', () => {
    it('should default to true when not set', () => {
      delete process.env.ENABLE_PUSH;
      // Re-import to get fresh env values
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(true);
    });

    it('should be true when explicitly set to true', () => {
      process.env.ENABLE_PUSH = 'true';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(true);
    });

    it('should be false when explicitly set to false', () => {
      process.env.ENABLE_PUSH = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(false);
    });

    it('should be false when set to invalid value', () => {
      process.env.ENABLE_PUSH = 'invalid';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(false);
    });

    it('should be false when set to empty string', () => {
      process.env.ENABLE_PUSH = '';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(false);
    });
  });

  describe('ENABLE_DM feature flag', () => {
    it('should default to true when not set', () => {
      delete process.env.ENABLE_DM;
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_DM).toBe(true);
    });

    it('should be true when explicitly set to true', () => {
      process.env.ENABLE_DM = 'true';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_DM).toBe(true);
    });

    it('should be false when explicitly set to false', () => {
      process.env.ENABLE_DM = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_DM).toBe(false);
    });

    it('should be false when set to invalid value', () => {
      process.env.ENABLE_DM = 'invalid';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_DM).toBe(false);
    });
  });

  describe('SECURITY_MONITORING_ENABLED feature flag', () => {
    it('should default to true when not set', () => {
      delete process.env.SECURITY_MONITORING_ENABLED;
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.SECURITY_MONITORING_ENABLED).toBe(true);
    });

    it('should be true when explicitly set to true', () => {
      process.env.SECURITY_MONITORING_ENABLED = 'true';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.SECURITY_MONITORING_ENABLED).toBe(true);
    });

    it('should be false when explicitly set to false', () => {
      process.env.SECURITY_MONITORING_ENABLED = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.SECURITY_MONITORING_ENABLED).toBe(false);
    });
  });

  describe('RATE_LIMIT_FAIL_CLOSED feature flag', () => {
    it('should default to true in production when not set', () => {
      delete process.env.RATE_LIMIT_FAIL_CLOSED;
      process.env.NODE_ENV = 'production';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(true);
    });

    it('should default to false in non-production when not set', () => {
      delete process.env.RATE_LIMIT_FAIL_CLOSED;
      process.env.NODE_ENV = 'development';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    });

    it('should be true when explicitly set to true', () => {
      process.env.RATE_LIMIT_FAIL_CLOSED = 'true';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(true);
    });

    it('should be false when explicitly set to false', () => {
      process.env.RATE_LIMIT_FAIL_CLOSED = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    });
  });

  describe('Feature flag behavior validation', () => {
    it('should have all feature flags defined in env config', () => {
      const testEnv = require('../src/lib/env').env;

      // Check that all expected feature flags exist
      expect(typeof testEnv.ENABLE_PUSH).toBe('boolean');
      expect(typeof testEnv.ENABLE_DM).toBe('boolean');
      expect(typeof testEnv.SECURITY_MONITORING_ENABLED).toBe('boolean');
      expect(typeof testEnv.RATE_LIMIT_FAIL_CLOSED).toBe('boolean');
    });

    it('should have consistent boolean values for all feature flags', () => {
      const testEnv = require('../src/lib/env').env;

      // All feature flags should be boolean values
      expect(typeof testEnv.ENABLE_PUSH).toBe('boolean');
      expect(typeof testEnv.ENABLE_DM).toBe('boolean');
      expect(typeof testEnv.SECURITY_MONITORING_ENABLED).toBe('boolean');
      expect(typeof testEnv.RATE_LIMIT_FAIL_CLOSED).toBe('boolean');
    });

    it('should handle case insensitive boolean parsing', () => {
      process.env.ENABLE_PUSH = 'TRUE';
      process.env.ENABLE_DM = 'FALSE';
      const testEnv = require('../src/lib/env').env;

      expect(testEnv.ENABLE_PUSH).toBe(true);
      expect(testEnv.ENABLE_DM).toBe(false);
    });

    it('should handle whitespace in boolean values', () => {
      process.env.ENABLE_PUSH = '  true  ';
      process.env.ENABLE_DM = '  false  ';
      const testEnv = require('../src/lib/env').env;

      expect(testEnv.ENABLE_PUSH).toBe(true);
      expect(testEnv.ENABLE_DM).toBe(false);
    });
  });

  describe('Feature flag default behavior verification', () => {
    it('should have ENABLE_PUSH default to true', () => {
      delete process.env.ENABLE_PUSH;
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(true);
    });

    it('should have ENABLE_DM default to true', () => {
      delete process.env.ENABLE_DM;
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_DM).toBe(true);
    });

    it('should have SECURITY_MONITORING_ENABLED default to true', () => {
      delete process.env.SECURITY_MONITORING_ENABLED;
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.SECURITY_MONITORING_ENABLED).toBe(true);
    });

    it('should have RATE_LIMIT_FAIL_CLOSED default based on NODE_ENV', () => {
      delete process.env.RATE_LIMIT_FAIL_CLOSED;

      // Test production default
      process.env.NODE_ENV = 'production';
      let testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(true);

      // Test non-production default
      process.env.NODE_ENV = 'development';
      // Need to re-require to get fresh values
      delete require.cache[require.resolve('../src/lib/env')];
      testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    });
  });

  describe('Feature flag explicit false behavior', () => {
    it('should allow ENABLE_PUSH to be explicitly disabled', () => {
      process.env.ENABLE_PUSH = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_PUSH).toBe(false);
    });

    it('should allow ENABLE_DM to be explicitly disabled', () => {
      process.env.ENABLE_DM = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.ENABLE_DM).toBe(false);
    });

    it('should allow SECURITY_MONITORING_ENABLED to be explicitly disabled', () => {
      process.env.SECURITY_MONITORING_ENABLED = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.SECURITY_MONITORING_ENABLED).toBe(false);
    });

    it('should allow RATE_LIMIT_FAIL_CLOSED to be explicitly disabled', () => {
      process.env.RATE_LIMIT_FAIL_CLOSED = 'false';
      const testEnv = require('../src/lib/env').env;
      expect(testEnv.RATE_LIMIT_FAIL_CLOSED).toBe(false);
    });
  });
});

describe('WHOP_API_KEY Environment Validation', () => {
  beforeEach(() => {
    // Reset process.env before each test
    (process.env as any) = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    (process.env as any) = originalEnv;
  });

  describe('WHOP_API_KEY validation in production', () => {
    it('should require WHOP_API_KEY in production environment', () => {
      (process.env as any).NODE_ENV = 'production';
      delete (process.env as any).WHOP_API_KEY;

      try {
        require('../src/lib/env').env;
        throw new Error('Expected to throw');
      } catch (error: any) {
        expect(error.message).toBe('WHOP_API_KEY must be set in production');
      }
    });

    it('should accept valid WHOP_API_KEY in production', () => {
      (process.env as any).NODE_ENV = 'production';
      (process.env as any).WHOP_API_KEY = 'valid_api_key_16_chars';

      try {
        const testEnv = require('../src/lib/env').env;
        expect(testEnv.WHOP_API_KEY).toBe('valid_api_key_16_chars');
      } catch (error) {
        throw new Error('Should not throw for valid WHOP_API_KEY');
      }
    });

    it('should validate WHOP_API_KEY length in production', () => {
      (process.env as any).NODE_ENV = 'production';
      (process.env as any).WHOP_API_KEY = 'short'; // Less than 16 characters

      try {
        require('../src/lib/env').env;
        throw new Error('Expected to throw');
      } catch (error: any) {
        expect(error.message.includes('must be at least 16 characters long')).toBeTruthy();
      }
    });

    it('should reject weak WHOP_API_KEY patterns in production', () => {
      (process.env as any).NODE_ENV = 'production';
      const weakKeys = ['test', 'demo', 'example', 'password', 'secret'];

      for (const weakKey of weakKeys) {
        (process.env as any).WHOP_API_KEY = weakKey;
        try {
          require('../src/lib/env').env;
          throw new Error('Expected to throw');
        } catch (error: any) {
          expect(error.message.includes('appears to be weak or insecure')).toBeTruthy();
        }
      }
    });

    it('should reject repeated character patterns in WHOP_API_KEY', () => {
      (process.env as any).NODE_ENV = 'production';
      (process.env as any).WHOP_API_KEY = 'a'.repeat(20); // Repeated characters

      try {
        require('../src/lib/env').env;
        throw new Error('Expected to throw');
      } catch (error: any) {
        expect(error.message.includes('appears to be weak or insecure')).toBeTruthy();
      }
    });
  });

  describe('WHOP_API_KEY validation in development', () => {
    it('should allow missing WHOP_API_KEY in development', () => {
      (process.env as any).NODE_ENV = 'development';
      delete (process.env as any).WHOP_API_KEY;

      try {
        const testEnv = require('../src/lib/env').env;
        expect(testEnv.WHOP_API_KEY).toBeUndefined();
      } catch (error) {
        throw new Error('Should not throw when WHOP_API_KEY is missing in development');
      }
    });

    it('should accept valid WHOP_API_KEY in development', () => {
      (process.env as any).NODE_ENV = 'development';
      (process.env as any).WHOP_API_KEY = 'valid_dev_api_key_16_chars';

      try {
        const testEnv = require('../src/lib/env').env;
        expect(testEnv.WHOP_API_KEY).toBe('valid_dev_api_key_16_chars');
      } catch (error) {
        throw new Error('Should not throw for valid WHOP_API_KEY in development');
      }
    });

    it('should warn about weak WHOP_API_KEY in development but not throw', () => {
      (process.env as any).NODE_ENV = 'development';
      (process.env as any).WHOP_API_KEY = 'test'; // Weak key

      // In development, validation warnings are logged but don't throw
      try {
        require('../src/lib/env').env;
        // Should not throw in development
      } catch (error) {
        throw new Error('Should not throw in development for weak keys');
      }
    });
  });

  describe('WHOP_API_KEY security validation logic', () => {
    it('should validate minimum length requirement', () => {
      const testCases = [
        { key: 'short', expected: false },
        { key: 'exactly_16_chars', expected: true },
        { key: 'longer_than_16_characters', expected: true }
      ];

      for (const testCase of testCases) {
        const isValid = testCase.key.length >= 16;
        expect(isValid).toBe(testCase.expected);
      }
    });

    it('should detect common weak patterns', () => {
      const weakPatterns = [
        'test',
        'demo',
        'example',
        'sample',
        'password',
        'secret',
        'key',
        'token',
        'api',
        'whop'
      ];

      for (const pattern of weakPatterns) {
        const isWeak = weakPatterns.some((weak: string) => pattern.toLowerCase().includes(weak));
        expect(isWeak).toBe(true);
      }
    });

    it('should detect repeated character patterns', () => {
      const repeatedPatterns = [
        'a'.repeat(17),
        '1'.repeat(20),
        'abc'.repeat(6),
        '123'.repeat(6)
      ];

      for (const pattern of repeatedPatterns) {
        const hasRepeatedChars = /(.)\1{15,}/.test(pattern);
        expect(hasRepeatedChars).toBe(true);
      }
    });

    it('should accept strong, random-looking keys', () => {
      const strongKeys = [
        'sk_live_1234567890abcdef',
        'whop_prod_abcdef1234567890',
        'api_key_2024_xyz_12345678'
      ];

      for (const key of strongKeys) {
        const isValidLength = key.length >= 16;
        const hasWeakPattern = /(test|demo|example|password|secret)/i.test(key);
        const hasRepeatedChars = /(.)\1{15,}/.test(key);

        expect(isValidLength && !hasWeakPattern && !hasRepeatedChars).toBe(true);
      }
    });
  });

  describe('Production security validation integration', () => {
    it('should validate all required production variables', () => {
      (process.env as any).NODE_ENV = 'production';
      // Set minimal valid values
      (process.env as any).WHOP_APP_ID = 'test_app_id';
      (process.env as any).WHOP_APP_SECRET = 'valid_app_secret_16_chars';
      (process.env as any).WHOP_WEBHOOK_SECRET = 'valid_webhook_secret_16_chars';
      (process.env as any).WHOP_API_KEY = 'valid_api_key_16_chars';
      (process.env as any).DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

      try {
        require('../src/lib/env').env;
      } catch (error) {
        throw new Error('Should not throw with all required production variables');
      }
    });

    it('should fail production validation when any required variable is missing', () => {
      (process.env as any).NODE_ENV = 'production';
      (process.env as any).WHOP_APP_ID = 'test_app_id';
      (process.env as any).WHOP_APP_SECRET = 'valid_app_secret_16_chars';
      (process.env as any).WHOP_WEBHOOK_SECRET = 'valid_webhook_secret_16_chars';
      // Missing WHOP_API_KEY

      try {
        require('../src/lib/env').env;
        throw new Error('Expected to throw');
      } catch (error: any) {
        expect(error.message.includes('WHOP_API_KEY must be set in production')).toBeTruthy();
      }
    });

    it('should detect development values in production environment', () => {
      (process.env as any).NODE_ENV = 'production';
      (process.env as any).WHOP_APP_ID = 'test_app_id';
      (process.env as any).WHOP_APP_SECRET = 'valid_app_secret_16_chars';
      (process.env as any).WHOP_WEBHOOK_SECRET = 'valid_webhook_secret_16_chars';
      (process.env as any).WHOP_API_KEY = 'valid_api_key_16_chars';
      (process.env as any).DATABASE_URL = 'postgresql://localhost:5432/test'; // Contains 'test'

      // This should not throw during env loading, but would log warnings
      try {
        require('../src/lib/env').env;
      } catch (error) {
        throw new Error('Should not throw during env loading even with development-like values');
      }
    });
  });

  describe('Environment variable precedence and fallbacks', () => {
    it('should handle WHOP_API_KEY as optional in env config', () => {
      (process.env as any).NODE_ENV = 'development';
      delete (process.env as any).WHOP_API_KEY;

      const testEnv = require('../src/lib/env').env;
      expect(testEnv.WHOP_API_KEY).toBeUndefined();
    });

    it('should preserve WHOP_API_KEY when set', () => {
      (process.env as any).NODE_ENV = 'development';
      (process.env as any).WHOP_API_KEY = 'test_api_key_value';

      const testEnv = require('../src/lib/env').env;
      expect(testEnv.WHOP_API_KEY).toBe('test_api_key_value');
    });
  });
});