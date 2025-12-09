// Test setup for Vitest
// This file is automatically loaded before each test run

// Mock console methods to avoid noise in tests
global.console = {
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Mock environment variables for testing
process.env.NODE_ENV = 'test';

// Set up global test utilities
import { vi } from 'vitest';

// Mock any global dependencies if needed
vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    ENCRYPTION_KEY: 'dGVzdGVkZXlZWJfa2V0NvQ==', // base64 for 'test-key-32-bytes'
    WHOP_API_KEY: 'test-api-key',
    WHOP_APP_ID: 'test-app-id',
    WHOP_WEBHOOK_SECRET: 'whsec_test_secret',
    NODE_ENV: 'test',
  },
  additionalEnv: {
    KPI_ATTRIBUTION_WINDOW_DAYS: 30,
    CASE_EXPIRY_WINDOW_DAYS: 90,
  },
  isProductionLikeEnvironment: () => false,
  validateWebhookTimestampSkew: () => {},
}));

// Mock whop auth service to prevent initialization errors during tests
vi.mock('@/src/lib/whop/auth', () => ({
WhopAuthService: {
  revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  validateToken: vi.fn().mockResolvedValue({ valid: true }),
  refreshToken: vi.fn().mockResolvedValue({ valid: true }),
  getUser: vi.fn().mockResolvedValue(undefined),
  getAuthUrl: vi.fn().mockReturnValue('https://test-auth.whop.com'),
  getClient: vi.fn().mockReturnValue({
    apiKey: 'test-api-key',
    auth: {
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      refreshAccessToken: vi.fn().mockResolvedValue('test-token'),
      logout: vi.fn().mockResolvedValue(undefined),
    }
  }),
  verifyWebhook: vi.fn().mockResolvedValue({ valid: true }),
  createWebhook: vi.fn().mockResolvedValue({ id: 'test-webhook-id' }),
  updateWebhook: vi.fn().mockResolvedValue(undefined),
  deleteWebhook: vi.fn().mockResolvedValue(undefined),
  getWebhooks: vi.fn().mockResolvedValue([]),
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'test-subscription-id' }),
    update: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ id: 'test-subscription-id' }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([{ id: 'test-subscription-id' }]),
  },
},
}));

// Also mock the path without src prefix to handle imports like in security-monitoring.ts
vi.mock('@/lib/whop/auth', () => ({
WhopAuthService: {
  revokeAllUserSessions: vi.fn().mockResolvedValue(undefined),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  validateToken: vi.fn().mockResolvedValue({ valid: true }),
  refreshToken: vi.fn().mockResolvedValue({ valid: true }),
  getUser: vi.fn().mockResolvedValue(undefined),
  getAuthUrl: vi.fn().mockReturnValue('https://test-auth.whop.com'),
  getClient: vi.fn().mockReturnValue({
    apiKey: 'test-api-key',
    auth: {
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
      refreshAccessToken: vi.fn().mockResolvedValue('test-token'),
      logout: vi.fn().mockResolvedValue(undefined),
    }
  }),
  verifyWebhook: vi.fn().mockResolvedValue({ valid: true }),
  createWebhook: vi.fn().mockResolvedValue({ id: 'test-webhook-id' }),
  updateWebhook: vi.fn().mockResolvedValue(undefined),
  deleteWebhook: vi.fn().mockResolvedValue(undefined),
  getWebhooks: vi.fn().mockResolvedValue([]),
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'test-subscription-id' }),
    update: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ id: 'test-subscription-id' }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([{ id: 'test-subscription-id' }]),
  },
},
}));

// Mock Whop SDK config to avoid runtime validation errors
vi.mock('@/lib/whop/sdkConfig', () => {
  const config = {
    appId: 'test-app-id',
    apiKey: 'test-api-key-for-testing',
    webhookSecret: 'whsec_test_secret',
    apiBaseUrl: 'https://api.whop.com/api/v1',
    requestTimeout: 30000,
    maxRetries: 0,
    retryDelay: 0,
    enableMetrics: false,
    enableLogging: false,
    enableRetry: false,
    environment: 'development',
    debugMode: false,
  };

  return {
    whopConfig: {
      get: () => config,
      validate: () => ({ isValid: true, errors: [], warnings: [], config }),
      isDevelopment: () => true,
      isStaging: () => false,
      isProduction: () => false,
      getCurrentEnvironment: () => 'development',
    },
    getWhopSdkConfig: () => config,
    validateWhopSdkConfig: () => ({ isValid: true, errors: [], warnings: [], config }),
    isDevelopment: () => true,
    isStaging: () => false,
    isProduction: () => false,
    getCurrentEnvironment: () => 'development',
  };
});

// Global mock for Whop SDK to avoid network calls and API key requirements
vi.mock('@/lib/whop-sdk', () => ({
  whopsdk: {
    verifyUserToken: vi.fn().mockResolvedValue({ userId: 'test-user' }),
    users: {
      checkAccess: vi.fn().mockResolvedValue({ has_access: true }),
      retrieve: vi.fn().mockResolvedValue({ id: 'test-user' }),
    },
    companies: {
      retrieve: vi.fn().mockResolvedValue({ id: 'test-company' }),
    },
    experiences: {
      retrieve: vi.fn().mockResolvedValue({ id: 'test-experience' }),
    },
  },
  getRequestContextSDK: vi.fn().mockResolvedValue({
    companyId: 'test-company',
    userId: 'test-user',
    isAuthenticated: true,
  }),
  getWebhookCompanyContext: vi.fn().mockReturnValue('test-company'),
  verifyUserToken: vi.fn().mockResolvedValue({ userId: 'test-user' }),
  checkUserAccess: vi.fn().mockResolvedValue({ hasAccess: true }),
  retrieveUser: vi.fn().mockResolvedValue({ id: 'test-user' }),
  retrieveCompany: vi.fn().mockResolvedValue({ id: 'test-company' }),
  retrieveExperience: vi.fn().mockResolvedValue({ id: 'test-experience' }),
  default: {},
}));

// Setup testing-library/jest-dom matchers for Vitest
// Note: Vitest uses a different expect API, so we'll set up matchers manually
import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Export test utilities for use in test files
export const testUtils = {
  // Helper to create mock responses
  createMockResponse: <T>(data: T) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as any),
  
  // Helper to wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to create test company context
  createTestCompanyContext: (companyId: string = 'test-company-123') => ({
    companyId,
    userId: 'test-user-456',
  }),
};