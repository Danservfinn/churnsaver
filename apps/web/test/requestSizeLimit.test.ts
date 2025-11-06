// Request Size Limit Middleware Tests
// Tests for request size limiting functionality

import { NextRequest } from 'next/server';
import { requestSizeLimitMiddleware, checkRequestSize, getCurrentLimits, DEFAULT_LIMITS } from '@/middleware/requestSizeLimit';

// Mock the security monitor
jest.mock('@/lib/security-monitoring', () => ({
  securityMonitor: {
    processSecurityEvent: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock the logger
jest.mock('@/lib/logger', () => ({
  logger: {
    security: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Request Size Limit Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.MAX_REQUEST_SIZE_DEFAULT_MB;
    delete process.env.MAX_REQUEST_SIZE_WEBHOOK_MB;
    delete process.env.MAX_REQUEST_SIZE_UPLOAD_MB;
  });

  describe('getCurrentLimits', () => {
    it('should return default limits when no environment variables are set', () => {
      const limits = getCurrentLimits();
      expect(limits).toEqual(DEFAULT_LIMITS);
    });

    it('should use environment variables when set', () => {
      process.env.MAX_REQUEST_SIZE_DEFAULT_MB = '5';
      process.env.MAX_REQUEST_SIZE_WEBHOOK_MB = '2';
      process.env.MAX_REQUEST_SIZE_UPLOAD_MB = '20';

      const limits = getCurrentLimits();
      expect(limits.default).toBe(5 * 1024 * 1024);
      expect(limits.webhook).toBe(2 * 1024 * 1024);
      expect(limits.upload).toBe(20 * 1024 * 1024);
    });

    it('should enforce maximum limits for safety', () => {
      process.env.MAX_REQUEST_SIZE_DEFAULT_MB = '200'; // Over 100MB limit
      process.env.MAX_REQUEST_SIZE_WEBHOOK_MB = '20';  // Over 10MB limit
      process.env.MAX_REQUEST_SIZE_UPLOAD_MB = '600';  // Over 500MB limit

      const limits = getCurrentLimits();
      expect(limits.default).toBe(100 * 1024 * 1024); // Capped at 100MB
      expect(limits.webhook).toBe(10 * 1024 * 1024);  // Capped at 10MB
      expect(limits.upload).toBe(500 * 1024 * 1024);  // Capped at 500MB
    });
  });

  describe('checkRequestSize', () => {
    it('should allow requests within size limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-length': '1024' // 1KB
        }
      });

      const result = await checkRequestSize(request);
      expect(result).toBeNull(); // No error response
    });

    it('should reject requests exceeding size limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-length': (DEFAULT_LIMITS.default + 1024).toString() // Over limit
        }
      });

      const result = await checkRequestSize(request);
      expect(result).toBeDefined();
      expect(result?.status).toBe(413);
    });

    it('should handle webhook endpoints with smaller limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/webhook/test', {
        method: 'POST',
        headers: {
          'content-length': (DEFAULT_LIMITS.webhook + 1024).toString() // Over webhook limit
        }
      });

      const result = await checkRequestSize(request);
      expect(result).toBeDefined();
      expect(result?.status).toBe(413);
    });

    it('should handle upload endpoints with larger limits', async () => {
      const request = new NextRequest('http://localhost:3000/api/upload/test', {
        method: 'POST',
        headers: {
          'content-length': (DEFAULT_LIMITS.upload - 1024).toString() // Within upload limit
        }
      });

      const result = await checkRequestSize(request);
      expect(result).toBeNull(); // Should allow
    });

    it('should skip size checking for requests without content-length header', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST'
        // No content-length header
      });

      const result = await checkRequestSize(request);
      expect(result).toBeNull(); // Should allow (can't check size)
    });

    it('should skip size checking for safe HTTP methods', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET'
      });

      const result = await requestSizeLimitMiddleware(request);
      expect(result).toBeNull(); // Should allow GET requests
    });
  });

  describe('requestSizeLimitMiddleware', () => {
    it('should skip non-API routes', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard', {
        method: 'POST',
        headers: {
          'content-length': '999999999' // Very large
        }
      });

      const result = await requestSizeLimitMiddleware(request);
      expect(result).toBeNull(); // Should allow non-API routes
    });

    it('should allow health check endpoints', async () => {
      const request = new NextRequest('http://localhost:3000/api/health', {
        method: 'GET'
      });

      const result = await requestSizeLimitMiddleware(request);
      expect(result).toBeNull(); // Should allow health checks
    });

    it('should block oversized API requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'POST',
        headers: {
          'content-length': (DEFAULT_LIMITS.default + 1024).toString()
        }
      });

      const result = await requestSizeLimitMiddleware(request);
      expect(result).toBeDefined();
      expect(result?.status).toBe(413);
    });
  });
});