// Whop webhook handler with signature validation and event upsert
// Enhanced with security monitoring and intrusion detection

import { createHash, createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS, sqlWithRLS } from '@/lib/db-rls';
import { env, additionalEnv, isProductionLikeEnvironment } from '@/lib/env';
import { logger } from '@/lib/logger';
import { WebhookPayloadSchema, validateAndTransform } from '@/lib/validation';
import { processWebhookEvent, ProcessedEvent } from '@/server/services/eventProcessor';
import { whopsdk, getWebhookCompanyContext } from '@/lib/whop-sdk';
import { jobQueue } from '@/server/services/jobQueue';
import { encryptWebhookPayload, deriveMinimalPayload } from '@/lib/whop/dataTransformers';
import { securityMonitor } from '@/lib/security-monitoring';
import {
  errorHandler,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  createDatabaseError,
  createExternalApiError,
  createBusinessLogicError,
  AppError
} from '@/lib/errorHandler';

export interface WhopWebhookPayload {
  id?: string; // whop_event_id (may be in id or whop_event_id)
  whop_event_id?: string; // alternative field name
  type: string;
  data: Record<string, unknown> | any; // Allow for SDK-specific data types
  created_at?: string;
  [key: string]: any; // Allow for additional properties from SDK
}


function normalizeWhopEventType(eventType: string): string {
  const map: Record<string, string> = {
    'payment.failed': 'payment_failed',
    'payment.succeeded': 'payment_succeeded',
    'membership.went_valid': 'membership_went_valid',
    'membership.went_invalid': 'membership_went_invalid',
    'membership.activated': 'membership_activated',
    'membership.deactivated': 'membership_deactivated'
  };

  if (!eventType) return eventType;
  if (map[eventType]) return map[eventType];
  return eventType.replace(/\./g, '_');
}

/**
 * Timing-safe hex string comparison using crypto.timingSafeEqual
 */
/**
 * Timing-safe hex string comparison using crypto.timingSafeEqual
 * Import from webhookValidator to ensure consistency
 */
import { timingSafeEqualHex } from '@/lib/whop/webhookValidator';

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

function advisoryLockKey(companyId: string, eventId: string): bigint {
  const hex = createHash('sha256').update(`${companyId}:${eventId}`).digest('hex').slice(0, 16);
  return BigInt('0x' + hex);
}

// Verify HMAC signature from Whop webhook with strict replay protection and timing-safe comparison
export function verifyWebhookSignature(
  body: string,
  signatureHeader: string,
  secret: string,
  timestampHeader?: string | null
): boolean {
  // Initialize all validation results to prevent timing attacks
  let isValid = true;
  const validationErrors: string[] = [];

  try {
    // Validate timestamp first (but don't return early)
    const timestampValidation = validateTimestamp(timestampHeader);
    if (!timestampValidation.valid) {
      isValid = false;
      validationErrors.push(timestampValidation.error || 'Invalid timestamp');
    }

    // Log security warnings from timestamp validation
    if (timestampValidation.warning) {
      logger.warn('Webhook timestamp security warning', {
        warning: timestampValidation.warning,
        timestamp: timestampHeader,
        error_category: 'security'
      });
    }

    // Parse signature header
    const provided = parseSignatureHeader(signatureHeader);
    if (!provided) {
      isValid = false;
      validationErrors.push('Unsupported signature format');
    }

    // Always compute expected signature to prevent timing attacks
    const expectedSignature = createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');

    // Perform timing-safe comparison if we have a valid signature
    let signatureValid = false;
    if (provided) {
      signatureValid = timingSafeEqualHex(expectedSignature, provided);
    }

    if (!signatureValid) {
      isValid = false;
      validationErrors.push('Signature verification failed');
    }

    // Log all validation errors if any occurred
    if (!isValid) {
      logger.warn('Webhook signature verification failed', {
        errors: validationErrors,
        hasTimestamp: !!timestampHeader,
        signatureFormat: signatureHeader ? signatureHeader.substring(0, 20) + '...' : 'missing',
        signatureLength: signatureHeader ? signatureHeader.length : 0,
        bodyLength: body.length,
        timestampValue: timestampHeader || 'missing',
        validationTime: Date.now()
      });
    }

    return isValid;
  } catch (error) {
    logger.error('Signature verification failed with exception', {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Separate timestamp validation to prevent timing attacks in main function
function validateTimestamp(timestampHeader?: string | null): { valid: boolean; error?: string; warning?: string } {
  // Require X-Whop-Timestamp in production-like environments
  if (isProductionLikeEnvironment() && !timestampHeader) {
    return { valid: false, error: 'Missing X-Whop-Timestamp header in production-like environment' };
  }

  // Enforce replay protection if timestamp present
  if (timestampHeader) {
    const ts = Number(timestampHeader);
    if (!Number.isFinite(ts) || ts < 0) {
      return { valid: false, error: 'Invalid X-Whop-Timestamp header: malformed timestamp' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const skewSec = Math.abs(nowSec - ts);

    if (skewSec > additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS) {
      return {
        valid: false,
        error: `Webhook timestamp outside allowed window: ${skewSec}s > ${additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS}s`
      };
    }

    // Log security warnings for timestamps close to expiration
    const warningThreshold = Math.floor(additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS * 0.8);
    if (skewSec > warningThreshold) {
      const warning = `Webhook timestamp approaching expiration: ${skewSec}s skew, allowed ${additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS}s`;
      logger.warn('Webhook timestamp nearing expiration threshold', {
        timestamp: timestampHeader,
        skewSeconds: skewSec,
        allowedSkewSeconds: additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS,
        warningThreshold,
        error_category: 'security'
      });
      return { valid: true, warning };
    }
  }

  return { valid: true };
}


/**
 * Upsert webhook event to database with privacy-focused payload storage
 * Sets occurred_at from payload.created_at or current time, immutable on conflict.
 * Stores minimal payload in payload_min, encrypts full payload if ENCRYPTION_KEY set.
 */
async function upsertWebhookEvent(
  payload: WhopWebhookPayload,
  eventTime: Date,
  companyId: string,
  client?: { query: (text: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  try {
    const eventId = payload.id || payload.whop_event_id!;

    // Extract occurred_at from payload.created_at if present, else use current time
    const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();

    // Derive minimal payload for privacy
    const payloadMin = deriveMinimalPayload(payload as unknown as Record<string, unknown>);
    const payloadForStorage = JSON.stringify(payloadMin);

    // Encrypt full payload if encryption key is available
    const payloadEncrypted = await encryptWebhookPayload(payload as unknown as Record<string, unknown>);

    const resolvedCompanyId = companyId;
    const insertQuery = `
      INSERT INTO events (
        whop_event_id,
        type,
        membership_id,
        payload,
        payload_min,
        payload_encrypted,
        processed_at,
        created_at,
        company_id,
        processed,
        company_resolution_status,
        occurred_at,
        received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), $7, $8, false, 'resolved', $9, NOW()
      )
      ON CONFLICT (company_id, whop_event_id) DO NOTHING
    `;
    const params = [
      eventId,
      payload.type,
      extractMembershipId(payload),
      payloadForStorage,
      JSON.stringify(payloadMin),
      payloadEncrypted,
      eventTime,
      resolvedCompanyId,
      occurredAt
    ];

    if (client) {
      await client.query(insertQuery, params);
    } else {
      await sqlWithRLS.execute(insertQuery, params, {
        companyId: resolvedCompanyId || undefined,
        enforceCompanyContext: true
      });
    }

    logger.info('Webhook event upserted with privacy', {
      eventId,
      type: payload.type,
      membershipId: extractMembershipId(payload),
      occurredAt: occurredAt.toISOString(),
      hasEncryptedPayload: !!payloadEncrypted
    });

  } catch (error) {
    logger.error('Failed to upsert webhook event', {
      eventId: payload.id || payload.whop_event_id,
    });
    throw error;
  }
}

// Extract membership ID from webhook payload
function extractMembershipId(payload: WhopWebhookPayload): string {
  // Try different possible locations for membership ID
  const data = payload.data;

  if (typeof data.membership_id === 'string') return data.membership_id;
  if (data.membership && typeof (data.membership as { id: string }).id === 'string') return (data.membership as { id: string }).id;
  if (typeof data.id === 'string' && payload.type.includes('membership')) return data.id;

  // Fallback - some events might not have membership IDs
  return 'unknown';
}

/**
 * Lightweight logger for payment_succeeded webhooks.
 * All recovery attribution happens asynchronously via job queue; this avoids double-processing.
 */
async function logPaymentSucceededWebhook(data: any) {
  const membershipId =
    data?.membership_id ||
    data?.membership?.id ||
    data?.membership?.membership_id ||
    'unknown';
  const paymentKeys = data?.payment ? Object.keys(data.payment) : [];
  logger.info('Payment succeeded webhook received (logging only)', {
    membershipId,
    paymentKeys,
    dataKeys: data ? Object.keys(data) : []
  });
  return { processed: true };
}

// Main webhook handler
// Accepts body and headers directly to avoid consuming request body twice
export async function handleWhopWebhook(
  body: string,
  headers: Headers | { get: (key: string) => string | null }
): Promise<NextResponse> {
  const startTime = Date.now();

  let lastEventId = 'unknown';

  try {
    // Initialize database connection if needed
    await initDbWithRLS();

    // Get headers for signature verification
    const signature = headers.get('x-whop-signature') || headers.get('X-Whop-Signature');
    const timestamp = headers.get('x-whop-timestamp') || headers.get('X-Whop-Timestamp');

    // Validate signature manually first (don't trust @whop/api for signature validation)
    if (!signature) {
      logger.warn('Missing webhook signature', {
        error_category: 'authentication',
        hasTimestamp: !!timestamp,
        bodyLength: body.length
      });

      const clientIP = headers.get('x-forwarded-for') ||
                        headers.get('x-real-ip') ||
                        'unknown';

      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'high',
        type: 'webhook_signature_missing',
        description: 'Webhook signature header missing',
        ip: clientIP,
        endpoint: '/api/webhooks/whop',
        metadata: {
          hasTimestamp: !!timestamp,
          bodyLength: body.length
        }
      });

      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // Verify signature manually
    const webhookSecret = env.WHOP_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error('WHOP_WEBHOOK_SECRET not configured', {
        error_category: 'configuration'
      });
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const isValidSignature = verifyWebhookSignature(body, signature, webhookSecret, timestamp);
    if (!isValidSignature) {
      logger.warn('Webhook signature verification failed', {
        error_category: 'authentication',
        signatureLength: signature.length,
        hasTimestamp: !!timestamp,
        bodyLength: body.length
      });

      const clientIP = headers.get('x-forwarded-for') ||
                        headers.get('x-real-ip') ||
                        'unknown';

      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'high',
        type: 'webhook_signature_invalid',
        description: 'Webhook signature verification failed',
        ip: clientIP,
        endpoint: '/api/webhooks/whop',
        metadata: {
          signatureLength: signature.length,
          hasTimestamp: !!timestamp,
          bodyLength: body.length
        }
      });

      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse the JSON payload
    let payload: WhopWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      logger.warn('Invalid JSON in webhook payload', {
        error: error instanceof Error ? error.message : String(error),
        error_category: 'validation'
      });

      const clientIP = headers.get('x-forwarded-for') ||
                        headers.get('x-real-ip') ||
                        'unknown';

      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'medium',
        type: 'webhook_payload_invalid_json',
        description: 'Webhook payload contains invalid JSON',
        ip: clientIP,
        endpoint: '/api/webhooks/whop',
        metadata: {
          bodyLength: body.length,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    // Validate webhook payload using Zod schema
    const validation = validateAndTransform(WebhookPayloadSchema, payload);
    if (!validation.success) {
      const clientIP = headers.get('x-forwarded-for') ||
                       headers.get('x-real-ip') ||
                       'unknown';

      logger.warn('Webhook payload validation failed', {
        error: validation.error,
        payloadKeys: payload ? Object.keys(payload) : [],
        error_category: 'validation'
      });

      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'medium',
        type: 'webhook_payload_invalid',
        description: `Webhook payload validation failed: ${validation.error}`,
        ip: clientIP,
        endpoint: '/api/webhooks/whop',
        metadata: {
          payloadKeys: payload ? Object.keys(payload) : [],
          error: validation.error
        }
      });

      return NextResponse.json({ error: `Invalid payload: ${validation.error}` }, { status: 400 });
    }

    const validated = validation.data;
    const normalizedType = normalizeWhopEventType(validated.type);
    const normalizedPayload: WhopWebhookPayload = {
      ...validated,
      // ensure data is always present to satisfy WhopWebhookPayload requirements
      data: validated.data ?? {},
      type: normalizedType
    };

    const eventId: string = (validated.id || validated.whop_event_id)!;
    lastEventId = eventId;

    // Extract event time (use created_at or current time)
    const eventTime = payload.created_at ? new Date(payload.created_at) : new Date();

    // Derive company context from webhook headers
    const headersObj: Record<string, string> = {};
    // Headers might be a Headers object or a simple object with get method
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        headersObj[key] = value;
      });
    } else {
      // For objects with get method, extract known headers
      const knownHeaders = ['x-whop-company-id', 'x-whop-signature', 'x-whop-timestamp', 'x-whop-event-type'];
      for (const key of knownHeaders) {
        const value = headers.get(key);
        if (value) headersObj[key] = value;
      }
    }
    const companyId = getWebhookCompanyContext(headersObj, payload);

    // Reject early if company context cannot be resolved
    if (!companyId) {
      logger.warn('Webhook rejected - unable to resolve company context', {
        eventId,
        eventType: payload.type,
        membershipId: extractMembershipId(payload)
      });

      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'medium',
        type: 'webhook_company_unresolvable',
        description: 'Webhook rejected - company context could not be resolved',
        endpoint: '/api/webhooks/whop',
        metadata: {
          eventId,
          eventType: payload.type,
          membershipId: extractMembershipId(payload)
        }
      });

      return NextResponse.json(
        { error: 'Unable to resolve company context from webhook payload' },
        { status: 400 }
      );
    }

    // Log successful webhook receipt (companyId guaranteed)
    logger.webhook('received', {
      eventId,
      eventType: normalizedType,
      membershipId: extractMembershipId(payload),
      companyId,
      success: true
    });

    // Idempotent upsert with advisory lock to prevent races
    const lockKey = advisoryLockKey(companyId, eventId);
    const upsertResult = await sqlWithRLS.transaction(
      async (client) => {
        await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        const existing = await client.query<{ id: string }>(
          `SELECT id FROM events WHERE whop_event_id = $1 AND company_id = $2`,
          [eventId, companyId]
        );

        if ((existing.rowCount ?? 0) > 0) {
          return { alreadyProcessed: true as const };
        }

        await upsertWebhookEvent(normalizedPayload, eventTime, companyId, client);
        return { alreadyProcessed: false as const };
      },
      {
        companyId: companyId,
        enforceCompanyContext: true
      }
    );

    if (upsertResult.alreadyProcessed) {
      logger.info('Webhook event already processed, returning OK', {
        eventId,
        eventType: payload.type
      });
      return NextResponse.json({ success: true, eventId }, { status: 200 });
    }

    // Handle webhook events based on type
    if (normalizedType === "payment_succeeded") {
      await logPaymentSucceededWebhook(payload.data);
    }

    // Enqueue event processing job (fail fast so Whop retries on errors)
    // Use producer mode - only enqueues jobs, doesn't start worker handlers
    try {
      await jobQueue.initProducer();

      const jobData = {
        eventId: eventId,
        eventType: normalizedType,
        membershipId: extractMembershipId(payload),
        payload: JSON.stringify(normalizedPayload),
        companyId: companyId,
        eventCreatedAt: eventTime.toISOString()
      };

      const jobId = await jobQueue.enqueueWebhookJob(jobData);

      logger.info('Webhook processing job enqueued', {
        eventId,
        jobId,
        eventType: payload.type,
        companyId
      });
    } catch (error) {
      logger.error('Failed to enqueue webhook processing job', {
        eventId,
        error: error instanceof Error ? error.message : String(error)
      });
      return NextResponse.json({ error: 'Failed to enqueue webhook job' }, { status: 500 });
    }

    // Log processing time
    const processingTime = Date.now() - startTime;
    logger.info('Webhook processed successfully', {
      eventId,
      type: payload.type,
      processingTimeMs: processingTime,
      companyId
    });

    // Quick response (< 1s requirement) - log only, don't call security monitor on hot path
    if (processingTime > 1000) {
      logger.warn('Webhook processing exceeded 1s', { 
        processingTime,
        eventId,
        eventType: payload.type,
        companyId
      });
      // Note: Performance issues are logged but not sent to security monitor to avoid DB overhead
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    const eventId = lastEventId;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCategory = error instanceof Error && error.name ? error.name : 'unknown';
    const clientIP = headers.get('x-forwarded-for') ||
                     headers.get('x-real-ip') ||
                     'unknown';

    logger.error('Webhook processing failed', {
      eventId,
      error: errorMessage,
      error_category: errorCategory,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Report processing error to security monitoring
    await securityMonitor.processSecurityEvent({
      category: 'anomaly',
      severity: 'medium',
      type: 'webhook_processing_error',
      description: `Webhook processing failed: ${errorMessage}`,
      ip: clientIP,
      endpoint: '/api/webhooks/whop',
      metadata: {
        eventId,
        error: errorMessage,
        errorCategory,
        processingTimeMs: Date.now() - startTime
      }
    });

    // Return 5xx so Whop retries; avoid silent drops
    return NextResponse.json(
      { error: 'Internal processing error' },
      { status: 500 }
    );
  }
}