// Database health check endpoint tests
// Tests for GET /api/health?type=db

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { createTestRequest, executeApiRoute } from '../helpers/test-utils';
import { mockDatabase, mockDatabaseFailure, mockDbInit } from '../helpers/mock-db';

describe('GET /api/health?type=db - Request Validation', () => {
  test('accepts db type parameter', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    expect([200, 503]).toContain(response.status);
  });
});

describe('GET /api/health?type=db - Response Formatting', () => {
  test('returns correctly formatted database health response', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn().mockResolvedValue([
        { count: '3' } // 3 required tables exist
      ]),
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();

    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('connectionTime');
    expect(data).toHaveProperty('tablesCount');

    expect(['healthy', 'unhealthy']).toContain(data.status);
    expect(typeof data.connectionTime).toBe('number');
    expect(typeof data.tablesCount).toBe('number');
  });

  test('returns unhealthy status when tables are missing', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn().mockResolvedValue([
        { count: '1' } // Only 1 table exists, need 3
      ]),
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(503);
    
    const data = await response.json();
    expect(data.status).toBe('unhealthy');
  });
});

describe('GET /api/health?type=db - Error Handling', () => {
  test('handles database connection failure', async () => {
    mockDbInit(false);

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(503);
    
    const data = await response.json();
    expect(data.status).toBe('unhealthy');
  });

  test('handles database query errors', async () => {
    mockDbInit(true);
    mockDatabaseFailure();

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(503);
    
    const data = await response.json();
    expect(data.status).toBe('unhealthy');
  });

  test('includes connection time even on failure', async () => {
    mockDbInit(false);

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();
    
    expect(data).toHaveProperty('connectionTime');
    expect(typeof data.connectionTime).toBe('number');
  });
});

describe('GET /api/health?type=db - Authentication', () => {
  test('does not require authentication', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn().mockResolvedValue([{ count: '3' }]),
    });

    const request = createTestRequest({
      method: 'GET',
      path: '/api/health',
      searchParams: { type: 'db' },
      // No auth headers
    });

    const response = await executeApiRoute(GET, request);
    expect([200, 503]).toContain(response.status);
  });
});



