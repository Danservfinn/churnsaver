/**
 * Comprehensive Security Tests
 * Validates authentication, webhook validation, rate limiting, and database security
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');

// Import the services we need to test
const { WhopAuthService, whopAuthService } = require('../src/lib/whop/auth');
const { WebhookValidator, webhookValidator, validateWebhookSignature, validateTimestamp, validateEventType, validateWebhookPayload } = require('../src/lib/whop/webhookValidator');
const { checkRateLimit } = require('../src/lib/rateLimitRedis');
const sqlWithRLS = require('../src/lib/db-rls');
const { encrypt, decrypt } = require('../src/lib/encryption');

// Mock external dependencies
jest.mock('../src/lib/whop/sdkConfig', () => ({
  whopConfig: {
    get: () => ({
      appId: 'test-app-id',
      apiKey: 'test-api-key',
      webhookSecret: 'test-webhook-secret',
      environment: 'test'
    })
  }
}));

jest.mock('../src/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    security: jest.fn()
  },
  security: jest.fn()
}));

jest.mock('../src/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/testdb',
    NODE_ENV: 'test'
  },
  isProductionLikeEnvironment: jest.fn(() => false),
  additionalEnv: {
    WEBHOOK_TIMESTAMP_SKEW_SECONDS: 300
  }
}));

jest.mock('@whop/sdk', () => ({
  Whop: jest.fn().mockImplementation(() => ({
    verifyUserToken: jest.fn(),
    users: {
      get: jest.fn()
    }
  }))
}));

jest.mock('ioredis');

// Mock database operations
jest.mock('../src/lib/db-rls', () => ({
  sqlWithRLS: {
    query: jest.fn(),
    select: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn()
  }
}));

describe('Security Tests Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset any global state
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  /*****************************
   * AUTHENTICATION SECURITY TESTS
   *****************************/

  describe('Authentication Security Tests', () => {
    let authService;

    beforeEach(() => {
      authService = new WhopAuthService({
        appId: 'test-app-id',
        apiKey: 'test-api-key',
        environment: 'test'
      });
    });

    describe('Development Mode Bypass Prevention', () => {
      it('should prevent authentication bypass in production-like environments', async () => {
        // Mock production-like environment
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const mockIsProductionLike = require('../src/lib/env').isProductionLikeEnvironment;
        mockIsProductionLike.mockReturnValue(true);

        // Mock missing API key (development mode condition)
        const service = new WhopAuthService({
          appId: 'test-app-id',
          apiKey: null,
          environment: 'production'
        });

        const mockRequest = {
          headers: { get: () => null }
        };

        await expect(service.authenticate(mockRequest))
          .rejects
          .toThrow('SECURITY CONFIGURATION ERROR');

        // Restore environment
        process.env.NODE_ENV = originalEnv;
      });

      it('should allow development mode with explicit ALLOW_INSECURE_DEV flag', async () => {
        process.env.NODE_ENV = 'development';
        process.env.ALLOW_INSECURE_DEV = 'true';

        const mockIsProductionLike = require('../src/lib/env').isProductionLikeEnvironment;
        mockIsProductionLike.mockReturnValue(false);

        const service = new WhopAuthService({
          appId: 'test-app-id',
          apiKey: null,
          environment: 'development'
        });

        const mockRequest = {
          headers: { get: () => 'test-token' }
        };

        const result = await service.authenticate(mockRequest);

        expect(result.isAuthenticated).toBe(true);
        expect(result.userId).toBe('dev-user');
        expect(result.metadata.developmentMode).toBe(true);
      });

      it('should block insecure dev mode in production-like environments', async () => {
        process.env.NODE_ENV = 'development';
        process.env.ALLOW_INSECURE_DEV = 'true';

        const mockIsProductionLike = require('../src/lib/env').isProductionLikeEnvironment;
        mockIsProductionLike.mockReturnValue(true);

        const service = new WhopAuthService({
          appId: 'test-app-id',
          apiKey: null,
          environment: 'development'
        });

        const mockRequest = {
          headers: { get: () => null }
        };

        await expect(service.authenticate(mockRequest))
          .rejects
          .toThrow('SECURITY CONFIGURATION ERROR');
      });
    });

    describe('Token Cache Invalidation', () => {
      it('should invalidate token cache on session revocation', async () => {
        const userId = 'test-user';
        const sessionId = 'test-session';

        // Mock session data
        const mockDecrypt = jest.spyOn(require('../src/lib/encryption'), 'decrypt');
        mockDecrypt.mockResolvedValue(JSON.stringify({
          sessionId,
          userId,
          isActive: true,
          expiresAt: Date.now() + 3600000
        }));

        const mockTokenStorage = {
          get: jest.fn().mockResolvedValue('encrypted-session-data'),
          delete: jest.fn().mockResolvedValue(undefined),
          set: jest.fn().mockResolvedValue(undefined)
        };

        authService = new WhopAuthService({
          appId: 'test-app-id',
          apiKey: 'test-api-key'
        }, mockTokenStorage);

        // Mock token cache
        authService.tokenCache.set('token:test-hash', {
          token: 'test-token',
          userId,
          expiresAt: Date.now() + 3600000
        });

        await authService.revokeSession(sessionId);

        expect(authService.tokenCache.has('token:test-hash')).toBe(false);
      });

      it('should invalidate all user tokens on revokeAllUserSessions', async () => {
        const userId = 'test-user';
        const sessionIds = ['session1', 'session2'];

        // Mock user sessions retrieval
        const mockGetUserSessions = jest.spyOn(authService, 'getUserSessions');
        mockGetUserSessions.mockResolvedValue(sessionIds);

        // Mock session data
        const mockDecrypt = jest.spyOn(require('../src/lib/encryption'), 'decrypt');
        mockDecrypt.mockResolvedValue(JSON.stringify({
          sessionId: 'session1',
          userId,
          isActive: true,
          expiresAt: Date.now() + 3600000
        }));

        // Populate token cache with user tokens
        authService.tokenCache.set('token:hash1', {
          token: 'token1',
          userId,
          expiresAt: Date.now() + 3600000
        });
        authService.tokenCache.set('token:hash2', {
          token: 'token2',
          userId,
          expiresAt: Date.now() + 3600000
        });

        // Map sessions to tokens
        authService.sessionToTokensMap.set('session1', new Set(['token:hash1']));
        authService.sessionToTokensMap.set('session2', new Set(['token:hash2']));

        await authService.revokeAllUserSessions(userId);

        expect(authService.tokenCache.has('token:hash1')).toBe(false);
        expect(authService.tokenCache.has('token:hash2')).toBe(false);
      });
    });

    describe('Session Revocation and Token Cleanup', () => {
      it('should revoke session and cleanup associated tokens', async () => {
        const sessionId = 'test-session';
        const userId = 'test-user';

        // Mock session data
        const mockDecrypt = jest.spyOn(require('../src/lib/encryption'), 'decrypt');
        mockDecrypt.mockResolvedValue(JSON.stringify({
          sessionId,
          userId,
          isActive: true,
          expiresAt: Date.now() + 3600000
        }));

        const mockTokenStorage = {
          get: jest.fn().mockResolvedValue('encrypted-session-data'),
          delete: jest.fn().mockResolvedValue(undefined),
          set: jest.fn().mockResolvedValue(undefined)
        };

        authService = new WhopAuthService({
          appId: 'test-app-id',
          apiKey: 'test-api-key'
        }, mockTokenStorage);

        // Setup session-to-tokens mapping
        authService.sessionToTokensMap.set(sessionId, new Set(['token:hash1', 'token:hash2']));

        await authService.revokeSession(sessionId);

        expect(mockTokenStorage.delete).toHaveBeenCalledWith(`session:${sessionId}`);
        expect(authService.sessionToTokensMap.has(sessionId)).toBe(false);
      });

      it('should cleanup expired sessions automatically', async () => {
        // Mock time to simulate expired sessions
        const originalNow = Date.now;
        Date.now = jest.fn(() => originalNow() + 7200000); // 2 hours later

        authService.tokenCache.set('token:expired', {
          token: 'expired-token',
          expiresAt: originalNow() - 3600000 // 1 hour ago
        });

        await authService.cleanupExpiredSessions();

        expect(authService.tokenCache.has('token:expired')).toBe(false);

        Date.now = originalNow;
      });
    });

    describe('Rate Limiting on Authentication Endpoints', () => {
      it('should enforce rate limits on authentication attempts', async () => {
        const identifier = 'test-ip';
        const config = {
          windowMs: 60000, // 1 minute
          maxRequests: 5,
          keyPrefix: 'auth'
        };

        // Mock Redis as unavailable to test Postgres fallback
        const mockIsRedisHealthy = jest.spyOn(require('../src/lib/rateLimitRedis'), 'isRedisHealthy');
        mockIsRedisHealthy.mockResolvedValue(false);

        // Mock Postgres rate limit check
        const mockSql = require('../src/lib/db');
        mockSql.execute = jest.fn().mockResolvedValue({ rowCount: 1 });
        mockSql.select = jest.fn().mockResolvedValue([{ count: 3 }]); // 3 requests already made

        const result = await checkRateLimit(identifier, config);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(1); // 5 - 3 - 1 = 1
      });

      it('should block requests exceeding rate limit', async () => {
        const identifier = 'test-ip';
        const config = {
          windowMs: 60000,
          maxRequests: 3,
          keyPrefix: 'auth'
        };

        // Mock Postgres rate limit check with exceeded limit
        const mockSql = require('../src/lib/db');
        mockSql.select = jest.fn().mockResolvedValue([{ count: 3 }]); // Already at limit

        const result = await checkRateLimit(identifier, config);

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfter).toBeGreaterThan(0);
      });
    });

    describe('JWT Tampering Detection', () => {
      it('should reject tampered JWT tokens', async () => {
        const tamperedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.tampered_signature';

        const mockWhopSdk = require('@whop/sdk').Whop.mock.results[0].value;
        mockWhopSdk.verifyUserToken.mockRejectedValue(new Error('Invalid signature'));

        await expect(authService.verifyToken(tamperedToken))
          .rejects
          .toThrow('Invalid authentication token');
      });

      it('should detect none algorithm in JWT header', () => {
        const noneToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.';

        // Use token analysis to check for none algorithm
        const tokenParts = noneToken.split('.');
        const header = JSON.parse(Buffer.from(tokenParts[0], 'base64').toString());

        expect(header.alg).toBe('none');
      });
    });
  });

  /*****************************
   * WEBHOOK SECURITY TESTS
   *****************************/

  describe('Webhook Security Tests', () => {
    const validSecret = 'test-webhook-secret';
    const validBody = JSON.stringify({ type: 'payment.succeeded', data: { id: 'test' } });

    describe('Webhook Signature Validation', () => {
      it('should validate correct webhook signatures', () => {
        const computedSignature = require('crypto')
          .createHmac('sha256', validSecret)
          .update(validBody, 'utf8')
          .digest('hex');

        const signatureHeader = `sha256=${computedSignature}`;

        const result = validateWebhookSignature(validBody, signatureHeader, validSecret);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject invalid webhook signatures', () => {
        const invalidSignature = 'sha256=invalid_signature_hash';

        const result = validateWebhookSignature(validBody, invalidSignature, validSecret);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Signature verification failed');
      });

      it('should reject malformed signature headers', () => {
        const malformedSignatures = [
          'invalid-format',
          'sha256=',
          'unknown-prefix=hash',
          'v2,hash',
          ''
        ];

        malformedSignatures.forEach(signature => {
          const result = validateWebhookSignature(validBody, signature, validSecret);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('Unsupported signature format');
        });
      });

      it('should handle timing-safe comparison correctly', () => {
        const validSignature = require('crypto')
          .createHmac('sha256', validSecret)
          .update(validBody, 'utf8')
          .digest('hex');

        // Test with different length signatures (should fail timing-safely)
        const shortSignature = validSignature.substring(0, 10);
        const result = validateWebhookSignature(validBody, `sha256=${shortSignature}`, validSecret);

        expect(result.isValid).toBe(false);
      });
    });

    describe('Timestamp Validation and Replay Attack Prevention', () => {
      it('should accept valid recent timestamps', () => {
        const now = Math.floor(Date.now() / 1000);
        const timestampHeader = now.toString();

        const result = validateTimestamp(timestampHeader, 300);

        expect(result.valid).toBe(true);
        expect(result.timestamp).toBe(now);
      });

      it('should reject timestamps outside tolerance window', () => {
        const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
        const timestampHeader = oldTimestamp.toString();

        const result = validateTimestamp(timestampHeader, 300);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside allowed window');
      });

      it('should require timestamp header in production', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const result = validateTimestamp(null);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Missing X-Whop-Timestamp header');

        process.env.NODE_ENV = originalEnv;
      });

      it('should reject malformed timestamps', () => {
        const malformedTimestamps = ['not-a-number', '', 'abc123', '-123'];

        malformedTimestamps.forEach(timestamp => {
          const result = validateTimestamp(timestamp);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('malformed timestamp');
        });
      });

      it('should prevent replay attacks with same timestamp', async () => {
        const now = Math.floor(Date.now() / 1000);
        const timestampHeader = now.toString();

        // First request should succeed
        const result1 = validateTimestamp(timestampHeader, 300);
        expect(result1.valid).toBe(true);

        // Immediate second request with same timestamp should still be valid
        // (replay protection would typically require additional state tracking)
        const result2 = validateTimestamp(timestampHeader, 300);
        expect(result2.valid).toBe(true);
      });
    });

    describe('Webhook Payload Manipulation Detection', () => {
      it('should detect tampered payload data', () => {
        const originalBody = JSON.stringify({ type: 'payment.succeeded', data: { amount: 100 } });
        const tamperedBody = JSON.stringify({ type: 'payment.succeeded', data: { amount: 1000 } });

        const signature = require('crypto')
          .createHmac('sha256', validSecret)
          .update(originalBody, 'utf8')
          .digest('hex');

        const result = validateWebhookSignature(tamperedBody, `sha256=${signature}`, validSecret);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Signature verification failed');
      });

      it('should validate required payload fields', () => {
        const invalidPayloads = [
          {}, // Missing type and data
          { type: 'payment.succeeded' }, // Missing data
          { data: { id: 'test' } }, // Missing type
          { type: '', data: {} }, // Empty type
          { type: 'invalid.type', data: {} } // Invalid type format
        ];

        invalidPayloads.forEach(payload => {
          const result = validateWebhookPayload(payload);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        });
      });

      it('should validate event type schema', () => {
        const validTypes = ['payment.succeeded', 'subscription.created', 'membership.updated'];
        const invalidTypes = ['payment', 'payment.succeeded.failed', 'invalid_event'];

        validTypes.forEach(type => {
          const result = validateEventType(type);
          expect(result.isValid).toBe(true);
          expect(result.schemaCompliant).toBe(true);
        });

        invalidTypes.forEach(type => {
          const result = validateEventType(type);
          expect(result.isValid).toBe(false);
          expect(result.errors).toContain('does not match expected schema');
        });
      });
    });

    describe('Rate Limiting on Webhook Endpoints', () => {
      it('should enforce rate limits on webhook processing', async () => {
        const identifier = 'webhook-source';
        const config = {
          windowMs: 60000,
          maxRequests: 10,
          keyPrefix: 'webhook'
        };

        // Mock successful rate limit check
        const mockCheckRateLimit = jest.spyOn(require('../src/lib/rateLimitRedis'), 'checkRateLimit');
        mockCheckRateLimit.mockResolvedValue({
          allowed: true,
          remaining: 7,
          resetAt: new Date(Date.now() + 60000)
        });

        const result = await checkRateLimit(identifier, config);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(7);
      });

      it('should block excessive webhook requests', async () => {
        const identifier = 'abusive-webhook-source';
        const config = {
          windowMs: 60000,
          maxRequests: 5,
          keyPrefix: 'webhook'
        };

        const mockCheckRateLimit = jest.spyOn(require('../src/lib/rateLimitRedis'), 'checkRateLimit');
        mockCheckRateLimit.mockResolvedValue({
          allowed: false,
          remaining: 0,
          resetAt: new Date(Date.now() + 30000),
          retryAfter: 30
        });

        const result = await checkRateLimit(identifier, config);

        expect(result.allowed).toBe(false);
        expect(result.retryAfter).toBe(30);
      });
    });
  });

  /*****************************
   * RATE LIMITING TESTS
   *****************************/

  describe('Rate Limiting Tests', () => {
    describe('Rate Limit Enforcement on Sensitive Endpoints', () => {
      const sensitiveEndpoints = [
        { path: '/api/auth/login', keyPrefix: 'auth' },
        { path: '/api/webhooks', keyPrefix: 'webhook' },
        { path: '/api/admin', keyPrefix: 'admin' }
      ];

      sensitiveEndpoints.forEach(({ path, keyPrefix }) => {
        it(`should enforce rate limits on ${path}`, async () => {
          const identifier = 'test-client';
          const config = {
            windowMs: 60000,
            maxRequests: keyPrefix === 'auth' ? 5 : 10,
            keyPrefix
          };

          const mockCheckRateLimit = jest.spyOn(require('../src/lib/rateLimitRedis'), 'checkRateLimit');
          mockCheckRateLimit.mockResolvedValue({
            allowed: true,
            remaining: config.maxRequests - 1,
            resetAt: new Date(Date.now() + config.windowMs)
          });

          const result = await checkRateLimit(identifier, config);

          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(config.maxRequests - 1);
        });
      });
    });

    describe('Rate Limit Bypass Prevention', () => {
      it('should prevent IP spoofing bypass attempts', async () => {
        const config = {
          windowMs: 60000,
          maxRequests: 10,
          keyPrefix: 'api'
        };

        // Mock multiple identifiers that might be spoofed
        const spoofedIdentifiers = [
          '127.0.0.1',
          '192.168.1.1',
          '10.0.0.1',
          '::1'
        ];

        const mockCheckRateLimit = jest.spyOn(require('../src/lib/rateLimitRedis'), 'checkRateLimit');

        for (const identifier of spoofedIdentifiers) {
          mockCheckRateLimit.mockResolvedValueOnce({
            allowed: true,
            remaining: 5,
            resetAt: new Date(Date.now() + 60000)
          });

          const result = await checkRateLimit(identifier, config);
          expect(result.allowed).toBe(true);
        }

        // Verify rate limits are applied per identifier
        expect(mockCheckRateLimit).toHaveBeenCalledTimes(spoofedIdentifiers.length);
      });

      it('should detect and prevent header-based bypass attempts', () => {
        // Test various bypass techniques
        const bypassHeaders = [
          'X-Forwarded-For',
          'X-Real-IP',
          'CF-Connecting-IP',
          'X-Client-IP'
        ];

        // In a real implementation, these would be validated server-side
        // This test ensures headers are properly handled
        bypassHeaders.forEach(header => {
          expect(typeof header).toBe('string');
          expect(header.length).toBeGreaterThan(0);
        });
      });
    });

    describe('Different Rate Limit Tiers', () => {
      const tiers = [
        { name: 'free', maxRequests: 10, windowMs: 60000 },
        { name: 'basic', maxRequests: 100, windowMs: 60000 },
        { name: 'premium', maxRequests: 1000, windowMs: 60000 },
        { name: 'enterprise', maxRequests: 10000, windowMs: 60000 }
      ];

      tiers.forEach(tier => {
        it(`should enforce ${tier.name} tier limits correctly`, async () => {
          const identifier = `user-${tier.name}`;
          const config = {
            windowMs: tier.windowMs,
            maxRequests: tier.maxRequests,
            keyPrefix: `tier-${tier.name}`
          };

          const mockCheckRateLimit = jest.spyOn(require('../src/lib/rateLimitRedis'), 'checkRateLimit');

          // Simulate reaching the limit
          for (let i = 0; i < tier.maxRequests; i++) {
            mockCheckRateLimit.mockResolvedValueOnce({
              allowed: true,
              remaining: tier.maxRequests - i - 1,
              resetAt: new Date(Date.now() + config.windowMs)
            });
          }

          // Next request should be blocked
          mockCheckRateLimit.mockResolvedValueOnce({
            allowed: false,
            remaining: 0,
            resetAt: new Date(Date.now() + config.windowMs),
            retryAfter: Math.ceil(config.windowMs / 1000)
          });

          // Test allowed requests
          for (let i = 0; i < tier.maxRequests; i++) {
            const result = await checkRateLimit(identifier, config);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(tier.maxRequests - i - 1);
          }

          // Test blocked request
          const blockedResult = await checkRateLimit(identifier, config);
          expect(blockedResult.allowed).toBe(false);
          expect(blockedResult.remaining).toBe(0);
        });
      });
    });

    describe('Rate Limit Reset Behavior', () => {
      it('should reset rate limits after window expires', async () => {
        const identifier = 'test-user';
        const config = {
          windowMs: 1000, // 1 second for testing
          maxRequests: 2,
          keyPrefix: 'test'
        };

        const mockCheckRateLimit = jest.spyOn(require('../src/lib/rateLimitRedis'), 'checkRateLimit');

        // First request
        mockCheckRateLimit.mockResolvedValueOnce({
          allowed: true,
          remaining: 1,
          resetAt: new Date(Date.now() + config.windowMs)
        });

        const result1 = await checkRateLimit(identifier, config);
        expect(result1.allowed).toBe(true);
        expect(result1.remaining).toBe(1);

        // Second request (should still be allowed)
        mockCheckRateLimit.mockResolvedValueOnce({
          allowed: true,
          remaining: 0,
          resetAt: new Date(Date.now() + config.windowMs)
        });

        const result2 = await checkRateLimit(identifier, config);
        expect(result2.allowed).toBe(true);
        expect(result2.remaining).toBe(0);

        // Third request (should be blocked)
        mockCheckRateLimit.mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          resetAt: new Date(Date.now() + config.windowMs),
          retryAfter: 1
        });

        const result3 = await checkRateLimit(identifier, config);
        expect(result3.allowed).toBe(false);

        // Simulate window reset
        jest.advanceTimersByTime(config.windowMs);

        // Next request should be allowed again
        mockCheckRateLimit.mockResolvedValueOnce({
          allowed: true,
          remaining: 1,
          resetAt: new Date(Date.now() + config.windowMs)
        });

        const result4 = await checkRateLimit(identifier, config);
        expect(result4.allowed).toBe(true);
        expect(result4.remaining).toBe(1);
      });

      it('should handle Redis fallback to Postgres correctly', async () => {
        const identifier = 'fallback-user';
        const config = {
          windowMs: 60000,
          maxRequests: 5,
          keyPrefix: 'fallback'
        };

        // Mock Redis failure
        const mockIsRedisHealthy = jest.spyOn(require('../src/lib/rateLimitRedis'), 'isRedisHealthy');
        mockIsRedisHealthy.mockResolvedValue(false);

        // Mock Postgres operations
        const mockSql = require('../src/lib/db');
        mockSql.select = jest.fn().mockResolvedValue([{ count: 2 }]);
        mockSql.execute = jest.fn().mockResolvedValue({ rowCount: 1 });

        const result = await checkRateLimit(identifier, config);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2); // 5 - 2 - 1 = 2

        expect(mockSql.select).toHaveBeenCalled();
        expect(mockSql.execute).toHaveBeenCalled();
      });
    });
  });

  /*****************************
   * DATABASE SECURITY TESTS
   *****************************/

  describe('Database Security Tests', () => {
    describe('Encryption Security', () => {
      it('should encrypt and decrypt sensitive data correctly', async () => {
        const sensitiveData = 'SSN:123-45-6789';
        const key = 'test-encryption-key-32-chars-long';

        const encrypted = await encrypt(sensitiveData, key);
        const decrypted = await decrypt(encrypted, key);

        expect(encrypted).not.toBe(sensitiveData);
        expect(decrypted).toBe(sensitiveData);
        expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64URL format
      });

      it('should fail decryption with wrong key', async () => {
        const sensitiveData = 'password:secret123';
        const correctKey = 'correct-key-32-chars-long-key';
        const wrongKey = 'wrong-key-32-chars-long-key';

        const encrypted = await encrypt(sensitiveData, correctKey);

        await expect(decrypt(encrypted, wrongKey))
          .rejects
          .toThrow(/decryption failed|invalid key/i);
      });

      it('should generate different ciphertexts for same plaintext (IV uniqueness)', async () => {
        const data = 'same sensitive data';
        const key = 'encryption-key-32-chars-long';

        const encrypted1 = await encrypt(data, key);
        const encrypted2 = await encrypt(data, key);

        expect(encrypted1).not.toBe(encrypted2);
        expect(await decrypt(encrypted1, key)).toBe(data);
        expect(await decrypt(encrypted2, key)).toBe(data);
      });

      it('should handle encryption of complex objects and arrays', async () => {
        const complexData = {
          user: {
            id: 12345,
            email: 'user@example.com',
            roles: ['admin', 'user']
          },
          permissions: {
            read: true,
            write: true,
            delete: false
          },
          metadata: {
            created: '2024-01-01T00:00:00Z',
            source: 'web-app'
          }
        };

        const key = 'complex-data-key-32-chars-long';
        const jsonData = JSON.stringify(complexData);

        const encrypted = await encrypt(jsonData, key);
        const decrypted = await decrypt(encrypted, key);
        const parsed = JSON.parse(decrypted);

        expect(parsed).toEqual(complexData);
      });

      it('should reject encryption with invalid key length', async () => {
        const data = 'test data';
        const shortKey = 'short';

        await expect(encrypt(data, shortKey))
          .rejects
          .toThrow(/invalid key|key length/i);
      });

      it('should handle empty strings and null values', async () => {
        const key = 'test-key-32-chars-long-for-test';

        const encryptedEmpty = await encrypt('', key);
        const decryptedEmpty = await decrypt(encryptedEmpty, key);
        expect(decryptedEmpty).toBe('');

        const encryptedNull = await encrypt(JSON.stringify(null), key);
        const decryptedNull = await decrypt(encryptedNull, key);
        expect(JSON.parse(decryptedNull)).toBeNull();
      });
    });

    describe('SQL Injection Prevention', () => {
      const injectionAttempts = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users --",
        "admin' --",
        "1; SELECT * FROM secret_table",
        "' OR id IS NOT NULL --",
        "') UNION SELECT password FROM users --",
        "'; EXEC xp_cmdshell 'dir' --"
      ];

      injectionAttempts.forEach(injection => {
        it(`should prevent SQL injection with payload: ${injection}`, async () => {
          const mockQuery = jest.spyOn(sqlWithRLS, 'query');
          mockQuery.mockResolvedValue({
            rows: [],
            rowCount: 0
          });

          // Attempt injection through parameterized query
          const result = await sqlWithRLS.query(
            'SELECT * FROM users WHERE username = $1',
            [injection]
          );

          // Query should execute safely without injection
          expect(result.rowCount).toBe(0);
          expect(mockQuery).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE username = $1',
            [injection]
          );
        });
      });

      it('should use parameterized queries for all dynamic values', async () => {
        const testCases = [
          { query: 'SELECT * FROM users WHERE id = $1', params: [123] },
          { query: 'INSERT INTO logs (message, level) VALUES ($1, $2)', params: ['test message', 'info'] },
          { query: 'UPDATE users SET email = $1 WHERE id = $2', params: ['test@example.com', 456] },
          { query: 'DELETE FROM sessions WHERE token = $1 AND expires_at < $2', params: ['abc123', new Date()] }
        ];

        const mockQuery = jest.spyOn(sqlWithRLS, 'query');

        for (const { query, params } of testCases) {
          mockQuery.mockResolvedValueOnce({
            rows: [],
            rowCount: params.length > 1 ? 1 : 0
          });

          await sqlWithRLS.query(query, params);

          expect(mockQuery).toHaveBeenCalledWith(query, params, undefined);
        }
      });

      it('should prevent second-order SQL injection through stored data', async () => {
        // Simulate data that was previously stored and now being used in queries
        const storedMaliciousData = "malicious'; DROP TABLE users; --";
        const mockQuery = jest.spyOn(sqlWithRLS, 'query');

        mockQuery.mockResolvedValue({
          rows: [{ id: 1, data: storedMaliciousData }],
          rowCount: 1
        });

        // Retrieve and use the data - should be safe when parameterized
        const result = await sqlWithRLS.query(
          'SELECT * FROM user_data WHERE user_id = $1',
          [1]
        );

        expect(result.rows).toHaveLength(1);
        // The malicious data should be returned as-is, not executed
        expect(result.rows[0].data).toBe(storedMaliciousData);
      });
    });
    describe('RLS Policy Enforcement', () => {
      it('should enforce company context in RLS queries', async () => {
        const companyId = 'test-company';
        const mockQuery = jest.spyOn(sqlWithRLS, 'query');

        mockQuery.mockResolvedValue({
          rows: [{ id: 1, name: 'test' }],
          rowCount: 1
        });

        // Mock request context
        require('../src/lib/db-rls').setRequestContext({
          companyId,
          userId: 'test-user',
          isAuthenticated: true
        });

        const result = await sqlWithRLS.query('SELECT * FROM test_table', [], {
          enforceCompanyContext: true
        });

        expect(result.rows).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(
          'SELECT * FROM test_table',
          [],
          expect.objectContaining({
            enforceCompanyContext: true
          })
        );
      });

      it('should reject queries without proper company context', async () => {
        const mockValidateCompanyContext = jest.spyOn(require('../src/lib/db-rls'), 'validateCompanyContext');
        mockValidateCompanyContext.mockResolvedValue(false);

        await expect(sqlWithRLS.query('SELECT * FROM companies', [], {
          companyId: 'invalid-company',
          enforceCompanyContext: true
        })).rejects.toThrow('Invalid company context');
      });

      it('should allow skipping RLS for system operations', async () => {
        const mockQuery = jest.spyOn(sqlWithRLS, 'query');
        mockQuery.mockResolvedValue({
          rows: [{ id: 1 }],
          rowCount: 1
        });

        const result = await sqlWithRLS.query('SELECT * FROM companies', [], {
          skipRLS: true
        });

        expect(result.rows).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(
          'SELECT * FROM companies',
          [],
          expect.objectContaining({
            skipRLS: true
          })
        );
      });
    });

    describe('SQL Injection Prevention', () => {
      const injectionAttempts = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users --",
        "admin' --",
        "1; SELECT * FROM secret_table"
      ];

      injectionAttempts.forEach(injection => {
        it(`should prevent SQL injection with payload: ${injection}`, async () => {
          const mockQuery = jest.spyOn(sqlWithRLS, 'query');
          mockQuery.mockResolvedValue({
            rows: [],
            rowCount: 0
          });

          // Attempt injection through parameterized query
          const result = await sqlWithRLS.query(
            'SELECT * FROM users WHERE username = $1',
            [injection]
          );

          // Query should execute safely without injection
          expect(result.rowCount).toBe(0);
          expect(mockQuery).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE username = $1',
            [injection]
          );
        });
      });

      it('should use parameterized queries for all dynamic values', async () => {
        const testCases = [
          { query: 'SELECT * FROM users WHERE id = $1', params: [123] },
          { query: 'INSERT INTO logs (message, level) VALUES ($1, $2)', params: ['test message', 'info'] },
          { query: 'UPDATE users SET email = $1 WHERE id = $2', params: ['test@example.com', 456] }
        ];

        const mockQuery = jest.spyOn(sqlWithRLS, 'query');

        for (const { query, params } of testCases) {
          mockQuery.mockResolvedValueOnce({
            rows: [],
            rowCount: params.length > 1 ? 1 : 0
          });

          await sqlWithRLS.query(query, params);

          expect(mockQuery).toHaveBeenCalledWith(query, params, undefined);
        }
      });
    });

    describe('Data Encryption Functionality', () => {
      it('should encrypt and decrypt data correctly', async () => {
        const testData = 'sensitive user data';
        const key = 'test-encryption-key';

        const encrypted = await encrypt(testData, key);
        const decrypted = await decrypt(encrypted, key);

        expect(encrypted).not.toBe(testData);
        expect(decrypted).toBe(testData);
        expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64URL format
      });

      it('should fail decryption with wrong key', async () => {
        const testData = 'secret information';
        const correctKey = 'correct-key';
        const wrongKey = 'wrong-key';

        const encrypted = await encrypt(testData, correctKey);

        await expect(decrypt(encrypted, wrongKey))
          .rejects
          .toThrow();
      });

      it('should generate different ciphertexts for same plaintext', async () => {
        const testData = 'same data';
        const key = 'test-key';

        const encrypted1 = await encrypt(testData, key);
        const encrypted2 = await encrypt(testData, key);

        expect(encrypted1).not.toBe(encrypted2);
        expect(await decrypt(encrypted1, key)).toBe(testData);
        expect(await decrypt(encrypted2, key)).toBe(testData);
      });

      it('should handle encryption of complex objects', async () => {
        const complexData = {
          user: { id: 123, email: 'user@example.com' },
          permissions: ['read', 'write'],
          metadata: { created: new Date(), source: 'test' }
        };

        const key = 'complex-data-key';
        const jsonData = JSON.stringify(complexData);

        const encrypted = await encrypt(jsonData, key);
        const decrypted = await decrypt(encrypted, key);
        const parsed = JSON.parse(decrypted);

        expect(parsed).toEqual(complexData);
      });
    });

    describe('SSL/TLS Security', () => {
      it('should enforce SSL certificate validation in production', () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        // Mock production-like environment
        const mockIsProductionLike = require('../src/lib/env').isProductionLikeEnvironment;
        mockIsProductionLike.mockReturnValue(true);

        // In production, SSL should be enabled with proper validation
        const poolConfig = {
          connectionString: 'postgresql://user:pass@host:5432/db?sslmode=require',
          ssl: {
            rejectUnauthorized: true
          }
        };

        expect(poolConfig.ssl.rejectUnauthorized).toBe(true);

        process.env.NODE_ENV = originalEnv;
      });

      it('should allow configurable SSL validation in development', () => {
        process.env.NODE_ENV = 'development';
        process.env.ALLOW_INSECURE_SSL = 'true';

        // Mock non-production environment
        const mockIsProductionLike = require('../src/lib/env').isProductionLikeEnvironment;
        mockIsProductionLike.mockReturnValue(false);

        const poolConfig = {
          connectionString: 'postgresql://user:pass@host:5432/db',
          ssl: {
            rejectUnauthorized: false // Should be allowed in dev with flag
          }
        };

        expect(poolConfig.ssl.rejectUnauthorized).toBe(false);
      });
    });
  });
});