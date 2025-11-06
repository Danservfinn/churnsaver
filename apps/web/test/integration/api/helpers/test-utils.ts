// Test utilities for API endpoint testing
// Provides helpers for creating requests, making HTTP calls, and validating responses

import { NextRequest } from 'next/server';
import { vi } from 'vitest';

/**
 * Options for creating test requests
 */
export interface TestRequestOptions {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: any;
  searchParams?: Record<string, string>;
  cookies?: Record<string, string>;
}

/**
 * Create a NextRequest-like object for testing
 */
export function createTestRequest(options: TestRequestOptions = {}): NextRequest {
  const {
    method = 'GET',
    path = '/',
    headers = {},
    body,
    searchParams = {},
    cookies = {}
  } = options;

  // Build URL with search params
  const url = new URL(path, 'http://localhost:3000');
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // Create headers object
  const headersObj = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    headersObj.set(key, value);
  });

  // Create request init
  const requestInit: RequestInit = {
    method,
    headers: headersObj,
  };

  if (body) {
    if (typeof body === 'string') {
      requestInit.body = body;
    } else {
      requestInit.body = JSON.stringify(body);
      headersObj.set('Content-Type', 'application/json');
    }
  }

  // Create NextRequest
  const request = new NextRequest(url, requestInit);

  // Add cookies if provided
  if (Object.keys(cookies).length > 0) {
    const cookieHeader = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headersObj.set('Cookie', cookieHeader);
  }

  return request;
}

/**
 * Execute an API route handler and return the response
 */
export async function executeApiRoute(
  handler: (request: NextRequest, context?: any) => Promise<Response>,
  request: NextRequest,
  context?: any
): Promise<Response> {
  try {
    const response = await handler(request, context);
    return response;
  } catch (error) {
    // Convert errors to response-like objects for testing
    throw error;
  }
}

/**
 * Parse JSON response body
 */
export async function parseJsonResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON response: ${text.substring(0, 200)}`);
  }
}

/**
 * Extract response headers as plain object
 */
export function extractHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * Wait for a specified amount of time (useful for rate limit testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create multiple requests in parallel
 */
export async function createConcurrentRequests<T>(
  count: number,
  requestFn: (index: number) => Promise<T>
): Promise<T[]> {
  const requests = Array.from({ length: count }, (_, i) => requestFn(i));
  return Promise.all(requests);
}

/**
 * Test helper to mock environment variables
 */
export function withMockEnv<T>(
  envVars: Record<string, string | undefined>,
  fn: () => T
): T {
  const originalEnv = { ...process.env };
  
  // Set new env vars
  Object.entries(envVars).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return fn();
  } finally {
    // Restore original env vars
    process.env = originalEnv;
  }
}

/**
 * Mock Next.js route params
 */
export function createRouteParams(params: Record<string, string>): Promise<Record<string, string>> {
  return Promise.resolve(params);
}

/**
 * Helper to create test URL with path params
 */
export function createTestUrl(
  path: string,
  pathParams?: Record<string, string>,
  searchParams?: Record<string, string>
): string {
  let url = path;
  
  // Replace path params
  if (pathParams) {
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`[${key}]`, value);
    });
  }

  // Add search params
  if (searchParams && Object.keys(searchParams).length > 0) {
    const urlObj = new URL(url, 'http://localhost:3000');
    Object.entries(searchParams).forEach(([key, value]) => {
      urlObj.searchParams.set(key, value);
    });
    return urlObj.pathname + urlObj.search;
  }

  return url;
}


