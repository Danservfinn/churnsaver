// Whop SDK Test Utilities and Fixtures
// Comprehensive test helpers, fixtures, and utilities for Whop SDK testing

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createHmac } from 'crypto';

// Test Configuration Constants
export const TEST_CONFIG = {
  APP_ID: 'test_app_id_integration',
  API_KEY: 'test_api_key_16_chars',
  WEBHOOK_SECRET: 'test_webhook_secret_16_chars',
  ENVIRONMENT: 'test' as const,
  DEBUG_MODE: true,
  API_BASE_URL: 'https://api.test.whop.com/api/v5/app',
  REQUEST_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  ENABLE_METRICS: true,
  ENABLE_LOGGING: true,
  ENABLE_RETRY: true
};

// Webhook Event Fixtures
export const WEBHOOK_FIXTURES = {
  PAYMENT_SUCCEEDED: {
    id: 'evt_payment_succeeded_123',
    type: 'payment.succeeded',
    data: {
      id: 'pay_succeeded_456',
      amount: 2999,
      currency: 'USD',
      status: 'succeeded',
      user_id: 'user_payment_789',
      company_id: 'company_payment_101',
      membership_id: 'mem_payment_202',
      payment_method_type: 'card',
      metadata: {
        source: 'web',
        campaign: 'premium_upgrade',
        transaction_id: 'txn_303'
      }
    },
    created_at: '2023-12-01T12:00:00Z'
  },

  PAYMENT_FAILED: {
    id: 'evt_payment_failed_124',
    type: 'payment.failed',
    data: {
      id: 'pay_failed_457',
      amount: 4999,
      currency: 'USD',
      status: 'failed',
      user_id: 'user_payment_790',
      company_id: 'company_payment_102',
      failure_reason: 'insufficient_funds',
      payment_method_type: 'card',
      metadata: {
        attempt_count: 3,
        last_error: 'card_declined'
      }
    },
    created_at: '2023-12-01T12:05:00Z'
  },

  MEMBERSHIP_CREATED: {
    id: 'evt_membership_created_125',
    type: 'membership.created',
    data: {
      id: 'mem_created_458',
      user_id: 'user_membership_791',
      company_id: 'company_membership_103',
      plan_id: 'plan_premium_104',
      status: 'active',
      current_period_start: '2023-12-01T00:00:00Z',
      current_period_end: '2024-01-01T00:00:00Z',
      cancel_at_period_end: false,
      metadata: {
        trial_period: true,
        discount_code: 'WELCOME20'
      }
    },
    created_at: '2023-12-01T12:10:00Z'
  },

  MEMBERSHIP_UPDATED: {
    id: 'evt_membership_updated_126',
    type: 'membership.updated',
    data: {
      id: 'mem_updated_459',
      user_id: 'user_membership_792',
      company_id: 'company_membership_104',
      plan_id: 'plan_enterprise_105',
      status: 'active',
      current_period_start: '2023-12-01T00:00:00Z',
      current_period_end: '2024-01-01T00:00:00Z',
      cancel_at_period_end: false,
      previous_plan_id: 'plan_premium_104',
      metadata: {
        upgrade_reason: 'feature_needs',
        proration_amount: 1500
      }
    },
    created_at: '2023-12-15T10:30:00Z'
  },

  MEMBERSHIP_CANCELLED: {
    id: 'evt_membership_cancelled_127',
    type: 'membership.cancelled',
    data: {
      id: 'mem_cancelled_460',
      user_id: 'user_membership_793',
      company_id: 'company_membership_105',
      plan_id: 'plan_premium_106',
      status: 'cancelled',
      cancelled_at: '2023-12-20T15:45:00Z',
      current_period_end: '2024-01-01T00:00:00Z',
      cancel_at_period_end: true,
      metadata: {
        cancellation_reason: 'cost_too_high',
        feedback_score: 3
      }
    },
    created_at: '2023-12-20T15:45:00Z'
  },

  USER_CREATED: {
    id: 'evt_user_created_128',
    type: 'user.created',
    data: {
      id: 'user_created_461',
      email: 'newuser@example.com',
      username: 'newuser2023',
      first_name: 'John',
      last_name: 'Smith',
      metadata: {
        signup_source: 'organic',
        referral_code: 'FRIEND50'
      }
    },
    created_at: '2023-12-01T08:15:00Z'
  },

  COMPANY_CREATED: {
    id: 'evt_company_created_129',
    type: 'company.created',
    data: {
      id: 'comp_created_462',
      name: 'New Company Inc',
      slug: 'new-company-inc',
      website_url: 'https://newcompany.com',
      description: 'A new innovative company',
      metadata: {
        industry: 'technology',
        employee_count: '11-50'
      }
    },
    created_at: '2023-12-01T09:00:00Z'
  }
};

// API Response Fixtures
export const API_RESPONSE_FIXTURES = {
  USER_PROFILE: {
    success: true,
    data: {
      id: 'user_api_123',
      email: 'apiuser@example.com',
      username: 'apiuser',
      first_name: 'API',
      last_name: 'User',
      created_at: '2023-11-15T10:30:00Z',
      updated_at: '2023-12-01T14:20:00Z',
      metadata: {
        last_login: '2023-12-01T14:20:00Z',
        login_count: 42
      }
    }
  },

  MEMBERSHIP_LIST: {
    success: true,
    data: [
      {
        id: 'mem_list_1',
        user_id: 'user_list_123',
        plan_id: 'plan_basic',
        status: 'active',
        current_period_start: '2023-12-01T00:00:00Z',
        current_period_end: '2024-01-01T00:00:00Z'
      },
      {
        id: 'mem_list_2',
        user_id: 'user_list_123',
        plan_id: 'plan_premium',
        status: 'active',
        current_period_start: '2023-11-01T00:00:00Z',
        current_period_end: '2023-12-01T00:00:00Z'
      }
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1
    }
  },

  PAYMENT_LIST: {
    success: true,
    data: [
      {
        id: 'pay_list_1',
        amount: 2999,
        currency: 'USD',
        status: 'succeeded',
        user_id: 'user_list_123',
        created_at: '2023-12-01T12:00:00Z'
      },
      {
        id: 'pay_list_2',
        amount: 4999,
        currency: 'USD',
        status: 'succeeded',
        user_id: 'user_list_123',
        created_at: '2023-11-15T10:30:00Z'
      }
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1
    }
  },

  ERROR_RESPONSE: {
    success: false,
    error: 'Resource not found',
    message: 'The requested membership does not exist',
    code: 'MEMBERSHIP_NOT_FOUND'
  },

  VALIDATION_ERROR: {
    success: false,
    error: 'Validation failed',
    message: 'Invalid input parameters',
    details: {
      email: 'Invalid email format',
      username: 'Username must be at least 3 characters'
    }
  }
};

// Authentication Fixtures
export const AUTH_FIXTURES = {
  VALID_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0X3VzZXJfMTIzIiwiY29tcGFueUlkIjoidGVzdF9jb21wYW55XzQ1NiIsInBlcm1pc3Npb25zIjpbInJlYWQiLCJ3cml0ZSJdLCJpYXQiOjE3MDE5MjAwMDAsImV4cCI6MTcwMTkyMzYwMH0.test_signature',

  EXPIRED_JWT: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJleHBpcmVkX3VzZXIiLCJjb21wYW55SWQiOiJleHBpcmVkX2NvbXBhbnkiLCJpYXQiOjE2NzI1MzYwMDAsImV4cCI6MTY3MjUzOTkwMH0.expired_signature',

  INVALID_JWT: 'invalid.jwt.token.format',

  MALFORMED_JWT: 'malformed_jwt_token',

  USER_SESSION: {
    sessionId: 'sess_test_123',
    createdAt: Date.now() - 1000,
    lastAccessedAt: Date.now() - 500,
    expiresAt: Date.now() + 3600000,
    isActive: true,
    userId: 'test_user_123'
  },

  EXPIRED_SESSION: {
    sessionId: 'sess_expired_456',
    createdAt: Date.now() - 7200000, // 2 hours ago
    lastAccessedAt: Date.now() - 3600000, // 1 hour ago
    expiresAt: Date.now() - 1800000, // 30 minutes ago
    isActive: false,
    userId: 'expired_user_456'
  }
};

// Utility Functions for Test Setup
export class TestHelper {
  private originalEnv: NodeJS.ProcessEnv;

  constructor() {
    this.originalEnv = { ...process.env };
  }

  /**
   * Set up test environment with Whop configuration
   */
  setupTestEnvironment(config: Partial<typeof TEST_CONFIG> = {}) {
    const testConfig = { ...TEST_CONFIG, ...config };

    process.env.NODE_ENV = testConfig.ENVIRONMENT;
    process.env.NEXT_PUBLIC_WHOP_APP_ID = testConfig.APP_ID;
    process.env.WHOP_API_KEY = testConfig.API_KEY;
    process.env.WHOP_WEBHOOK_SECRET = testConfig.WEBHOOK_SECRET;

    // Clear require cache for fresh imports
    this.clearRequireCache();

    return testConfig;
  }

  /**
   * Restore original environment
   */
  restoreEnvironment() {
    process.env = this.originalEnv;
    this.clearRequireCache();
  }

  /**
   * Clear require cache for Whop SDK modules
   */
  private clearRequireCache() {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('/lib/whop/') || key.includes('/test/whop/')) {
        delete require.cache[key];
      }
    });
  }

  /**
   * Generate webhook signature for test payload
   */
  generateWebhookSignature(payload: any, secret: string = TEST_CONFIG.WEBHOOK_SECRET): string {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const signature = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');
    return `sha256=${signature}`;
  }

  /**
   * Create mock request object
   */
  createMockRequest(options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}) {
    const {
      method = 'POST',
      url = '/api/webhooks/whop',
      headers = {},
      body
    } = options;

    return {
      method,
      url,
      headers: {
        get: (name: string) => headers[name.toLowerCase()],
        ...headers
      },
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  }

  /**
   * Create mock response object
   */
  createMockResponse(options: {
    status?: number;
    headers?: Record<string, string>;
    body?: any;
  } = {}) {
    const {
      status = 200,
      headers = { 'content-type': 'application/json' },
      body = {}
    } = options;

    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => headers[name.toLowerCase()],
        ...headers
      },
      json: async () => body,
      text: async () => JSON.stringify(body)
    };
  }

  /**
   * Generate random test data
   */
  generateTestData(type: 'user' | 'membership' | 'payment' | 'company', index: number = 0) {
    const timestamp = new Date().toISOString();

    switch (type) {
      case 'user':
        return {
          id: `user_test_${index}`,
          email: `test${index}@example.com`,
          username: `testuser${index}`,
          first_name: `Test${index}`,
          last_name: `User${index}`,
          created_at: timestamp,
          updated_at: timestamp
        };

      case 'membership':
        return {
          id: `mem_test_${index}`,
          user_id: `user_test_${index}`,
          plan_id: `plan_test_${index}`,
          status: 'active',
          current_period_start: timestamp.replace('T', ' ').slice(0, -5),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, -5),
          created_at: timestamp,
          updated_at: timestamp
        };

      case 'payment':
        return {
          id: `pay_test_${index}`,
          amount: 1000 + index * 100,
          currency: 'USD',
          status: 'succeeded',
          user_id: `user_test_${index}`,
          payment_method_type: 'card',
          created_at: timestamp,
          updated_at: timestamp
        };

      case 'company':
        return {
          id: `comp_test_${index}`,
          name: `Test Company ${index}`,
          slug: `test-company-${index}`,
          website_url: `https://testcompany${index}.com`,
          created_at: timestamp,
          updated_at: timestamp
        };

      default:
        throw new Error(`Unknown test data type: ${type}`);
    }
  }

  /**
   * Create performance test scenario
   */
  createPerformanceScenario(scenario: 'webhooks' | 'auth' | 'api', count: number) {
    const scenarios = {
      webhooks: () => Array.from({ length: count }, (_, i) => ({
        ...WEBHOOK_FIXTURES.PAYMENT_SUCCEEDED,
        id: `evt_perf_${i}`,
        data: {
          ...WEBHOOK_FIXTURES.PAYMENT_SUCCEEDED.data,
          id: `pay_perf_${i}`,
          user_id: `user_perf_${i}`
        }
      })),

      auth: () => Array.from({ length: count }, (_, i) => ({
        token: `jwt_perf_${i}`,
        userId: `user_perf_${i}`,
        companyId: `company_perf_${i % 5}` // 5 companies for distribution
      })),

      api: () => Array.from({ length: count }, (_, i) => ({
        endpoint: `/api/test/${i}`,
        method: 'GET',
        expectedStatus: 200,
        expectedDuration: 50 + Math.random() * 100
      }))
    };

    return scenarios[scenario]();
  }

  /**
   * Simulate network conditions
   */
  simulateNetworkCondition(condition: 'normal' | 'slow' | 'unstable' | 'offline') {
    const conditions = {
      normal: { delay: 50, failureRate: 0 },
      slow: { delay: 1000, failureRate: 0 },
      unstable: { delay: 100, failureRate: 0.2 },
      offline: { delay: 0, failureRate: 1.0 }
    };

    return conditions[condition];
  }

  /**
   * Create security test scenarios
   */
  createSecurityScenarios() {
    return {
      xss: {
        name: 'XSS Attack',
        payload: {
          id: 'evt_xss_123',
          type: 'payment.succeeded',
          data: {
            metadata: {
              script: '<script>alert("xss")</script>',
              comment: '"><img src=x onerror=alert(1)>'
            }
          }
        }
      },

      sqlInjection: {
        name: 'SQL Injection',
        payload: {
          id: 'evt_sqli_456',
          type: 'user.created',
          data: {
            username: "admin' OR '1'='1",
            metadata: {
              query: "'; DROP TABLE users; --"
            }
          }
        }
      },

      pathTraversal: {
        name: 'Path Traversal',
        payload: {
          id: '../../../etc/passwd',
          type: 'payment.succeeded',
          data: {
            metadata: {
              file: '../../sensitive/config.json'
            }
          }
        }
      },

      largePayload: {
        name: 'Large Payload Attack',
        payload: {
          id: 'evt_large_789',
          type: 'payment.succeeded',
          data: {
            description: 'x'.repeat(100000), // 100KB payload
            metadata: { large: 'x'.repeat(50000) }
          }
        }
      },

      malformedJson: {
        name: 'Malformed JSON',
        payload: '{ "id": "evt_malformed", "type": "payment.succeeded", "data": { "amount": 1000 }',
        isString: true
      }
    };
  }
}

// Global test helper instance
export const testHelper = new TestHelper();

// Test Data Validators
export const TEST_VALIDATORS = {
  /**
   * Validate webhook fixture structure
   */
  validateWebhookFixture: (fixture: any) => {
    const requiredFields = ['id', 'type', 'data'];
    const missingFields = requiredFields.filter(field => !fixture[field]);

    if (missingFields.length > 0) {
      throw new Error(`Webhook fixture missing required fields: ${missingFields.join(', ')}`);
    }

    if (typeof fixture.data !== 'object') {
      throw new Error('Webhook fixture data field must be an object');
    }

    return true;
  },

  /**
   * Validate API response fixture structure
   */
  validateApiResponseFixture: (fixture: any) => {
    if (typeof fixture.success !== 'boolean') {
      throw new Error('API response fixture must have boolean success field');
    }

    if (fixture.success && !fixture.data) {
      throw new Error('Successful API response fixture must have data field');
    }

    if (!fixture.success && !fixture.error) {
      throw new Error('Failed API response fixture must have error field');
    }

    return true;
  },

  /**
   * Validate JWT token format
   */
  validateJwtFormat: (token: string) => {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('JWT token must have 3 parts separated by dots');
    }

    parts.forEach((part, index) => {
      if (!part || part.length === 0) {
        throw new Error(`JWT token part ${index} is empty`);
      }

      // Check if it's valid base64url (no padding required)
      try {
        Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      } catch {
        throw new Error(`JWT token part ${index} is not valid base64url`);
      }
    });

    return true;
  }
};

// Test Assertions Helpers
export const TEST_ASSERTIONS = {
  /**
   * Assert webhook validation result
   */
  assertWebhookValidation: (result: any, expected: { isValid: boolean; eventType?: string; eventId?: string }) => {
    expect(result.isValid).toBe(expected.isValid);

    if (expected.eventType) {
      expect(result.eventType).toBe(expected.eventType);
    }

    if (expected.eventId) {
      expect(result.eventId).toBe(expected.eventId);
    }
  },

  /**
   * Assert API response structure
   */
  assertApiResponse: (response: any, expected: { success: boolean; hasData?: boolean; errorCode?: string }) => {
    expect(response.success).toBe(expected.success);

    if (expected.hasData !== undefined) {
      if (expected.hasData) {
        expect(response.data).toBeDefined();
      } else {
        expect(response.data).toBeUndefined();
      }
    }

    if (expected.errorCode) {
      expect(response.code || response.error).toBe(expected.errorCode);
    }
  },

  /**
   * Assert observability logging
   */
  assertObservabilityLogged: (mockLogger: any, event: string, context: any) => {
    const calls = mockLogger.info.mock.calls.filter(([message]) =>
      message.includes(event)
    );

    expect(calls.length).toBeGreaterThan(0);

    const [message, loggedContext] = calls[0];
    Object.entries(context).forEach(([key, value]) => {
      expect(loggedContext[key]).toBe(value);
    });
  },

  /**
   * Assert metrics recorded
   */
  assertMetricsRecorded: (mockMetrics: any, metricName: string, expectedLabels: any = {}) => {
    const calls = mockMetrics.recordCounter.mock.calls.filter(([name]) =>
      name === metricName
    );

    expect(calls.length).toBeGreaterThan(0);

    const [, , labels] = calls[0];
    Object.entries(expectedLabels).forEach(([key, value]) => {
      expect(labels[key]).toBe(value);
    });
  }
};

// Performance Benchmarking Helpers
export const PERFORMANCE_HELPERS = {
  /**
   * Measure execution time of async function
   */
  measureExecutionTime: async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;

    return { result, duration };
  },

  /**
   * Run performance benchmark
   */
  runBenchmark: async (
    name: string,
    fn: () => Promise<any>,
    iterations: number = 100
  ): Promise<{
    name: string;
    iterations: number;
    totalTime: number;
    averageTime: number;
    minTime: number;
    maxTime: number;
  }> => {
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { duration } = await PERFORMANCE_HELPERS.measureExecutionTime(fn);
      times.push(duration);
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    return {
      name,
      iterations,
      totalTime,
      averageTime,
      minTime,
      maxTime
    };
  }
};

// Export all fixtures and utilities
export {
  WEBHOOK_FIXTURES as webhookFixtures,
  API_RESPONSE_FIXTURES as apiResponseFixtures,
  AUTH_FIXTURES as authFixtures,
  TEST_CONFIG as testConfig,
  TEST_VALIDATORS as validators,
  TEST_ASSERTIONS as assertions,
  PERFORMANCE_HELPERS as performance
};