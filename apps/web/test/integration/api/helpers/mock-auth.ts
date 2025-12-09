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
export async function mockGetRequestContextSDK(context: MockAuthContext) {
  const module = await import('@/lib/whop-sdk');
  return vi.spyOn(module, 'getRequestContextSDK').mockResolvedValue(context as RequestContext);
}

/**
 * Create authenticated test request
 */
export async function createAuthenticatedRequest(
  method: string,
  path: string,
  context: MockAuthContext = TEST_AUTH_CONTEXTS.authenticated,
  options: {
    body?: any;
    searchParams?: Record<string, string>;
  } = {}
) {
  const { createTestRequest } = await import('./test-utils');
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
export async function createUnauthenticatedRequest(
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
export async function mockRateLimitAllow() {
  const module = await import('@/server/middleware/rateLimit');
  return vi.spyOn(
    module,
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
export async function mockRateLimitDeny(retryAfter: number = 60) {
  const module = await import('@/server/middleware/rateLimit');
  return vi.spyOn(
    module,
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

























