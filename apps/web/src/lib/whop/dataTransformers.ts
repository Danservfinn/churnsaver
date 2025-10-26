// Data transformation and sanitization utilities for Whop integration
// Provides secure data handling with encryption, sanitization, and transformation utilities

import { encrypt, decrypt } from '../encryption';
import { logger } from '../logger';
import { env } from '../env';

// ============================================================================
// Minimal Payload Extraction
// ============================================================================

/**
 * Derive minimal payload from webhook for privacy-focused storage
 * Extracts only essential fields needed for processing
 */
export function deriveMinimalPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data as Record<string, unknown> || {};
  const membershipId =
    (typeof data.membership_id === 'string' && data.membership_id) ||
    (typeof data.membership === 'object' && data.membership !== null && typeof (data.membership as { id?: string }).id === 'string' && (data.membership as { id: string }).id) ||
    (payload.type && typeof payload.type === 'string' && payload.type.includes('membership') && typeof data.id === 'string' ? data.id : undefined) ||
    'unknown';

  const minimal: Record<string, unknown> = {
    whop_event_id: payload.id || payload.whop_event_id,
    type: payload.type,
    membership_id: membershipId
  };

  if (typeof data.failure_reason === 'string') {
    minimal.failure_reason = data.failure_reason;
  }
  if ((payload.data as { user_id?: string })?.user_id) {
    minimal.user_id = (payload.data as { user_id: string }).user_id;
  }

  return minimal;
}

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Sanitization options for data transformation
 */
export interface SanitizationOptions {
  removeSensitiveFields?: string[];
  maskFields?: string[];
  truncateFields?: Record<string, number>;
  encryptFields?: string[];
}

/**
 * Transformation result
 */
export interface TransformationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

/**
 * Data transformation pipeline configuration
 */
export interface TransformationPipeline {
  sanitization?: SanitizationOptions;
  validation?: boolean;
  encryption?: boolean;
  normalization?: boolean;
}

// ============================================================================
// Data Sanitization Utilities
// ============================================================================

/**
 * Sanitize webhook payload by removing or masking sensitive data
 */
export async function sanitizeWebhookPayload(
  payload: Record<string, any>,
  options: SanitizationOptions = {}
): Promise<Record<string, any>> {
  const sanitized = { ...payload };

  // Remove sensitive fields
  if (options.removeSensitiveFields) {
    options.removeSensitiveFields.forEach(field => {
      removeNestedField(sanitized, field);
    });
  }

  // Mask sensitive fields
  if (options.maskFields) {
    options.maskFields.forEach(field => {
      maskNestedField(sanitized, field);
    });
  }

  // Truncate long fields
  if (options.truncateFields) {
    Object.entries(options.truncateFields).forEach(([field, maxLength]) => {
      truncateNestedField(sanitized, field, maxLength);
    });
  }

  // Encrypt sensitive fields
  if (options.encryptFields && env.ENCRYPTION_KEY) {
    for (const field of options.encryptFields) {
      await encryptNestedField(sanitized, field);
    }
  }

  return sanitized;
}

/**
 * Sanitize user data for storage or transmission
 */
export async function sanitizeUserData(data: Record<string, any>): Promise<Record<string, any>> {
  return await sanitizeWebhookPayload(data, {
    removeSensitiveFields: ['password', 'apiKey', 'secret', 'token'],
    maskFields: ['email', 'phone'],
    truncateFields: {
      description: 1000,
      bio: 500,
    },
    encryptFields: ['ssn', 'taxId', 'bankAccount'],
  });
}

/**
 * Sanitize payment data for logging and storage
 */
export async function sanitizePaymentData(data: Record<string, any>): Promise<Record<string, any>> {
  return await sanitizeWebhookPayload(data, {
    removeSensitiveFields: ['cardNumber', 'cvv', 'pin'],
    maskFields: ['accountNumber', 'routingNumber'],
    encryptFields: ['cardToken', 'paymentMethodId'],
  });
}

// ============================================================================
// Data Transformation Utilities
// ============================================================================

/**
 * Normalize webhook payload data types and formats
 */
export function normalizeWebhookPayload(payload: Record<string, any>): Record<string, any> {
  const normalized = { ...payload };

  // Normalize common fields
  if (normalized.id && typeof normalized.id === 'number') {
    normalized.id = String(normalized.id);
  }

  if (normalized.whop_event_id && typeof normalized.whop_event_id === 'number') {
    normalized.whop_event_id = String(normalized.whop_event_id);
  }

  if (normalized.created_at && typeof normalized.created_at === 'string') {
    normalized.created_at = new Date(normalized.created_at).toISOString();
  }

  // Normalize data object if present
  if (normalized.data && typeof normalized.data === 'object') {
    normalized.data = normalizeDataObject(normalized.data);
  }

  return normalized;
}

/**
 * Normalize data object fields
 */
function normalizeDataObject(data: Record<string, any>): Record<string, any> {
  const normalized = { ...data };

  // Normalize IDs
  ['id', 'user_id', 'company_id', 'membership_id', 'plan_id'].forEach(field => {
    if (normalized[field] && typeof normalized[field] === 'number') {
      normalized[field] = String(normalized[field]);
    }
  });

  // Normalize amounts
  if (normalized.amount && typeof normalized.amount === 'string') {
    const parsed = parseFloat(normalized.amount);
    if (!isNaN(parsed)) {
      normalized.amount = parsed;
    }
  }

  // Normalize dates
  ['created_at', 'updated_at', 'current_period_start', 'current_period_end', 'cancelled_at'].forEach(field => {
    if (normalized[field] && typeof normalized[field] === 'string') {
      const date = new Date(normalized[field]);
      if (!isNaN(date.getTime())) {
        normalized[field] = date.toISOString();
      }
    }
  });

  // Normalize boolean fields
  if (normalized.cancel_at_period_end !== undefined) {
    normalized.cancel_at_period_end = Boolean(normalized.cancel_at_period_end);
  }

  return normalized;
}

/**
 * Transform webhook payload between different formats
 */
export async function transformWebhookPayload(
  payload: Record<string, any>,
  targetFormat: 'database' | 'api' | 'log' = 'database'
): Promise<Record<string, any>> {
  const transformed = { ...payload };

  switch (targetFormat) {
    case 'database':
      // Convert to database format (snake_case, proper types)
      transformed.event_type = transformed.type;
      delete transformed.type;
      break;

    case 'api':
      // Convert to API format (camelCase, serialized)
      if (transformed.created_at) {
        transformed.createdAt = transformed.created_at;
        delete transformed.created_at;
      }
      break;

    case 'log':
      // Convert to log format (sanitized, truncated)
      return await sanitizeWebhookPayload(transformed, {
        truncateFields: {
          'data.metadata': 200,
          'data.description': 100,
        },
        maskFields: ['data.email', 'data.phone'],
      });
  }

  return transformed;
}

/**
 * Transform user data between formats
 */
export function transformUserData(
  data: Record<string, any>,
  targetFormat: 'database' | 'api' | 'profile' = 'database'
): Record<string, any> {
  const transformed = { ...data };

  switch (targetFormat) {
    case 'database':
      // Database format
      transformed.first_name = transformed.firstName;
      transformed.last_name = transformed.lastName;
      delete transformed.firstName;
      delete transformed.lastName;
      break;

    case 'api':
      // API format (camelCase)
      transformed.firstName = transformed.first_name;
      transformed.lastName = transformed.last_name;
      delete transformed.first_name;
      delete transformed.last_name;
      break;

    case 'profile':
      // Profile format (display ready)
      transformed.displayName = [transformed.first_name, transformed.last_name]
        .filter(Boolean)
        .join(' ') || transformed.username;
      break;
  }

  return transformed;
}

// ============================================================================
// Encryption and Decryption Utilities
// ============================================================================

/**
 * Encrypt sensitive fields in webhook payload
 */
export async function encryptWebhookPayload(
  payload: Record<string, any>,
  fields: string[] = ['data.metadata', 'data.payment_method', 'data.user.email']
): Promise<Record<string, any>> {
  const encrypted = { ...payload };

  if (!env.ENCRYPTION_KEY) {
    logger.warn('Encryption key not available, skipping payload encryption');
    return encrypted;
  }

  for (const field of fields) {
    await encryptNestedField(encrypted, field);
  }

  return encrypted;
}

/**
 * Decrypt encrypted fields in webhook payload
 */
export async function decryptWebhookPayload(
  payload: Record<string, any>,
  fields: string[] = ['data.metadata', 'data.payment_method']
): Promise<Record<string, any>> {
  const decrypted = { ...payload };

  if (!env.ENCRYPTION_KEY) {
    logger.warn('Encryption key not available, cannot decrypt payload');
    return decrypted;
  }

  for (const field of fields) {
    await decryptNestedField(decrypted, field);
  }

  return decrypted;
}

/**
 * Encrypt payment data for secure storage
 */
export async function encryptPaymentData(data: Record<string, any>): Promise<Record<string, any>> {
  return encryptWebhookPayload(data, [
    'cardToken',
    'paymentMethodId',
    'billingAddress',
    'customerData',
  ]);
}

/**
 * Decrypt payment data for processing
 */
export async function decryptPaymentData(data: Record<string, any>): Promise<Record<string, any>> {
  return decryptWebhookPayload(data, [
    'cardToken',
    'paymentMethodId',
    'billingAddress',
  ]);
}

// ============================================================================
// Safe Data Access Utilities
// ============================================================================

/**
 * Safely access nested object properties
 */
export function safeGet(obj: any, path: string, defaultValue: any = undefined): any {
  try {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }

    return current !== undefined ? current : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely set nested object properties
 */
export function safeSet(obj: any, path: string, value: any): boolean {
  try {
    const keys = path.split('.');
    const lastKey = keys.pop();
    if (!lastKey) return false;

    let current = obj;
    for (const key of keys) {
      if (current[key] == null || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely access webhook event data
 */
export function getWebhookEventData(webhook: Record<string, any>): Record<string, any> {
  return safeGet(webhook, 'data', {});
}

/**
 * Safely access webhook event type
 */
export function getWebhookEventType(webhook: Record<string, any>): string {
  return safeGet(webhook, 'type', 'unknown');
}

/**
 * Safely access webhook event ID
 */
export function getWebhookEventId(webhook: Record<string, any>): string {
  return safeGet(webhook, 'id') || safeGet(webhook, 'whop_event_id') || 'unknown';
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Remove nested field from object
 */
function removeNestedField(obj: any, path: string): void {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current = obj;
  for (const key of keys) {
    if (current[key] == null || typeof current[key] !== 'object') {
      return;
    }
    current = current[key];
  }

  delete current[lastKey];
}

/**
 * Mask nested field in object
 */
function maskNestedField(obj: any, path: string): void {
  const value = safeGet(obj, path);
  if (typeof value === 'string' && value.length > 4) {
    const masked = '*'.repeat(value.length - 4) + value.slice(-4);
    safeSet(obj, path, masked);
  }
}

/**
 * Truncate nested field in object
 */
function truncateNestedField(obj: any, path: string, maxLength: number): void {
  const value = safeGet(obj, path);
  if (typeof value === 'string' && value.length > maxLength) {
    safeSet(obj, path, value.substring(0, maxLength) + '...');
  }
}

/**
 * Encrypt nested field in object
 */
async function encryptNestedField(obj: any, path: string): Promise<void> {
  const value = safeGet(obj, path);
  if (value != null) {
    try {
      const encrypted = await encrypt(JSON.stringify(value));
      safeSet(obj, path, `encrypted:${encrypted}`);
    } catch (error) {
      logger.error('Failed to encrypt field', { path, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

/**
 * Decrypt nested field in object
 */
async function decryptNestedField(obj: any, path: string): Promise<void> {
  const value = safeGet(obj, path);
  if (typeof value === 'string' && value.startsWith('encrypted:')) {
    try {
      const encryptedData = value.substring('encrypted:'.length);
      const decrypted = await decrypt(encryptedData);
      const parsed = JSON.parse(decrypted);
      safeSet(obj, path, parsed);
    } catch (error) {
      logger.error('Failed to decrypt field', { path, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

// ============================================================================
// Transformation Pipeline
// ============================================================================

/**
 * Apply complete transformation pipeline to webhook payload
 */
export async function applyTransformationPipeline(
  payload: Record<string, any>,
  pipeline: TransformationPipeline
): Promise<TransformationResult<Record<string, any>>> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let transformed = { ...payload };

  try {
    // Apply normalization
    if (pipeline.normalization !== false) {
      transformed = normalizeWebhookPayload(transformed);
    }

    // Apply sanitization
    if (pipeline.sanitization) {
      transformed = await sanitizeWebhookPayload(transformed, pipeline.sanitization);
    }

    // Apply encryption
    if (pipeline.encryption !== false) {
      transformed = await encryptWebhookPayload(transformed);
    }

    // Could add validation here if needed

    return {
      success: true,
      data: transformed,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Transformation failed: ${message}`);

    return {
      success: false,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Create default transformation pipeline for webhook processing
 */
export function createDefaultWebhookPipeline(): TransformationPipeline {
  return {
    sanitization: {
      maskFields: ['data.email', 'data.phone', 'data.accountNumber'],
      truncateFields: {
        'data.description': 1000,
        'data.metadata': 2000,
      },
      encryptFields: ['data.paymentMethod', 'data.billingAddress'],
    },
    validation: true,
    encryption: true,
    normalization: true,
  };
}
