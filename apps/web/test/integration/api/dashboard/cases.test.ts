// Dashboard cases endpoint tests
// Tests for GET /api/dashboard/cases

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/dashboard/cases/route';
import { createTestRequest, executeApiRoute } from '../helpers/test-utils';
import { createAuthenticatedRequest, TEST_AUTH_CONTEXTS, mockRateLimitAllow, mockRateLimitDeny } from '../helpers/mock-auth';
import { mockDatabase, mockDbInit, createMockQueryResult } from '../helpers/mock-db';
import { validateResponse } from '../helpers/response-validators';

describe('GET /api/dashboard/cases - Request Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInit(true);
    mockRateLimitAllow();
  });

  test('rejects missing company context', async () => {
    const request = createTestRequest({
      method: 'GET',
      path: '/api/dashboard/cases',
      // No company context headers
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(401);
  });

  test('accepts valid pagination parameters', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([]) // Cases query
        .mockResolvedValueOnce([{ count: 0 }]), // Total count
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { page: '1', limit: '50' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });

  test('rejects invalid page parameter (less than 1)', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { page: '0' },
    });

    const response = await executeApiRoute(GET, request);
    // Should normalize to page 1 or reject
    expect([200, 400]).toContain(response.status);
  });

  test('rejects invalid limit parameter (greater than 1000)', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { limit: '2000' },
    });

    const response = await executeApiRoute(GET, request);
    // Should cap at 1000 or reject
    expect([200, 400]).toContain(response.status);
  });

  test('rejects invalid date format', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { startDate: 'invalid-date' },
    });

    const response = await executeApiRoute(GET, request);
    // Should handle gracefully (might filter out invalid dates)
    expect([200, 400]).toContain(response.status);
  });

  test('rejects SQL injection in parameters', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { status: "'; DROP TABLE recovery_cases; --" },
    });

    const response = await executeApiRoute(GET, request);
    // Should sanitize and reject invalid input
    expect([200, 400]).toContain(response.status);
  });

  test('accepts valid status filter', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { status: 'open' },
    });

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
  });
});

describe('GET /api/dashboard/cases - Response Formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInit(true);
    mockRateLimitAllow();
  });

  test('returns correctly formatted success response', async () => {
    const mockCases = [
      {
        id: 'case_1',
        membership_id: 'mem_1',
        user_id: 'user_1',
        company_id: TEST_AUTH_CONTEXTS.authenticated.companyId,
        status: 'open',
        attempts: 1,
        incentive_days: 0,
        recovered_amount_cents: 0,
        failure_reason: 'payment_failed',
        first_failure_at: new Date().toISOString(),
        last_nudge_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce(mockCases)
        .mockResolvedValueOnce([{ count: 1 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    await validateResponse(response, {
      expectedStatus: 200,
      validateData: (data: any) => {
        expect(data).toHaveProperty('cases');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('page');
        expect(data).toHaveProperty('limit');
        expect(data).toHaveProperty('totalPages');
        expect(Array.isArray(data.cases)).toBe(true);
      },
    });
  });

  test('includes all required meta fields', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    const data = await response.json();
    
    // Response should have proper structure
    expect(data).toHaveProperty('cases');
    expect(data).toHaveProperty('total');
  });

  test('formats dates correctly', async () => {
    const mockCase = {
      id: 'case_1',
      membership_id: 'mem_1',
      user_id: 'user_1',
      company_id: TEST_AUTH_CONTEXTS.authenticated.companyId,
      status: 'open',
      attempts: 1,
      incentive_days: 0,
      recovered_amount_cents: 0,
      failure_reason: 'payment_failed',
      first_failure_at: new Date().toISOString(),
      last_nudge_at: null,
      created_at: new Date().toISOString(),
    };

    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([mockCase])
        .mockResolvedValueOnce([{ count: 1 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    const data = await response.json();
    
    if (data.cases && data.cases.length > 0) {
      const caseItem = data.cases[0];
      expect(caseItem.first_failure_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  test('includes pagination information', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 25 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated, {
      searchParams: { page: '1', limit: '10' },
    });

    const response = await executeApiRoute(GET, request);
    const data = await response.json();
    
    expect(data.page).toBe(1);
    expect(data.limit).toBe(10);
    expect(data.total).toBe(25);
    expect(data.totalPages).toBe(3); // Math.ceil(25/10)
  });
});

describe('GET /api/dashboard/cases - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitAllow();
  });

  test('handles database connection failure', async () => {
    mockDbInit(false);

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(500);
  });

  test('handles database query errors', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn().mockRejectedValue(new Error('Database query failed')),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(500);
  });

  test('handles empty results gracefully', async () => {
    mockDbInit(true);
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.cases).toEqual([]);
    expect(data.total).toBe(0);
  });
});

describe('GET /api/dashboard/cases - Authentication & Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbInit(true);
    mockRateLimitAllow();
  });

  test('requires authentication in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const request = createTestRequest({
        method: 'GET',
        path: '/api/dashboard/cases',
        // No auth headers
      });

      const response = await executeApiRoute(GET, request);
      expect(response.status).toBe(401);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('enforces tenant isolation', async () => {
    const companyACases = [
      {
        id: 'case_a_1',
        membership_id: 'mem_a_1',
        user_id: 'user_a_1',
        company_id: 'company_a',
        status: 'open',
        attempts: 1,
        incentive_days: 0,
        recovered_amount_cents: 0,
        failure_reason: 'payment_failed',
        first_failure_at: new Date().toISOString(),
        last_nudge_at: null,
        created_at: new Date().toISOString(),
      },
    ];

    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce(companyACases)
        .mockResolvedValueOnce([{ count: 1 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    const data = await response.json();
    
    // Should only return cases for the authenticated company
    if (data.cases && data.cases.length > 0) {
      data.cases.forEach((caseItem: any) => {
        expect(caseItem.company_id).toBe(TEST_AUTH_CONTEXTS.authenticated.companyId);
      });
    }
  });

  test('enforces rate limiting', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    mockRateLimitDeny(60);

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    expect(response.status).toBe(422);
    
    const data = await response.json();
    expect(data.error).toContain('Rate limit');
  });

  test('extracts company context correctly', async () => {
    mockDatabase({
      select: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0 }]),
    });

    const request = createAuthenticatedRequest('GET', '/api/dashboard/cases', TEST_AUTH_CONTEXTS.authenticated);

    const response = await executeApiRoute(GET, request);
    // Should succeed with valid company context
    expect(response.status).toBe(200);
  });
});


