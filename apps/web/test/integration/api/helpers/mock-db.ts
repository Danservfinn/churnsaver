// Database mocking utilities for API endpoint testing
// Provides helpers for mocking database operations

import { vi } from 'vitest';

/**
 * Mock database query results
 */
export interface MockQueryResult<T = any> {
  rows: T[];
  rowCount: number;
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
 * Mock the database sql module
 */
export function mockDatabase(overrides: {
  select?: <T>(query: string, params?: any[]) => Promise<T[]>;
  execute?: (query: string, params?: any[]) => Promise<void>;
  selectOne?: <T>(query: string, params?: any[]) => Promise<T | null>;
} = {}) {
  const sqlModule = require('@/lib/db');
  
  const defaultMocks = {
    select: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue(undefined),
    selectOne: vi.fn().mockResolvedValue(null),
  };

  const mocks = { ...defaultMocks, ...overrides };

  vi.spyOn(sqlModule, 'sql', 'get').mockReturnValue({
    select: mocks.select,
    execute: mocks.execute,
    selectOne: mocks.selectOne,
  });

  return mocks;
}

/**
 * Mock database init
 */
export function mockDbInit(shouldSucceed: boolean = true) {
  const dbModule = require('@/lib/db');
  
  if (shouldSucceed) {
    return vi.spyOn(dbModule, 'initDb').mockResolvedValue(undefined);
  } else {
    return vi.spyOn(dbModule, 'initDb').mockRejectedValue(
      new Error('Database connection failed')
    );
  }
}

/**
 * Mock database connection failure
 */
export function mockDatabaseFailure() {
  return mockDatabase({
    select: vi.fn().mockRejectedValue(new Error('Database connection failed')),
    execute: vi.fn().mockRejectedValue(new Error('Database connection failed')),
    selectOne: vi.fn().mockRejectedValue(new Error('Database connection failed')),
  });
}

/**
 * Mock database timeout
 */
export function mockDatabaseTimeout() {
  return mockDatabase({
    select: vi.fn().mockImplementation(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 100)
      )
    ),
    execute: vi.fn().mockImplementation(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 100)
      )
    ),
    selectOne: vi.fn().mockImplementation(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 100)
      )
    ),
  });
}

/**
 * Mock empty database result
 */
export function mockEmptyResult() {
  return mockDatabase({
    select: vi.fn().mockResolvedValue([]),
    selectOne: vi.fn().mockResolvedValue(null),
  });
}

/**
 * Mock database constraint violation
 */
export function mockConstraintViolation(constraintName: string = 'unique_constraint') {
  const error = new Error(`duplicate key value violates unique constraint "${constraintName}"`);
  (error as any).code = '23505'; // PostgreSQL unique violation code
  (error as any).constraint = constraintName;
  
  return mockDatabase({
    select: vi.fn().mockRejectedValue(error),
    execute: vi.fn().mockRejectedValue(error),
    selectOne: vi.fn().mockRejectedValue(error),
  });
}



