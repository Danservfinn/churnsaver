/**
 * Tests for rate limiter cleanup functionality
 * Verifies that cleanup only removes expired buckets and preserves active ones
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { checkRateLimit } from '@/server/middleware/rateLimit';
import { sql } from '@/lib/db';

// Mock the database module
jest.mock('@/lib/db', () => ({
  sql: {
    execute: jest.fn(),
    select: jest.fn(),
  },
}));

describe('Rate Limiter - Cleanup Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Bucket Cleanup Logic', () => {
    it('should preserve current bucket during cleanup', async () => {
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
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Current bucket starts at 12:00:00
      const currentBucketStart = new Date('2023-01-01T12:00:00.000Z');
      
      // Verify cleanup only deletes buckets older than current bucket
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [currentBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should clean up multiple old buckets', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:05:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Current bucket starts at 12:05:00
      const currentBucketStart = new Date('2023-01-01T12:05:00.000Z');
      
      // Should delete all buckets before 12:05:00
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [currentBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should handle edge case at bucket boundary', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:00:00.000Z'); // Exactly at bucket start
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Current bucket starts at 12:00:00 (exact same time)
      const currentBucketStart = new Date('2023-01-01T12:00:00.000Z');
      
      // Should delete buckets before 12:00:00, preserving current bucket
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [currentBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Multiple Identifiers Cleanup', () => {
    it('should clean up old buckets for different identifiers independently', async () => {
      const config = {
        windowMs: 60000, // 1 minute
        maxRequests: 5,
        keyPrefix: 'test'
      };
      
      const identifier1 = 'test:company1';
      const identifier2 = 'test:company2';
      const mockNow = new Date('2023-01-01T12:00:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      // Process first identifier
      await checkRateLimit(identifier1, config);
      
      // Process second identifier
      await checkRateLimit(identifier2, config);

      // Both should use the same cleanup logic
      const expectedBucketStart = new Date('2023-01-01T12:00:00.000Z');
      
      expect(sql.execute).toHaveBeenCalledTimes(2);
      expect((sql.execute as jest.Mock).mock.calls[0][1]).toEqual([expectedBucketStart]);
      expect((sql.execute as jest.Mock).mock.calls[1][1]).toEqual([expectedBucketStart]);

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Different Window Sizes', () => {
    it('should handle 5-minute windows correctly', async () => {
      const config = {
        windowMs: 5 * 60 * 1000, // 5 minutes
        maxRequests: 10,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:07:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // 5-minute bucket: floor(12:07:30 / 5min) * 5min = 12:05:00
      const expectedBucketStart = new Date('2023-01-01T12:05:00.000Z');
      
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [expectedBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should handle 1-hour windows correctly', async () => {
      const config = {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxRequests: 100,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:30:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // 1-hour bucket: floor(12:30:30 / 1hour) * 1hour = 12:00:00
      const expectedBucketStart = new Date('2023-01-01T12:00:00.000Z');
      
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [expectedBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('should handle 24-hour windows correctly', async () => {
      const config = {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        maxRequests: 1000,
        keyPrefix: 'test'
      };
      
      const identifier = 'test:company1';
      const mockNow = new Date('2023-01-01T12:30:30.000Z');
      
      // Mock Date.now to return consistent timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => mockNow.getTime());

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // 24-hour bucket: floor(12:30:30 / 24hours) * 24hours = 00:00:00 of current day
      const expectedBucketStart = new Date('2023-01-01T00:00:00.000Z');
      
      expect(sql.execute).toHaveBeenCalledWith(
        `DELETE FROM rate_limits WHERE window_bucket_start < $1`,
        [expectedBucketStart]
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });

  describe('Cleanup Performance', () => {
    it('should use efficient index for cleanup queries', async () => {
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

      // Mock database responses
      (sql.select as jest.Mock).mockResolvedValue([{ count: 0 }]);
      (sql.execute as jest.Mock).mockResolvedValue(undefined);

      await checkRateLimit(identifier, config);

      // Verify cleanup query uses indexed column (window_bucket_start)
      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE window_bucket_start < $1'),
        expect.any(Array)
      );

      // Restore Date.now
      Date.now = originalDateNow;
    });
  });
});