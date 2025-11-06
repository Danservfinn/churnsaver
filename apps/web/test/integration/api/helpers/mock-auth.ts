// Authentication mocking utilities for API endpoint testing
// Provides helpers for creating authenticated requests and mocking auth contexts

import { vi } from 'vitest';
import type { RequestContext } from '@/lib/whop-sdk';

/**
 * Mock authentication context
 */
export interface MockAuthContext {
  companyId: string;
  userId: string;
  isAuthenticated: boolean;
  role?: string;
}

/**
 * Default test auth contexts
 */
export const TEST_AUTH_CONTEXTS = {
  authenticated: {
    companyId: 'test_company_123',
    userId: 'test_user_456',
    isAuthenticated: true,
  },
  unauthenticated: {
    companyId: 'test_company_123',
    userId: 'anonymous',
    isAuthenticated: false,
  },
  differentCompany: {
    companyId: 'test_company_789',
    userId: 'test_user_101',
    isAuthenticated: true,
  },
} as const;

/**
 * Create authentication headers for a request
 */
export function createAuthHeaders(context: MockAuthContext): Record<string, string> {
  const headers: Record<string, string> = {
    'x-company-id': context.companyId,
    'x-user-id': context.userId,
    'x-authenticated': context.isAuthenticated ? 'true' : 'false',
  };

  // Add token header if authenticated
  if (context.isAuthenticated) {
    headers['x-whop-user-token'] = `mock_token_${context.companyId}_${context.userId}`;
  }

  return headers;
}

/**
 * Mock the getRequestContextSDK function
 */
export function mockGetRequestContextSDK(context: MockAuthContext) {
  return vi.spyOn(
    await import('@/lib/whop-sdk'),
    'getRequestContextSDK'
  ).mockResolvedValue(context as RequestContext);
}

/**
 * Create authenticated test request
 */
export function createAuthenticatedRequest(
  method: string,
  path: string,
  context: MockAuthContext = TEST_AUTH_CONTEXTS.authenticated,
  options: {
    body?: any;
    searchParams?: Record<string, string>;
  } = {}
) {
  const { createTestRequest } = require('./test-utils');
  return createTestRequest({
    method,
    path,
    headers: createAuthHeaders(context),
    body: options.body,
    searchParams: options.searchParams,
  });
}

/**
 * Create unauthenticated test request
 */
export function createUnauthenticatedRequest(
  method: string,
  path: string,
  options: {
    body?: any;
    searchParams?: Record<string, string>;
  } = {}
) {
  return createAuthenticatedRequest(method, path, TEST_AUTH_CONTEXTS.unauthenticated, options);
}

/**
 * Mock rate limiting to allow requests
 */
export function mockRateLimitAllow() {
  const { checkRateLimit } = require('@/server/middleware/rateLimit');
  return vi.spyOn(
    { checkRateLimit },
    'checkRateLimit'
  ).mockResolvedValue({
    allowed: true,
    resetAt: new Date(Date.now() + 60000),
    remaining: 100,
  });
}

/**
 * Mock rate limiting to deny requests
 */
export function mockRateLimitDeny(retryAfter: number = 60) {
  const { checkRateLimit } = require('@/server/middleware/rateLimit');
  return vi.spyOn(
    { checkRateLimit },
    'checkRateLimit'
  ).mockResolvedValue({
    allowed: false,
    resetAt: new Date(Date.now() + retryAfter * 1000),
    remaining: 0,
    retryAfter,
  });
}

/**
 * Restore all mocks
 */
export function restoreMocks() {
  vi.restoreAllMocks();
}


