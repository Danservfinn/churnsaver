/**
 * Enhanced Webhook Validation Service
 * Provides robust signature validation, event type enforcement, and security features
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { logger } from '@/lib/logger';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { env, additionalEnv } from '@/lib/env';

/**
 * Webhook validation result interface
 */
export interface WebhookValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  eventType?: string;
  eventId?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

/**
 * Webhook signature validation result
 */
export interface SignatureValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  computedSignature?: string;
  providedSignature?: string;
}

/**
 * Event type validation result
 */
export interface EventTypeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  eventType?: string;
  isKnownEvent: boolean;
  schemaCompliant: boolean;
}

/**
 * Supported Whop webhook event types
 */
export const WHOP_WEBHOOK_EVENTS = {
  // Payment events
  'payment.succeeded': 'Payment completed successfully',
  'payment.failed': 'Payment failed',
  'payment.pending': 'Payment is pending',
  'payment.cancelled': 'Payment was cancelled',
  'payment.refunded': 'Payment was refunded',

  // Subscription events
  'subscription.created': 'Subscription was created',
  'subscription.updated': 'Subscription was updated',
  'subscription.cancelled': 'Subscription was cancelled',
  'subscription.expired': 'Subscription expired',
  'subscription.renewed': 'Subscription was renewed',

  // Membership events
  'membership.created': 'Membership was created',
  'membership.updated': 'Membership was updated',
  'membership.deleted': 'Membership was deleted',

  // Product events
  'product.created': 'Product was created',
  'product.updated': 'Product was updated',
  'product.deleted': 'Product was deleted',
} as const;

export type WhopWebhookEventType = keyof typeof WHOP_WEBHOOK_EVENTS;

/**
 * Webhook payload interface
 */
export interface WebhookPayload {
  id?: string;
  whop_event_id?: string;
  type: string;
  data: Record<string, unknown> | any;
  created_at?: string;
  [key: string]: any;
}

/**
 * Timing-safe hex string comparison using crypto.timingSafeEqual
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    // Normalize hex strings: remove 0x prefix, convert to lowercase
    const aHex = a.replace(/^0x/, '').toLowerCase();
    const bHex = b.replace(/^0x/, '').toLowerCase();

    // Validate both are valid hex strings of equal length
    if (aHex.length !== bHex.length ||
        aHex.length === 0 ||
        !/^[0-9a-f]+$/.test(aHex) ||
        !/^[0-9a-f]+$/.test(bHex)) {
      return false;
    }

    // Convert to buffers and compare
    const aBuf = Buffer.from(aHex, 'hex');
    const bBuf = Buffer.from(bHex, 'hex');
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Parse signature header supporting all supported formats:
 * - "sha256=<hex>"
 * - "v1,<hex>"
 * - "<hex>"
 * Rejects unknown formats with clear error.
 */
export function parseSignatureHeader(signatureHeader: string): string | null {
  const s = signatureHeader.trim();

  // Support sha256=<hex> format
  if (s.startsWith('sha256=')) {
    const hexPart = s.substring(7); // Remove 'sha256=' prefix
    if (/^[0-9a-f]+$/i.test(hexPart)) {
      return hexPart;
    }
    return null; // Invalid hex after sha256=
  }

  // Support v1,<hex> format
  const parts = s.split(',');
  if (parts.length === 2 && parts[0].toLowerCase() === 'v1') {
    return parts[1];
  }

  // Support bare <hex> format
  if (/^[0-9a-f]+$/i.test(s)) {
    return s;
  }

  // Reject any other format
  return null;
}

/**
 * Validate webhook signature with timing-safe comparison
 */
export function validateWebhookSignature(
  body: string,
  signatureHeader: string,
  secret: string
): SignatureValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Parse signature header
    const providedSignature = parseSignatureHeader(signatureHeader);
    if (!providedSignature) {
      errors.push('Unsupported signature format');
      return { isValid: false, errors, warnings };
    }

    // Compute expected signature
    const computedSignature = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');

    // Perform timing-safe comparison
    const isValid = timingSafeEqualHex(computedSignature, providedSignature);

    if (!isValid) {
      errors.push('Signature verification failed');
    }

    return {
      isValid,
      errors,
      warnings,
      computedSignature,
      providedSignature
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Signature validation failed: ${errorMessage}`);
    return { isValid: false, errors, warnings };
  }
}

/**
 * Validate timestamp for replay attack protection
 */
export function validateTimestamp(
  timestampHeader?: string | null,
  toleranceSeconds: number = additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS || 300
): { valid: boolean; error?: string; timestamp?: number } {
  // Require X-Whop-Timestamp in production
  if (process.env.NODE_ENV === 'production' && !timestampHeader) {
    return { valid: false, error: 'Missing X-Whop-Timestamp header in production' };
  }

  // Enforce replay protection if timestamp present
  if (timestampHeader) {
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts) || ts < 0) {
      return { valid: false, error: 'Invalid X-Whop-Timestamp header: malformed timestamp' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const skewSec = Math.abs(nowSec - ts);
    if (skewSec > toleranceSeconds) {
      return {
        valid: false,
        error: `Webhook timestamp outside allowed window: ${skewSec}s > ${toleranceSeconds}s`
      };
    }

    return { valid: true, timestamp: ts };
  }

  return { valid: true };
}

/**
 * Validate webhook event type against known Whop events
 */
export function validateEventType(eventType: string): EventTypeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!eventType || typeof eventType !== 'string') {
    errors.push('Event type is required and must be a string');
    return { isValid: false, errors, warnings, eventType, isKnownEvent: false, schemaCompliant: false };
  }

  const isKnownEvent = eventType in WHOP_WEBHOOK_EVENTS;
  const schemaCompliant = /^[a-z]+\.[a-z]+$/.test(eventType); // Basic schema validation

  if (!schemaCompliant) {
    errors.push('Event type does not match expected schema (format: resource.action)');
  }

  if (!isKnownEvent) {
    warnings.push(`Unknown event type: ${eventType}. This may be a new event type not yet supported.`);
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    eventType,
    isKnownEvent,
    schemaCompliant
  };
}

/**
 * Validate webhook payload structure and required fields
 */
export function validateWebhookPayload(payload: WebhookPayload): WebhookValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata: Record<string, any> = {};

  // Check required fields
  const eventId = payload.id || payload.whop_event_id;
  if (!eventId) {
    errors.push('Webhook payload missing event ID (id or whop_event_id)');
  } else {
    metadata.eventId = eventId;
  }

  if (!payload.type) {
    errors.push('Webhook payload missing event type');
  } else {
    metadata.eventType = payload.type;
  }

  // Validate event type
  if (payload.type) {
    const eventTypeValidation = validateEventType(payload.type);
    errors.push(...eventTypeValidation.errors);
    warnings.push(...eventTypeValidation.warnings);
    metadata.isKnownEvent = eventTypeValidation.isKnownEvent;
    metadata.schemaCompliant = eventTypeValidation.schemaCompliant;
  }

  // Validate created_at if present
  if (payload.created_at) {
    try {
      const createdAt = new Date(payload.created_at);
      if (isNaN(createdAt.getTime())) {
        errors.push('Invalid created_at timestamp format');
      } else {
        metadata.createdAt = createdAt.toISOString();
      }
    } catch {
      errors.push('Invalid created_at timestamp');
    }
  }

  // Check data field presence
  if (!payload.data || typeof payload.data !== 'object') {
    warnings.push('Webhook payload data field is missing or invalid');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    eventType: payload.type,
    eventId,
    metadata
  };
}

/**
 * Enhanced webhook validation service class
 */
export class WebhookValidator {
  private config: WhopSdkConfig;

  constructor(config?: WhopSdkConfig) {
    this.config = config || whopConfig.get();
  }

  /**
   * Comprehensive webhook validation
   */
  async validateWebhook(
    body: string,
    signatureHeader: string,
    timestampHeader?: string | null,
    payload?: WebhookPayload
  ): Promise<WebhookValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: Record<string, any> = {};

    try {
      // Get webhook secret from config
      const webhookSecret = this.config.webhookSecret;
      if (!webhookSecret) {
        errors.push('Webhook secret not configured');
        return { isValid: false, errors, warnings, metadata };
      }

      // Validate timestamp (replay attack protection)
      const timestampValidation = validateTimestamp(timestampHeader);
      if (!timestampValidation.valid) {
        errors.push(timestampValidation.error || 'Invalid timestamp');
      } else if (timestampValidation.timestamp) {
        metadata.timestamp = timestampValidation.timestamp;
      }

      // Validate signature
      const signatureValidation = validateWebhookSignature(body, signatureHeader, webhookSecret);
      errors.push(...signatureValidation.errors);
      warnings.push(...signatureValidation.warnings);

      if (signatureValidation.computedSignature) {
        metadata.computedSignature = signatureValidation.computedSignature;
      }
      if (signatureValidation.providedSignature) {
        metadata.providedSignature = signatureValidation.providedSignature;
      }

      // Validate payload if provided
      let payloadValidation: WebhookValidationResult | undefined;
      if (payload) {
        payloadValidation = validateWebhookPayload(payload);
        errors.push(...payloadValidation.errors);
        warnings.push(...payloadValidation.warnings);

        if (payloadValidation.eventType) {
          metadata.eventType = payloadValidation.eventType;
        }
        if (payloadValidation.eventId) {
          metadata.eventId = payloadValidation.eventId;
        }

        // Merge payload metadata
        Object.assign(metadata, payloadValidation.metadata);
      }

      const isValid = errors.length === 0;

      // Log validation result
      const logLevel = isValid ? 'info' : 'warn';
      logger[logLevel]('Webhook validation completed', {
        isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
        eventType: metadata.eventType,
        eventId: metadata.eventId,
        hasTimestamp: !!timestampHeader,
        validationTimeMs: Date.now() - startTime,
        ...metadata
      });

      return {
        isValid,
        errors,
        warnings,
        eventType: metadata.eventType,
        eventId: metadata.eventId,
        timestamp: metadata.timestamp,
        metadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Webhook validation failed: ${errorMessage}`);

      logger.error('Webhook validation exception', {
        error: errorMessage,
        validationTimeMs: Date.now() - startTime
      });

      return {
        isValid: false,
        errors,
        warnings,
        metadata
      };
    }
  }

  /**
   * Validate signature only
   */
  validateSignature(
    body: string,
    signatureHeader: string
  ): SignatureValidationResult {
    const webhookSecret = this.config.webhookSecret;
    if (!webhookSecret) {
      return {
        isValid: false,
        errors: ['Webhook secret not configured'],
        warnings: []
      };
    }

    return validateWebhookSignature(body, signatureHeader, webhookSecret);
  }

  /**
   * Validate event type only
   */
  validateEventTypeOnly(eventType: string): EventTypeValidationResult {
    return validateEventType(eventType);
  }

  /**
   * Get supported event types
   */
  getSupportedEvents(): Record<string, string> {
    return { ...WHOP_WEBHOOK_EVENTS };
  }

  /**
   * Check if event type is supported
   */
  isEventSupported(eventType: string): boolean {
    return eventType in WHOP_WEBHOOK_EVENTS;
  }
}

/**
 * Default webhook validator instance
 */
export const webhookValidator = new WebhookValidator();