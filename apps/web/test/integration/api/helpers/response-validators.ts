// Response validation utilities for API endpoint testing
// Provides helpers for validating API response formats

import { describe, test, expect } from 'vitest';
import type { ApiResponse } from '@/lib/apiResponse';

/**
 * Validate success response structure
 */
export function validateSuccessResponse<T = any>(
  response: Response,
  expectedStatus: number = 200
): void {
  expect(response.status).toBe(expectedStatus);
  
  const contentType = response.headers.get('content-type');
  expect(contentType).toContain('application/json');
}

/**
 * Validate error response structure
 */
export function validateErrorResponse(
  response: Response,
  expectedStatus: number
): void {
  expect(response.status).toBe(expectedStatus);
  
  const contentType = response.headers.get('content-type');
  expect(contentType).toContain('application/json');
}

/**
 * Validate API response format (success or error)
 */
export async function validateApiResponseFormat<T = any>(
  response: Response
): Promise<ApiResponse<T>> {
  const data = await response.json() as ApiResponse<T>;
  
  // Must have success field
  expect(data).toHaveProperty('success');
  expect(typeof data.success).toBe('boolean');
  
  if (data.success) {
    // Success response should have data
    expect(data).toHaveProperty('data');
    expect(data).not.toHaveProperty('error');
    
    // Should have meta
    if (data.meta) {
      expect(data.meta).toHaveProperty('timestamp');
      expect(data.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO 8601 format
      expect(data.meta).toHaveProperty('version');
    }
  } else {
    // Error response should have error
    expect(data).toHaveProperty('error');
    expect(data).not.toHaveProperty('data');
    
    // Error should have required fields
    if (data.error) {
      expect(data.error).toHaveProperty('message');
      expect(typeof data.error.message).toBe('string');
    }
  }
  
  return data;
}

/**
 * Validate meta fields in success response
 */
export function validateMetaFields(meta: ApiResponse['meta']): void {
  if (!meta) return;
  
  if (meta.requestId) {
    expect(typeof meta.requestId).toBe('string');
    expect(meta.requestId.length).toBeGreaterThan(0);
  }
  
  if (meta.timestamp) {
    expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  }
  
  if (meta.version) {
    expect(typeof meta.version).toBe('string');
  }
  
  if (meta.pagination) {
    expect(meta.pagination).toHaveProperty('page');
    expect(meta.pagination).toHaveProperty('limit');
    expect(meta.pagination).toHaveProperty('total');
    expect(meta.pagination).toHaveProperty('totalPages');
  }
}

/**
 * Validate error response fields
 */
export function validateErrorFields(error: any): void {
  expect(error).toHaveProperty('message');
  expect(typeof error.message).toBe('string');
  expect(error.message.length).toBeGreaterThan(0);
}

/**
 * Validate rate limit headers
 */
export function validateRateLimitHeaders(response: Response): void {
  const headers = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'];
  
  headers.forEach(header => {
    const value = response.headers.get(header);
    if (value !== null) {
      expect(typeof value).toBe('string');
      // Reset should be a timestamp
      if (header === 'X-RateLimit-Reset') {
        expect(Number(value)).toBeGreaterThan(0);
      }
    }
  });
}

/**
 * Validate cache control headers
 */
export function validateCacheControlHeaders(response: Response, shouldCache: boolean = false): void {
  const cacheControl = response.headers.get('Cache-Control');
  
  if (shouldCache) {
    expect(cacheControl).toBeTruthy();
  } else {
    // Should have no-cache for API responses
    if (cacheControl) {
      expect(cacheControl).toContain('no-cache');
    }
  }
}

/**
 * Validate date format (ISO 8601)
 */
export function validateDateFormat(dateString: string): void {
  expect(dateString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  
  // Should be parseable
  const date = new Date(dateString);
  expect(date.getTime()).not.toBeNaN();
}

/**
 * Validate pagination structure
 */
export function validatePagination(pagination: any): void {
  expect(pagination).toHaveProperty('page');
  expect(pagination).toHaveProperty('limit');
  expect(pagination).toHaveProperty('total');
  expect(pagination).toHaveProperty('totalPages');
  
  expect(typeof pagination.page).toBe('number');
  expect(typeof pagination.limit).toBe('number');
  expect(typeof pagination.total).toBe('number');
  expect(typeof pagination.totalPages).toBe('number');
  
  expect(pagination.page).toBeGreaterThan(0);
  expect(pagination.limit).toBeGreaterThan(0);
  expect(pagination.total).toBeGreaterThanOrEqual(0);
  expect(pagination.totalPages).toBeGreaterThanOrEqual(0);
}

/**
 * Validate array response structure
 */
export function validateArrayResponse<T>(data: T[], minLength: number = 0): void {
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThanOrEqual(minLength);
}

/**
 * Comprehensive response validator
 */
export async function validateResponse<T = any>(
  response: Response,
  options: {
    expectedStatus?: number;
    validateData?: (data: T) => void;
    validateError?: (error: any) => void;
    checkRateLimitHeaders?: boolean;
    checkCacheHeaders?: boolean;
  } = {}
): Promise<ApiResponse<T>> {
  const {
    expectedStatus = 200,
    validateData,
    validateError,
    checkRateLimitHeaders = false,
    checkCacheHeaders = false,
  } = options;

  // Validate status
  expect(response.status).toBe(expectedStatus);

  // Validate content type
  const contentType = response.headers.get('content-type');
  expect(contentType).toContain('application/json');

  // Parse and validate response format
  const apiResponse = await validateApiResponseFormat<T>(response);

  // Validate success/error structure
  if (apiResponse.success) {
    validateMetaFields(apiResponse.meta);
    if (validateData && apiResponse.data) {
      validateData(apiResponse.data);
    }
  } else {
    if (apiResponse.error) {
      validateErrorFields(apiResponse.error);
      if (validateError) {
        validateError(apiResponse.error);
      }
    }
  }

  // Validate headers
  if (checkRateLimitHeaders) {
    validateRateLimitHeaders(response);
  }

  if (checkCacheHeaders) {
    validateCacheControlHeaders(response, false);
  }

  return apiResponse;
}


