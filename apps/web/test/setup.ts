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
vi.mock('@/src/lib/env', () => ({
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ENCRYPTION_KEY: 'dGVzdGVkZXlZWJfa2V0NvQ==', // base64 for 'test-key-32-bytes'
  WHOP_API_KEY: 'test-api-key-for-testing',
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