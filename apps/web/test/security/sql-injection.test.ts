import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findExistingCase } from '@/server/services/cases';

const paramsSeen: unknown[][] = [];

const mockSelect = vi.fn(async (_query: string, params: unknown[]) => {
  paramsSeen.push(params);
  return [];
});

vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: mockSelect,
  },
}));

vi.mock('@/lib/errorHandler', () => ({
  errorHandler: {
    wrapAsync: async (fn: () => unknown) => ({ success: true, data: await fn() }),
  },
  ErrorCode: { DATABASE_QUERY_ERROR: 'DATABASE_QUERY_ERROR' },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: { KPI_ATTRIBUTION_WINDOW_DAYS: 30, CASE_EXPIRY_WINDOW_DAYS: 30 },
}));

describe('SQL Injection Prevention', () => {
  const maliciousInputs = [
    "'; DROP TABLE recovery_cases; --",
    "1' OR '1'='1",
    '1; SELECT * FROM users; --',
    "mem_123'; UPDATE recovery_cases SET status='recovered' WHERE '1'='1",
    '$(whoami)',
    "<script>alert('xss')</script>",
  ];

  beforeEach(() => {
    paramsSeen.length = 0;
    mockSelect.mockClear();
  });

  it.each(maliciousInputs)('safely parameterizes membership_id: %s', async (input) => {
    await findExistingCase('company-123', input);

    expect(mockSelect).toHaveBeenCalled();
    const [, membershipId] = paramsSeen.at(-1)!;
    expect(membershipId).toBe(input);
  });

  it.each(maliciousInputs)('safely parameterizes company_id: %s', async (input) => {
    await findExistingCase(input, 'membership-123');

    expect(mockSelect).toHaveBeenCalled();
    const [companyId] = paramsSeen.at(-1)!;
    expect(companyId).toBe(input);
  });
});

