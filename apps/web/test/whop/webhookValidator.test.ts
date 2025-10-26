// Whop Webhook Validator Tests
// Comprehensive tests for webhook signature validation, event type enforcement, and security features

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  WebhookValidator,
  validateWebhookSignature,
  validateTimestamp,
  validateEventType,
  validateWebhookPayload,
  parseSignatureHeader,
  timingSafeEqualHex,
  WHOP_WEBHOOK_EVENTS,
  type WebhookValidationResult,
  type SignatureValidationResult,
  type EventTypeValidationResult,
  type WebhookPayload
} from '@/lib/whop/webhookValidator';
import { whopConfig } from '@/lib/whop/sdkConfig';
import { logger } from '@/lib/logger';

// Mock dependencies
jest.mock('@/lib/whop/sdkConfig');
jest.mock('@/lib/logger');

const mockWhopConfig = whopConfig as jest.Mocked<typeof whopConfig>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Webhook Signature Validation', () => {
  const testSecret = 'test_webhook_secret_12345';
  const testBody = JSON.stringify({ test: 'data' });
  const testSignature = 'sha256=5d41402abc4b2a76b9719d911017c592'; // SHA256 of 'hello'

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseSignatureHeader', () => {
    it('should parse sha256= format', () => {
      const signature = 'sha256=abcdef123456';
      const result = parseSignatureHeader(signature);
      
      expect(result).toBe('abcdef123456');
    });

    it('should parse v1, format', () => {
      const signature = 'v1,abcdef123456';
      const result = parseSignatureHeader(signature);
      
      expect(result).toBe('abcdef123456');
    });

    it('should parse bare hex format', () => {
      const signature = 'abcdef123456';
      const result = parseSignatureHeader(signature);
      
      expect(result).toBe('abcdef123456');
    });

    it('should reject invalid sha256 format', () => {
      const signature = 'sha256=invalid_hex!';
      const result = parseSignatureHeader(signature);
      
      expect(result).toBeNull();
    });

    it('should reject invalid v1 format', () => {
      const signature = 'v2,abcdef123456';
      const result = parseSignatureHeader(signature);
      
      expect(result).toBeNull();
    });

    it('should reject malformed format', () => {
      const signature = 'invalid_format';
      const result = parseSignatureHeader(signature);
      
      expect(result).toBeNull();
    });

    it('should handle empty string', () => {
      const result = parseSignatureHeader('');
      
      expect(result).toBeNull();
    });

    it('should handle null/undefined', () => {
      expect(parseSignatureHeader(null as any)).toBeNull();
      expect(parseSignatureHeader(undefined as any)).toBeNull();
    });
  });

  describe('timingSafeEqualHex', () => {
    it('should compare equal hex strings', () => {
      const hex1 = 'abcdef1234567890';
      const hex2 = 'abcdef1234567890';
      
      expect(timingSafeEqualHex(hex1, hex2)).toBe(true);
    });

    it('should reject different hex strings', () => {
      const hex1 = 'abcdef1234567890';
      const hex2 = '1234567890abcdef';
      
      expect(timingSafeEqualHex(hex1, hex2)).toBe(false);
    });

    it('should handle 0x prefix', () => {
      const hex1 = '0xabcdef1234567890';
      const hex2 = 'abcdef1234567890';
      
      expect(timingSafeEqualHex(hex1, hex2)).toBe(true);
    });

    it('should handle case differences', () => {
      const hex1 = 'ABCDEF1234567890';
      const hex2 = 'abcdef1234567890';
      
      expect(timingSafeEqualHex(hex1, hex2)).toBe(true);
    });

    it('should reject invalid hex strings', () => {
      const hex1 = 'abcdef123456789g'; // Invalid hex character
      const hex2 = 'abcdef1234567890';
      
      expect(timingSafeEqualHex(hex1, hex2)).toBe(false);
    });

    it('should reject different length strings', () => {
      const hex1 = 'abcdef123456';
      const hex2 = 'abcdef1234567890';
      
      expect(timingSafeEqualHex(hex1, hex2)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(timingSafeEqualHex('', '')).toBe(false); // Empty strings are invalid
    });

    it('should handle exceptions gracefully', () => {
      expect(timingSafeEqualHex(null as any, 'abcdef')).toBe(false);
      expect(timingSafeEqualHex('abcdef', undefined as any)).toBe(false);
    });
  });

  describe('validateWebhookSignature', () => {
    it('should validate correct signature', () => {
      const body = 'test payload';
      const signature = 'sha256=' + require('crypto')
        .createHmac('sha256', testSecret)
        .update(body)
        .digest('hex');
      
      const result = validateWebhookSignature(body, signature, testSecret);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.computedSignature).toBeDefined();
      expect(result.providedSignature).toBeDefined();
    });

    it('should reject incorrect signature', () => {
      const body = 'test payload';
      const signature = 'sha256=incorrect_signature';
      
      const result = validateWebhookSignature(body, signature, testSecret);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Signature verification failed');
    });

    it('should handle unsupported signature format', () => {
      const body = 'test payload';
      const signature = 'unsupported_format';
      
      const result = validateWebhookSignature(body, signature, testSecret);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unsupported signature format');
    });

    it('should handle empty body', () => {
      const body = '';
      const signature = 'sha256=' + require('crypto')
        .createHmac('sha256', testSecret)
        .update(body)
        .digest('hex');
      
      const result = validateWebhookSignature(body, signature, testSecret);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle Unicode content', () => {
      const body = '测试内容 🚀';
      const signature = 'sha256=' + require('crypto')
        .createHmac('sha256', testSecret)
        .update(body)
        .digest('hex');
      
      const result = validateWebhookSignature(body, signature, testSecret);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle large payloads', () => {
      const body = 'x'.repeat(10000); // 10KB payload
      const signature = 'sha256=' + require('crypto')
        .createHmac('sha256', testSecret)
        .update(body)
        .digest('hex');
      
      const result = validateWebhookSignature(body, signature, testSecret);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateTimestamp', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should accept valid timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      const timestamp = now.toString();
      
      const result = validateTimestamp(timestamp);
      
      expect(result.valid).toBe(true);
      expect(result.timestamp).toBe(now);
    });

    it('should accept timestamp within tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const timestamp = (now - 200).toString(); // 200 seconds ago
      
      const result = validateTimestamp(timestamp, 300); // 5 minute tolerance
      
      expect(result.valid).toBe(true);
      expect(result.timestamp).toBe(now - 200);
    });

    it('should reject timestamp outside tolerance', () => {
      const now = Math.floor(Date.now() / 1000);
      const timestamp = (now - 400).toString(); // 400 seconds ago
      
      const result = validateTimestamp(timestamp, 300); // 5 minute tolerance
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('outside allowed window');
    });

    it('should require timestamp in production', () => {
      process.env.NODE_ENV = 'production';
      
      const result = validateTimestamp(null);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing X-Whop-Timestamp header');
    });

    it('should allow missing timestamp in development', () => {
      process.env.NODE_ENV = 'development';
      
      const result = validateTimestamp(null);
      
      expect(result.valid).toBe(true);
    });

    it('should reject invalid timestamp format', () => {
      const result = validateTimestamp('not_a_number');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('malformed timestamp');
    });

    it('should reject negative timestamp', () => {
      const result = validateTimestamp('-12345');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('malformed timestamp');
    });

    it('should reject NaN timestamp', () => {
      const result = validateTimestamp('NaN');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('malformed timestamp');
    });
  });

  describe('validateEventType', () => {
    it('should accept known event types', () => {
      const knownEvents = Object.keys(WHOP_WEBHOOK_EVENTS);
      
      knownEvents.forEach(eventType => {
        const result = validateEventType(eventType);
        
        expect(result.isValid).toBe(true);
        expect(result.eventType).toBe(eventType);
        expect(result.isKnownEvent).toBe(true);
        expect(result.schemaCompliant).toBe(true);
      });
    });

    it('should accept unknown but schema-compliant event types', () => {
      const eventType = 'custom.action';
      
      const result = validateEventType(eventType);
      
      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe(eventType);
      expect(result.isKnownEvent).toBe(false);
      expect(result.schemaCompliant).toBe(true);
      expect(result.warnings).toContain(`Unknown event type: ${eventType}`);
    });

    it('should reject non-schema-compliant event types', () => {
      const eventType = 'invalid_format';
      
      const result = validateEventType(eventType);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Event type does not match expected schema');
      expect(result.isKnownEvent).toBe(false);
      expect(result.schemaCompliant).toBe(false);
    });

    it('should reject empty event type', () => {
      const result = validateEventType('');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Event type is required and must be a string');
    });

    it('should reject null event type', () => {
      const result = validateEventType(null as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Event type is required and must be a string');
    });

    it('should reject non-string event type', () => {
      const result = validateEventType(123 as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Event type is required and must be a string');
    });
  });

  describe('validateWebhookPayload', () => {
    it('should validate complete webhook payload', () => {
      const payload: WebhookPayload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: 1000,
          currency: 'USD',
          user_id: 'user_789'
        },
        created_at: '2023-01-01T00:00:00Z'
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.eventId).toBe('evt_123');
      expect(result.eventType).toBe('payment.succeeded');
    });

    it('should validate payload with whop_event_id', () => {
      const payload: WebhookPayload = {
        whop_event_id: 'evt_123',
        type: 'membership.created',
        data: {
          id: 'mem_456',
          user_id: 'user_789'
        }
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(true);
      expect(result.eventId).toBe('evt_123');
      expect(result.eventType).toBe('membership.created');
    });

    it('should reject payload missing event ID', () => {
      const payload: WebhookPayload = {
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Webhook payload missing event ID');
    });

    it('should reject payload missing event type', () => {
      const payload: WebhookPayload = {
        id: 'evt_123',
        data: { amount: 1000 }
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Webhook payload missing event type');
    });

    it('should handle invalid created_at format', () => {
      const payload: WebhookPayload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { amount: 1000 },
        created_at: 'invalid_date'
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid created_at timestamp');
    });

    it('should warn about missing data field', () => {
      const payload: WebhookPayload = {
        id: 'evt_123',
        type: 'payment.succeeded'
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Webhook payload data field is missing or invalid');
    });

    it('should warn about invalid data field type', () => {
      const payload: WebhookPayload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: 'not_an_object'
      };
      
      const result = validateWebhookPayload(payload);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Webhook payload data field is missing or invalid');
    });
  });
});

describe('WebhookValidator Class', () => {
  let validator: WebhookValidator;
  const testConfig = {
    appId: 'test-app',
    webhookSecret: 'test_secret_12345',
    environment: 'test' as const,
    debugMode: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhopConfig.get.mockReturnValue(testConfig);
    validator = new WebhookValidator(testConfig);
  });

  describe('constructor', () => {
    it('should use provided config', () => {
      const customValidator = new WebhookValidator(testConfig);
      
      expect(customValidator).toBeInstanceOf(WebhookValidator);
    });

    it('should use default config when none provided', () => {
      const defaultValidator = new WebhookValidator();
      
      expect(defaultValidator).toBeInstanceOf(WebhookValidator);
      expect(mockWhopConfig.get).toHaveBeenCalled();
    });
  });

  describe('validateWebhook', () => {
    const validBody = JSON.stringify({
      id: 'evt_123',
      type: 'payment.succeeded',
      data: { amount: 1000 }
    });
    const validSignature = 'sha256=' + require('crypto')
      .createHmac('sha256', testConfig.webhookSecret)
      .update(validBody)
      .digest('hex');
    const validTimestamp = Math.floor(Date.now() / 1000).toString();

    it('should validate complete webhook successfully', async () => {
      const payload = JSON.parse(validBody);
      
      const result = await validator.validateWebhook(
        validBody,
        validSignature,
        validTimestamp,
        payload
      );
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.eventId).toBe('evt_123');
      expect(result.eventType).toBe('payment.succeeded');
      expect(result.timestamp).toBe(parseInt(validTimestamp));
    });

    it('should handle missing webhook secret', async () => {
      const configWithoutSecret = { ...testConfig, webhookSecret: undefined };
      const validatorWithoutSecret = new WebhookValidator(configWithoutSecret);
      
      const result = await validatorWithoutSecret.validateWebhook(
        validBody,
        validSignature
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Webhook secret not configured');
    });

    it('should handle invalid timestamp', async () => {
      const invalidTimestamp = (Date.now() / 1000 - 1000).toString(); // 1000 seconds ago
      
      const result = await validator.validateWebhook(
        validBody,
        validSignature,
        invalidTimestamp
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('outside allowed window');
    });

    it('should handle invalid signature', async () => {
      const invalidSignature = 'sha256=invalid_signature';
      
      const result = await validator.validateWebhook(
        validBody,
        invalidSignature,
        validTimestamp
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Signature verification failed');
    });

    it('should log validation results', async () => {
      const payload = JSON.parse(validBody);
      
      await validator.validateWebhook(
        validBody,
        validSignature,
        validTimestamp,
        payload
      );
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook validation completed',
        expect.objectContaining({
          isValid: true,
          eventType: 'payment.succeeded',
          eventId: 'evt_123'
        })
      );
    });

    it('should log validation failures', async () => {
      await validator.validateWebhook(
        validBody,
        'invalid_signature',
        validTimestamp
      );
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook validation completed',
        expect.objectContaining({
          isValid: false,
          errorCount: expect.any(Number)
        })
      );
    });

    it('should handle validation exceptions', async () => {
      // Mock JSON.parse to throw an error
      const invalidBody = '{ invalid json }';
      
      const result = await validator.validateWebhook(
        invalidBody,
        validSignature,
        validTimestamp
      );
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Webhook validation failed:');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Webhook validation exception',
        expect.any(Object)
      );
    });

    it('should include metadata in result', async () => {
      const payload = JSON.parse(validBody);
      
      const result = await validator.validateWebhook(
        validBody,
        validSignature,
        validTimestamp,
        payload
      );
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.eventType).toBe('payment.succeeded');
      expect(result.metadata?.eventId).toBe('evt_123');
      expect(result.metadata?.isKnownEvent).toBe(true);
    });
  });

  describe('validateSignature', () => {
    it('should validate signature using config secret', () => {
      const result = validator.validateSignature(validBody, validSignature);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle missing secret in config', () => {
      const configWithoutSecret = { ...testConfig, webhookSecret: undefined };
      const validatorWithoutSecret = new WebhookValidator(configWithoutSecret);
      
      const result = validatorWithoutSecret.validateSignature(validBody, validSignature);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Webhook secret not configured');
    });
  });

  describe('validateEventTypeOnly', () => {
    it('should validate event type', () => {
      const result = validator.validateEventTypeOnly('payment.succeeded');
      
      expect(result.isValid).toBe(true);
      expect(result.eventType).toBe('payment.succeeded');
      expect(result.isKnownEvent).toBe(true);
    });

    it('should handle unknown event type', () => {
      const result = validator.validateEventTypeOnly('custom.action');
      
      expect(result.isValid).toBe(true);
      expect(result.isKnownEvent).toBe(false);
      expect(result.warnings).toContain('Unknown event type: custom.action');
    });
  });

  describe('getSupportedEvents', () => {
    it('should return all supported events', () => {
      const events = validator.getSupportedEvents();
      
      expect(events).toEqual(WHOP_WEBHOOK_EVENTS);
      expect(typeof events['payment.succeeded']).toBe('string');
    });
  });

  describe('isEventSupported', () => {
    it('should return true for supported events', () => {
      expect(validator.isEventSupported('payment.succeeded')).toBe(true);
      expect(validator.isEventSupported('membership.created')).toBe(true);
    });

    it('should return false for unsupported events', () => {
      expect(validator.isEventSupported('custom.action')).toBe(false);
      expect(validator.isEventSupported('invalid_format')).toBe(false);
    });
  });
});

describe('Integration Tests', () => {
  let validator: WebhookValidator;
  const testConfig = {
    appId: 'test-app',
    webhookSecret: 'integration_test_secret_12345',
    environment: 'test' as const,
    debugMode: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhopConfig.get.mockReturnValue(testConfig);
    validator = new WebhookValidator(testConfig);
  });

  it('should handle complete webhook processing flow', async () => {
    const webhookPayload = {
      id: 'evt_integration_123',
      type: 'membership.created',
      data: {
        id: 'mem_integration_456',
        user_id: 'user_integration_789',
        plan_id: 'plan_integration_101',
        status: 'active'
      },
      created_at: '2023-12-01T10:30:00Z'
    };

    const body = JSON.stringify(webhookPayload);
    const signature = 'sha256=' + require('crypto')
      .createHmac('sha256', testConfig.webhookSecret)
      .update(body)
      .digest('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const result = await validator.validateWebhook(body, signature, timestamp, webhookPayload);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.eventId).toBe('evt_integration_123');
    expect(result.eventType).toBe('membership.created');
    expect(result.metadata?.isKnownEvent).toBe(true);
    expect(result.metadata?.schemaCompliant).toBe(true);

    // Verify logging was called appropriately
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Webhook validation completed',
      expect.objectContaining({
        isValid: true,
        eventType: 'membership.created',
        eventId: 'evt_integration_123'
      })
    );
  });

  it('should handle webhook with unknown event type', async () => {
    const webhookPayload = {
      id: 'evt_unknown_123',
      type: 'custom.new_event',
      data: {
        custom_field: 'custom_value'
      }
    };

    const body = JSON.stringify(webhookPayload);
    const signature = 'sha256=' + require('crypto')
      .createHmac('sha256', testConfig.webhookSecret)
      .update(body)
      .digest('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const result = await validator.validateWebhook(body, signature, timestamp, webhookPayload);

    expect(result.isValid).toBe(true); // Valid format, just unknown event type
    expect(result.warnings).toContain('Unknown event type: custom.new_event');
    expect(result.metadata?.isKnownEvent).toBe(false);
    expect(result.metadata?.schemaCompliant).toBe(true);
  });

  it('should handle malformed webhook with multiple validation errors', async () => {
    const malformedPayload = {
      // Missing id
      type: 'invalid_format', // Invalid event type format
      // Missing data field
      created_at: 'invalid_date' // Invalid date format
    };

    const body = JSON.stringify(malformedPayload);
    const signature = 'sha256=' + require('crypto')
      .createHmac('sha256', testConfig.webhookSecret)
      .update(body)
      .digest('hex');

    const result = await validator.validateWebhook(body, signature, undefined, malformedPayload);

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.errors.some(err => err.includes('missing event ID'))).toBe(true);
    expect(result.errors.some(err => err.includes('expected schema'))).toBe(true);
    expect(result.errors.some(err => err.includes('Invalid created_at'))).toBe(true);
  });
});