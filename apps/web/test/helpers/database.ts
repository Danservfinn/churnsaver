// Database mocking and test data setup helpers
// Provides utilities for mocking database operations in unit tests

import { vi } from 'vitest';

export interface MockQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface MockDatabase {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  queries: Array<{ sql: string; params?: any[] }>;
  clear: () => void;
}

/**
 * Create a mock database instance for testing
 */
export function createMockDatabase(): MockDatabase {
  const queries: Array<{ sql: string; params?: any[] }> = [];

  const mockSelect = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockResolvedValue(null);
  const mockExecute = vi.fn().mockResolvedValue(1);
  const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

  // Track queries for assertions
  const select = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
    queries.push({ sql, params });
    return mockSelect(sql, params);
  });

  const insert = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
    queries.push({ sql, params });
    return mockInsert(sql, params);
  });

  const execute = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
    queries.push({ sql, params });
    return mockExecute(sql, params);
  });

  const query = vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
    queries.push({ sql, params });
    return mockQuery(sql, params);
  });

  return {
    select,
    insert,
    execute,
    query,
    queries,
    clear: () => {
      queries.length = 0;
      mockSelect.mockClear();
      mockInsert.mockClear();
      mockExecute.mockClear();
      mockQuery.mockClear();
    },
  };
}

/**
 * Create a mock query result
 */
export function createMockQueryResult<T>(rows: T[]): MockQueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
  };
}

/**
 * Mock the sql module from @/lib/db
 */
export function mockSqlModule(overrides: {
  select?: (query: string, params?: any[]) => Promise<any[]>;
  insert?: (query: string, params?: any[]) => Promise<any>;
  execute?: (query: string, params?: any[]) => Promise<number>;
  query?: (query: string, params?: any[]) => Promise<MockQueryResult>;
} = {}) {
  const defaultMocks = {
    select: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(1),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };

  const mocks = { ...defaultMocks, ...overrides };

  return {
    sql: mocks,
    mockSql: mocks,
  };
}

/**
 * Create test recovery case data
 */
export function createTestRecoveryCase(overrides: Partial<any> = {}): any {
  return {
    id: 'test-case-id',
    company_id: 'test-company-id',
    membership_id: 'test-membership-id',
    user_id: 'test-user-id',
    first_failure_at: new Date(),
    last_nudge_at: null,
    attempts: 0,
    incentive_days: 0,
    status: 'open',
    failure_reason: 'payment_failed',
    recovered_amount_cents: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create test event data
 */
export function createTestEvent(overrides: Partial<any> = {}): any {
  const defaultPayload = overrides.type === 'payment_failed' 
    ? {
        id: overrides.whop_event_id || 'evt_test_123',
        type: 'payment_failed',
        data: {
          membership_id: overrides.membership_id || 'test-membership-id',
          user_id: 'test-user-id',
          reason: 'card_declined',
          membership: {
            id: overrides.membership_id || 'test-membership-id',
            user_id: 'test-user-id',
          },
        },
      }
    : overrides.type === 'payment_succeeded'
    ? {
        id: overrides.whop_event_id || 'evt_test_123',
        type: 'payment_succeeded',
        data: {
          membership_id: overrides.membership_id || 'test-membership-id',
          user_id: 'test-user-id',
          amount: 29.99,
          currency: 'usd',
        },
      }
    : {};

  return {
    id: 'test-event-id',
    whop_event_id: overrides.whop_event_id || 'evt_test_123',
    type: overrides.type || 'payment_failed',
    membership_id: overrides.membership_id || 'test-membership-id',
    payload: overrides.payload || defaultPayload,
    processed_at: overrides.processed_at || null,
    event_created_at: overrides.event_created_at || new Date(),
    processed_successfully: overrides.processed_successfully || null,
    processing_error: overrides.processing_error || null,
    occurred_at: overrides.occurred_at || new Date(),
    ...overrides,
  };
}

