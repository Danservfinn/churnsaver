/**
 * Comprehensive Production Webhook Integration Test Suite
 * 
 * This test suite validates the webhook endpoint for production deployment,
 * testing all security controls, processing mechanisms, and resilience patterns.
 * 
 * Tests:
 * 1. Signature validation (HMAC-SHA256) with real Whop payloads
 * 2. Idempotency enforcement with duplicate event IDs
 * 3. Rate limiting functionality
 * 4. Queue processing and job enqueueing
 * 5. Production endpoint accessibility
 * 6. Security event logging
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'crypto';
import { WebhookValidator } from '@/lib/whop/webhookValidator';
import { EnhancedJobQueueService } from '@/server/services/enhancedJobQueue';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { securityMonitor } from '@/lib/security-monitoring';
import { env } from '@/lib/env';

// Production URL for testing
const PRODUCTION_WEBHOOK_URL = 'https://churnsaver-8pphoo5on-dannys-projects-de68569e.vercel.app/api/webhooks/whop';

// Test webhook payload (realistic Whop structure)
const TEST_WEBHOOK_PAYLOAD = {
  id: 'evt_test_integration_' + Date.now(),
  type: 'membership.created',
  data: {
    id: 'mem_test_integration_' + Date.now(),
    membership_id: 'mem_test_integration_' + Date.now(),
    user_id: 'user_test_integration_' + Date.now(),
    status: 'active',
    created_at: new Date().toISOString()
  },
  created_at: new Date().toISOString()
};

describe('Production Webhook Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let testResults: any[] = [];

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Initialize database for testing
    await sql`SELECT 1`.catch(() => {}); // Simple connection test
    
    // Initialize enhanced job queue
    await EnhancedJobQueueService.init();
  });

  afterAll(async () => {
    // Restore original environment
    process.env = originalEnv;
    
    // Cleanup test data
    try {
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'evt_test_integration_%'`;
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'mem_test_integration_%'`;
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });

  describe('1. Signature Validation (HMAC-SHA256)', () => {
    const webhookSecret = env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret_for_integration_testing';
    const testPayload = JSON.stringify(TEST_WEBHOOK_PAYLOAD);

    it('should accept valid HMAC-SHA256 signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac('sha256', webhookSecret)
        .update(testPayload, 'utf8')
        .digest('hex');

      const validator = new WebhookValidator();
      const result = await validator.validateWebhook(testPayload, signature, timestamp);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject invalid HMAC signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const invalidSignature = createHmac('sha256', 'invalid_secret')
        .update(testPayload, 'utf8')
        .digest('hex');

      const validator = new WebhookValidator();
      const result = await validator.validateWebhook(testPayload, invalidSignature, timestamp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Signature verification failed');
    });

    it('should reject missing signature header', async () => {
      const validator = new WebhookValidator();
      const result = await validator.validateWebhook(testPayload, '', null);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing signature header');
    });

    it('should reject timestamps outside allowed window', async () => {
      const oldTimestamp = Math.floor((Date.now() - 400000) / 1000).toString(); // ~4.6 days ago
      const signature = createHmac('sha256', webhookSecret)
        .update(testPayload, 'utf8')
        .digest('hex');

      const validator = new WebhookValidator();
      const result = await validator.validateWebhook(testPayload, signature, oldTimestamp);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('outside allowed window');
    });
  });

  describe('2. Idempotency Enforcement', () => {
    const eventId = 'evt_idempotency_test_' + Date.now();
    const testPayload = {
      ...TEST_WEBHOOK_PAYLOAD,
      id: eventId
    };

    beforeAll(async () => {
      // Clean up any existing test events
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'evt_idempotency_test_%'`;
    });

    it('should process first occurrence of event', async () => {
      // First submission should succeed
      const response = await sendWebhook(testPayload);
      expect(response.status).toBe(200);
      
      // Verify event was stored
      const events = await sql`SELECT * FROM events WHERE whop_event_id = $1`, [eventId];
      expect(events).toHaveLength(1);
    });

    it('should reject duplicate event with same ID', async () => {
      // Second submission should be rejected but return 200 (idempotent response)
      const response = await sendWebhook(testPayload);
      expect(response.status).toBe(200);
      
      // Verify only one event exists
      const events = await sql`SELECT COUNT(*) as count FROM events WHERE whop_event_id = $1`, [eventId];
      expect(events[0].count).toBe(1);
    });

    it('should handle different events with different IDs', async () => {
      const differentEventId = 'evt_idempotency_test_different_' + Date.now();
      const differentPayload = {
        ...TEST_WEBHOOK_PAYLOAD,
        id: differentEventId
      };

      // Different event ID should be processed
      const response = await sendWebhook(differentPayload);
      expect(response.status).toBe(200);
      
      // Verify both events exist
      const events = await sql`SELECT COUNT(*) as count FROM events WHERE whop_event_id IN ($1, $2)`, [eventId, differentEventId];
      expect(events[0].count).toBe(2);
    });
  });

  describe('3. Rate Limiting', () => {
    const rateLimitPayload = { ...TEST_WEBHOOK_PAYLOAD };

    beforeAll(async () => {
      // Clean up any existing test events
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'evt_rate_limit_test_%'`;
    });

    it('should allow requests within rate limit', async () => {
      // Send requests within rate limit (300 per minute)
      for (let i = 0; i < 5; i++) {
        const payload = {
          ...rateLimitPayload,
          id: `evt_rate_limit_test_${Date.now()}_${i}`
        };
        
        const response = await sendWebhook(payload);
        expect(response.status).toBe(200);
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    it('should enforce rate limit when exceeded', async () => {
      // Send requests rapidly to exceed rate limit
      let rateLimitHit = false;
      
      for (let i = 0; i < 310; i++) { // Exceed the 300/minute limit
        const payload = {
          ...rateLimitPayload,
          id: `evt_rate_limit_burst_${Date.now()}_${i}`
        };
        
        const response = await sendWebhook(payload);
        
        if (response.status === 429) {
          rateLimitHit = true;
          break;
        }
        
        // Minimal delay to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      expect(rateLimitHit).toBe(true);
    });

    it('should include retry-after header when rate limited', async () => {
      // Send requests rapidly to trigger rate limit
      let retryAfterHeader = null;
      
      for (let i = 0; i < 310; i++) {
        const payload = {
          ...rateLimitPayload,
          id: `evt_retry_after_test_${Date.now()}_${i}`
        };
        
        const response = await sendWebhook(payload);
        
        if (response.status === 429) {
          retryAfterHeader = response.headers.get('retry-after');
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      expect(retryAfterHeader).toBeTruthy();
      expect(typeof retryAfterHeader).toBe('string');
    });
  });

  describe('4. Queue Processing and Job Enqueueing', () => {
    const queueTestPayload = {
      ...TEST_WEBHOOK_PAYLOAD,
      id: 'evt_queue_test_' + Date.now()
    };

    beforeAll(async () => {
      // Clean up any existing test events
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'evt_queue_test_%'`;
    });

    it('should enqueue webhook processing job', async () => {
      const response = await sendWebhook(queueTestPayload);
      expect(response.status).toBe(200);
      
      // Wait a moment for job to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if job was enqueued (verify in job table)
      const jobs = await sql`
        SELECT * FROM pgboss.job 
        WHERE name = 'webhook_processing' 
        AND data->>'eventId' LIKE $1
        ORDER BY createdon DESC 
        LIMIT 1
      `, [`%evt_queue_test_%`];
      
      expect(jobs.length).toBeGreaterThan(0);
    });

    it('should set singleton key for idempotency', async () => {
      const response = await sendWebhook(queueTestPayload);
      expect(response.status).toBe(200);
      
      // Verify singleton key was set
      const jobs = await sql`
        SELECT data->>'singletonKey' as singleton_key 
        FROM pgboss.job 
        WHERE name = 'webhook_processing' 
        AND data->>'eventId' LIKE $1
        ORDER BY createdon DESC 
        LIMIT 1
      `, [`%evt_queue_test_%`];
      
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0].singleton_key).toContain(queueTestPayload.id);
    });

    it('should record job metrics', async () => {
      const response = await sendWebhook(queueTestPayload);
      expect(response.status).toBe(200);
      
      // Wait for metrics to be recorded
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if metrics were recorded
      const metrics = await sql`
        SELECT * FROM job_metrics 
        WHERE job_type = 'webhook_processing' 
        AND createdon > NOW() - INTERVAL '5 minutes'
        ORDER BY createdon DESC 
        LIMIT 1
      `;
      
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('5. Production Endpoint Accessibility', () => {
    it('should be accessible via HTTPS', async () => {
      const response = await fetch(PRODUCTION_WEBHOOK_URL, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'ChurnSaver-Integration-Test/1.0'
        }
      });

      expect(response.status).toBe(200);
      expect(response.url).toMatch(/^https:\/\//);
    });

    it('should handle OPTIONS requests for CORS', async () => {
      const response = await fetch(PRODUCTION_WEBHOOK_URL, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://dashboard.churnsaver.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, X-Whop-Signature, X-Whop-Timestamp'
        }
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });

    it('should reject unsupported HTTP methods', async () => {
      const response = await fetch(PRODUCTION_WEBHOOK_URL, {
        method: 'GET',
        headers: {
          'User-Agent': 'ChurnSaver-Integration-Test/1.0'
        }
      });

      expect(response.status).toBe(405);
    });
  });

  describe('6. Security Event Logging', () => {
    const securityTestPayload = {
      ...TEST_WEBHOOK_PAYLOAD,
      id: 'evt_security_test_' + Date.now()
    };

    beforeAll(async () => {
      // Clean up any existing test events
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'evt_security_test_%'`;
    });

    it('should log security events for invalid signatures', async () => {
      const response = await sendWebhookWithInvalidSignature(securityTestPayload);
      expect(response.status).toBe(401);
      
      // Wait for logging to occur
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check security monitoring logs
      const securityEvents = await sql`
        SELECT * FROM security_events 
        WHERE event_type = 'webhook_signature_invalid'
        AND createdon > NOW() - INTERVAL '1 minute'
        ORDER BY createdon DESC 
        LIMIT 1
      `;
      
      expect(securityEvents.length).toBeGreaterThan(0);
    });

    it('should log security events for missing timestamps', async () => {
      const response = await sendWebhookWithoutTimestamp(securityTestPayload);
      expect(response.status).toBe(401);
      
      // Wait for logging to occur
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check security monitoring logs
      const securityEvents = await sql`
        SELECT * FROM security_events 
        WHERE event_type = 'webhook_timestamp_invalid'
        AND createdon > NOW() - INTERVAL '1 minute'
        ORDER BY createdon DESC 
        LIMIT 1
      `;
      
      expect(securityEvents.length).toBeGreaterThan(0);
    });

    it('should log successful webhook processing', async () => {
      const response = await sendWebhook(securityTestPayload);
      expect(response.status).toBe(200);
      
      // Wait for logging to occur
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check security monitoring logs
      const securityEvents = await sql`
        SELECT * FROM security_events 
        WHERE event_type = 'webhook_processed_successfully'
        AND createdon > NOW() - INTERVAL '1 minute'
        ORDER BY createdon DESC 
        LIMIT 1
      `;
      
      expect(securityEvents.length).toBeGreaterThan(0);
    });
  });

  describe('7. Error Handling and Resilience', () => {
    const errorTestPayload = {
      ...TEST_WEBHOOK_PAYLOAD,
      id: 'evt_error_test_' + Date.now()
    };

    beforeAll(async () => {
      // Clean up any existing test events
      await sql`DELETE FROM events WHERE whop_event_id LIKE 'evt_error_test_%'`;
    });

    it('should handle malformed JSON payload gracefully', async () => {
      const response = await sendWebhookWithMalformedJson();
      expect(response.status).toBe(400);
      
      const body = await response.text();
      expect(body).toContain('Invalid JSON payload');
    });

    it('should handle oversized payload', async () => {
      const oversizedPayload = {
        ...errorTestPayload,
        data: {
          ...errorTestPayload.data,
          oversized_field: 'x'.repeat(1000000) // Create very large payload
        }
      };

      const response = await sendWebhook(oversizedPayload);
      expect(response.status).toBe(413);
    });

    it('should respond within 1 second requirement', async () => {
      const startTime = Date.now();
      const response = await sendWebhook(errorTestPayload);
      const endTime = Date.now();
      
      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});

// Helper functions for testing
async function sendWebhook(payload: any): Promise<{ status: number; headers: Headers }> {
  const webhookSecret = env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret_for_integration_testing';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', webhookSecret)
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');

  const response = await fetch(PRODUCTION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Whop-Signature': `sha256=${signature}`,
      'X-Whop-Timestamp': timestamp,
      'User-Agent': 'ChurnSaver-Integration-Test/1.0'
    },
    body: JSON.stringify(payload)
  });

  return {
    status: response.status,
    headers: response.headers
  };
}

async function sendWebhookWithInvalidSignature(payload: any): Promise<{ status: number; headers: Headers }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const invalidSignature = createHmac('sha256', 'invalid_secret')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');

  const response = await fetch(PRODUCTION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Whop-Signature': `sha256=${invalidSignature}`,
      'X-Whop-Timestamp': timestamp,
      'User-Agent': 'ChurnSaver-Integration-Test/1.0'
    },
    body: JSON.stringify(payload)
  });

  return {
    status: response.status,
    headers: response.headers
  };
}

async function sendWebhookWithoutTimestamp(payload: any): Promise<{ status: number; headers: Headers }> {
  const webhookSecret = env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret_for_integration_testing';
  const signature = createHmac('sha256', webhookSecret)
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');

  const response = await fetch(PRODUCTION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Whop-Signature': `sha256=${signature}`,
      'User-Agent': 'ChurnSaver-Integration-Test/1.0'
    },
    body: JSON.stringify(payload)
  });

  return {
    status: response.status,
    headers: response.headers
  };
}

async function sendWebhookWithMalformedJson(): Promise<{ status: number; headers: Headers }> {
  const response = await fetch(PRODUCTION_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Whop-Signature': 'invalid_signature',
      'X-Whop-Timestamp': Math.floor(Date.now() / 1000).toString(),
      'User-Agent': 'ChurnSaver-Integration-Test/1.0'
    },
    body: '{"invalid": json}' // Malformed JSON
  });

  return {
    status: response.status,
    headers: response.headers
  };
}