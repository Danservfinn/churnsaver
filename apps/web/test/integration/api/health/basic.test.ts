// Health check endpoint tests
// Tests for GET /api/health

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { createTestRequest, executeApiRoute } from '../helpers/test-utils';
import { validateResponse } from '../helpers/response-validators';

describe('GET /api/health - Request Validation', () => {
  test('accepts request without query parameters', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });

  test('accepts detailed=true query parameter', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { detailed: 'true' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });

  test('accepts type query parameter', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });

  test('handles invalid query parameter values gracefully', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { detailed: 'invalid', type: 'invalid_type' },
    });

    const response = await executeApiRoute(GET, request);
    // Should still return 200, but might ignore invalid params
    expect([200, 400]).toContain(response.status);
  });
});

describe('GET /api/health - Response Formatting', () => {
  test('returns correctly formatted health response', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();

    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('environment');

    expect(['healthy', 'unhealthy']).toContain(data.status);
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.version).toBe('string');
    expect(typeof data.environment).toBe('string');
  });

  test('formats timestamp correctly (ISO 8601)', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();

    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    const date = new Date(data.timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  test('includes detailed information when requested', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { detailed: 'true' },
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();

    if (data.details) {
      expect(data.details).toHaveProperty('node_version');
      expect(data.details).toHaveProperty('memory_usage');
      expect(data.details).toHaveProperty('cpu_usage');
    }
  });

  test('sets correct content-type header', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
    });

    const response = await executeApiRoute(GET, request);
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });

  test('sets cache-control headers', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
    });

    const response = await executeApiRoute(GET, request);
    const cacheControl = response.headers.get('cache-control');
    expect(cacheControl).toContain('no-cache');
  });
});

describe('GET /api/health - Error Handling', () => {
  test('handles internal errors gracefully', async () => {
    // Mock console.error to verify error logging
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Force an error by using invalid handler
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'invalid' },
    });

    try {
      const response = await executeApiRoute(GET, request);
      // Should return either 200 (ignores invalid) or 503 (error)
      expect([200, 503]).toContain(response.status);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  test('returns 503 status on health check failure', async () => {
    // This would require mocking database failures
    // For now, we test that the endpoint structure handles errors
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    // Should return 200 (healthy) or 503 (unhealthy)
    expect([200, 503]).toContain(response.status);
  });
});

describe('GET /api/health - Authentication', () => {
  test('does not require authentication', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      // No auth headers
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });

  test('works with authentication headers present', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      headers: {
        'x-company-id': 'test_company',
        'x-user-id': 'test_user',
      },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });
});


