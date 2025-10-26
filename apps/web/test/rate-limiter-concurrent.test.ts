/**
 * Comprehensive tests for rate limiter with concurrent scenarios
 * Tests fixed time bucketing and composite primary key implementation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { sql } from '@/lib/db';

// Mock the database module
jest.mock('@/lib/db', () => ({
  sql: {
    execute: jest.fn(),
    select: jest.fn(),
  },
}));

describe('Rate Limiter - Concurrent Scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Fixed Time Bucketing', () => {
    it('should use fixed time buckets for all requests in same window', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 2 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      const result1 = await checkRateLimit(identifier, config);
      const result2 = await checkRateLimit(identifier, config);

      // Both requests should use the same time bucket
      const expectedBucketStart = new Date('2023-01-01T12:00:00.000Z');
      
      expect(sql.select).toHaveBeenCalledWith(
        `SELECT count FROM rate_limits WHERE company_key = $1 AND window_bucket_start = $2`,
        [identifier, expectedBucketStart]
      );

      // Both calls should use the same bucket start time
      expect(sql.select).toHaveBeenCalledTimes(2);
      expect((sql.select as jest.Mock).mock.calls[0][1]).toEqual([identifier, expectedBucketStart]);
      expect((sql.select as jest.Mock).mock.calls[1][1]).toEqual([identifier, expectedBucketStart]);

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should use different buckets for different time windows', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      
      // Mock Date.now for different times
      const originalDateNow = Date.now;
      
      // First request at 12:00:30
      Date.now = jest.fn(() => new Date('2023-01-01T12:00:30.000Z').getTime());
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);
      
      const firstBucketStart = new Date('2023-01-01T12:00:00.000Z');
      expect((sql.select as jest.Mock).mock.calls[0][1]).toEqual([identifier, firstBucketStart]);

      // Second request at 12:01:30 (next bucket)
      Date.now = jest.fn(() => new Date('2023-01-01T12:01:30.000Z').getTime());
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);

      await checkRateLimit(identifier, config);
      
      const secondBucketStart = new Date('2023-01-01T12:01:00.000Z');
      expect((sql.select as jest.Mock).mock.calls[1][1]).toEqual([identifier, secondBucketStart]);

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Composite Primary Key Usage', () => {
    it('should use composite key in ON CONFLICT clause', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Verify the INSERT uses composite key in ON CONFLICT
      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (company_key, window_bucket_start)'),
        [identifier, expect.any(Date), 1]
      );
    });

    it('should handle concurrent requests to same bucket correctly', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 2, // Low limit for testing
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // First request - should be allowed
      (sql.select as jest.Mock).mockResolvedValueOnce([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValueOnce(undefined);

      const result1 = await checkRateLimit(identifier, config);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(1);

      // Second request - should be allowed
      (sql.select as jest.Mock).mockResolvedValueOnce([{ count: 1 }]);
      (sql.execute as jest.Mock).mockResolvedValueOnce(undefined);

      const result2 = await checkRateLimit(identifier, config);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(0);

      // Third request - should be rate limited
      (sql.select as jest.Mock).mockResolvedValueOnce([{ count: 2 }]);

      const result3 = await checkRateLimit(identifier, config);
      expect(result3.allowed).toBe(false);
      expect(result3.remaining).toBe(0);
      expect(result3.retryAfter).toBeGreaterThan(0);

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Cleanup Functionality', () => {
    it('should only delete expired buckets', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Should only delete buckets older than current bucket start
      const expectedBucketStart = new Date('2023-01-01T12:00:00.000Z');
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [expectedBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should not delete active buckets', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Current bucket should not be deleted (only older buckets)
      const currentBucketStart = new Date('2023-01-01T12:00:00.000Z');
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [currentBucketStart]
      );

      // Verify it's using < (not <=) so current bucket is preserved
      expect((sql.execute as jest.Mock).mock.calls[0][0]).toContain('< $1');

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Reset Time Calculation', () => {
    it('should calculate reset time as start of next bucket', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      (sql.select as jest.Mock).mockResolvedValue([{ count: 5 }]); // At limit

      const result = await checkRateLimit(identifier, config);

      // Reset should be at start of next bucket (12:01:00)
      const expectedResetTime = new Date('2023-01-01T12:01:00.000Z');
      expect(result.resetAt).toEqual(expectedResetTime);

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should calculate retry after correctly', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      (sql.select as jest.Mock).mockResolvedValue([{ count: 5 }]); // At limit

      const result = await checkRateLimit(identifier, config);

      // Retry after should be time until next bucket (30 seconds)
      expect(result.retryAfter).toBe(30);

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Error Handling', () => {
    it('should fail-closed in production on database error', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      
      // Mock production environment
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Mock database error
      (sql.select as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      const result = await checkRateLimit(identifier, config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(60);

      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should fail-open in development on database error', async () => {
      const config = {
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      
      // Mock development environment
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Mock database error
      (sql.select as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      const result = await checkRateLimit(identifier, config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // maxRequests - 1

      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('Rate Limit Configurations', () => {
    it('should have proper webhook configuration', () => {
      expect(RATE_LIMIT_CONFIGS.webhooks).toEqual({
        windowMs: 60000, // 1 minute
        maxRequests: 300,
        keyPrefix: 'webhook'
      });
    });

    it('should have proper case actions configuration', () => {
      expect(RATE_LIMIT_CONFIGS.caseActions).toEqual({
        windowMs: 60000, // 1 minute
        maxRequests: 30,
        keyPrefix: 'case_action'
      });
    });

    it('should have proper data export configuration', () => {
      expect(RATE_LIMIT_CONFIGS.dataExport).toEqual({
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        maxRequests: 1,
        keyPrefix: 'data_export'
      });
    });
  });
});