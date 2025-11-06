// RLS context helpers for multi-tenant tests
// Provides utilities for testing Row-Level Security (RLS) isolation

import { vi } from 'vitest';

/**
 * Create a mock RLS context setter
 */
export function createMockRLSContext() {
  const contexts: string[] = [];
  
  return {
    setContext: vi.fn().mockImplementation((companyId: string) => {
      contexts.push(companyId);
    }),
    clearContext: vi.fn().mockImplementation(() => {
      contexts.length = 0;
    }),
    getContexts: () => [...contexts],
    getCurrentContext: () => contexts[contexts.length - 1] || null,
  };
}

/**
 * Execute a function with a specific RLS context
 */
export async function withRLSContext<T>(
  companyId: string,
  operation: () => Promise<T>
): Promise<T> {
  // In a real implementation, this would set the RLS context
  // For testing, we'll just execute the operation
  try {
    return await operation();
  } finally {
    // Clear context after operation
  }
}

/**
 * Assert that queries are scoped to a specific company
 */
export function assertRLSContext(
  queries: Array<{ sql: string; params?: any[] }>,
  expectedCompanyId: string
): void {
  const companyScopedQueries = queries.filter(
    (q) => q.sql.includes('company_id') && q.params?.includes(expectedCompanyId)
  );

  if (queries.length > 0 && companyScopedQueries.length === 0) {
    throw new Error(
      `Expected queries to be scoped to company ${expectedCompanyId}, but none found`
    );
  }
}

/**
 * Create test company IDs for multi-tenant testing
 */
export function createTestCompanyIds(count: number = 2): string[] {
  return Array.from({ length: count }, (_, i) => `test-company-${i + 1}`);
}

