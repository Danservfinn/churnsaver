// Webhook health check endpoint tests
// Tests for GET /api/health?type=webhooks

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { createTestRequest, executeApiRoute } from '../helpers/test-utils';
import { mockDatabase, mockDbInit } from '../helpers/mock-db';

describe('GET /api/health?type=webhooks - Request Validation', () => {
  test('accepts webhooks type parameter', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn().mockResolvedValue([
        { count: '10' } // Recent events count
      ]),
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'webhooks' },
    });

    const response = await executeApiRoute(GET, request);
    expect([200, 503]).toContain(response.status);
  });
});

describe('GET /api/health?type=webhooks - Response Formatting', () => {
  test('returns correctly formatted webhook health response', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([{ count: '10' }]) // Recent events count
        .mockResolvedValueOnce([]), // No recent event timestamp
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'webhooks' },
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();

    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('recentEventsCount');
    expect(data).toHaveProperty('recentEventsTimeframe');

    expect(['healthy', 'unhealthy']).toContain(data.status);
    expect(typeof data.recentEventsCount).toBe('number');
    expect(data.recentEventsTimeframe).toBe('24 hours');
  });

  test('handles zero recent events gracefully', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([{ count: '0' }]) // No recent events
        .mockResolvedValueOnce([]), // No recent event timestamp
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'webhooks' },
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();
    
    expect(data.status).toBe('healthy'); // Still healthy, just no traffic
    expect(data.recentEventsCount).toBe(0);
  });
});

describe('GET /api/health?type=webhooks - Error Handling', () => {
  test('handles database connection failure', async () => {
    mockDbInit(false);

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'webhooks' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(503);
    
    const data = await response.json();
    expect(data.status).toBe('unhealthy');
  });

  test('handles database query errors', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn().mockRejectedValue(new Error('Query failed')),
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'webhooks' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(503);
  });
});

describe('GET /api/health?type=webhooks - Authentication', () => {
  test('does not require authentication', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([{ count: '5' }])
        .mockResolvedValueOnce([]),
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'webhooks' },
      // No auth headers
    });

    const response = await executeApiRoute(GET, request);
    expect([200, 503]).toContain(response.status);
  });
});


