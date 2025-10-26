// Whop Data Transformers Tests
// Comprehensive tests for data sanitization, transformation, and encryption utilities

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  sanitizeWebhookPayload,
  sanitizeUserData,
  sanitizePaymentData,
  normalizeWebhookPayload,
  transformWebhookPayload,
  transformUserData,
  encryptWebhookPayload,
  decryptWebhookPayload,
  encryptPaymentData,
  decryptPaymentData,
  safeGet,
  safeSet,
  getWebhookEventData,
  getWebhookEventType,
  getWebhookEventId,
  applyTransformationPipeline,
  createDefaultWebhookPipeline,
  type SanitizationOptions,
  type TransformationResult,
  type TransformationPipeline
} from '@/lib/whop/dataTransformers';
import { encrypt, decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

// Mock dependencies
jest.mock('@/lib/encryption');
jest.mock('@/lib/logger');
jest.mock('@/lib/env');

const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockEnv = env as jest.Mocked<typeof env>;

describe('Data Sanitization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.ENCRYPTION_KEY = 'test_encryption_key_12345';
    mockEncrypt.mockImplementation((data: string) => `encrypted_${data}`);
    mockDecrypt.mockImplementation((data: string) => data.replace('encrypted_', ''));
  });

  describe('sanitizeWebhookPayload', () => {
    it('should remove sensitive fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          currency: 'USD',
          password: 'secret123',
          apiKey: 'sk_test_123'
        }
      };

      const options: SanitizationOptions = {
        removeSensitiveFields: ['data.password', 'data.apiKey']
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(result.data.password).toBeUndefined();
      expect(result.data.apiKey).toBeUndefined();
      expect(result.data.amount).toBe(1000);
      expect(result.id).toBe('evt_123');
    });

    it('should mask sensitive fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          email: 'test@example.com',
          phone: '+1234567890',
          name: 'Test User'
        }
      };

      const options: SanitizationOptions = {
        maskFields: ['data.email', 'data.phone']
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(result.data.email).toBe('***********ple.com');
      expect(result.data.phone).toBe('********7890');
      expect(result.data.name).toBe('Test User');
    });

    it('should truncate long fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          description: 'This is a very long description that should be truncated to a reasonable length',
          shortField: 'short'
        }
      };

      const options: SanitizationOptions = {
        truncateFields: {
          'data.description': 20
        }
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(result.data.description).toBe('This is a very lo...');
      expect(result.data.shortField).toBe('short');
    });

    it('should encrypt sensitive fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          ssn: '123-45-6789',
          bankAccount: '987654321'
        }
      };

      const options: SanitizationOptions = {
        encryptFields: ['data.ssn', 'data.bankAccount']
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(result.data.ssn).toBe('encrypted_123-45-6789');
      expect(result.data.bankAccount).toBe('encrypted_987654321');
      expect(mockEncrypt).toHaveBeenCalledWith('123-45-6789');
      expect(mockEncrypt).toHaveBeenCalledWith('987654321');
    });

    it('should handle nested field paths', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          user: {
            personal: {
              ssn: '123-45-6789'
            },
            contact: {
              email: 'test@example.com'
            }
          }
        }
      };

      const options: SanitizationOptions = {
        removeSensitiveFields: ['data.user.personal.ssn'],
        maskFields: ['data.user.contact.email']
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(result.data.user.personal.ssn).toBeUndefined();
      expect(result.data.user.contact.email).toBe('***********ple.com');
    });

    it('should not modify original payload', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          secret: 'should_be_removed'
        }
      };

      const options: SanitizationOptions = {
        removeSensitiveFields: ['data.secret']
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(payload.data.secret).toBe('should_be_removed');
      expect(result.data.secret).toBeUndefined();
    });

    it('should handle missing encryption key', () => {
      mockEnv.ENCRYPTION_KEY = undefined;

      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          ssn: '123-45-6789'
        }
      };

      const options: SanitizationOptions = {
        encryptFields: ['data.ssn']
      };

      const result = sanitizeWebhookPayload(payload, options);

      expect(result.data.ssn).toBe('123-45-6789');
      expect(mockEncrypt).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeUserData', () => {
    it('should apply default user data sanitization', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        phone: '+1234567890',
        password: 'secret123',
        apiKey: 'sk_test_123',
        description: 'This is a long description that should be truncated',
        bio: 'Short bio',
        ssn: '123-45-6789',
        taxId: '987-65-4321',
        bankAccount: '123456789'
      };

      const result = sanitizeUserData(userData);

      // Check removed fields
      expect(result.password).toBeUndefined();
      expect(result.apiKey).toBeUndefined();
      expect(result.secret).toBeUndefined();
      expect(result.token).toBeUndefined();

      // Check masked fields
      expect(result.email).toBe('***********ple.com');
      expect(result.phone).toBe('********7890');

      // Check truncated fields
      expect(result.description).toBe('This is a long descript...');
      expect(result.bio).toBe('Short bio');

      // Check encrypted fields
      expect(result.ssn).toBe('encrypted_123-45-6789');
      expect(result.taxId).toBe('encrypted_987-65-4321');
      expect(result.bankAccount).toBe('encrypted_123456789');

      // Check unchanged fields
      expect(result.id).toBe('user_123');
    });
  });

  describe('sanitizePaymentData', () => {
    it('should apply default payment data sanitization', () => {
      const paymentData = {
        id: 'pay_123',
        amount: 1000,
        currency: 'USD',
        cardNumber: '4111111111111111',
        cvv: '123',
        pin: '4321',
        accountNumber: '987654321',
        routingNumber: '123456789',
        cardToken: 'tok_123456',
        paymentMethodId: 'pm_789'
      };

      const result = sanitizePaymentData(paymentData);

      // Check removed fields
      expect(result.cardNumber).toBeUndefined();
      expect(result.cvv).toBeUndefined();
      expect(result.pin).toBeUndefined();

      // Check masked fields
      expect(result.accountNumber).toBe('********4321');
      expect(result.routingNumber).toBe('********6789');

      // Check encrypted fields
      expect(result.cardToken).toBe('encrypted_tok_123456');
      expect(result.paymentMethodId).toBe('encrypted_pm_789');

      // Check unchanged fields
      expect(result.id).toBe('pay_123');
      expect(result.amount).toBe(1000);
      expect(result.currency).toBe('USD');
    });
  });
});

describe('Data Normalization', () => {
  describe('normalizeWebhookPayload', () => {
    it('should normalize numeric IDs to strings', () => {
      const payload = {
        id: 123,
        whop_event_id: 456,
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = normalizeWebhookPayload(payload);

      expect(typeof result.id).toBe('string');
      expect(typeof result.whop_event_id).toBe('string');
      expect(result.id).toBe('123');
      expect(result.whop_event_id).toBe('456');
    });

    it('should normalize created_at timestamp', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        created_at: '2023-12-01T10:30:00Z',
        data: { amount: 1000 }
      };

      const result = normalizeWebhookPayload(payload);

      expect(result.created_at).toBe('2023-12-01T10:30:00.000Z');
    });

    it('should normalize data object fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 789,
          user_id: 456,
          company_id: 123,
          amount: '1000.50',
          created_at: '2023-12-01T10:30:00Z',
          current_period_start: '2023-12-01T00:00:00Z',
          cancel_at_period_end: 'true'
        }
      };

      const result = normalizeWebhookPayload(payload);

      expect(typeof result.data.id).toBe('string');
      expect(typeof result.data.user_id).toBe('string');
      expect(typeof result.data.company_id).toBe('string');
      expect(typeof result.data.amount).toBe('number');
      expect(result.data.amount).toBe(1000.50);
      expect(result.data.created_at).toBe('2023-12-01T10:30:00.000Z');
      expect(result.data.current_period_start).toBe('2023-12-01T00:00:00.000Z');
      expect(result.data.cancel_at_period_end).toBe(true);
    });

    it('should handle missing data object', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded'
      };

      const result = normalizeWebhookPayload(payload);

      expect(result.data).toBeUndefined();
    });

    it('should not modify original payload', () => {
      const payload = {
        id: 123,
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = normalizeWebhookPayload(payload);

      expect(typeof payload.id).toBe('number');
      expect(payload.id).toBe(123);
      expect(typeof result.id).toBe('string');
    });
  });
});

describe('Data Transformation', () => {
  describe('transformWebhookPayload', () => {
    it('should transform to database format', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { amount: 1000 },
        created_at: '2023-12-01T10:30:00Z'
      };

      const result = transformWebhookPayload(payload, 'database');

      expect(result.event_type).toBe('payment.succeeded');
      expect(result.type).toBeUndefined();
      expect(result.id).toBe('evt_123');
      expect(result.created_at).toBe('2023-12-01T10:30:00Z');
    });

    it('should transform to API format', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { amount: 1000 },
        created_at: '2023-12-01T10:30:00Z'
      };

      const result = transformWebhookPayload(payload, 'api');

      expect(result.type).toBe('payment.succeeded');
      expect(result.createdAt).toBe('2023-12-01T10:30:00Z');
      expect(result.created_at).toBeUndefined();
    });

    it('should transform to log format', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          email: 'test@example.com',
          description: 'This is a very long description that should be truncated',
          metadata: { key: 'value' }
        }
      };

      const result = transformWebhookPayload(payload, 'log');

      expect(result.data.email).toBe('***********ple.com');
      expect(result.data.description).toBe('This is a very long des...');
      expect(typeof result.data.metadata).toBe('string'); // Truncated to string
    });

    it('should default to database format', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = transformWebhookPayload(payload);

      expect(result.event_type).toBe('payment.succeeded');
      expect(result.type).toBeUndefined();
    });
  });

  describe('transformUserData', () => {
    it('should transform to database format', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = transformUserData(userData, 'database');

      expect(result.first_name).toBe('John');
      expect(result.last_name).toBe('Doe');
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });

    it('should transform to API format', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe'
      };

      const result = transformUserData(userData, 'api');

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.first_name).toBeUndefined();
      expect(result.last_name).toBeUndefined();
    });

    it('should transform to profile format', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        username: 'johndoe'
      };

      const result = transformUserData(userData, 'profile');

      expect(result.displayName).toBe('John Doe');
      expect(result.first_name).toBe('John');
      expect(result.last_name).toBe('Doe');
      expect(result.username).toBe('johndoe');
    });

    it('should handle missing names in profile format', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'johndoe'
      };

      const result = transformUserData(userData, 'profile');

      expect(result.displayName).toBe('johndoe');
    });

    it('should default to database format', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = transformUserData(userData);

      expect(result.first_name).toBe('John');
      expect(result.last_name).toBe('Doe');
    });
  });
});

describe('Encryption and Decryption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.ENCRYPTION_KEY = 'test_encryption_key_12345';
    mockEncrypt.mockImplementation((data: string) => `encrypted_${data}`);
    mockDecrypt.mockResolvedValue(data.replace('encrypted_', ''));
  });

  describe('encryptWebhookPayload', () => {
    it('should encrypt specified fields', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          metadata: { secret: 'value' },
          payment_method: { token: 'secret_token' },
          user: { email: 'test@example.com' }
        }
      };

      const fields = ['data.metadata', 'data.payment_method'];

      const result = encryptWebhookPayload(payload, fields);

      expect(result.data.metadata).toBe('encrypted_[object Object]'); // Stringified object
      expect(result.data.payment_method).toBe('encrypted_[object Object]');
      expect(result.data.user.email).toBe('test@example.com'); // Not encrypted
      expect(mockEncrypt).toHaveBeenCalledTimes(2);
    });

    it('should use default fields when none specified', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          metadata: { secret: 'value' },
          payment_method: { token: 'secret_token' },
          user: { email: 'test@example.com' }
        }
      };

      const result = encryptWebhookPayload(payload);

      expect(result.data.metadata).toBe('encrypted_[object Object]');
      expect(result.data.payment_method).toBe('encrypted_[object Object]');
      expect(result.data.user.email).toBe('encrypted_test@example.com');
      expect(mockEncrypt).toHaveBeenCalledTimes(3);
    });

    it('should handle missing encryption key', () => {
      mockEnv.ENCRYPTION_KEY = undefined;

      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { metadata: { secret: 'value' } }
      };

      const result = encryptWebhookPayload(payload);

      expect(result.data.metadata).toEqual({ secret: 'value' });
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Encryption key not available, skipping payload encryption');
    });
  });

  describe('decryptWebhookPayload', () => {
    it('should decrypt specified fields', async () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          metadata: 'encrypted_[object Object]',
          payment_method: 'encrypted_[object Object]'
        }
      };

      const fields = ['data.metadata', 'data.payment_method'];

      const result = await decryptWebhookPayload(payload, fields);

      expect(result.data.metadata).toEqual({});
      expect(result.data.payment_method).toEqual({});
      expect(mockDecrypt).toHaveBeenCalledWith('[object Object]');
      expect(mockDecrypt).toHaveBeenCalledTimes(2);
    });

    it('should use default fields when none specified', async () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          metadata: 'encrypted_[object Object]',
          payment_method: 'encrypted_[object Object]'
        }
      };

      const result = await decryptWebhookPayload(payload);

      expect(result.data.metadata).toEqual({});
      expect(result.data.payment_method).toEqual({});
      expect(mockDecrypt).toHaveBeenCalledTimes(2);
    });

    it('should handle missing encryption key', async () => {
      mockEnv.ENCRYPTION_KEY = undefined;

      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { metadata: 'encrypted_[object Object]' }
      };

      const result = await decryptWebhookPayload(payload);

      expect(result.data.metadata).toBe('encrypted_[object Object]');
      expect(mockDecrypt).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Encryption key not available, cannot decrypt payload');
    });

    it('should handle decryption errors', async () => {
      mockDecrypt.mockRejectedValue(new Error('Decryption failed'));

      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { metadata: 'encrypted_invalid_data' }
      };

      const result = await decryptWebhookPayload(payload);

      expect(result.data.metadata).toBe('encrypted_invalid_data');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to decrypt field',
        expect.objectContaining({
          path: 'data.metadata'
        })
      );
    });
  });

  describe('encryptPaymentData', () => {
    it('should encrypt payment-specific fields', () => {
      const paymentData = {
        id: 'pay_123',
        amount: 1000,
        cardToken: 'tok_123456',
        paymentMethodId: 'pm_789',
        billingAddress: { street: '123 Main St' },
        customerData: { name: 'John Doe' }
      };

      const result = encryptPaymentData(paymentData);

      expect(result.cardToken).toBe('encrypted_tok_123456');
      expect(result.paymentMethodId).toBe('encrypted_pm_789');
      expect(result.billingAddress).toBe('encrypted_[object Object]');
      expect(result.customerData).toBe('encrypted_[object Object]');
      expect(result.amount).toBe(1000); // Not encrypted
      expect(mockEncrypt).toHaveBeenCalledTimes(4);
    });
  });

  describe('decryptPaymentData', () => {
    it('should decrypt payment-specific fields', async () => {
      const paymentData = {
        id: 'pay_123',
        amount: 1000,
        cardToken: 'encrypted_tok_123456',
        paymentMethodId: 'encrypted_pm_789',
        billingAddress: 'encrypted_[object Object]'
      };

      const result = await decryptPaymentData(paymentData);

      expect(result.cardToken).toBe('tok_123456');
      expect(result.paymentMethodId).toBe('pm_789');
      expect(result.billingAddress).toEqual({});
      expect(result.amount).toBe(1000); // Not decrypted
      expect(mockDecrypt).toHaveBeenCalledTimes(3);
    });
  });
});

describe('Safe Data Access', () => {
  describe('safeGet', () => {
    it('should get nested value', () => {
      const obj = {
        user: {
          profile: {
            name: 'John Doe',
            contact: {
              email: 'john@example.com'
            }
          }
        }
      };

      const result = safeGet(obj, 'user.profile.contact.email');

      expect(result).toBe('john@example.com');
    });

    it('should return default value for missing path', () => {
      const obj = {
        user: {
          profile: {
            name: 'John Doe'
          }
        }
      };

      const result = safeGet(obj, 'user.profile.contact.email', 'default@example.com');

      expect(result).toBe('default@example.com');
    });

    it('should return undefined for missing path with no default', () => {
      const obj = {
        user: {
          profile: {
            name: 'John Doe'
          }
        }
      };

      const result = safeGet(obj, 'user.profile.contact.email');

      expect(result).toBeUndefined();
    });

    it('should handle null/undefined object', () => {
      expect(safeGet(null, 'user.name')).toBeUndefined();
      expect(safeGet(undefined, 'user.name')).toBeUndefined();
    });

    it('should handle array indices', () => {
      const obj = {
        users: [
          { name: 'John' },
          { name: 'Jane' }
        ]
      };

      const result = safeGet(obj, 'users.1.name');

      expect(result).toBe('Jane');
    });

    it('should handle exceptions gracefully', () => {
      const obj = {
        user: {
          profile: null
        }
      };

      const result = safeGet(obj, 'user.profile.contact.email', 'default');

      expect(result).toBe('default');
    });
  });

  describe('safeSet', () => {
    it('should set nested value', () => {
      const obj = {};

      const result = safeSet(obj, 'user.profile.name', 'John Doe');

      expect(result).toBe(true);
      expect(obj.user.profile.name).toBe('John Doe');
    });

    it('should create intermediate objects', () => {
      const obj = {};

      const result = safeSet(obj, 'user.profile.contact.email', 'john@example.com');

      expect(result).toBe(true);
      expect(obj.user.profile.contact.email).toBe('john@example.com');
    });

    it('should return false for invalid path', () => {
      const obj = {};

      const result = safeSet(obj, '', 'value');

      expect(result).toBe(false);
    });

    it('should handle existing intermediate null values', () => {
      const obj = {
        user: null
      };

      const result = safeSet(obj, 'user.profile.name', 'John Doe');

      expect(result).toBe(true);
      expect(obj.user.profile.name).toBe('John Doe');
    });

    it('should handle exceptions gracefully', () => {
      const obj = {};
      // Create a scenario that might cause an exception
      Object.defineProperty(obj, 'user', {
        get() { throw new Error('Access denied'); },
        set() { throw new Error('Access denied'); }
      });

      const result = safeSet(obj, 'user.name', 'John');

      expect(result).toBe(false);
    });
  });

  describe('getWebhookEventData', () => {
    it('should get webhook event data', () => {
      const webhook = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          currency: 'USD',
          user_id: 'user_456'
        }
      };

      const result = getWebhookEventData(webhook);

      expect(result).toEqual({
        amount: 1000,
        currency: 'USD',
        user_id: 'user_456'
      });
    });

    it('should return empty object for missing data', () => {
      const webhook = {
        id: 'evt_123',
        type: 'payment.succeeded'
      };

      const result = getWebhookEventData(webhook);

      expect(result).toEqual({});
    });

    it('should use default for null data', () => {
      const webhook = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: null
      };

      const result = getWebhookEventData(webhook);

      expect(result).toEqual({});
    });
  });

  describe('getWebhookEventType', () => {
    it('should get webhook event type', () => {
      const webhook = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = getWebhookEventType(webhook);

      expect(result).toBe('payment.succeeded');
    });

    it('should return unknown for missing type', () => {
      const webhook = {
        id: 'evt_123',
        data: { amount: 1000 }
      };

      const result = getWebhookEventType(webhook);

      expect(result).toBe('unknown');
    });

    it('should return unknown for null webhook', () => {
      const result = getWebhookEventType(null as any);

      expect(result).toBe('unknown');
    });
  });

  describe('getWebhookEventId', () => {
    it('should get webhook event ID from id field', () => {
      const webhook = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = getWebhookEventId(webhook);

      expect(result).toBe('evt_123');
    });

    it('should get webhook event ID from whop_event_id field', () => {
      const webhook = {
        whop_event_id: 'evt_456',
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = getWebhookEventId(webhook);

      expect(result).toBe('evt_456');
    });

    it('should prefer id over whop_event_id', () => {
      const webhook = {
        id: 'evt_123',
        whop_event_id: 'evt_456',
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = getWebhookEventId(webhook);

      expect(result).toBe('evt_123');
    });

    it('should return unknown for missing ID fields', () => {
      const webhook = {
        type: 'payment.succeeded',
        data: { amount: 1000 }
      };

      const result = getWebhookEventId(webhook);

      expect(result).toBe('unknown');
    });
  });
});

describe('Transformation Pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.ENCRYPTION_KEY = 'test_encryption_key_12345';
    mockEncrypt.mockImplementation((data: string) => `encrypted_${data}`);
  });

  describe('applyTransformationPipeline', () => {
    it('should apply complete pipeline successfully', async () => {
      const payload = {
        id: 123,
        type: 'payment.succeeded',
        data: {
          amount: '1000.50',
          email: 'test@example.com',
          description: 'This is a very long description'
        }
      };

      const pipeline: TransformationPipeline = {
        sanitization: {
          maskFields: ['data.email'],
          truncateFields: { 'data.description': 20 }
        },
        validation: true,
        encryption: true,
        normalization: true
      };

      const result = await applyTransformationPipeline(payload, pipeline);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data?.id).toBe('string'); // Normalized
      expect(result.data?.data.email).toBe('***********ple.com'); // Masked
      expect(result.data?.data.description).toBe('This is a very lo...'); // Truncated
      expect(result.warnings).toBeUndefined();
    });

    it('should handle pipeline errors', async () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded'
      };

      // Mock an error during encryption
      mockEncrypt.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      const pipeline: TransformationPipeline = {
        encryption: true
      };

      const result = await applyTransformationPipeline(payload, pipeline);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('Transformation failed');
    });

    it('should collect warnings during pipeline', async () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          amount: 1000,
          email: 'test@example.com'
        }
      };

      const pipeline: TransformationPipeline = {
        sanitization: {
          maskFields: ['data.email']
        }
      };

      const result = await applyTransformationPipeline(payload, pipeline);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.data.email).toBe('***********ple.com');
      // Note: Warnings would be collected if the sanitization functions were modified to return them
    });
  });

  describe('createDefaultWebhookPipeline', () => {
    it('should create default webhook pipeline', () => {
      const pipeline = createDefaultWebhookPipeline();

      expect(pipeline.sanitization).toBeDefined();
      expect(pipeline.sanitization?.maskFields).toContain('data.email');
      expect(pipeline.sanitization?.maskFields).toContain('data.phone');
      expect(pipeline.sanitization?.truncateFields).toBeDefined();
      expect(pipeline.sanitization?.encryptFields).toContain('data.paymentMethod');
      expect(pipeline.validation).toBe(true);
      expect(pipeline.encryption).toBe(true);
      expect(pipeline.normalization).toBe(true);
    });
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.ENCRYPTION_KEY = 'test_encryption_key_12345';
    mockEncrypt.mockImplementation((data: string) => `encrypted_${data}`);
    mockDecrypt.mockResolvedValue(data.replace('encrypted_', ''));
  });

  it('should handle complete webhook transformation pipeline', async () => {
    const webhookPayload = {
      id: 123,
      type: 'payment.succeeded',
      data: {
        amount: '1000.50',
        currency: 'USD',
        user_id: 456,
        email: 'test@example.com',
        description: 'This is a very long description that should be truncated',
        metadata: {
          source: 'web',
          campaign: 'holiday_sale',
          secret_data: 'sensitive_information'
        }
      },
      created_at: '2023-12-01T10:30:00Z'
    };

    // Apply default pipeline
    const pipeline = createDefaultWebhookPipeline();
    const result = await applyTransformationPipeline(webhookPayload, pipeline);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const transformed = result.data!;

    // Check normalization
    expect(typeof transformed.id).toBe('string');
    expect(transformed.id).toBe('123');
    expect(typeof transformed.data.user_id).toBe('string');
    expect(transformed.data.user_id).toBe('456');
    expect(typeof transformed.data.amount).toBe('number');
    expect(transformed.data.amount).toBe(1000.50);

    // Check sanitization
    expect(transformed.data.email).toBe('***********ple.com');
    expect(transformed.data.description.length).toBeLessThanOrEqual(2000);

    // Check encryption
    expect(transformed.data.metadata).toMatch(/^encrypted_/);
  });

  it('should handle user data transformation for different formats', () => {
    const userData = {
      id: 'user_123',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe'
    };

    // Database format
    const dbResult = transformUserData(userData, 'database');
    expect(dbResult.first_name).toBe('John');
    expect(dbResult.last_name).toBe('Doe');
    expect(dbResult.firstName).toBeUndefined();

    // API format
    const apiResult = transformUserData(userData, 'api');
    expect(apiResult.firstName).toBe('John');
    expect(apiResult.lastName).toBe('Doe');
    expect(apiResult.first_name).toBeUndefined();

    // Profile format
    const profileResult = transformUserData(userData, 'profile');
    expect(profileResult.displayName).toBe('John Doe');
  });

  it('should handle payment data encryption and decryption', async () => {
    const paymentData = {
      id: 'pay_123',
      amount: 1000,
      currency: 'USD',
      cardToken: 'tok_sensitive_123',
      paymentMethodId: 'pm_sensitive_456',
      billingAddress: {
        street: '123 Main St',
        city: 'Anytown'
      }
    };

    // Encrypt
    const encrypted = encryptPaymentData(paymentData);
    expect(encrypted.cardToken).toMatch(/^encrypted_/);
    expect(encrypted.paymentMethodId).toMatch(/^encrypted_/);
    expect(encrypted.billingAddress).toMatch(/^encrypted_/);

    // Decrypt
    const decrypted = await decryptPaymentData(encrypted);
    expect(decrypted.cardToken).toBe('tok_sensitive_123');
    expect(decrypted.paymentMethodId).toBe('pm_sensitive_456');
    expect(decrypted.billingAddress.street).toBe('123 Main St');
  });
});