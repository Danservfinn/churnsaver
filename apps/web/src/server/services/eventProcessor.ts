// Event processor service
// Processes stored webhook events and creates recovery cases

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  processPaymentFailedEvent,
  PaymentFailedEvent,
  processPaymentSucceededEvent,
  PaymentSucceededEvent,
  processMembershipValidEvent,
  MembershipValidEvent,
  processMembershipInvalidEvent,
  MembershipInvalidEvent
} from './cases';

export interface ProcessedEvent {
  id: string;
  whop_event_id: string;
  type: string;
  membership_id: string;
  payload: unknown;
  processed_at: Date;
  event_created_at: Date;
  processed_successfully?: boolean;
  processing_error?: string;
}

// Extract PaymentFailedEvent from webhook payload
function extractPaymentFailedEvent(event: ProcessedEvent): PaymentFailedEvent | null {
  try {
    if (event.type !== 'payment_failed') {
      return null;
    }

    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload;

    if (!payload || !payload.data) {
      logger.warn('Invalid payment_failed payload structure', { eventId: event.whop_event_id });
      return null;
    }

    const data = payload.data;

    // Extract user info from various possible locations
    const userId = data.membership?.user_id || data.user_id || 'unknown';
    const reason = data.payment?.failure_reason || data.reason || 'payment_failed';
    const amount = data.payment?.amount || data.amount;
    const currency = data.payment?.currency || data.currency || 'usd';

    return {
      eventId: event.whop_event_id,
      membershipId: event.membership_id,
      userId,
      reason,
      amount: typeof amount === 'number' ? amount : undefined,
      currency
    };

  } catch (error) {
    logger.error('Failed to extract payment failed event', {
      eventId: event.whop_event_id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// ISO currency minor units mapping (number of decimal places)
// Based on ISO 4217 standard
const CURRENCY_MINOR_UNITS: Record<string, number> = {
  // Zero decimal currencies (whole units only)
  'BIF': 0, 'BYR': 0, 'CLF': 0, 'CLP': 0, 'CVE': 0, 'DJF': 0, 'GNF': 0,
  'ISK': 0, 'JPY': 0, 'KMF': 0, 'KRW': 0, 'MGA': 0, 'PYG': 0, 'RWF': 0,
  'UGX': 0, 'UYI': 0, 'VND': 0, 'VUV': 0, 'XAF': 0, 'XOF': 0, 'XPF': 0,

  // Three decimal currencies
  'BHD': 3, 'IQD': 3, 'JOD': 3, 'KWD': 3, 'LYD': 3, 'OMR': 3, 'TND': 3,

  // Two decimal currencies (most common, including USD, EUR)
  'AED': 2, 'AFN': 2, 'ALL': 2, 'AMD': 2, 'ANG': 2, 'AOA': 2, 'ARS': 2,
  'AUD': 2, 'AWG': 2, 'AZN': 2, 'BAM': 2, 'BBD': 2, 'BDT': 2, 'BGN': 2,
  'BMD': 2, 'BND': 2, 'BOB': 2, 'BRL': 2, 'BSD': 2, 'BTN': 2, 'BWP': 2,
  'BYN': 2, 'BZD': 2, 'CAD': 2, 'CDF': 2, 'CHF': 2, 'CNY': 2, 'COP': 2,
  'CRC': 2, 'CUC': 2, 'CUP': 2, 'CZK': 2, 'DKK': 2, 'DOP': 2, 'DZD': 2,
  'EGP': 2, 'ERN': 2, 'ETB': 2, 'EUR': 2, 'FJD': 2, 'FKP': 2, 'GBP': 2,
  'GEL': 2, 'GGP': 2, 'GHS': 2, 'GIP': 2, 'GMD': 2, 'GTQ': 2, 'GYD': 2,
  'HKD': 2, 'HNL': 2, 'HRK': 2, 'HTG': 2, 'HUF': 2, 'IDR': 2, 'ILS': 2,
  'IMP': 2, 'INR': 2, 'IRR': 2, 'JEP': 2, 'KES': 2, 'KGS': 2, 'KHR': 2,
  'KID': 2, 'KPW': 2, 'KYD': 2, 'KZT': 2, 'LAK': 2, 'LBP': 2,
  'LKR': 2, 'LRD': 2, 'LSL': 2, 'MAD': 2, 'MDL': 2, 'MKD': 2,
  'MMK': 2, 'MNT': 2, 'MOP': 2, 'MRU': 2, 'MUR': 2, 'MVR': 2, 'MWK': 2,
  'MXN': 2, 'MYR': 2, 'MZN': 2, 'NAD': 2, 'NGN': 2, 'NIO': 2, 'NOK': 2,
  'NPR': 2, 'NZD': 2, 'PAB': 2, 'PEN': 2, 'PGK': 2, 'PHP': 2, 'PKR': 2,
  'PLN': 2, 'PRB': 2, 'QAR': 2, 'RON': 2, 'RSD': 2, 'RUB': 2, 'SAR': 2,
  'SBD': 2, 'SCR': 2, 'SDG': 2, 'SEK': 2, 'SGD': 2, 'SHP': 2, 'SLL': 2,
  'SOS': 2, 'SRD': 2, 'SSP': 2, 'STN': 2, 'SVC': 2, 'SYP': 2, 'SZL': 2,
  'THB': 2, 'TJS': 2, 'TMT': 2, 'TOP': 2, 'TRY': 2, 'TTD': 2, 'TWD': 2,
  'TZS': 2, 'UAH': 2, 'USD': 2, 'UYU': 2, 'UZS': 2, 'VES': 2, 'WST': 2,
  'XCD': 2, 'YER': 2, 'ZAR': 2, 'ZMW': 2, 'ZWL': 2
};

// Get minor units for a currency (default to 2 for unknown currencies)
function getCurrencyMinorUnits(currency: string): number {
  const upperCurrency = currency.toUpperCase();
  return CURRENCY_MINOR_UNITS[upperCurrency] ?? 2; // Default to 2 decimal places
}

// Normalize amount to dollars using ISO currency minor units
function normalizeAmountToDollars(rawAmount: number, currency: string = 'USD'): number {
  if (typeof rawAmount !== 'number' || isNaN(rawAmount)) {
    throw new Error(`Invalid raw amount: ${rawAmount}`);
  }

  const upperCurrency = currency.toUpperCase();
  const minorUnits = getCurrencyMinorUnits(upperCurrency);

  // Convert from minor units to major units (dollars)
  const normalizedAmount = rawAmount / Math.pow(10, minorUnits);

  // Validate reasonable amount range (prevent extreme values)
  if (normalizedAmount < 0) {
    throw new Error(`Negative amount after normalization: ${normalizedAmount}`);
  }
  if (normalizedAmount > 1000000) { // $1M upper bound for sanity
    throw new Error(`Excessive amount after normalization: ${normalizedAmount}`);
  }

  return normalizedAmount;
}

// Extract PaymentSucceededEvent from webhook payload
function extractPaymentSucceededEvent(event: ProcessedEvent): PaymentSucceededEvent | null {
  try {
    if (event.type !== 'payment_succeeded') {
      return null;
    }

    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload;

    if (!payload || !payload.data) {
      logger.warn('Invalid payment_succeeded payload structure', { eventId: event.whop_event_id });
      return null;
    }

    const data = payload.data;

    // Payment succeeded events should have an amount in data.payment.amount
    const rawAmount = data.payment?.amount || data.amount;
    if (typeof rawAmount !== 'number' || rawAmount <= 0) {
      logger.warn('Invalid or missing amount in payment_succeeded event', {
        eventId: event.whop_event_id,
        rawAmount,
        dataKeys: Object.keys(data)
      });
      return null;
    }

    // Extract currency (default to USD for backward compatibility)
    const currency = data.payment?.currency || data.currency || 'USD';
    if (typeof currency !== 'string' || currency.length !== 3) {
      logger.warn('Invalid currency format in payment_succeeded event, defaulting to USD', {
        eventId: event.whop_event_id,
        currency,
        rawAmount
      });
    }

    // Normalize amount to dollars (handle both cents and dollar inputs)
    let normalizedAmount: number;
    try {
      normalizedAmount = normalizeAmountToDollars(rawAmount, currency);
    } catch (error) {
      logger.error('Failed to normalize payment amount', {
        eventId: event.whop_event_id,
        rawAmount,
        currency,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }

    logger.info('Normalized payment amount for recovery attribution', {
      eventId: event.whop_event_id,
      rawAmount,
      currency,
      normalizedAmount,
      minorUnits: getCurrencyMinorUnits(currency),
      conversionFactor: Math.pow(10, getCurrencyMinorUnits(currency))
    });

    return {
      eventId: event.whop_event_id,
      membershipId: event.membership_id,
      userId: data.membership?.user_id || data.user_id || 'unknown',
      amount: normalizedAmount,
      currency: data.payment?.currency || data.currency || 'usd'
    };

  } catch (error) {
    logger.error('Failed to extract payment succeeded event', {
      eventId: event.whop_event_id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Extract MembershipValidEvent from webhook payload
function extractMembershipValidEvent(event: ProcessedEvent): MembershipValidEvent | null {
  try {
    if (event.type !== 'membership_went_valid') {
      return null;
    }

    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload;

    if (!payload || !payload.data) {
      logger.warn('Invalid membership_went_valid payload structure', { eventId: event.whop_event_id });
      return null;
    }

    const data = payload.data;

    return {
      eventId: event.whop_event_id,
      membershipId: event.membership_id,
      userId: data.membership?.user_id || data.user_id || 'unknown'
    };

  } catch (error) {
    logger.error('Failed to extract membership valid event', {
      eventId: event.whop_event_id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Extract MembershipInvalidEvent from webhook payload
function extractMembershipInvalidEvent(event: ProcessedEvent): MembershipInvalidEvent | null {
  try {
    if (event.type !== 'membership_went_invalid') {
      return null;
    }

    const payload = typeof event.payload === 'string'
      ? JSON.parse(event.payload)
      : event.payload;

    if (!payload || !payload.data) {
      logger.warn('Invalid membership_went_invalid payload structure', { eventId: event.whop_event_id });
      return null;
    }

    const data = payload.data;

    return {
      eventId: event.whop_event_id,
      membershipId: event.membership_id,
      userId: data.membership?.user_id || data.user_id || 'unknown'
    };

  } catch (error) {
    logger.error('Failed to extract membership invalid event', {
      eventId: event.whop_event_id,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

// Process a single webhook event
export async function processWebhookEvent(
  event: ProcessedEvent,
  companyId: string
): Promise<boolean> {
  try {
    logger.info('Processing webhook event', {
      eventId: event.whop_event_id,
      type: event.type,
      membershipId: event.membership_id
    });

    // Process payment_failed events
    if (event.type === 'payment_failed') {
      logger.info('Extracting payment failed event data', { eventId: event.whop_event_id });
      const paymentEvent = extractPaymentFailedEvent(event);
      if (!paymentEvent) {
        logger.warn('Could not extract payment failed event data', { eventId: event.whop_event_id });
        return false;
      }

      logger.info('Processing payment failed event', {
        eventId: paymentEvent.eventId,
        membershipId: paymentEvent.membershipId
      });
      const result = await processPaymentFailedEvent(paymentEvent, companyId);
      logger.info('Payment failed event processing result', {
        eventId: paymentEvent.eventId,
        success: result !== null
      });
      return result !== null;
    }

    // Process payment_succeeded events (recovery attribution)
    if (event.type === 'payment_succeeded') {
      logger.info('Extracting payment succeeded event data', { eventId: event.whop_event_id });
      const paymentEvent = extractPaymentSucceededEvent(event);
      if (!paymentEvent) {
        logger.warn('Could not extract payment succeeded event data', { eventId: event.whop_event_id });
        return false;
      }

      logger.info('Processing payment succeeded event', {
        eventId: paymentEvent.eventId,
        membershipId: paymentEvent.membershipId,
        amount: paymentEvent.amount
      });
      const result = await processPaymentSucceededEvent(paymentEvent, event.event_created_at);
      logger.info('Payment succeeded event processing result', {
        eventId: paymentEvent.eventId,
        success: result
      });
      return result;
    }

    // Process membership_went_valid events (recovery attribution)
    if (event.type === 'membership_went_valid') {
      logger.info('Extracting membership valid event data', { eventId: event.whop_event_id });
      const membershipEvent = extractMembershipValidEvent(event);
      if (!membershipEvent) {
        logger.warn('Could not extract membership valid event data', { eventId: event.whop_event_id });
        return false;
      }

      logger.info('Processing membership valid event', {
        eventId: membershipEvent.eventId,
        membershipId: membershipEvent.membershipId
      });
      const result = await processMembershipValidEvent(membershipEvent, event.event_created_at);
      logger.info('Membership valid event processing result', {
        eventId: membershipEvent.eventId,
        success: result
      });
      return result;
    }

    // Process membership_went_invalid events (create recovery case)
    if (event.type === 'membership_went_invalid') {
      logger.info('Extracting membership invalid event data', { eventId: event.whop_event_id });
      const membershipEvent = extractMembershipInvalidEvent(event);
      if (!membershipEvent) {
        logger.warn('Could not extract membership invalid event data', { eventId: event.whop_event_id });
        return false;
      }

      logger.info('Processing membership invalid event', {
        eventId: membershipEvent.eventId,
        membershipId: membershipEvent.membershipId
      });
      const result = await processMembershipInvalidEvent(membershipEvent, companyId);
      logger.info('Membership invalid event processing result', {
        eventId: membershipEvent.eventId,
        success: result
      });
      return result;
    }

    // Skip unsupported event types
    logger.info('Skipping unsupported event type', {
      eventId: event.whop_event_id,
      type: event.type
    });

    return true; // Not an error, just not processed

  } catch (error) {
    logger.error('Failed to process webhook event', {
      eventId: event.whop_event_id,
      type: event.type,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

// Process all unprocessed webhook events
export async function processUnprocessedEvents(companyId: string): Promise<{
  processed: number;
  successful: number;
  failed: number;
}> {
  try {
    logger.info('Starting batch event processing', { companyId });

    // Validate company context is provided for RLS security
    if (!companyId) {
      logger.error('Company context missing from processUnprocessedEvents - cannot proceed with RLS security');
      throw new Error('Company context required for tenant-scoped operations');
    }

    // Get events that haven't been processed yet
    // Company context is required to ensure RLS policies are applied and data isolation is maintained
    // For now, we'll process all events since we don't have a processed flag
    // In production, you'd add a processed_events table or flag
    const events = await sql.select<ProcessedEvent>(
      `SELECT id, whop_event_id, type, membership_id, payload, processed_at, occurred_at AS event_created_at
       FROM events
       WHERE processed = false
         AND company_id = $1
         AND type IN ('payment_failed', 'payment_succeeded', 'membership_went_valid', 'membership_went_invalid')
       ORDER BY received_at ASC`,
      [companyId]
    );

    logger.info('Found events to process', { count: events.length });

    let successful = 0;
    let failed = 0;

    for (const event of events) {
      const success = await processWebhookEvent(event, companyId);
      // Mark processed with success/error
      // Company context is required to ensure RLS policies are applied and data isolation is maintained
      try {
        if (success) {
          // Set processed_at only on successful processing
          await sql.execute(
            `UPDATE events SET processed = $2, processed_at = NOW(), error = NULL WHERE whop_event_id = $1 AND company_id = $2`,
            [event.whop_event_id, success, companyId]
          );
        } else {
          // Keep processed_at null on failure, set error
          await sql.execute(
            `UPDATE events SET processed = $2, error = $3 WHERE whop_event_id = $1 AND company_id = $4`,
            [event.whop_event_id, success, 'processing_failed', companyId]
          );
        }
      } catch (e) {
        logger.error('Failed to update processed flag for event', {
          eventId: event.whop_event_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      if (success) {
        successful++;
      } else {
        failed++;
      }
    }

    logger.info('Completed batch event processing', {
      total: events.length,
      successful,
      failed
    });

    return {
      processed: events.length,
      successful,
      failed
    };

  } catch (error) {
    logger.error('Failed to process unprocessed events', {
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { processed: 0, successful: 0, failed: 0 };
  }
}

// Process a specific event by ID (for manual processing)
export async function processEventById(
  whopEventId: string,
  companyId: string
): Promise<boolean> {
  try {
    // Ensure database is initialized
    const { initDb } = await import('@/lib/db');
    await initDb();

    // Validate company context is provided for RLS security
    if (!companyId) {
      logger.error('Company context missing from processEventById - cannot proceed with RLS security', { whopEventId });
      throw new Error('Company context required for tenant-scoped operations');
    }

    const events = await sql.select<ProcessedEvent>(
      `SELECT id, whop_event_id, type, membership_id, payload, processed_at, occurred_at AS event_created_at
       FROM events
       WHERE whop_event_id = $1 AND company_id = $2`,
      [whopEventId, companyId]
    );

    if (events.length === 0) {
      logger.warn('Event not found', { whopEventId });
      return false;
    }

    return await processWebhookEvent(events[0], companyId);

  } catch (error) {
    logger.error('Failed to process event by ID', {
      whopEventId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
