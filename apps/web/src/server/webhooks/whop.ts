// Whop webhook handler with signature validation and event upsert
// Enhanced with security monitoring and intrusion detection

import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { initDb, sql } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { processWebhookEvent, ProcessedEvent } from '@/server/services/eventProcessor';
import { getWebhookCompanyContext } from '@/lib/auth/whop-sdk';
import { jobQueue } from '@/server/services/jobQueue';
import { encryptWebhookPayload, deriveMinimalPayload } from '@/lib/encryption';
import { securityMonitor } from '@/lib/security-monitoring';

export interface WhopWebhookPayload {
  id?: string; // whop_event_id (may be in id or whop_event_id)
  whop_event_id?: string; // alternative field name
  type: string;
  data: Record<string, unknown>;
  created_at?: string;
}

/**
 * Timing-safe hex string comparison using crypto.timingSafeEqual
 */
export function timingSafeEqual(a: string, b: string): boolean {
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
    return nodeTimingSafeEqual(aBuf, bBuf);
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
      signatureValid = timingSafeEqual(expectedSignature, provided);
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
        signatureFormat: signatureHeader ? signatureHeader.substring(0, 20) + '...' : 'missing'
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
function validateTimestamp(timestampHeader?: string | null): { valid: boolean; error?: string } {
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
    if (skewSec > env.WEBHOOK_TIMESTAMP_SKEW_SECONDS) {
      return {
        valid: false,
        error: `Webhook timestamp outside allowed window: ${skewSec}s > ${env.WEBHOOK_TIMESTAMP_SKEW_SECONDS}s`
      };
    }
  }

  return { valid: true };
}

/**
 * Upsert webhook event to database with privacy-focused payload storage
 * Sets occurred_at from payload.created_at or current time, immutable on conflict.
 * Stores minimal payload in payload_min, encrypts full payload if ENCRYPTION_KEY set.
 */
async function upsertWebhookEvent(payload: WhopWebhookPayload, eventTime: Date, companyId?: string): Promise<void> {
  try {
    const eventId = payload.id || payload.whop_event_id!;

    // Extract occurred_at from payload.created_at if present, else use current time
    const occurredAt = payload.created_at ? new Date(payload.created_at) : new Date();

    // Derive minimal payload for privacy
    const payloadMin = deriveMinimalPayload(payload as unknown as Record<string, unknown>);

    // Encrypt full payload if encryption key is available
    const payloadEncrypted = encryptWebhookPayload(payload as unknown as Record<string, unknown>, env.ENCRYPTION_KEY);

    await sql.execute(`
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
        occurred_at,
        received_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW(), $7, $8, false, $9, NOW()
      )
      ON CONFLICT (whop_event_id) DO NOTHING
    `, [
      eventId,
      payload.type,
      extractMembershipId(payload),
      null, // Set plaintext payload to null for privacy
      JSON.stringify(payloadMin),
      payloadEncrypted,
      eventTime,
      companyId || null,
      occurredAt
    ]);

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

// Main webhook handler
export async function handleWhopWebhook(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  let lastEventId = 'unknown';

  try {
    // Initialize database connection if needed
    await initDb();

    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('x-whop-signature') || request.headers.get('X-Whop-Signature');
    const timestamp = request.headers.get('x-whop-timestamp') || request.headers.get('X-Whop-Timestamp');

    // Verify signature
    if (!signature) {
      logger.warn('Webhook received without signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    if (!verifyWebhookSignature(body, signature, env.WHOP_WEBHOOK_SECRET, timestamp)) {
      const clientIP = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent')?.substring(0, 200) || 'unknown';

      logger.webhook('failed', {
        eventId: 'unknown',
        eventType: 'unknown',
        error: 'Invalid signature',
        error_category: 'authentication'
      });

      // Report to security monitoring
      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'high',
        type: 'webhook_signature_invalid',
        description: 'Invalid webhook signature detected',
        ip: clientIP,
        userAgent,
        endpoint: '/api/webhooks/whop',
        metadata: {
          signatureLength: signature?.length || 0,
          hasTimestamp: !!timestamp,
          bodyLength: body.length
        }
      });

      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    let payload: WhopWebhookPayload | null = null;
    try {
      payload = JSON.parse(body) as WhopWebhookPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to parse webhook payload', {
        error: errorMessage,
        error_category: 'parsing',
        bodyLength: body.length
      });
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate required fields (accept both id and whop_event_id)
    const eventId: string = (payload.id || payload.whop_event_id)!;
    lastEventId = eventId;
    if (!eventId || !payload.type) {
      const clientIP = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';

      logger.warn('Webhook payload missing required fields', {
        hasId: !!eventId,
        hasType: !!payload.type,
        payloadKeys: payload ? Object.keys(payload) : 'null',
        error_category: 'validation'
      });

      // Report to security monitoring
      await securityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'medium',
        type: 'webhook_payload_invalid',
        description: 'Webhook payload missing required fields',
        ip: clientIP,
        endpoint: '/api/webhooks/whop',
        metadata: {
          hasId: !!eventId,
          hasType: !!payload.type,
          payloadKeys: payload ? Object.keys(payload) : [],
          eventType: payload.type || 'unknown'
        }
      });

      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract event time (use created_at or current time)
    const eventTime = payload.created_at ? new Date(payload.created_at) : new Date();

    // Derive company context from webhook headers
    const companyId = getWebhookCompanyContext(Object.fromEntries(request.headers.entries()));

    // Log successful webhook receipt
    logger.webhook('received', {
      eventId,
      eventType: payload.type,
      membershipId: extractMembershipId(payload),
      companyId,
      success: true
    });

    // Upsert event (idempotent)
    await upsertWebhookEvent(payload, eventTime, companyId);

    // Enqueue event processing job (don't block the webhook response)
    setImmediate(async () => {
      try {
        // Initialize job queue if needed
        await jobQueue.init();

        // Enqueue webhook processing job with retry policies
        const jobData = {
          eventId: eventId,
          eventType: payload.type,
          membershipId: extractMembershipId(payload),
          payload: JSON.stringify(payload),
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
      }
    });

    // Log processing time
    const processingTime = Date.now() - startTime;
    logger.info('Webhook processed successfully', {
      eventId,
      type: payload.type,
      processingTimeMs: processingTime
    });

    // Report successful processing to security monitoring
    await securityMonitor.processSecurityEvent({
      category: 'authentication',
      severity: 'info',
      type: 'webhook_processed_successfully',
      description: `Webhook processed successfully: ${payload.type}`,
      endpoint: '/api/webhooks/whop',
      metadata: {
        eventId,
        eventType: payload.type,
        processingTimeMs: processingTime,
        companyId
      }
    });

    // Quick response (< 1s requirement)
    if (processingTime > 1000) {
      logger.warn('Webhook processing exceeded 1s', { processingTime });
      
      // Report performance issue to security monitoring
      await securityMonitor.processSecurityEvent({
        category: 'anomaly',
        severity: 'low',
        type: 'webhook_performance_issue',
        description: `Webhook processing exceeded 1s: ${processingTime}ms`,
        endpoint: '/api/webhooks/whop',
        metadata: {
          eventId,
          processingTimeMs: processingTime,
          threshold: 1000
        }
      });
    }

    return NextResponse.json({ success: true, eventId }, { status: 200 });

  } catch (error) {
    const eventId = lastEventId;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCategory = error instanceof Error && error.name ? error.name : 'unknown';
    const clientIP = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
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

    // Still return success to avoid webhook retries for transient errors
    // The event was logged to database, can be processed asynchronously
    return NextResponse.json(
      { error: 'Internal processing error', eventLogged: true },
      { status: 200 }
    );
  }
}
