/**
 * Integration tests for webhook rate limiting fix
 * 
 * This test suite verifies the complete webhook flow with the new rate limiting implementation:
 * 1. ArrayBuffer body consumption - ensure no "body already consumed" errors
 * 2. Rate limiting with extracted company IDs - verify logs show real company IDs instead of "unknown"
 * 3. Signature verification integrity - confirm HMAC validation still works correctly
 * 4. Webhook processing pipeline - ensure no regressions in event ingestion and queueing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/webhooks/whop/route';
import { cleanupRateLimitKeys, getRateLimitKeys } from '@/lib/rateLimitRedis';
import crypto from 'crypto';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';

// Test configuration
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'test-webhook-secret';
const TEST_COMPANY_ID = 'test-company-123';
const OTHER_COMPANY_ID = 'other-company-456';

// Helper to create a mock webhook request
function createMockWebhookRequest(payload: any, companyId: string = TEST_COMPANY_ID): NextRequest {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('hex');

  const request = new NextRequest('http://localhost:3000/api/webhooks/whop', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Whop-Signature': `sha256=${signature}`,
      'X-Whop-Timestamp': Math.floor(Date.now() / 1000).toString(),
      'X-Whop-Event-Id': payload.id || 'evt_test_123',
    },
    body: body
  });

  return request;
}

// Helper to extract company ID from webhook payload (simulates getWebhookCompanyContext)
function extractCompanyId(payload: any): string {
  // Simulate the logic from getWebhookCompanyContext
  if (payload.company_id) return payload.company_id;
  if (payload.data?.company_id) return payload.data.company_id;
  if (payload.data?.company?.id) return payload.data.company.id;
  return 'unknown';
}

describe('Webhook Rate Limiting Fix Integration Tests', () => {
  beforeEach(async () => {
    // Clean up Redis rate limit keys before each test
    try {
      const deletedCount = await cleanupRateLimitKeys('ratelimit:webhook:*');
      console.log(`Cleaned up ${deletedCount} Redis rate limit keys before test`);
    } catch (error) {
      console.warn('Failed to cleanup Redis rate limit keys', error);
    }
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Additional cleanup after each test
    try {
      await cleanupRateLimitKeys('ratelimit:webhook:*');
    } catch (error) {
      console.warn('Error in afterEach cleanup', error);
    }
  });

  describe('ArrayBuffer Body Consumption', () => {
    it('should not throw "body already consumed" errors when processing webhooks', async () => {
      const payload = {
        id: 'evt_body_consumption_test',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: {
          membership_id: 'mem_123',
          user_id: 'user_456'
        }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      
      // This should not throw "body already consumed" error
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      // Verify the response contains the expected structure
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
      expect(responseData).toHaveProperty('eventId', payload.id);
    });

    it('should handle multiple webhook requests without body consumption errors', async () => {
      const payloads = Array.from({ length: 5 }, (_, i) => ({
        id: `evt_multi_body_test_${i}`,
        type: 'payment.succeeded',
        company_id: TEST_COMPANY_ID,
        data: {
          amount: 1000 * (i + 1),
          currency: 'usd'
        }
      }));

      const responses = await Promise.all(
        payloads.map(payload => {
          const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
          return POST(request);
        })
      );

      // All requests should succeed without body consumption errors
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Rate Limiting with Extracted Company IDs', () => {
    it('should apply per-company rate limiting with extracted company ID', async () => {
      const payload = {
        id: 'evt_company_id_test',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: {
          membership_id: 'mem_123'
        }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      // Verify rate limit key was created with company ID
      const rateLimitKeys = await getRateLimitKeys('ratelimit:webhook:*');
      expect(rateLimitKeys.length).toBeGreaterThan(0);
      
      // Verify the key contains the company ID, not "unknown"
      const hasCompanySpecificKey = rateLimitKeys.some(key => 
        key.includes(TEST_COMPANY_ID) && !key.includes('unknown')
      );
      expect(hasCompanySpecificKey).toBe(true);
    });

    it('should use different rate limit keys for different companies', async () => {
      const payload1 = {
        id: 'evt_company_a_1',
        type: 'payment.succeeded',
        company_id: TEST_COMPANY_ID,
        data: { amount: 1000 }
      };

      const payload2 = {
        id: 'evt_company_b_1',
        type: 'payment.succeeded',
        company_id: OTHER_COMPANY_ID,
        data: { amount: 2000 }
      };

      // Send webhooks for both companies
      const request1 = createMockWebhookRequest(payload1, TEST_COMPANY_ID);
      const request2 = createMockWebhookRequest(payload2, OTHER_COMPANY_ID);
      
      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2)
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify both companies have their own rate limit keys
      const rateLimitKeys = await getRateLimitKeys('ratelimit:webhook:*');
      
      const hasCompanyAKey = rateLimitKeys.some(key => key.includes(TEST_COMPANY_ID));
      const hasCompanyBKey = rateLimitKeys.some(key => key.includes(OTHER_COMPANY_ID));
      
      expect(hasCompanyAKey).toBe(true);
      expect(hasCompanyBKey).toBe(true);
    });

    it('should log company ID in rate limit exceeded responses', async () => {
      // Set a very low rate limit for testing
      const originalConfig = { ...RATE_LIMIT_CONFIGS.webhooks };
      RATE_LIMIT_CONFIGS.webhooks.maxRequests = 1; // Only 1 request allowed
      
      const payload = {
        id: 'evt_rate_limit_test',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: { membership_id: 'mem_123' }
      };

      // First request should succeed
      const request1 = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response1 = await POST(request1);
      expect(response1.status).toBe(200);

      // Second request should hit rate limit
      const request2 = createMockWebhookRequest(
        { ...payload, id: 'evt_rate_limit_test_2' },
        TEST_COMPANY_ID
      );
      const response2 = await POST(request2);
      
      expect(response2.status).toBe(429);
      
      const responseData = await response2.json();
      expect(responseData).toHaveProperty('companyId', TEST_COMPANY_ID);
      expect(responseData.companyId).not.toBe('unknown');
      expect(responseData).toHaveProperty('error', 'Rate limit exceeded');
      
      // Restore original config
      RATE_LIMIT_CONFIGS.webhooks.maxRequests = originalConfig.maxRequests;
    });

    it('should handle fallback to global rate limit when company ID extraction fails', async () => {
      const payload = {
        id: 'evt_no_company_id',
        type: 'payment.succeeded',
        // No company_id field - extraction should fail
        data: { amount: 1000 }
      };

      const request = createMockWebhookRequest(payload);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      // Should fall back to global rate limiting
      const rateLimitKeys = await getRateLimitKeys('ratelimit:webhook:*');
      const hasGlobalKey = rateLimitKeys.some(key => key.includes('global'));
      expect(hasGlobalKey).toBe(true);
    });
  });

  describe('Signature Verification Integrity', () => {
    it('should validate webhook signature correctly with new body handling', async () => {
      const payload = {
        id: 'evt_signature_valid',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: {
          membership_id: 'mem_123',
          user_id: 'user_456'
        }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
      expect(responseData).toHaveProperty('signatureValid', true);
    });

    it('should reject invalid webhook signatures', async () => {
      const payload = {
        id: 'evt_signature_invalid',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: { membership_id: 'mem_123' }
      };

      const body = JSON.stringify(payload);
      
      // Create request with invalid signature
      const request = new NextRequest('http://localhost:3000/api/webhooks/whop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Whop-Signature': 'sha256=invalid_signature_hash',
          'X-Whop-Timestamp': Math.floor(Date.now() / 1000).toString(),
          'X-Whop-Event-Id': payload.id,
        },
        body: body
      });

      const response = await POST(request);
      
      // Should reject due to invalid signature
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('error');
      expect(responseData.error).toContain('signature');
    });

    it('should handle malformed signature headers gracefully', async () => {
      const payload = {
        id: 'evt_signature_malformed',
        type: 'payment.succeeded',
        company_id: TEST_COMPANY_ID,
        data: { amount: 1000 }
      };

      const body = JSON.stringify(payload);
      
      // Create request with malformed signature header
      const request = new NextRequest('http://localhost:3000/api/webhooks/whop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Whop-Signature': 'malformed_header_without_sha256_prefix',
          'X-Whop-Timestamp': Math.floor(Date.now() / 1000).toString(),
          'X-Whop-Event-Id': payload.id,
        },
        body: body
      });

      const response = await POST(request);
      
      // Should reject due to malformed signature
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('error');
    });
  });

  describe('Webhook Processing Pipeline Integrity', () => {
    it('should successfully enqueue webhook events to PG Boss', async () => {
      const payload = {
        id: 'evt_enqueue_test',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: {
          membership_id: 'mem_123',
          user_id: 'user_456',
          status: 'active'
        }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
      expect(responseData).toHaveProperty('eventId', payload.id);
      expect(responseData).toHaveProperty('queued', true);
    });

    it('should handle webhook events with minimal payload', async () => {
      const payload = {
        id: 'evt_minimal_payload',
        type: 'payment.succeeded',
        company_id: TEST_COMPANY_ID,
        data: { amount: 1000 }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
      expect(responseData).toHaveProperty('eventId', payload.id);
    });

    it('should handle webhook events with large payload without issues', async () => {
      const payload = {
        id: 'evt_large_payload',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: {
          membership_id: 'mem_123',
          user_id: 'user_456',
          // Large nested object
          metadata: {
            nested: {
              deeply: {
                nested: {
                  data: 'x'.repeat(10000) // 10KB of data
                }
              }
            }
          }
        }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('success', true);
    });

    it('should maintain idempotency for duplicate webhook events', async () => {
      const payload = {
        id: 'evt_idempotency_test',
        type: 'payment.succeeded',
        company_id: TEST_COMPANY_ID,
        data: { amount: 1000 }
      };

      // Send the same event twice
      const request1 = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const request2 = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      
      const [response1, response2] = await Promise.all([
        POST(request1),
        POST(request2)
      ]);

      // Both should succeed (idempotency handled at queue level)
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      const data1 = await response1.json();
      const data2 = await response2.json();
      
      expect(data1.eventId).toBe(payload.id);
      expect(data2.eventId).toBe(payload.id);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle rate limiter service errors gracefully', async () => {
      // Mock the rate limiter to throw an error
      vi.spyOn(require('@/server/middleware/rateLimit'), 'checkRateLimit').mockRejectedValueOnce(
        new Error('Rate limiter service unavailable')
      );

      const payload = {
        id: 'evt_rate_limit_error',
        type: 'membership.created',
        company_id: TEST_COMPANY_ID,
        data: { membership_id: 'mem_123' }
      };

      const request = createMockWebhookRequest(payload, TEST_COMPANY_ID);
      const response = await POST(request);
      
      // In production, should fail-closed (503)
      // In development, should allow request
      expect([200, 503]).toContain(response.status);
    });

    it('should handle malformed JSON payloads gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhooks/whop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Whop-Signature': 'sha256=some_signature',
          'X-Whop-Timestamp': Math.floor(Date.now() / 1000).toString(),
        },
        body: 'invalid json {{{'
      });

      const response = await POST(request);
      
      // Should reject malformed JSON
      expect(response.status).toBe(400);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('error');
    });

    it('should handle missing required headers gracefully', async () => {
      const payload = {
        id: 'evt_missing_headers',
        type: 'payment.succeeded',
        company_id: TEST_COMPANY_ID,
        data: { amount: 1000 }
      };

      const request = new NextRequest('http://localhost:3000/api/webhooks/whop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Missing X-Whop-Signature and X-Whop-Timestamp
        },
        body: JSON.stringify(payload)
      });

      const response = await POST(request);
      
      // Should reject due to missing signature header
      expect(response.status).toBe(401);
      
      const responseData = await response.json();
      expect(responseData).toHaveProperty('error');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high volume of webhooks from multiple companies', async () => {
      const companies = [TEST_COMPANY_ID, OTHER_COMPANY_ID, 'company-c-789'];
      const webhooksPerCompany = 10;

      const requests = [];
      for (let i = 0; i < webhooksPerCompany; i++) {
        for (const companyId of companies) {
          const payload = {
            id: `evt_high_volume_${companyId}_${i}`,
            type: 'payment.succeeded',
            company_id: companyId,
            data: { amount: 1000 + i }
          };
          requests.push(createMockWebhookRequest(payload, companyId));
        }
      }

      // Send all requests concurrently
      const responses = await Promise.all(requests.map(req => POST(req)));
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify rate limit keys for all companies
      const rateLimitKeys = await getRateLimitKeys('ratelimit:webhook:*');
      
      companies.forEach(companyId => {
        const hasCompanyKey = rateLimitKeys.some(key => key.includes(companyId));
        expect(hasCompanyKey).toBe(true);
      });
    }, 30000); // Increase timeout for this test
  });
});