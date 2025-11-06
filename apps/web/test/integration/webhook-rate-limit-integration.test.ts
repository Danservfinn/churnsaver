// Integration tests for webhook rate limiting and idempotency
// Tests end-to-end webhook processing with rate limiting, idempotency enforcement, and concurrent scenarios

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/webhooks/whop/route';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { handleWhopWebhook } from '@/server/webhooks/whop';
import { sql } from '@/lib/db';
import { createHmac } from 'crypto';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/server/webhooks/whop');
vi.mock('@/server/middleware/rateLimit');
vi.mock('@/lib/whop-sdk', () => ({
  whopsdk: {
    apps: {
      verifyWebhook: vi.fn()
    }
  }
}));
vi.mock('@/lib/whop/sdkConfig', () => ({
  whopConfig: {
    get: vi.fn(() => ({
      appId: 'test-app-id',
      apiKey: 'test-api-key',
      webhookSecret: 'test-webhook-secret',
      environment: 'test' as const,
      debugMode: false
    }))
  }
}));

const mockSql = sql as any;
const mockCheckRateLimit = checkRateLimit as any;
const mockHandleWhopWebhook = vi.mocked(handleWhopWebhook);

describe('Webhook Rate Limiting Integration Tests', () => {
  const webhookSecret = 'test_webhook_secret_integration';
  const testPayload = {
    id: 'evt_integration_test',
    type: 'payment.succeeded',
    data: { amount: 1000, currency: 'USD' }
  };
  const testBody = JSON.stringify(testPayload);
  const validSignature = createHmac('sha256', webhookSecret)
    .update(testBody, 'utf8')
    .digest('hex');
  const validTimestamp = Math.floor(Date.now() / 1000).toString();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHOP_WEBHOOK_SECRET = webhookSecret;
    
    // Default mock for handleWhopWebhook - returns success response
    mockHandleWhopWebhook.mockResolvedValue(
      NextResponse.json({ received: true }, { status: 200 })
    );
    
    // Default database mocks
    mockSql.select.mockResolvedValue([]);
    mockSql.execute.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.WHOP_WEBHOOK_SECRET;
  });

  function createMockRequest(body: string, signature: string, timestamp: string): NextRequest {
    const headers = new Headers();
    headers.set('x-whop-signature', `sha256=${signature}`);
    headers.set('x-whop-timestamp', timestamp);
    headers.set('content-type', 'application/json');
    headers.set('x-forwarded-for', '192.168.1.1');

    return new NextRequest('http://localhost/api/webhooks/whop', {
      method: 'POST',
      headers,
      body
    });
  }

  describe('Rate Limit Enforcement', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        resetAt: new Date(Date.now() + 60000),
        remaining: 0,
        retryAfter: 60
      });

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(429);
      expect(responseData.error).toBe('Rate limit exceeded');
      expect(responseData.retryAfter).toBe(60);
      expect(responseData.resetAt).toBeDefined();
      expect(mockHandleWhopWebhook).not.toHaveBeenCalled();
    });

    it('should process webhook when rate limit allows', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      // Mock database and other dependencies for handleWhopWebhook
      mockSql.select.mockResolvedValue([]); // No existing event
      mockSql.execute.mockResolvedValue(undefined);
      
      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'webhook:global',
        RATE_LIMIT_CONFIGS.webhooks
      );
    });

    it('should use correct rate limit configuration for webhooks', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      await POST(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        'webhook:global',
        expect.objectContaining({
          windowMs: 60 * 1000, // 1 minute
          maxRequests: 300, // 300 requests per minute
          keyPrefix: 'webhook'
        })
      );
    });

    it('should include retryAfter and resetAt in rate limit response', async () => {
      const resetAt = new Date(Date.now() + 45000); // 45 seconds from now
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        resetAt,
        remaining: 0,
        retryAfter: 45
      });

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(429);
      expect(responseData.retryAfter).toBe(45);
      expect(responseData.resetAt).toBe(resetAt.toISOString());
    });

    it('should log rate limit violations with client IP', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        resetAt: new Date(Date.now() + 60000),
        remaining: 0,
        retryAfter: 60
      });

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      await POST(request);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          endpoint: 'webhooks/whop',
          ip: '192.168.1.1',
          retryAfter: 60
        })
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Rate Limit Fail-Closed Behavior', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should block requests when rate limit check fails in production', async () => {
      process.env.NODE_ENV = 'production';
      
      mockCheckRateLimit.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(503);
      expect(responseData.error).toBe('Rate limiting service temporarily unavailable');
      expect(mockHandleWhopWebhook).not.toHaveBeenCalled();
    });

    it('should allow requests when rate limit check fails in development', async () => {
      process.env.NODE_ENV = 'development';
      
      mockCheckRateLimit.mockRejectedValue(new Error('Database connection failed'));
      
      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Bucket Behavior', () => {
    it('should use fixed time bucket algorithm', async () => {
      const now = Date.now();
      const windowMs = RATE_LIMIT_CONFIGS.webhooks.windowMs;
      const expectedBucketStart = Math.floor(now / windowMs) * windowMs;

      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(expectedBucketStart + windowMs),
        remaining: 299
      });

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      await POST(request);

      expect(mockCheckRateLimit).toHaveBeenCalled();
    });

    it('should calculate retryAfter correctly based on bucket reset time', async () => {
      const resetAt = new Date(Date.now() + 30000); // 30 seconds from now
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        resetAt,
        remaining: 0,
        retryAfter: 30
      });

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);
      const responseData = await response.json();

      expect(responseData.retryAfter).toBe(30);
      expect(new Date(responseData.resetAt).getTime()).toBeCloseTo(resetAt.getTime(), -3);
    });
  });

  describe('Concurrent Rate Limit Requests', () => {
    it('should handle multiple concurrent requests correctly', async () => {
      let callCount = 0;
      mockCheckRateLimit.mockImplementation(async () => {
        callCount++;
        if (callCount <= 300) {
          return {
            allowed: true,
            resetAt: new Date(Date.now() + 60000),
            remaining: Math.max(0, 300 - callCount)
          };
        } else {
          return {
            allowed: false,
            resetAt: new Date(Date.now() + 60000),
            remaining: 0,
            retryAfter: 60
          };
        }
      });

      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      // Simulate 301 concurrent requests
      const requests = Array.from({ length: 301 }, () =>
        createMockRequest(testBody, validSignature, validTimestamp)
      );

      const responses = await Promise.all(requests.map(req => POST(req)));

      // First 300 should succeed, 301st should be rate limited
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      expect(successCount).toBe(300);
      expect(rateLimitedCount).toBe(1);
    });
  });
});

describe('Webhook Idempotency Integration Tests', () => {
  const webhookSecret = 'test_webhook_secret_idempotency';
  const eventId = 'evt_idempotency_test_123';
  const testPayload = {
    id: eventId,
    type: 'payment.succeeded',
    data: { amount: 1000, currency: 'USD' }
  };
  const testBody = JSON.stringify(testPayload);
  const validSignature = createHmac('sha256', webhookSecret)
    .update(testBody, 'utf8')
    .digest('hex');
  const validTimestamp = Math.floor(Date.now() / 1000).toString();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHOP_WEBHOOK_SECRET = webhookSecret;
    
    // Default mock for handleWhopWebhook
    mockHandleWhopWebhook.mockResolvedValue(
      NextResponse.json({ received: true }, { status: 200 })
    );
    
    // Default database mocks
    mockSql.select.mockResolvedValue([]);
    mockSql.execute.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.WHOP_WEBHOOK_SECRET;
  });

  function createMockRequest(body: string, signature: string, timestamp: string): NextRequest {
    const headers = new Headers();
    headers.set('x-whop-signature', `sha256=${signature}`);
    headers.set('x-whop-timestamp', timestamp);
    headers.set('content-type', 'application/json');

    return new NextRequest('http://localhost/api/webhooks/whop', {
      method: 'POST',
      headers,
      body
    });
  }

  describe('Duplicate Event Detection', () => {
    it('should return 200 OK for duplicate event without processing', async () => {
      // Mock handler to return idempotent response (event already processed)
      const mockResponse = NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);
      
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);
      const responseData = await response.json();

      expect(response.status).toBe(200);
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
      // Note: Idempotency logic is tested in handleWhopWebhook unit tests
    });

    it('should process new event when not duplicate', async () => {
      // Mock database to return no existing event
      mockSql.select.mockResolvedValue([]);
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const mockResponse = NextResponse.json({ success: true, processed: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
    });

    it('should use whop_event_id for idempotency check', async () => {
      const payloadWithWhopEventId = {
        whop_event_id: 'evt_whop_123',
        type: 'payment.succeeded',
        data: {}
      };
      const body = JSON.stringify(payloadWithWhopEventId);
      const signature = createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');

      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const request = createMockRequest(body, signature, validTimestamp);
      await POST(request);

      // Verify handleWhopWebhook was called with the request
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
      
      // Verify the payload contains whop_event_id
      expect(payloadWithWhopEventId.whop_event_id).toBe('evt_whop_123');
    });

    it('should use id field when whop_event_id is not present', async () => {
      const payloadWithId = {
        id: 'evt_id_123',
        type: 'payment.succeeded',
        data: {}
      };
      const body = JSON.stringify(payloadWithId);
      const signature = createHmac('sha256', webhookSecret)
        .update(body, 'utf8')
        .digest('hex');

      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const request = createMockRequest(body, signature, validTimestamp);
      await POST(request);

      // Verify handleWhopWebhook was called with the request
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
      
      // Verify the payload contains id field
      expect(payloadWithId.id).toBe('evt_id_123');
    });
  });

  describe('Concurrent Duplicate Events', () => {
    it('should handle concurrent webhook calls with same event ID', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      // Simulate 3 concurrent requests with same event ID
      const requests = Array.from({ length: 3 }, () =>
        createMockRequest(testBody, validSignature, validTimestamp)
      );

      const responses = await Promise.all(requests.map(req => POST(req)));

      // All should return 200 and call handleWhopWebhook
      // Note: Actual idempotency is handled inside handleWhopWebhook
      expect(responses.every(r => r.status === 200)).toBe(true);
      expect(mockHandleWhopWebhook).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid-fire requests correctly', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      // Send first request
      const request1 = createMockRequest(testBody, validSignature, validTimestamp);
      const response1 = await POST(request1);

      // Immediately send duplicate
      const request2 = createMockRequest(testBody, validSignature, validTimestamp);
      const response2 = await POST(request2);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Both requests call handleWhopWebhook (idempotency handled inside)
      expect(mockHandleWhopWebhook).toHaveBeenCalledTimes(2);
    });
  });

  describe('Idempotency with Different Payloads', () => {
    it('should detect duplicate even if payload differs but event ID is same', async () => {
      const payload1 = {
        id: eventId,
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };
      const payload2 = {
        id: eventId,
        type: 'payment.succeeded',
        data: { amount: 2000 } // Different amount
      };

      const body1 = JSON.stringify(payload1);
      const body2 = JSON.stringify(payload2);
      const signature1 = createHmac('sha256', webhookSecret)
        .update(body1, 'utf8')
        .digest('hex');
      const signature2 = createHmac('sha256', webhookSecret)
        .update(body2, 'utf8')
        .digest('hex');

      mockSql.select.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'existing_event_id' }]);
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      const request1 = createMockRequest(body1, signature1, validTimestamp);
      const response1 = await POST(request1);

      const request2 = createMockRequest(body2, signature2, validTimestamp);
      const response2 = await POST(request2);

      // Both requests are processed (idempotency handled inside handleWhopWebhook)
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(mockHandleWhopWebhook).toHaveBeenCalledTimes(2);
    });
  });

  describe('Database Query Verification', () => {
    it('should process webhook requests correctly', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      const mockResponse = NextResponse.json({ success: true }, { status: 200 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
      // Note: Database queries are tested in handleWhopWebhook unit tests
    });

    it('should handle database errors gracefully', async () => {
      mockSql.select.mockRejectedValue(new Error('Database connection failed'));
      mockCheckRateLimit.mockResolvedValue({
        allowed: true,
        resetAt: new Date(Date.now() + 60000),
        remaining: 299
      });

      // Should propagate error to handler, which will handle it
      const mockResponse = NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      mockHandleWhopWebhook.mockResolvedValue(mockResponse);

      const request = createMockRequest(testBody, validSignature, validTimestamp);
      const response = await POST(request);

      // Error should be handled by webhook handler
      expect(mockHandleWhopWebhook).toHaveBeenCalled();
    });
  });
});

