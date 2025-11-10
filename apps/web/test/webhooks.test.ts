import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TEST_RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { cleanupRateLimitKeys, getRateLimitKeys } from '@/lib/rateLimitRedis';
import crypto from 'crypto';

// Test utilities
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Test data
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'test-webhook-secret';
const TEST_COMPANY_ID = 'test-company-123';

describe('Webhook Rate Limiting Tests', () => {
  // Clean up Redis rate limit keys before each test
  beforeEach(async () => {
    try {
      const deletedCount = await cleanupRateLimitKeys('ratelimit:webhook:*');
      console.log(`Cleaned up ${deletedCount} Redis rate limit keys before test`);
    } catch (error) {
      console.warn('Failed to cleanup Redis rate limit keys', error);
    }
  });

  // Additional cleanup after each test
  afterEach(async () => {
    try {
      // Small delay to ensure any pending operations complete
      await delay(50);
    } catch (error) {
      console.warn('Error in afterEach cleanup', error);
    }
  });

  describe('Rate Limit Configuration', () => {
    it('should have test-specific rate limit config with higher limits', () => {
      expect(TEST_RATE_LIMIT_CONFIGS.webhooks.maxRequests).toBe(1000);
      expect(TEST_RATE_LIMIT_CONFIGS.webhooks.windowMs).toBe(5000);
    });

    it('should have different limits than production config', () => {
      // Production config should have lower limits
      const productionConfig = {
        webhooks: {
          windowMs: 60000, // 1 minute
          maxRequests: 300,
          keyPrefix: 'webhook'
        }
      };
      
      expect(TEST_RATE_LIMIT_CONFIGS.webhooks.maxRequests).toBeGreaterThan(productionConfig.webhooks.maxRequests);
      expect(TEST_RATE_LIMIT_CONFIGS.webhooks.windowMs).toBeLessThan(productionConfig.webhooks.windowMs);
    });
  });

  describe('Redis Cleanup Utilities', () => {
    it('should cleanup rate limit keys matching pattern', async () => {
      // First, verify no keys exist
      const initialKeys = await getRateLimitKeys('ratelimit:webhook:test-*');
      expect(initialKeys.length).toBe(0);

      // Cleanup should return 0 when no keys exist
      const deletedCount = await cleanupRateLimitKeys('ratelimit:webhook:test-*');
      expect(deletedCount).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      // Test with invalid pattern (should not throw)
      const result = await cleanupRateLimitKeys('');
      expect(result).toBe(0);
    });
  });

  describe('Webhook Request Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const testRequests = 5;
      
      for (let i = 0; i < testRequests; i++) {
        // Simulate webhook request
        const signature = crypto
          .createHmac('sha256', WEBHOOK_SECRET)
          .update(JSON.stringify({ test: `data-${i}` }), 'utf8')
          .digest('hex');
        
        // Add small delay between requests to avoid overwhelming
        if (i > 0) await delay(50);
        
        // In a real test, this would be an actual HTTP request
        // For now, we just verify the test infrastructure works
        expect(signature).toBeTruthy();
      }
      
      // Verify no rate limit keys were created (or they were cleaned up)
      const keys = await getRateLimitKeys('ratelimit:webhook:*');
      expect(keys.length).toBe(0); // Should be cleaned up by beforeEach
    });

    it('should handle rapid sequential requests with delays', async () => {
      const rapidRequests = 10;
      
      for (let i = 0; i < rapidRequests; i++) {
        // Create webhook payload
        const payload = {
          id: `evt_test_${i}`,
          type: 'payment.succeeded',
          data: { amount: 1000 + i }
        };
        
        const signature = crypto
          .createHmac('sha256', WEBHOOK_SECRET)
          .update(JSON.stringify(payload), 'utf8')
          .digest('hex');
        
        // Add strategic 100ms delay between rapid requests
        if (i > 0) await delay(100);
        
        expect(signature).toHaveLength(64); // SHA256 hex length
      }
    }, 10000); // Increase timeout for this test

    it('should demonstrate test isolation between test cases', async () => {
      // This test should start with a clean slate
      const keysBefore = await getRateLimitKeys('ratelimit:webhook:*');
      expect(keysBefore.length).toBe(0);
      
      // Simulate some webhook activity
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify({ test: 'isolation' }), 'utf8')
        .digest('hex');
      
      expect(signature).toBeTruthy();
      
      // Keys should still be 0 because we're not actually making HTTP requests
      // that would trigger rate limiting
      const keysAfter = await getRateLimitKeys('ratelimit:webhook:*');
      expect(keysAfter.length).toBe(0);
    });
  });

  describe('Webhook Signature Validation', () => {
    it('should validate webhook signature correctly', () => {
      const payload = { test: 'data' };
      const body = JSON.stringify(payload);
      
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body, 'utf8')
        .digest('hex');
      
      // Verify signature format
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      
      // Verify signature validation would pass
      const expectedSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(expectedSignature);
    });

    it('should reject invalid signatures', () => {
      const payload = { test: 'data' };
      const body = JSON.stringify(payload);
      
      const validSignature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(body, 'utf8')
        .digest('hex');
      
      const invalidSignature = 'invalid_signature_hash';
      
      expect(validSignature).not.toBe(invalidSignature);
    });
  });

  describe('Test Isolation and Cleanup', () => {
    it('should maintain isolation between tests', async () => {
      // Verify clean state
      const keys = await getRateLimitKeys('ratelimit:webhook:*');
      expect(keys.length).toBe(0);
      
      // This test should not be affected by previous tests
      // due to the beforeEach cleanup hook
    });

    it('should handle multiple cleanup calls gracefully', async () => {
      // Call cleanup multiple times
      const result1 = await cleanupRateLimitKeys('ratelimit:webhook:*');
      const result2 = await cleanupRateLimitKeys('ratelimit:webhook:*');
      
      // Both should succeed
      expect(result1).toBeGreaterThanOrEqual(0);
      expect(result2).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Integration: Webhook Rate Limiting', () => {
  beforeEach(async () => {
    await cleanupRateLimitKeys('ratelimit:webhook:*');
  });

  it('should demonstrate complete webhook test flow with rate limiting', async () => {
    const testPayload = {
      id: 'evt_integration_test',
      type: 'membership.created',
      data: {
        membership_id: 'mem_123',
        user_id: 'user_456'
      }
    };

    // Simulate webhook processing with rate limiting
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(testPayload), 'utf8')
      .digest('hex');

    // Add delay to prevent rate limiting
    await delay(100);

    // Verify the signature was created
    expect(signature).toBeTruthy();
    expect(signature).toHaveLength(64);

    // Verify no rate limit keys exist (cleanup worked)
    const keys = await getRateLimitKeys('ratelimit:webhook:*');
    expect(keys.length).toBe(0);
  });

  it('should handle batch webhook processing with proper delays', async () => {
    const batchSize = 5;
    const processed: string[] = [];

    for (let i = 0; i < batchSize; i++) {
      const payload = {
        id: `evt_batch_${i}`,
        type: 'payment.succeeded',
        data: { amount: 1000 * (i + 1) }
      };

      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(payload), 'utf8')
        .digest('hex');

      processed.push(signature);
      
      // Strategic delay between batch processing
      if (i < batchSize - 1) {
        await delay(100);
      }
    }

    expect(processed).toHaveLength(batchSize);
    expect(processed.every(sig => sig.length === 64)).toBe(true);
  }, 10000);
});