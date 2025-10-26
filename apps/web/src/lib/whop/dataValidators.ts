// Data validation schemas for Whop integration
// Provides centralized validation using Zod schemas for all Whop payloads

import { z } from 'zod';

// ============================================================================
// Common Types and Utilities
// ============================================================================

/**
 * Base validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Structured validation error with field-level details
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
  value?: any;
}

// ============================================================================
// Webhook Event Validation
// ============================================================================

/**
 * Base webhook payload schema (common fields for all webhooks)
 */
export const BaseWebhookSchema = z.object({
  id: z.string().optional(),
  whop_event_id: z.string().optional(),
  type: z.string(),
  data: z.any(),
  created_at: z.string().datetime().optional(),
}).catchall(z.any()); // Allow additional properties

/**
 * Payment succeeded webhook payload schema
 */
export const PaymentSucceededWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('payment.succeeded'),
  data: z.object({
    id: z.string(),
    amount: z.number().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/), // ISO 4217 currency code
    status: z.literal('succeeded'),
    membership_id: z.string().optional(),
    user_id: z.string(),
    company_id: z.string().optional(),
    metadata: z.any().optional(),
    payment_method: z.object({
      type: z.string(),
      id: z.string().optional(),
    }).optional(),
  }).catchall(z.any()),
});

/**
 * Membership created webhook payload schema
 */
export const MembershipCreatedWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('membership.created'),
  data: z.object({
    id: z.string(),
    user_id: z.string(),
    company_id: z.string().optional(),
    plan_id: z.string(),
    status: z.enum(['active', 'inactive', 'cancelled', 'expired']),
    current_period_start: z.string().datetime(),
    current_period_end: z.string().datetime().optional(),
    cancel_at_period_end: z.boolean().optional(),
    metadata: z.any().optional(),
  }).catchall(z.any()),
});

/**
 * Membership updated webhook payload schema
 */
export const MembershipUpdatedWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('membership.updated'),
  data: z.object({
    id: z.string(),
    user_id: z.string(),
    company_id: z.string().optional(),
    plan_id: z.string(),
    status: z.enum(['active', 'inactive', 'cancelled', 'expired']),
    current_period_start: z.string().datetime(),
    current_period_end: z.string().datetime().optional(),
    cancel_at_period_end: z.boolean().optional(),
    metadata: z.any().optional(),
  }).catchall(z.any()),
});

/**
 * User created webhook payload schema
 */
export const UserCreatedWebhookSchema = BaseWebhookSchema.extend({
  type: z.literal('user.created'),
  data: z.object({
    id: z.string(),
    email: z.string().email(),
    username: z.string().optional(),
    avatar_url: z.string().url().optional(),
    company_id: z.string().optional(),
    metadata: z.any().optional(),
  }).catchall(z.any()),
});

/**
 * Union of all supported webhook event schemas
 */
export const WhopWebhookSchema = z.union([
  PaymentSucceededWebhookSchema,
  MembershipCreatedWebhookSchema,
  MembershipUpdatedWebhookSchema,
  UserCreatedWebhookSchema,
  BaseWebhookSchema, // Fallback for unknown event types
]);

// ============================================================================
// API Response Validation
// ============================================================================

/**
 * Generic API response wrapper schema
 */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }).optional(),
});

/**
 * User data response schema
 */
export const UserResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    id: z.string(),
    email: z.string().email(),
    username: z.string().optional(),
    avatar_url: z.string().url().optional(),
    company_id: z.string().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    metadata: z.any().optional(),
  }).optional(),
});

/**
 * Membership data response schema
 */
export const MembershipResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    id: z.string(),
    user_id: z.string(),
    company_id: z.string().optional(),
    plan_id: z.string(),
    status: z.enum(['active', 'inactive', 'cancelled', 'expired']),
    current_period_start: z.string().datetime(),
    current_period_end: z.string().datetime().optional(),
    cancel_at_period_end: z.boolean().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    metadata: z.any().optional(),
  }).optional(),
});

/**
 * Payment data response schema
 */
export const PaymentResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    id: z.string(),
    amount: z.number().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    status: z.enum(['succeeded', 'pending', 'failed', 'cancelled']),
    membership_id: z.string().optional(),
    user_id: z.string(),
    company_id: z.string().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    payment_method: z.object({
      type: z.string(),
      id: z.string().optional(),
    }).optional(),
    metadata: z.any().optional(),
  }).optional(),
});

/**
 * Company data response schema
 */
export const CompanyResponseSchema = ApiResponseSchema.extend({
  data: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    logo_url: z.string().url().optional(),
    website_url: z.string().url().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    metadata: z.any().optional(),
  }).optional(),
});

// ============================================================================
// User Data Validation
// ============================================================================

/**
 * User profile data schema
 */
export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  avatar_url: z.string().url().optional(),
  company_id: z.string().optional(),
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.any().optional(),
});

/**
 * Membership data schema
 */
export const MembershipSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  company_id: z.string().optional(),
  plan_id: z.string(),
  status: z.enum(['active', 'inactive', 'cancelled', 'expired']),
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime().optional(),
  cancel_at_period_end: z.boolean().default(false),
  cancelled_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.any().optional(),
});

/**
 * Payment data schema
 */
export const PaymentSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['succeeded', 'pending', 'failed', 'cancelled']),
  membership_id: z.string().optional(),
  user_id: z.string(),
  company_id: z.string().optional(),
  payment_method_type: z.string(),
  payment_method_id: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.any().optional(),
});

/**
 * Company data schema
 */
export const CompanySchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(1000).optional(),
  logo_url: z.string().url().optional(),
  website_url: z.string().url().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.any().optional(),
});

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate webhook payload with structured error reporting
 */
export function validateWebhookPayload(payload: unknown): ValidationResult<z.infer<typeof WhopWebhookSchema>> {
  try {
    const result = WhopWebhookSchema.safeParse(payload);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      const errors: ValidationError[] = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
        value: issue.path.length > 0 ? getNestedValue(payload, issue.path as (string | number)[]) : payload,
      }));
      return { success: false, errors };
    }
  } catch (error) {
    return {
      success: false,
      errors: [{
        field: 'payload',
        message: 'Validation failed with exception',
        code: 'VALIDATION_EXCEPTION',
        value: payload,
      }],
    };
  }
}

/**
 * Validate API response with structured error reporting
 */
export function validateApiResponse<T>(
  response: unknown,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  try {
    const result = schema.safeParse(response);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      const errors: ValidationError[] = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
        value: issue.path.length > 0 ? getNestedValue(response, issue.path as (string | number)[]) : response,
      }));
      return { success: false, errors };
    }
  } catch (error) {
    return {
      success: false,
      errors: [{
        field: 'response',
        message: 'Validation failed with exception',
        code: 'VALIDATION_EXCEPTION',
        value: response,
      }],
    };
  }
}

/**
 * Validate user data with structured error reporting
 */
export function validateUserData(data: unknown): ValidationResult<z.infer<typeof UserProfileSchema>> {
  return validateApiResponse(data, UserProfileSchema);
}

/**
 * Validate membership data with structured error reporting
 */
export function validateMembershipData(data: unknown): ValidationResult<z.infer<typeof MembershipSchema>> {
  return validateApiResponse(data, MembershipSchema);
}

/**
 * Validate payment data with structured error reporting
 */
export function validatePaymentData(data: unknown): ValidationResult<z.infer<typeof PaymentSchema>> {
  return validateApiResponse(data, PaymentSchema);
}

/**
 * Validate company data with structured error reporting
 */
export function validateCompanyData(data: unknown): ValidationResult<z.infer<typeof CompanySchema>> {
  return validateApiResponse(data, CompanySchema);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get nested value from object using path array
 */
function getNestedValue(obj: any, path: (string | number)[]): any {
  try {
    let current = obj;
    for (const key of path) {
      if (current && typeof current === 'object') {
        current = current[key];
      } else {
        return undefined;
      }
    }
    return current;
  } catch {
    return undefined;
  }
}

/**
 * Format validation errors for logging
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(err => `${err.field}: ${err.message}`).join('; ');
}

// ============================================================================
// Type Exports
// ============================================================================

export type WhopWebhookPayload = z.infer<typeof WhopWebhookSchema>;
export type PaymentSucceededWebhook = z.infer<typeof PaymentSucceededWebhookSchema>;
export type MembershipCreatedWebhook = z.infer<typeof MembershipCreatedWebhookSchema>;
export type MembershipUpdatedWebhook = z.infer<typeof MembershipUpdatedWebhookSchema>;
export type UserCreatedWebhook = z.infer<typeof UserCreatedWebhookSchema>;

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Membership = z.infer<typeof MembershipSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type Company = z.infer<typeof CompanySchema>;
