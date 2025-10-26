// Whop Observability Service Tests
// Comprehensive tests for logging, metrics collection, and distributed tracing

import { describe, it, expect, jest } from '../test-framework';
import { 
  whopObservability,
  type WhopObservabilityContext,
  type WhopApiCallOptions,
  type WhopWebhookEvent,
  type WhopAuthOperation
} from '../../src/lib/whop/observability';

// Mock dependencies
const mockLogger = {
  api: jest.fn(),
  webhook: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  security: jest.fn(),
  setRequestId: jest.fn()
};

const mockMetrics = {
  recordExternalApiCall: jest.fn(),
  recordCounter: jest.fn(),
  recordHistogram: jest.fn(),
  recordWebhookEvent: jest.fn(),
  getMetric: jest.fn()
};

const mockGetTelemetry = jest.fn(() => ({
  withSpan: jest.fn().mockImplementation(async (spanName, operation) => {
    const mockSpan = {
      setAttributes: jest.fn(),
      setStatus: jest.fn(),
      recordException: jest.fn()
    };
    return await operation(mockSpan);
  }),
  recordExternalApiCall: jest.fn(),
  recordWebhookEvent: jest.fn()
}));

// Mock modules
jest.mock('../../src/lib/logger', () => mockLogger);
jest.mock('../../src/lib/metrics', () => mockMetrics);
jest.mock('../../src/lib/telemetry', () => mockGetTelemetry);

// Helper functions to extend the test framework
const objectContaining = (expected) => {
  return (actual) => {
    if (!actual || typeof actual !== 'object') {
      throw new Error(`Expected object, but got ${typeof actual}`);
    }
    
    for (const key in expected) {
      if (actual[key] !== expected[key]) {
        throw new Error(`Expected property ${key} to be ${expected[key]}, but got ${actual[key]}`);
      }
    }
    
    return true;
  };
};

const anything = () => {
  return () => true; // Always passes
};

const toHaveBeenCalled = () => {
  return (mockFn) => {
    if (!mockFn || !mockFn.mock) {
      throw new Error('Expected function to be a jest mock');
    }
    
    return mockFn.mock.calls.length > 0;
  };
};

const toHaveBeenCalledWith = (expectedArgs) => {
  return (mockFn) => {
    if (!mockFn || !mockFn.mock) {
      throw new Error('Expected function to be a jest mock');
    }
    
    const calls = mockFn.mock.calls;
    if (calls.length === 0) {
      return false;
    }
    
    // Check if any call matches the expected arguments
    return calls.some(call => {
      if (call.length !== expectedArgs.length) {
        return false;
      }
      
      return call.every((arg, index) => {
        const expectedArg = expectedArgs[index];
        if (typeof expectedArg === 'object' && typeof arg === 'object') {
          return JSON.stringify(arg) === JSON.stringify(expectedArg);
        }
        
        return arg === expectedArg;
      });
    });
  };
};

const toMatch = (pattern) => {
  return (actual) => {
    if (typeof actual !== 'string') {
      throw new Error(`Expected string, but got ${typeof actual}`);
    }
    
    return new RegExp(pattern).test(actual);
  };
};

const toBeDefined = () => {
  return (actual) => {
    return actual !== undefined && actual !== null;
  };
};

describe('WhopObservabilityService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    
    // Reset all mock functions
    Object.keys(mockLogger).forEach(key => {
      (mockLogger as any)[key].mockClear();
    });
    Object.keys(mockMetrics).forEach(key => {
      (mockMetrics as any)[key].mockClear();
    });
    mockGetTelemetry.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createContext', () => {
    it('should create context with generated IDs', () => {
      const context = whopObservability.createContext('test-operation');

      expect(context.operation).toBe('test-operation');
      expect(context.requestId).toMatch(/^[0-9a-f-]{36}$/); // UUID v4 format
      expect(context.correlationId).toMatch(/^[0-9a-f-]{36}$/); // UUID v4 format
      expect(context.startTime).toBeDefined();
      expect(typeof context.startTime).toBe('number');
    });

    it('should merge existing context', () => {
      const existingContext = {
        requestId: 'existing-request-id',
        userId: 'user-123',
        companyId: 'company-456'
      };

      const context = whopObservability.createContext('new-operation', existingContext);

      expect(context.operation).toBe('new-operation');
      expect(context.requestId).toBe('existing-request-id');
      expect(context.userId).toBe('user-123');
      expect(context.companyId).toBe('company-456');
      expect(context.correlationId).toMatch(/^[0-9a-f-]{36}$/); // Generated
    });

    it('should preserve existing timestamps', () => {
      const existingStartTime = Date.now() - 1000;
      const existingContext = {
        startTime: existingStartTime
      };

      const context = whopObservability.createContext('test-operation', existingContext);

      expect(context.startTime).toBe(existingStartTime);
    });

    it('should merge Whop-specific fields', () => {
      const existingContext = {
        whopEventId: 'evt-123',
        whopUserId: 'whop-user-456',
        whopCompanyId: 'whop-company-789'
      };

      const context = whopObservability.createContext('test-operation', existingContext);

      expect(context.whopEventId).toBe('evt-123');
      expect(context.whopUserId).toBe('whop-user-456');
      expect(context.whopCompanyId).toBe('whop-company-789');
    });
  });

  describe('logApiCall', () => {
    let context: WhopObservabilityContext;
    let options: WhopApiCallOptions;

    beforeEach(() => {
      context = whopObservability.createContext('api-test');
      options = {
        endpoint: '/api/v1/test',
        method: 'POST',
        body: { test: 'data' },
        headers: { 'Content-Type': 'application/json' }
      };
    });

    it('should log successful API call', async () => {
      const response = {
        statusCode: 200,
        duration: 150,
        success: true
      };

      await whopObservability.logApiCall(context, options, response);

      expect(toHaveBeenCalledWith([
        'Whop API call completed: POST /api/v1/test',
        objectContaining({
          whop_operation: 'api-test',
          whop_endpoint: '/api/v1/test',
          whop_method: 'POST',
          whop_status_code: 200,
          whop_duration_ms: 150,
          whop_success: true,
          whop_request_id: context.requestId,
          whop_request_body: { test: 'data' },
          whop_request_headers: { 'Content-Type': 'application/json' }
        })
      ]))(mockLogger.api);

      // Verify metrics were recorded
      expect(toHaveBeenCalledWith(['whop', '/api/v1/test', 200, 150]))(mockMetrics.recordExternalApiCall);

      expect(toHaveBeenCalledWith([
        'whop_api_calls_total',
        1,
        {
          operation: 'api-test',
          endpoint: '/api/v1/test',
          method: 'POST',
          success: 'true',
          user_id: context.userId,
          company_id: context.companyId
        }
      ]))(mockMetrics.recordCounter);

      expect(toHaveBeenCalledWith([
        'whop_api_call_duration_ms',
        150,
        {
          operation: 'api-test',
          endpoint: '/api/v1/test',
          method: 'POST'
        }
      ]))(mockMetrics.recordHistogram);
    });

    it('should log failed API call', async () => {
      const response = {
        statusCode: 400,
        duration: 100,
        success: false,
        error: 'Bad Request'
      };

      await whopObservability.logApiCall(context, options, response);

      expect(toHaveBeenCalledWith([
        'Whop API call failed: POST /api/v1/test',
        objectContaining({
          whop_operation: 'api-test',
          whop_status_code: 400,
          whop_success: false,
          whop_error: 'Bad Request'
        })
      ]))(mockLogger.error);
    });

    it('should include additional metadata', async () => {
      const response = {
        statusCode: 200,
        duration: 150,
        success: true
      };

      const additionalMetadata = {
        additional_field: 'additional_value',
        another_field: 42
      };

      await whopObservability.logApiCall(context, options, response, additionalMetadata);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          additional_field: 'additional_value',
          another_field: 42
        })
      ]))(mockLogger.api);
    });

    it('should sanitize sensitive request body data', async () => {
      options.body = {
        apiKey: 'sk_test_123456',
        password: 'secret123',
        normalField: 'normal_value'
      };

      const response = {
        statusCode: 200,
        duration: 150,
        success: true
      };

      await whopObservability.logApiCall(context, options, response);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          whop_request_body: {
            apiKey: '[REDACTED]',
            password: '[REDACTED]',
            normalField: 'normal_value'
          }
        })
      ]))(mockLogger.api);
    });

    it('should sanitize large request body data', async () => {
      options.body = {
        largeField: 'x'.repeat(100) // Large string
      };

      const response = {
        statusCode: 200,
        duration: 150,
        success: true
      };

      await whopObservability.logApiCall(context, options, response);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          whop_request_body: {
            largeField: '[REDACTED - Large String]'
          }
        })
      ]))(mockLogger.api);
    });

    it('should handle telemetry integration', async () => {
      const response = {
        statusCode: 200,
        duration: 150,
        success: true
      };

      await whopObservability.logApiCall(context, options, response);

      expect(toHaveBeenCalledWith(['whop', '/api/v1/test', 200, 150]))(mockGetTelemetry().recordExternalApiCall);
    });

    it('should handle metrics recording errors gracefully', async () => {
      mockMetrics.recordExternalApiCall.mockImplementation(() => {
        throw new Error('Metrics recording failed');
      });

      const response = {
        statusCode: 200,
        duration: 150,
        success: true
      };

      await whopObservability.logApiCall(context, options, response);

      expect(toHaveBeenCalledWith([
        'Failed to record Whop API call metrics',
        objectContaining({
          error: 'Metrics recording failed'
        })
      ]))(mockLogger.warn);
    });
  });

  describe('logWebhookProcessing', () => {
    let context: WhopObservabilityContext;
    let event: WhopWebhookEvent;

    beforeEach(() => {
      context = whopObservability.createContext('webhook-test');
      event = {
        eventType: 'payment.succeeded',
        eventId: 'evt_123',
        userId: 'user_456',
        companyId: 'company_789',
        data: {
          amount: 1000,
          currency: 'USD',
          metadata: { source: 'web' }
        }
      };
    });

    it('should log successful webhook processing', async () => {
      const processing = {
        duration: 200,
        success: true
      };

      await whopObservability.logWebhookProcessing(context, event, processing);

      expect(toHaveBeenCalledWith([
        'Whop webhook processed: payment.succeeded',
        objectContaining({
          whop_operation: 'webhook-test',
          whop_event_type: 'payment.succeeded',
          whop_event_id: 'evt_123',
          whop_duration_ms: 200,
          whop_success: true,
          whop_event_user_id: 'user_456',
          whop_event_company_id: 'company_789'
        })
      ]))(mockLogger.webhook);

      // Verify metrics were recorded
      expect(toHaveBeenCalledWith(['payment.succeeded', true, 200]))(mockMetrics.recordWebhookEvent);

      expect(toHaveBeenCalledWith([
        'whop_webhook_events_total',
        1,
        {
          event_type: 'payment.succeeded',
          success: 'true',
          user_id: context.userId,
          company_id: context.companyId
        }
      ]))(mockMetrics.recordCounter);

      expect(toHaveBeenCalledWith([
        'whop_webhook_processing_duration_ms',
        200,
        {
          event_type: 'payment.succeeded',
          success: 'true'
        }
      ]))(mockMetrics.recordHistogram);
    });

    it('should log failed webhook processing', async () => {
      const processing = {
        duration: 100,
        success: false,
        error: 'Validation failed'
      };

      await whopObservability.logWebhookProcessing(context, event, processing);

      expect(toHaveBeenCalledWith([
        'Whop webhook processing failed: payment.succeeded',
        objectContaining({
          whop_operation: 'webhook-test',
          whop_success: false,
          whop_error: 'Validation failed'
        })
      ]))(mockLogger.error);
    });

    it('should include additional metadata', async () => {
      const processing = {
        duration: 200,
        success: true
      };

      const additionalMetadata = {
        processing_node: 'worker-1',
        queue_size: 10
      };

      await whopObservability.logWebhookProcessing(context, event, processing, additionalMetadata);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          processing_node: 'worker-1',
          queue_size: 10
        })
      ]))(mockLogger.webhook);
    });

    it('should sanitize sensitive webhook data', async () => {
      event.data = {
        amount: 1000,
        currency: 'USD',
        apiKey: 'sk_test_123456',
        user: {
          email: 'test@example.com',
          password: 'secret123'
        }
      };

      const processing = {
        duration: 200,
        success: true
      };

      await whopObservability.logWebhookProcessing(context, event, processing);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          whop_event_data: {
            amount: 1000,
            currency: 'USD',
            apiKey: '[REDACTED]',
            user: {
              email: '***********ple.com',
              password: '[REDACTED]'
            }
          }
        })
      ]))(mockLogger.webhook);
    });

    it('should handle telemetry integration', async () => {
      const processing = {
        duration: 200,
        success: true
      };

      await whopObservability.logWebhookProcessing(context, event, processing);

      expect(toHaveBeenCalledWith(['payment.succeeded', true, 200]))(mockGetTelemetry().recordWebhookEvent);
    });

    it('should handle metrics recording errors gracefully', async () => {
      mockMetrics.recordWebhookEvent.mockImplementation(() => {
        throw new Error('Metrics recording failed');
      });

      const processing = {
        duration: 200,
        success: true
      };

      await whopObservability.logWebhookProcessing(context, event, processing);

      expect(toHaveBeenCalledWith([
        'Failed to record Whop webhook metrics',
        objectContaining({
          error: 'Metrics recording failed'
        })
      ]))(mockLogger.warn);
    });
  });

  describe('logAuthOperation', () => {
    let context: WhopObservabilityContext;
    let auth: WhopAuthOperation;

    beforeEach(() => {
      context = whopObservability.createContext('auth-test');
      auth = {
        operation: 'login',
        userId: 'user-123',
        companyId: 'company-456',
        success: true,
        duration: 300
      };
    });

    it('should log successful auth operation', async () => {
      await whopObservability.logAuthOperation(context, auth);

      expect(toHaveBeenCalledWith([
        'Whop auth operation completed: login',
        objectContaining({
          whop_operation: 'auth-test',
          whop_auth_operation: 'login',
          whop_auth_success: true,
          whop_auth_duration_ms: 300,
          whop_user_id: 'user-123',
          whop_company_id: 'company-456'
        })
      ]))(mockLogger.api);

      // Verify metrics were recorded
      expect(toHaveBeenCalledWith([
        'whop_auth_operations_total',
        1,
        {
          operation: 'login',
          success: 'true',
          user_id: context.userId,
          company_id: context.companyId
        }
      ]))(mockMetrics.recordCounter);

      expect(toHaveBeenCalledWith([
        'whop_auth_operation_duration_ms',
        300,
        {
          operation: 'login',
          success: 'true'
        }
      ]))(mockMetrics.recordHistogram);
    });

    it('should log failed auth operation', async () => {
      auth.success = false;
      auth.duration = 100;

      await whopObservability.logAuthOperation(context, auth);

      expect(toHaveBeenCalledWith([
        'Whop auth operation failed: login',
        objectContaining({
          whop_auth_success: false,
          whop_auth_duration_ms: 100
        })
      ]))(mockLogger.error);
    });

    it('should include additional metadata', async () => {
      const additionalMetadata = {
        auth_method: 'oauth',
        client_version: '1.0.0'
      };

      await whopObservability.logAuthOperation(context, auth, additionalMetadata);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          auth_method: 'oauth',
          client_version: '1.0.0'
        })
      ]))(mockLogger.api);
    });

    it('should handle all auth operation types', async () => {
      const authOperations: WhopAuthOperation['operation'][] = [
        'login',
        'logout',
        'token_refresh',
        'token_validation'
      ];

      for (const operation of authOperations) {
        auth.operation = operation;
        auth.success = true;
        auth.duration = 150;

        await whopObservability.logAuthOperation(context, auth);

        expect(toHaveBeenCalledWith([
          expect.stringContaining(`Whop auth operation completed: ${operation}`),
          expect.any(Object)
        ]))(mockLogger.api);
      }
    });

    it('should handle telemetry integration', async () => {
      await whopObservability.logAuthOperation(context, auth);

      expect(toHaveBeenCalledWith(['whop_auth', 'login', 200, 300]))(mockGetTelemetry().recordExternalApiCall);
    });

    it('should handle metrics recording errors gracefully', async () => {
      mockMetrics.recordCounter.mockImplementation(() => {
        throw new Error('Metrics recording failed');
      });

      await whopObservability.logAuthOperation(context, auth);

      expect(toHaveBeenCalledWith([
        'Failed to record Whop auth metrics',
        objectContaining({
          error: 'Metrics recording failed'
        })
      ]))(mockLogger.warn);
    });
  });

  describe('withTracing', () => {
    let context: WhopObservabilityContext;

    beforeEach(() => {
      context = whopObservability.createContext('tracing-test');
    });

    it('should execute operation with tracing', async () => {
      const mockOperation = jest.fn().mockResolvedValue('operation-result');
      const mockSpan = {
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn()
      };

      mockGetTelemetry().withSpan.mockImplementation(async (spanName, operation) => {
        return await operation(mockSpan);
      });

      const result = await whopObservability.withTracing(
        context,
        'test-span',
        mockOperation,
        { custom_attribute: 'custom_value' }
      );

      expect(result).toBe('operation-result');
      expect(toHaveBeenCalledWith([
        'test-span',
        expect.any(Function),
        {
          custom_attribute: 'custom_value',
          'whop.operation': 'tracing-test',
          'whop.request_id': context.requestId,
          'whop.correlation_id': context.correlationId,
          'whop.user_id': context.userId,
          'whop.company_id': context.companyId,
          'whop.event_id': context.whopEventId
        },
        expect.any(Number) // SpanKind.INTERNAL
      ]))(mockGetTelemetry().withSpan);
    });

    it('should handle operation success', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      const mockSpan = {
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn()
      };

      mockGetTelemetry().withSpan.mockImplementation(async (spanName, operation) => {
        return await operation(mockSpan);
      });

      await whopObservability.withTracing(context, 'test-span', mockOperation);

      expect(toHaveBeenCalledWith({
        code: expect.any(Number) // SpanStatusCode.OK
      }))(mockSpan.setStatus);
      expect(toHaveBeenCalled())(mockSpan.recordException);
    });

    it('should handle operation failure', async () => {
      const error = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);
      const mockSpan = {
        setAttributes: jest.fn(),
        setStatus: jest.fn(),
        recordException: jest.fn()
      };

      mockGetTelemetry().withSpan.mockImplementation(async (spanName, operation) => {
        return await operation(mockSpan);
      });

      await expect(whopObservability.withTracing(context, 'test-span', mockOperation))
        .rejects.toThrow('Operation failed');

      expect(toHaveBeenCalledWith({
        code: expect.any(Number), // SpanStatusCode.ERROR
        message: 'Operation failed'
      }))(mockSpan.setStatus);
      expect(toHaveBeenCalledWith(error))(mockSpan.recordException);
    });

    it('should execute without tracing when telemetry unavailable', async () => {
      mockGetTelemetry.mockImplementation(() => {
        throw new Error('Telemetry not available');
      });

      const mockOperation = jest.fn().mockResolvedValue('no-tracing-result');

      const result = await whopObservability.withTracing(
        context,
        'test-span',
        mockOperation
      );

      expect(result).toBe('no-tracing-result');
      expect(toHaveBeenCalled())(mockOperation);
      expect(toHaveBeenCalled())(mockGetTelemetry().withSpan);
    });
  });

  describe('logSecurityEvent', () => {
    let context: WhopObservabilityContext;

    beforeEach(() => {
      context = whopObservability.createContext('security-test');
    });

    it('should log security event with medium severity', () => {
      const details = {
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        attempted_action: 'admin_access'
      };

      whopObservability.logSecurityEvent(context, 'unauthorized_access_attempt', details, 'medium');

      expect(toHaveBeenCalledWith([
        'Whop security event: unauthorized_access_attempt',
        objectContaining({
          whop_operation: 'security-test',
          whop_request_id: context.requestId,
          whop_correlation_id: context.correlationId,
          whop_user_id: context.userId,
          whop_company_id: context.companyId,
          security_event: 'unauthorized_access_attempt',
          security_severity: 'medium',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          attempted_action: 'admin_access'
        })
      ]))(mockLogger.security);
    });

    it('should default to medium severity', () => {
      const details = { test: 'data' };

      whopObservability.logSecurityEvent(context, 'test_event', details);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          security_severity: 'medium'
        })
      ]))(mockLogger.security);
    });

    it('should sanitize sensitive security details', () => {
      const details = {
        password: 'secret123',
        api_key: 'sk_test_123456',
        normal_field: 'normal_value'
      };

      whopObservability.logSecurityEvent(context, 'credential_exposure', details);

      expect(toHaveBeenCalledWith([
        expect.anything(),
        objectContaining({
          password: '[REDACTED]',
          api_key: '[REDACTED]',
          normal_field: 'normal_value'
        })
      ]))(mockLogger.security);
    });

    it('should handle all severity levels', () => {
      const details = { test: 'data' };
      const severities: Array<'low' | 'medium' | 'high' | 'critical'> = [
        'low',
        'medium',
        'high',
        'critical'
      ];

      severities.forEach(severity => {
        whopObservability.logSecurityEvent(
          context,
          'test_security_event',
          details,
          severity
        );

        expect(toHaveBeenCalledWith([
          expect.anything(),
          objectContaining({
            security_severity: severity
          })
        ]))(mockLogger.security);
      });
    });
  });

  describe('setCorrelationId', () => {
    it('should set correlation ID in logger', () => {
      const correlationId = 'test-correlation-id';

      whopObservability.setCorrelationId(correlationId);

      expect(toHaveBeenCalledWith(correlationId))(mockLogger.setRequestId);
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics snapshot', () => {
      const mockApiCalls = { total: 100, success: 95 };
      const mockWebhooks = { total: 50, success: 48 };
      const mockAuth = { total: 25, success: 24 };

      mockMetrics.getMetric.mockImplementation((metricName) => {
        switch (metricName) {
          case 'whop_api_calls_total':
            return mockApiCalls;
          case 'whop_webhook_events_total':
            return mockWebhooks;
          case 'whop_auth_operations_total':
            return mockAuth;
          default:
            return {};
        }
      });

      const metrics = whopObservability.getMetrics();

      expect(metrics).toEqual({
        apiCalls: mockApiCalls,
        webhooks: mockWebhooks,
        auth: mockAuth
      });

      expect(toHaveBeenCalledWith('whop_api_calls_total'))(mockMetrics.getMetric);
      expect(toHaveBeenCalledWith('whop_webhook_events_total'))(mockMetrics.getMetric);
      expect(toHaveBeenCalledWith('whop_auth_operations_total'))(mockMetrics.getMetric);
    });
  });
});

describe('Integration Tests', () => {
  let context: WhopObservabilityContext;

  beforeEach(() => {
    jest.clearAllMocks();
    context = whopObservability.createContext('integration-test');
    
    // Mock telemetry to be available
    mockGetTelemetry.mockReturnValue({
      withSpan: jest.fn().mockImplementation(async (spanName, operation) => {
        const mockSpan = {
          setAttributes: jest.fn(),
          setStatus: jest.fn(),
          recordException: jest.fn()
        };
        return await operation(mockSpan);
      }),
      recordExternalApiCall: jest.fn(),
      recordWebhookEvent: jest.fn()
    });
  });

  it('should handle complete observability workflow', async () => {
    // 1. Create API context
    const apiContext = whopObservability.createContext('api-operation', {
      userId: 'user-123',
      companyId: 'company-456'
    });

    // 2. Log API call
    const apiOptions = {
      endpoint: '/api/v1/payments',
      method: 'POST',
      body: { amount: 1000, currency: 'USD' }
    };

    const apiResponse = {
      statusCode: 200,
      duration: 150,
      success: true
    };

    await whopObservability.logApiCall(apiContext, apiOptions, apiResponse);

    // 3. Log webhook processing
    const webhookEvent = {
      eventType: 'payment.succeeded',
      eventId: 'evt_789',
      userId: 'user-123',
      data: { amount: 1000, currency: 'USD' }
    };

    const webhookProcessing = {
      duration: 200,
      success: true
    };

    await whopObservability.logWebhookProcessing(apiContext, webhookEvent, webhookProcessing);

    // 4. Log auth operation
    const authOperation = {
      operation: 'token_validation',
      userId: 'user-123',
      success: true,
      duration: 50
    };

    await whopObservability.logAuthOperation(apiContext, authOperation);

    // Verify all logging was called
    expect(toHaveBeenCalled())(mockLogger.api); // API + Auth
    expect(toHaveBeenCalled())(mockLogger.webhook); // Webhook

    // Verify metrics were recorded
    expect(toHaveBeenCalledWith(
      'whop_api_calls_total',
      1,
      expect.any(Object)
    ))(mockMetrics.recordCounter);
    expect(toHaveBeenCalledWith(
      'whop_webhook_events_total',
      1,
      expect.any(Object)
    ))(mockMetrics.recordCounter);
    expect(toHaveBeenCalledWith(
      'whop_auth_operations_total',
      1,
      expect.any(Object)
    ))(mockMetrics.recordCounter);
  });

  it('should handle error scenarios with tracing', async () => {
    const error = new Error('API request failed');
    const mockOperation = jest.fn().mockRejectedValue(error);

    // Execute with tracing
    await expect(whopObservability.withTracing(
      context,
      'error-operation',
      mockOperation
    )).rejects.toThrow('API request failed');

    // Verify tracing was used
    expect(toHaveBeenCalled())(mockGetTelemetry().withSpan);

    // Verify span recorded error
    const mockSpan = mockGetTelemetry().withSpan.mock.calls[0][1];
    const spanInstance = await mockSpan(mockGetTelemetry().withSpan.mock.calls[0][0]);
    expect(toHaveBeenCalledWith(error))(spanInstance.recordException);
  });

  it('should handle security event logging', () => {
    const securityDetails = {
      ip_address: '192.168.1.100',
      user_agent: 'BadBot/1.0',
      attempted_endpoint: '/admin/users',
      suspicious_payload: { api_key: 'stolen_key_123' }
    };

    whopObservability.logSecurityEvent(
      context,
      'suspicious_admin_access',
      securityDetails,
      'high'
    );

    expect(toHaveBeenCalledWith([
      'Whop security event: suspicious_admin_access',
      objectContaining({
        security_event: 'suspicious_admin_access',
        security_severity: 'high',
        ip_address: '192.168.1.100',
        user_agent: 'BadBot/1.0',
        attempted_endpoint: '/admin/users',
        suspicious_payload: {
          api_key: '[REDACTED]'
        }
      })
    ]))(mockLogger.security);
  });

  it('should handle telemetry unavailability gracefully', async () => {
    // Mock telemetry to be unavailable
    mockGetTelemetry.mockImplementation(() => {
      throw new Error('Telemetry service unavailable');
    });

    const mockOperation = jest.fn().mockResolvedValue('success');

    // Execute with tracing (should work without telemetry)
    const result = await whopObservability.withTracing(
      context,
      'no-telemetry-operation',
      mockOperation
    );

    expect(result).toBe('success');
    expect(toHaveBeenCalled())(mockOperation);

    // API logging should still work
    const apiOptions = { endpoint: '/test', method: 'GET' };
    const apiResponse = { statusCode: 200, duration: 100, success: true };

    await whopObservability.logApiCall(context, apiOptions, apiResponse);

    expect(toHaveBeenCalled())(mockLogger.api);
    expect(toHaveBeenCalled())(mockMetrics.recordExternalApiCall);
  });
});