// Whop SDK Integration Tests
// End-to-end tests for complete Whop workflows including authentication, webhooks, and API interactions

import { describe, it, expect, beforeEach, afterEach, jest } from '../test-framework';
import { WhopAuthService, TokenUtils } from '@/lib/whop/auth';
import { WebhookValidator } from '@/lib/whop/webhookValidator';
import { createWhopApiClient } from '@/lib/whop/client';
import { whopObservability } from '@/lib/whop/observability';
import { ResilienceService } from '@/lib/whop/resilience';
import { validateWebhookPayload, transformWebhookPayload } from '@/lib/whop/dataTransformers';
import { encryptWebhookPayload, decryptWebhookPayload } from '@/lib/whop/dataTransformers';
import { whopConfig } from '@/lib/whop/sdkConfig';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';

// Mock all dependencies
jest.mock('@/lib/whop/sdkConfig');
jest.mock('@/lib/logger');
jest.mock('@/lib/metrics');
jest.mock('@/lib/encryption', () => ({
  encrypt: jest.fn((data) => `encrypted_${data}`),
  decrypt: jest.fn((data) => data.replace('encrypted_', ''))
}));

const mockWhopConfig = whopConfig as jest.Mocked<typeof whopConfig>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockMetrics = metrics as jest.Mocked<typeof metrics>;

describe('Whop SDK Integration Tests', () => {
  let authService: WhopAuthService;
  let webhookValidator: WebhookValidator;
  let apiClient: any;
  let resilienceService: ResilienceService;

  const testConfig = {
    appId: 'integration_test_app',
    apiKey: 'test_api_key_16_chars',
    webhookSecret: 'test_webhook_secret_16_chars',
    environment: 'test' as const,
    debugMode: true,
    apiBaseUrl: 'https://api.test.whop.com/api/v5/app',
    requestTimeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    enableMetrics: true,
    enableLogging: true,
    enableRetry: true
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock config
    mockWhopConfig.get.mockReturnValue(testConfig);

    // Initialize services
    authService = new WhopAuthService(testConfig);
    webhookValidator = new WebhookValidator(testConfig);
    apiClient = createWhopApiClient(testConfig);
    resilienceService = new ResilienceService({
      retryPolicy: { maxRetries: 2, baseDelay: 100 },
      circuitBreaker: { failureThreshold: 3, recoveryTimeout: 1000 },
      enableMetrics: true,
      enableLogging: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Authentication Flow', () => {
    it('should handle full user authentication lifecycle', async () => {
      const userId = 'integration_user_123';
      const companyId = 'integration_company_456';
      const token = 'jwt_integration_token_789';
      const refreshToken = 'refresh_integration_token_101';

      // Mock token verification
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token,
        payload: { userId, companyId },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId,
        companyId
      });

      // Step 1: Verify token
      const verification = await authService.verifyToken(token);
      expect(verification.userId).toBe(userId);
      expect(verification.companyId).toBe(companyId);

      // Step 2: Create session
      const session = await authService.createSession(userId, companyId);
      expect(session.userId).toBe(userId);
      expect(session.companyId).toBe(companyId);
      expect(session.isActive).toBe(true);

      // Step 3: Authenticate request
      const request = {
        headers: {
          get: jest.fn().mockReturnValue(`Bearer ${token}`)
        }
      };

      const authResult = await authService.authenticate(request, { validateSession: true });
      expect(authResult.isAuthenticated).toBe(true);
      expect(authResult.userId).toBe(userId);
      expect(authResult.companyId).toBe(companyId);

      // Step 4: Refresh token
      jest.spyOn(authService, 'refreshToken').mockResolvedValue({
        token: refreshToken,
        payload: { userId, companyId },
        expiresAt: Date.now() + 7200000,
        issuedAt: Date.now(),
        userId,
        companyId
      });

      const refreshed = await authService.refreshToken(refreshToken);
      expect(refreshed.userId).toBe(userId);
      expect(refreshed.token).toBe(refreshToken);

      // Step 5: Revoke session
      await authService.revokeSession(session.sessionId);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Session revoked successfully',
        expect.objectContaining({ sessionId: session.sessionId })
      );
    });

    it('should handle authentication failure scenarios', async () => {
      const invalidToken = 'invalid.jwt.token';

      // Mock token verification failure
      jest.spyOn(authService, 'verifyToken').mockRejectedValue(
        new Error('Invalid token format')
      );

      const request = {
        headers: {
          get: jest.fn().mockReturnValue(`Bearer ${invalidToken}`)
        }
      };

      const authResult = await authService.authenticate(request);
      expect(authResult.isAuthenticated).toBe(false);
      expect(authResult.userId).toBeUndefined();
      expect(authResult.companyId).toBe(testConfig.appId);

      // Verify error was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Token verification failed',
        expect.any(Object)
      );
    });
  });

  describe('Complete Webhook Processing Flow', () => {
    const validWebhookPayload = {
      id: 'evt_integration_webhook_123',
      type: 'payment.succeeded',
      data: {
        id: 'pay_integration_456',
        amount: 2999,
        currency: 'USD',
        status: 'succeeded',
        user_id: 'user_integration_789',
        company_id: 'company_integration_101',
        metadata: {
          source: 'web',
          campaign: 'integration_test'
        }
      },
      created_at: '2023-12-01T12:00:00Z'
    };

    it('should process complete webhook lifecycle', async () => {
      const body = JSON.stringify(validWebhookPayload);
      const signature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(body)
        .digest('hex');
      const timestamp = Math.floor(Date.now() / 1000).toString();

      // Step 1: Validate webhook
      const validation = await webhookValidator.validateWebhook(body, signature, timestamp, validWebhookPayload);
      expect(validation.isValid).toBe(true);
      expect(validation.eventType).toBe('payment.succeeded');
      expect(validation.eventId).toBe('evt_integration_webhook_123');

      // Step 2: Transform webhook data
      const transformed = transformWebhookPayload(validWebhookPayload, 'database');
      expect(transformed.event_type).toBe('payment.succeeded');
      expect(transformed.type).toBeUndefined();
      expect(transformed.id).toBe('evt_integration_webhook_123');

      // Step 3: Validate transformed data
      const validationResult = validateWebhookPayload(validWebhookPayload);
      expect(validationResult.success).toBe(true);

      // Step 4: Encrypt sensitive data
      const encrypted = encryptWebhookPayload(transformed, ['data.metadata']);
      expect(encrypted.data.metadata).toMatch(/^encrypted_/);

      // Step 5: Decrypt data
      const decrypted = await decryptWebhookPayload(encrypted, ['data.metadata']);
      expect(decrypted.data.metadata).toEqual(transformed.data.metadata);

      // Step 6: Log webhook processing
      await whopObservability.logWebhookProcessing(
        whopObservability.createContext('webhook-processing', {
          userId: validWebhookPayload.data.user_id
        }),
        {
          eventType: validWebhookPayload.type,
          eventId: validWebhookPayload.id,
          userId: validWebhookPayload.data.user_id,
          data: validWebhookPayload.data
        },
        {
          duration: 150,
          success: true
        }
      );

      // Verify observability was recorded
      expect(mockLogger.webhook).toHaveBeenCalledWith(
        'Whop webhook processed: payment.succeeded',
        expect.objectContaining({
          whop_event_type: 'payment.succeeded',
          whop_duration_ms: 150,
          whop_success: true
        })
      );

      expect(mockMetrics.recordWebhookEvent).toHaveBeenCalledWith(
        'payment.succeeded',
        true,
        150
      );
    });

    it('should handle webhook processing failures', async () => {
      const invalidPayload = {
        id: 'evt_invalid_123',
        type: 'payment.succeeded',
        data: {
          amount: -1000, // Invalid negative amount
          currency: 'INVALID',
          status: 'wrong_status'
        }
      };

      const body = JSON.stringify(invalidPayload);
      const signature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(body)
        .digest('hex');

      // Webhook validation should pass signature but fail payload validation
      const validation = await webhookValidator.validateWebhook(body, signature, undefined, invalidPayload);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Must be positive');

      // Log validation failure
      await whopObservability.logWebhookProcessing(
        whopObservability.createContext('webhook-validation-failed'),
        {
          eventType: invalidPayload.type,
          eventId: invalidPayload.id,
          data: invalidPayload.data
        },
        {
          duration: 50,
          success: false,
          error: 'Validation failed'
        }
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Whop webhook processing failed: payment.succeeded',
        expect.objectContaining({
          whop_success: false,
          whop_error: 'Validation failed'
        })
      );
    });
  });

  describe('API Client with Resilience Integration', () => {
    it('should handle complete API workflow with resilience', async () => {
      const context = whopObservability.createContext('api-integration-test', {
        userId: 'user_api_123',
        companyId: 'company_api_456'
      });

      // Mock successful API call
      const mockApiResponse = {
        data: {
          id: 'membership_api_789',
          user_id: 'user_api_123',
          status: 'active',
          plan_id: 'plan_api_101'
        },
        status: 200
      };

      const mockApiCall = jest.fn().mockResolvedValue(mockApiResponse);

      // Execute with resilience
      const result = await resilienceService.execute(mockApiCall, context);

      expect(result).toEqual(mockApiResponse);
      expect(mockApiCall).toHaveBeenCalledTimes(1);

      // Verify telemetry was recorded
      expect(mockLogger.api).toHaveBeenCalled();
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_started',
        1,
        expect.any(Object)
      );
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop.api.request_error',
        0, // No errors
        expect.any(Object)
      );
    });

    it('should handle API failures with retry and circuit breaker', async () => {
      const context = whopObservability.createContext('api-failure-test');

      // Mock API call that fails twice then succeeds
      const mockApiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({ data: 'success', status: 200 });

      // Execute with resilience (should retry and succeed)
      const result = await resilienceService.execute(mockApiCall, context);

      expect(result).toEqual({ data: 'success', status: 200 });
      expect(mockApiCall).toHaveBeenCalledTimes(3); // 2 failures + 1 success

      // Verify retry telemetry
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Operation failed, retrying',
        expect.objectContaining({
          attempt: 1,
          error: 'Network timeout'
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operation succeeded after retry',
        expect.objectContaining({
          attempt: 3
        })
      );
    });

    it('should trigger circuit breaker after threshold failures', async () => {
      const context = whopObservability.createContext('circuit-breaker-test');

      // Mock API call that always fails
      const mockApiCall = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      // Execute multiple times to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await expect(resilienceService.execute(mockApiCall, context))
          .rejects.toThrow('Persistent failure');
      }

      // Circuit should now be open
      expect(resilienceService.getCircuitBreakerState()).toBe('open');

      // Next call should fail immediately (circuit open)
      await expect(resilienceService.execute(mockApiCall, context))
        .rejects.toThrow('Circuit breaker is OPEN');

      expect(mockApiCall).toHaveBeenCalledTimes(3); // Only 3 calls, not 4
    });
  });

  describe('End-to-End User Journey', () => {
    const userJourney = {
      userId: 'journey_user_123',
      companyId: 'journey_company_456',
      membershipId: 'journey_membership_789',
      paymentId: 'journey_payment_101'
    };

    it('should simulate complete user registration and payment flow', async () => {
      // Step 1: User authentication
      const authToken = 'jwt_journey_token_202';
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: authToken,
        payload: { userId: userJourney.userId, companyId: userJourney.companyId },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: userJourney.userId,
        companyId: userJourney.companyId
      });

      const authResult = await authService.authenticate({
        headers: { get: () => `Bearer ${authToken}` }
      });
      expect(authResult.isAuthenticated).toBe(true);
      expect(authResult.userId).toBe(userJourney.userId);

      // Step 2: Simulate payment webhook
      const paymentWebhook = {
        id: `evt_journey_${Date.now()}`,
        type: 'payment.succeeded',
        data: {
          id: userJourney.paymentId,
          amount: 4999,
          currency: 'USD',
          status: 'succeeded',
          user_id: userJourney.userId,
          company_id: userJourney.companyId,
          metadata: { journey: 'integration_test' }
        },
        created_at: new Date().toISOString()
      };

      const webhookBody = JSON.stringify(paymentWebhook);
      const webhookSignature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const webhookValidation = await webhookValidator.validateWebhook(
        webhookBody,
        webhookSignature,
        undefined,
        paymentWebhook
      );
      expect(webhookValidation.isValid).toBe(true);

      // Step 3: Transform and validate payment data
      const transformedPayment = transformWebhookPayload(paymentWebhook, 'database');
      const paymentValidation = validateWebhookPayload(paymentWebhook);
      expect(paymentValidation.success).toBe(true);

      // Step 4: Simulate membership creation webhook
      const membershipWebhook = {
        id: `evt_membership_journey_${Date.now()}`,
        type: 'membership.created',
        data: {
          id: userJourney.membershipId,
          user_id: userJourney.userId,
          company_id: userJourney.companyId,
          plan_id: 'plan_journey_premium',
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        created_at: new Date().toISOString()
      };

      const membershipBody = JSON.stringify(membershipWebhook);
      const membershipSignature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(membershipBody)
        .digest('hex');

      const membershipValidation = await webhookValidator.validateWebhook(
        membershipBody,
        membershipSignature,
        undefined,
        membershipWebhook
      );
      expect(membershipValidation.isValid).toBe(true);

      // Step 5: API call to verify membership (with resilience)
      const mockMembershipApiCall = jest.fn().mockResolvedValue({
        data: membershipWebhook.data,
        status: 200
      });

      const apiResult = await resilienceService.execute(mockMembershipApiCall,
        whopObservability.createContext('verify-membership', {
          userId: userJourney.userId,
          companyId: userJourney.companyId
        })
      );

      expect(apiResult.data.id).toBe(userJourney.membershipId);
      expect(apiResult.data.status).toBe('active');

      // Step 6: Log complete journey success
      await whopObservability.logAuthOperation(
        whopObservability.createContext('journey-complete', {
          userId: userJourney.userId,
          companyId: userJourney.companyId
        }),
        {
          operation: 'login',
          userId: userJourney.userId,
          companyId: userJourney.companyId,
          success: true,
          duration: 250
        }
      );

      // Verify comprehensive logging
      expect(mockLogger.api).toHaveBeenCalledTimes(2); // Auth + API call
      expect(mockLogger.webhook).toHaveBeenCalledTimes(2); // Payment + Membership webhooks
      expect(mockMetrics.recordCounter).toHaveBeenCalledWith(
        'whop_auth_operations_total',
        1,
        expect.any(Object)
      );
    });
  });

  describe('Error Scenarios and Recovery', () => {
    it('should handle cascading failures gracefully', async () => {
      const context = whopObservability.createContext('error-scenario-test');

      // Step 1: Authentication fails
      jest.spyOn(authService, 'verifyToken').mockRejectedValue(new Error('Token expired'));

      const authResult = await authService.authenticate({
        headers: { get: () => 'Bearer expired_token' }
      });
      expect(authResult.isAuthenticated).toBe(false);

      // Step 2: Webhook validation fails due to invalid signature
      const invalidWebhook = { id: 'evt_invalid', type: 'test.event' };
      const webhookValidation = await webhookValidator.validateWebhook(
        JSON.stringify(invalidWebhook),
        'invalid_signature',
        undefined,
        invalidWebhook
      );
      expect(webhookValidation.isValid).toBe(false);

      // Step 3: API call fails with retry exhaustion
      const failingApiCall = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const resilienceConfig = new ResilienceService({
        retryPolicy: { maxRetries: 2, baseDelay: 50 },
        enableMetrics: true,
        enableLogging: true
      });

      await expect(resilienceConfig.execute(failingApiCall, context))
        .rejects.toThrow('Service unavailable');

      expect(failingApiCall).toHaveBeenCalledTimes(3); // 1 initial + 2 retries

      // Step 4: Verify all errors were logged appropriately
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Token verification failed',
        expect.any(Object)
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook validation completed',
        expect.objectContaining({ isValid: false })
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Operation failed, retrying',
        expect.any(Object)
      );
    });

    it('should recover from partial failures', async () => {
      const context = whopObservability.createContext('recovery-test');

      // Step 1: Authentication succeeds
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: 'valid_token',
        payload: { userId: 'recovery_user', companyId: 'recovery_company' },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: 'recovery_user',
        companyId: 'recovery_company'
      });

      const authResult = await authService.authenticate({
        headers: { get: () => 'Bearer valid_token' }
      });
      expect(authResult.isAuthenticated).toBe(true);

      // Step 2: API call fails initially but recovers
      const recoveryApiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ data: 'recovered', status: 200 });

      const result = await resilienceService.execute(recoveryApiCall, context);
      expect(result).toEqual({ data: 'recovered', status: 200 });
      expect(recoveryApiCall).toHaveBeenCalledTimes(2);

      // Step 3: Webhook processing succeeds
      const validWebhook = {
        id: 'evt_recovery_123',
        type: 'payment.succeeded',
        data: { amount: 1000, user_id: 'recovery_user' }
      };

      const webhookBody = JSON.stringify(validWebhook);
      const webhookSignature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(webhookBody)
        .digest('hex');

      const webhookValidation = await webhookValidator.validateWebhook(
        webhookBody,
        webhookSignature,
        undefined,
        validWebhook
      );
      expect(webhookValidation.isValid).toBe(true);

      // Verify successful recovery logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operation succeeded after retry',
        expect.any(Object)
      );
    });
  });

  describe('Performance and Load Testing Scenarios', () => {
    it('should handle concurrent webhook processing', async () => {
      const webhookPromises = [];

      for (let i = 0; i < 5; i++) {
        const webhook = {
          id: `evt_concurrent_${i}`,
          type: 'payment.succeeded',
          data: {
            id: `pay_concurrent_${i}`,
            amount: 1000 + i * 100,
            currency: 'USD',
            status: 'succeeded',
            user_id: `user_concurrent_${i}`
          }
        };

        const body = JSON.stringify(webhook);
        const signature = 'sha256=' + require('crypto')
          .createHmac('sha256', testConfig.webhookSecret)
          .update(body)
          .digest('hex');

        webhookPromises.push(
          webhookValidator.validateWebhook(body, signature, undefined, webhook)
        );
      }

      const results = await Promise.all(webhookPromises);

      results.forEach((result, index) => {
        expect(result.isValid).toBe(true);
        expect(result.eventId).toBe(`evt_concurrent_${index}`);
      });

      expect(mockLogger.info).toHaveBeenCalledTimes(5);
    });

    it('should handle high-frequency authentication requests', async () => {
      const authPromises = [];

      for (let i = 0; i < 10; i++) {
        const token = `jwt_auth_load_${i}`;
        jest.spyOn(authService, 'verifyToken').mockResolvedValueOnce({
          token,
          payload: { userId: `user_load_${i}`, companyId: 'load_test_company' },
          expiresAt: Date.now() + 3600000,
          issuedAt: Date.now(),
          userId: `user_load_${i}`,
          companyId: 'load_test_company'
        });

        authPromises.push(
          authService.authenticate({
            headers: { get: () => `Bearer ${token}` }
          })
        );
      }

      const results = await Promise.all(authPromises);

      results.forEach((result, index) => {
        expect(result.isAuthenticated).toBe(true);
        expect(result.userId).toBe(`user_load_${index}`);
      });
    });

    it('should maintain observability under load', async () => {
      const observabilityPromises = [];

      for (let i = 0; i < 3; i++) {
        observabilityPromises.push(
          whopObservability.logApiCall(
            whopObservability.createContext(`load_test_${i}`),
            { endpoint: `/api/test/${i}`, method: 'GET' },
            { statusCode: 200, duration: 100 + i * 20, success: true }
          )
        );
      }

      await Promise.all(observabilityPromises);

      expect(mockLogger.api).toHaveBeenCalledTimes(3);
      expect(mockMetrics.recordExternalApiCall).toHaveBeenCalledTimes(3);
      expect(mockMetrics.recordCounter).toHaveBeenCalledTimes(6); // 3 API calls + 3 request counters
    });
  });

  describe('Security Integration Tests', () => {
    it('should handle comprehensive security validation', async () => {
      const context = whopObservability.createContext('security-test');

      // Test secure token handling
      const secureToken = 'secure_jwt_token_123';
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: secureToken,
        payload: { userId: 'security_user', permissions: ['read', 'write'] },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: 'security_user'
      });

      // Test secure webhook processing
      const secureWebhook = {
        id: 'evt_security_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_security_456',
          amount: 9999,
          currency: 'USD',
          status: 'succeeded',
          user_id: 'security_user',
          metadata: {
            sensitive_info: 'should_be_encrypted',
            api_key: 'sk_live_123456789'
          }
        }
      };

      const webhookBody = JSON.stringify(secureWebhook);
      const webhookSignature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(webhookBody)
        .digest('hex');

      // Validate webhook
      const validation = await webhookValidator.validateWebhook(
        webhookBody,
        webhookSignature,
        undefined,
        secureWebhook
      );
      expect(validation.isValid).toBe(true);

      // Test data transformation with encryption
      const transformed = transformWebhookPayload(secureWebhook, 'database');
      const encrypted = encryptWebhookPayload(transformed, ['data.metadata']);
      expect(encrypted.data.metadata).toMatch(/^encrypted_/);

      // Test authentication with encrypted data handling
      const authResult = await authService.authenticate({
        headers: { get: () => `Bearer ${secureToken}` }
      });
      expect(authResult.isAuthenticated).toBe(true);

      // Log security event
      whopObservability.logSecurityEvent(
        context,
        'secure_data_processing',
        {
          user_id: 'security_user',
          operation: 'webhook_processing',
          data_encrypted: true
        },
        'low'
      );

      expect(mockLogger.security).toHaveBeenCalledWith(
        'Whop security event: secure_data_processing',
        expect.objectContaining({
          security_event: 'secure_data_processing',
          security_severity: 'low'
        })
      );
    });

    it('should detect and handle security threats', async () => {
      const context = whopObservability.createContext('threat-detection');

      // Test malformed webhook attack
      const maliciousWebhook = {
        id: '../../etc/passwd', // Path traversal attempt
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
          user_id: 'malicious_user',
          metadata: {
            script: '<script>alert("xss")</script>', // XSS attempt
            sql: 'DROP TABLE users;', // SQL injection attempt
            api_key: 'sk_live_exposed_key_123'
          }
        }
      };

      const maliciousBody = JSON.stringify(maliciousWebhook);
      const maliciousSignature = 'sha256=' + require('crypto')
        .createHmac('sha256', testConfig.webhookSecret)
        .update(maliciousBody)
        .digest('hex');

      // Webhook should still validate (signature is valid)
      const validation = await webhookValidator.validateWebhook(
        maliciousBody,
        maliciousSignature,
        undefined,
        maliciousWebhook
      );
      expect(validation.isValid).toBe(true); // Signature valid, but data needs sanitization

      // Test data sanitization removes threats
      const sanitized = transformWebhookPayload(maliciousWebhook, 'log');
      expect(sanitized.id).toBe('evt_123'); // Would be sanitized in real implementation
      expect(sanitized.data.metadata.api_key).toBe('[REDACTED]'); // Should be redacted

      // Log security threat
      whopObservability.logSecurityEvent(
        context,
        'potential_security_threat_detected',
        {
          event_id: maliciousWebhook.id,
          threat_types: ['path_traversal', 'xss', 'sql_injection'],
          severity: 'high'
        },
        'high'
      );

      expect(mockLogger.security).toHaveBeenCalledWith(
        'Whop security event: potential_security_threat_detected',
        expect.objectContaining({
          security_severity: 'high',
          threat_types: ['path_traversal', 'xss', 'sql_injection']
        })
      );
    });
  });
});