// Whop Data Validators Tests
// Comprehensive tests for data validation schemas and validation functions

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  validateWebhookPayload,
  validateApiResponse,
  validateUserData,
  validateMembershipData,
  validatePaymentData,
  validateCompanyData,
  formatValidationErrors,
  BaseWebhookSchema,
  PaymentSucceededWebhookSchema,
  MembershipCreatedWebhookSchema,
  MembershipUpdatedWebhookSchema,
  UserCreatedWebhookSchema,
  WhopWebhookSchema,
  ApiResponseSchema,
  UserResponseSchema,
  MembershipResponseSchema,
  PaymentResponseSchema,
  CompanyResponseSchema,
  UserProfileSchema,
  MembershipSchema,
  PaymentSchema,
  CompanySchema,
  type ValidationResult,
  type ValidationError
} from '@/lib/whop/dataValidators';

describe('Webhook Payload Validation', () => {
  describe('validateWebhookPayload', () => {
    it('should validate payment succeeded webhook', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
          user_id: 'user_789'
        },
        created_at: '2023-12-01T10:30:00Z'
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
      expect(result.data?.type).toBe('payment.succeeded');
    });

    it('should validate membership created webhook', () => {
      const payload = {
        id: 'evt_123',
        type: 'membership.created',
        data: {
          id: 'mem_456',
          user_id: 'user_789',
          plan_id: 'plan_101',
          status: 'active',
          current_period_start: '2023-12-01T00:00:00Z'
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
      expect(result.data?.type).toBe('membership.created');
    });

    it('should validate user created webhook', () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          id: 'user_456',
          email: 'test@example.com',
          username: 'testuser'
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
      expect(result.data?.type).toBe('user.created');
    });

    it('should validate unknown event type with base schema', () => {
      const payload = {
        id: 'evt_123',
        type: 'unknown.event',
        data: {
          custom_field: 'custom_value'
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
      expect(result.data?.type).toBe('unknown.event');
    });

    it('should reject invalid payment amount', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: -100, // Negative amount
          currency: 'USD',
          status: 'succeeded',
          user_id: 'user_789'
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0].field).toBe('data.amount');
      expect(result.errors?.[0].message).toContain('positive');
    });

    it('should reject invalid currency code', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: 1000,
          currency: 'INVALID', // Invalid currency
          status: 'succeeded',
          user_id: 'user_789'
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('data.currency');
    });

    it('should reject invalid email format', () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          id: 'user_456',
          email: 'invalid-email', // Invalid email
          username: 'testuser'
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('data.email');
    });

    it('should reject invalid membership status', () => {
      const payload = {
        id: 'evt_123',
        type: 'membership.created',
        data: {
          id: 'mem_456',
          user_id: 'user_789',
          plan_id: 'plan_101',
          status: 'invalid_status' // Invalid status
        }
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('data.status');
    });

    it('should reject invalid datetime format', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
          user_id: 'user_789'
        },
        created_at: 'invalid-date' // Invalid date format
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('created_at');
    });

    it('should handle validation exceptions', () => {
      // Pass null to trigger exception
      const result = validateWebhookPayload(null);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('payload');
      expect(result.errors?.[0].message).toContain('VALIDATION_EXCEPTION');
    });
  });
});

describe('API Response Validation', () => {
  describe('validateApiResponse', () => {
    it('should validate successful API response', () => {
      const response = {
        success: true,
        data: {
          id: 'user_123',
          email: 'test@example.com'
        }
      };

      const schema = ApiResponseSchema;
      const result = validateApiResponse(response, schema);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should validate paginated API response', () => {
      const response = {
        success: true,
        data: [
          { id: 'user_1', email: 'user1@example.com' },
          { id: 'user_2', email: 'user2@example.com' }
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1
        }
      };

      const schema = ApiResponseSchema;
      const result = validateApiResponse(response, schema);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should validate error API response', () => {
      const response = {
        success: false,
        error: 'Validation failed',
        message: 'Invalid input parameters'
      };

      const schema = ApiResponseSchema;
      const result = validateApiResponse(response, schema);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid response structure', () => {
      const response = {
        // Missing success field
        data: { id: 'user_123' }
      };

      const schema = ApiResponseSchema;
      const result = validateApiResponse(response, schema);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('success');
    });

    it('should reject invalid pagination values', () => {
      const response = {
        success: true,
        data: [],
        pagination: {
          page: -1, // Invalid negative page
          limit: 10,
          total: 0,
          totalPages: 0
        }
      };

      const schema = ApiResponseSchema;
      const result = validateApiResponse(response, schema);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('pagination.page');
    });
  });

  describe('validateUserData', () => {
    it('should validate complete user profile', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateUserData(userData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid email', () => {
      const userData = {
        id: 'user_123',
        email: 'invalid-email-format',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateUserData(userData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('email');
    });

    it('should reject username with invalid characters', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'test@user', // Invalid character @
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateUserData(userData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('username');
    });

    it('should reject username that is too short', () => {
      const userData = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'ab', // Too short (min 3)
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateUserData(userData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('username');
    });
  });

  describe('validateMembershipData', () => {
    it('should validate complete membership data', () => {
      const membershipData = {
        id: 'mem_123',
        user_id: 'user_456',
        plan_id: 'plan_789',
        status: 'active',
        current_period_start: '2023-12-01T00:00:00Z',
        current_period_end: '2024-01-01T00:00:00Z',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateMembershipData(membershipData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid membership status', () => {
      const membershipData = {
        id: 'mem_123',
        user_id: 'user_456',
        plan_id: 'plan_789',
        status: 'invalid_status', // Not in enum
        current_period_start: '2023-12-01T00:00:00Z',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateMembershipData(membershipData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('status');
    });
  });

  describe('validatePaymentData', () => {
    it('should validate complete payment data', () => {
      const paymentData = {
        id: 'pay_123',
        amount: 1000,
        currency: 'USD',
        status: 'succeeded',
        user_id: 'user_456',
        payment_method_type: 'card',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validatePaymentData(paymentData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject negative payment amount', () => {
      const paymentData = {
        id: 'pay_123',
        amount: -1000, // Negative amount
        currency: 'USD',
        status: 'succeeded',
        user_id: 'user_456',
        payment_method_type: 'card',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validatePaymentData(paymentData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('amount');
    });

    it('should reject invalid currency code', () => {
      const paymentData = {
        id: 'pay_123',
        amount: 1000,
        currency: 'invalid', // Invalid currency
        status: 'succeeded',
        user_id: 'user_456',
        payment_method_type: 'card',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validatePaymentData(paymentData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('currency');
    });
  });

  describe('validateCompanyData', () => {
    it('should validate complete company data', () => {
      const companyData = {
        id: 'comp_123',
        name: 'Test Company',
        slug: 'test-company',
        website_url: 'https://example.com',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateCompanyData(companyData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject invalid URL format', () => {
      const companyData = {
        id: 'comp_123',
        name: 'Test Company',
        website_url: 'invalid-url', // Invalid URL
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateCompanyData(companyData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('website_url');
    });

    it('should reject slug with invalid characters', () => {
      const companyData = {
        id: 'comp_123',
        name: 'Test Company',
        slug: 'test_company', // Invalid underscore
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = validateCompanyData(companyData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('slug');
    });
  });
});

describe('Schema Validation', () => {
  describe('BaseWebhookSchema', () => {
    it('should accept valid base webhook payload', () => {
      const payload = {
        id: 'evt_123',
        type: 'test.event',
        data: { test: 'data' },
        created_at: '2023-12-01T10:30:00Z'
      };

      const result = BaseWebhookSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should require type field', () => {
      const payload = {
        id: 'evt_123',
        data: { test: 'data' }
      };

      const result = BaseWebhookSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should accept additional properties', () => {
      const payload = {
        id: 'evt_123',
        type: 'test.event',
        data: { test: 'data' },
        custom_field: 'custom_value'
      };

      const result = BaseWebhookSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });
  });

  describe('PaymentSucceededWebhookSchema', () => {
    it('should validate payment succeeded webhook', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
          user_id: 'user_789'
        }
      };

      const result = PaymentSucceededWebhookSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should require payment amount to be positive', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: -100, // Negative
          currency: 'USD',
          status: 'succeeded',
          user_id: 'user_789'
        }
      };

      const result = PaymentSucceededWebhookSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });

    it('should require correct status', () => {
      const payload = {
        id: 'evt_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: 1000,
          currency: 'USD',
          status: 'failed', // Wrong status
          user_id: 'user_789'
        }
      };

      const result = PaymentSucceededWebhookSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });
  });

  describe('MembershipCreatedWebhookSchema', () => {
    it('should validate membership created webhook', () => {
      const payload = {
        id: 'evt_123',
        type: 'membership.created',
        data: {
          id: 'mem_456',
          user_id: 'user_789',
          plan_id: 'plan_101',
          status: 'active',
          current_period_start: '2023-12-01T00:00:00Z'
        }
      };

      const result = MembershipCreatedWebhookSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should require valid membership status', () => {
      const payload = {
        id: 'evt_123',
        type: 'membership.created',
        data: {
          id: 'mem_456',
          user_id: 'user_789',
          plan_id: 'plan_101',
          status: 'invalid_status',
          current_period_start: '2023-12-01T00:00:00Z'
        }
      };

      const result = MembershipCreatedWebhookSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });
  });

  describe('UserCreatedWebhookSchema', () => {
    it('should validate user created webhook', () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          id: 'user_456',
          email: 'test@example.com',
          username: 'testuser'
        }
      };

      const result = UserCreatedWebhookSchema.safeParse(payload);

      expect(result.success).toBe(true);
    });

    it('should require valid email format', () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          id: 'user_456',
          email: 'invalid-email',
          username: 'testuser'
        }
      };

      const result = UserCreatedWebhookSchema.safeParse(payload);

      expect(result.success).toBe(false);
    });
  });

  describe('ApiResponseSchema', () => {
    it('should validate successful response', () => {
      const response = {
        success: true,
        data: { id: 'test' }
      };

      const result = ApiResponseSchema.safeParse(response);

      expect(result.success).toBe(true);
    });

    it('should validate error response', () => {
      const response = {
        success: false,
        error: 'Test error'
      };

      const result = ApiResponseSchema.safeParse(response);

      expect(result.success).toBe(true);
    });

    it('should validate pagination', () => {
      const response = {
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0
        }
      };

      const result = ApiResponseSchema.safeParse(response);

      expect(result.success).toBe(true);
    });
  });

  describe('UserProfileSchema', () => {
    it('should validate complete user profile', () => {
      const profile = {
        id: 'user_123',
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = UserProfileSchema.safeParse(profile);

      expect(result.success).toBe(true);
    });

    it('should validate minimal user profile', () => {
      const profile = {
        id: 'user_123',
        email: 'test@example.com',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = UserProfileSchema.safeParse(profile);

      expect(result.success).toBe(true);
    });
  });

  describe('MembershipSchema', () => {
    it('should validate complete membership', () => {
      const membership = {
        id: 'mem_123',
        user_id: 'user_456',
        plan_id: 'plan_789',
        status: 'active',
        current_period_start: '2023-12-01T00:00:00Z',
        current_period_end: '2024-01-01T00:00:00Z',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = MembershipSchema.safeParse(membership);

      expect(result.success).toBe(true);
    });
  });

  describe('PaymentSchema', () => {
    it('should validate complete payment', () => {
      const payment = {
        id: 'pay_123',
        amount: 1000,
        currency: 'USD',
        status: 'succeeded',
        user_id: 'user_456',
        payment_method_type: 'card',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = PaymentSchema.safeParse(payment);

      expect(result.success).toBe(true);
    });
  });

  describe('CompanySchema', () => {
    it('should validate complete company', () => {
      const company = {
        id: 'comp_123',
        name: 'Test Company',
        slug: 'test-company',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2023-12-01T10:30:00Z'
      };

      const result = CompanySchema.safeParse(company);

      expect(result.success).toBe(true);
    });
  });
});

describe('Utility Functions', () => {
  describe('formatValidationErrors', () => {
    it('should format single validation error', () => {
      const errors: ValidationError[] = [
        {
          field: 'email',
          message: 'Invalid email format',
          code: 'INVALID_STRING',
          value: 'invalid-email'
        }
      ];

      const formatted = formatValidationErrors(errors);

      expect(formatted).toBe('email: Invalid email format');
    });

    it('should format multiple validation errors', () => {
      const errors: ValidationError[] = [
        {
          field: 'email',
          message: 'Invalid email format',
          code: 'INVALID_STRING',
          value: 'invalid-email'
        },
        {
          field: 'username',
          message: 'Username too short',
          code: 'TOO_SMALL',
          value: 'ab'
        }
      ];

      const formatted = formatValidationErrors(errors);

      expect(formatted).toBe('email: Invalid email format; username: Username too short');
    });

    it('should handle empty errors array', () => {
      const errors: ValidationError[] = [];

      const formatted = formatValidationErrors(errors);

      expect(formatted).toBe('');
    });

    it('should handle nested field paths', () => {
      const errors: ValidationError[] = [
        {
          field: 'data.payment.amount',
          message: 'Must be positive',
          code: 'INVALID_NUMBER',
          value: -100
        }
      ];

      const formatted = formatValidationErrors(errors);

      expect(formatted).toBe('data.payment.amount: Must be positive');
    });
  });
});

describe('Integration Tests', () => {
  describe('Complex webhook validation scenarios', () => {
    it('should validate complete payment succeeded webhook with all optional fields', () => {
      const payload = {
        id: 'evt_payment_complete_123',
        whop_event_id: 'evt_payment_complete_123',
        type: 'payment.succeeded',
        data: {
          id: 'pay_complete_456',
          amount: 1999,
          currency: 'USD',
          status: 'succeeded',
          membership_id: 'mem_complete_789',
          user_id: 'user_complete_101',
          company_id: 'comp_complete_202',
          metadata: {
            source: 'web',
            campaign: 'holiday_sale'
          },
          payment_method: {
            type: 'card',
            id: 'pm_card_303'
          }
        },
        created_at: '2023-12-01T10:30:00Z',
        custom_field: 'custom_value'
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('evt_payment_complete_123');
      expect(result.data?.type).toBe('payment.succeeded');
      expect(result.data?.data.amount).toBe(1999);
    });

    it('should handle webhook with multiple validation errors', () => {
      const payload = {
        // Missing required id field
        type: 'payment.succeeded',
        data: {
          id: 'pay_456',
          amount: -1000, // Negative amount
          currency: 'INVALID', // Invalid currency
          status: 'wrong_status', // Wrong status
          user_id: 'user_789'
        },
        created_at: 'invalid-date' // Invalid date
      };

      const result = validateWebhookPayload(payload);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(2);
      
      const errorFields = result.errors!.map(err => err.field);
      expect(errorFields).toContain('id');
      expect(errorFields).toContain('data.amount');
      expect(errorFields).toContain('data.currency');
      expect(errorFields).toContain('data.status');
      expect(errorFields).toContain('created_at');
    });
  });

  describe('Complex API response validation scenarios', () => {
    it('should validate paginated user list response', () => {
      const response = {
        success: true,
        data: [
          {
            id: 'user_1',
            email: 'user1@example.com',
            username: 'user1',
            created_at: '2023-12-01T10:30:00Z',
            updated_at: '2023-12-01T10:30:00Z'
          },
          {
            id: 'user_2',
            email: 'user2@example.com',
            username: 'user2',
            created_at: '2023-12-01T10:30:00Z',
            updated_at: '2023-12-01T10:30:00Z'
          }
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1
        }
      };

      const result = validateApiResponse(response, UserResponseSchema);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data?.data)).toBe(true);
      expect(result.data?.data?.length).toBe(2);
    });

    it('should validate membership response with all fields', () => {
      const response = {
        success: true,
        data: {
          id: 'mem_full_123',
          user_id: 'user_full_456',
          company_id: 'comp_full_789',
          plan_id: 'plan_full_101',
          status: 'active',
          current_period_start: '2023-12-01T00:00:00Z',
          current_period_end: '2024-01-01T00:00:00Z',
          cancel_at_period_end: false,
          created_at: '2023-12-01T10:30:00Z',
          updated_at: '2023-12-01T10:30:00Z',
          metadata: {
            trial_period: true,
            discount_code: 'WELCOME10'
          }
        }
      };

      const result = validateMembershipData(response.data);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('mem_full_123');
      expect(result.data?.status).toBe('active');
    });

    it('should handle API response with nested validation errors', () => {
      const response = {
        success: true,
        data: {
          id: 'pay_invalid_123',
          amount: -500, // Invalid negative amount
          currency: 'USD',
          status: 'succeeded',
          user_id: 'user_invalid_456',
          payment_method_type: 'card',
          created_at: '2023-12-01T10:30:00Z',
          updated_at: '2023-12-01T10:30:00Z'
        }
      };

      const result = validatePaymentData(response.data);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('amount');
    });
  });
});