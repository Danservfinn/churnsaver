/**
 * Subscription webhook handler for ChurnSaver's own subscription events
 * Handles tier changes, cancellations, and payment failures for the app itself
 * Per churn-saver-monetization-spec-final.md
 */

import { logger } from '@/lib/logger';
import { mapWhopProductToTier } from '@/lib/tiers';
import {
  upsertSubscription,
  updateSubscriptionStatus,
} from '@/server/services/subscriptions';

/**
 * Check if a membership event is for ChurnSaver's own subscription products
 * (not a customer's membership in a creator's product)
 */
export function isChurnSaverSubscriptionEvent(productId: string | undefined): boolean {
  if (!productId) return false;

  const churnSaverProductIds = [
    process.env.WHOP_PRODUCT_ID_FREE,
    process.env.WHOP_PRODUCT_ID_PRO_MONTHLY,
    process.env.WHOP_PRODUCT_ID_PRO_ANNUAL,
    process.env.WHOP_PRODUCT_ID_MAX_MONTHLY,
    process.env.WHOP_PRODUCT_ID_MAX_ANNUAL,
  ].filter(Boolean);

  return churnSaverProductIds.includes(productId);
}

/**
 * Extract company_id from membership webhook data
 * For ChurnSaver subscriptions, the company_id might be in different fields
 */
function extractCompanyId(data: Record<string, unknown>): string | null {
  // Whop membership events may have company_id at different locations
  // Check common patterns
  if (typeof data.company_id === 'string') {
    return data.company_id;
  }
  if (typeof data.user_id === 'string') {
    // For ChurnSaver's own subscriptions, user_id is the company installing the app
    return data.user_id;
  }
  if (data.membership && typeof (data.membership as Record<string, unknown>).company_id === 'string') {
    return (data.membership as Record<string, unknown>).company_id as string;
  }
  return null;
}

interface MembershipEventData {
  id: string; // membership_id
  product_id?: string;
  user_id?: string;
  company_id?: string;
  status?: string;
  plan_id?: string;
}

/**
 * Process membership.went_valid event - subscription activated
 */
export async function handleMembershipValid(
  eventId: string,
  data: MembershipEventData,
  companyId: string
): Promise<void> {
  logger.info('Processing ChurnSaver subscription activation', {
    eventId,
    membershipId: data.id,
    productId: data.product_id,
    companyId,
  });

  if (!data.product_id) {
    logger.warn('No product_id in membership.went_valid event', { eventId });
    return;
  }

  await upsertSubscription(
    companyId,
    data.id,
    data.product_id,
    'active'
  );

  logger.info('ChurnSaver subscription activated', {
    companyId,
    tier: mapWhopProductToTier(data.product_id)?.tier,
  });
}

/**
 * Process membership.went_invalid event - subscription deactivated/cancelled
 */
export async function handleMembershipInvalid(
  eventId: string,
  data: MembershipEventData,
  companyId: string
): Promise<void> {
  logger.info('Processing ChurnSaver subscription cancellation', {
    eventId,
    membershipId: data.id,
    productId: data.product_id,
    companyId,
  });

  if (data.product_id) {
    // Full upsert if we have product info
    await upsertSubscription(
      companyId,
      data.id,
      data.product_id,
      'cancelled'
    );
  } else {
    // Just update status if no product info
    await updateSubscriptionStatus(companyId, 'cancelled');
  }

  logger.info('ChurnSaver subscription cancelled', { companyId });
}

/**
 * Process membership.updated event - plan change or billing update
 */
export async function handleMembershipUpdated(
  eventId: string,
  data: MembershipEventData,
  companyId: string
): Promise<void> {
  logger.info('Processing ChurnSaver subscription update', {
    eventId,
    membershipId: data.id,
    productId: data.product_id,
    companyId,
  });

  if (!data.product_id) {
    logger.warn('No product_id in membership.updated event', { eventId });
    return;
  }

  // Determine status from data if available
  const status = data.status === 'canceled' || data.status === 'cancelled'
    ? 'cancelled'
    : 'active';

  await upsertSubscription(
    companyId,
    data.id,
    data.product_id,
    status
  );

  logger.info('ChurnSaver subscription updated', {
    companyId,
    newTier: mapWhopProductToTier(data.product_id)?.tier,
  });
}

/**
 * Process payment.failed event for ChurnSaver's own subscription
 */
export async function handleChurnSaverPaymentFailed(
  eventId: string,
  membershipId: string,
  companyId: string
): Promise<void> {
  logger.info('Processing ChurnSaver payment failure', {
    eventId,
    membershipId,
    companyId,
  });

  await updateSubscriptionStatus(companyId, 'past_due');

  logger.warn('ChurnSaver subscription marked as past_due', { companyId });
}

/**
 * Process payment.succeeded event for ChurnSaver's own subscription
 * Restores active status if previously past_due
 */
export async function handleChurnSaverPaymentSucceeded(
  eventId: string,
  membershipId: string,
  companyId: string
): Promise<void> {
  logger.info('Processing ChurnSaver payment success', {
    eventId,
    membershipId,
    companyId,
  });

  await updateSubscriptionStatus(companyId, 'active');

  logger.info('ChurnSaver subscription restored to active', { companyId });
}

/**
 * Main handler for ChurnSaver subscription webhooks
 * Called from eventProcessor when a ChurnSaver product event is detected
 */
export async function handleChurnSaverSubscriptionEvent(
  eventType: string,
  eventId: string,
  data: Record<string, unknown>,
  providedCompanyId?: string
): Promise<{ processed: boolean; message: string }> {
  try {
    const companyId = providedCompanyId || extractCompanyId(data);

    if (!companyId) {
      logger.warn('Could not determine company_id for ChurnSaver subscription event', {
        eventId,
        eventType,
      });
      return { processed: false, message: 'missing_company_id' };
    }

    const membershipData: MembershipEventData = {
      id: (data.id as string) || (data.membership_id as string) || '',
      product_id: data.product_id as string | undefined,
      user_id: data.user_id as string | undefined,
      company_id: companyId,
      status: data.status as string | undefined,
    };

    // Handle nested data structures
    if (data.membership && typeof data.membership === 'object') {
      const nested = data.membership as Record<string, unknown>;
      membershipData.id = membershipData.id || (nested.id as string);
      membershipData.product_id = membershipData.product_id || (nested.product_id as string);
    }

    switch (eventType) {
      case 'membership_went_valid':
      case 'membership.went_valid':
      case 'membership_activated':
      case 'membership.activated':
        await handleMembershipValid(eventId, membershipData, companyId);
        return { processed: true, message: 'subscription_activated' };

      case 'membership_went_invalid':
      case 'membership.went_invalid':
      case 'membership_deactivated':
      case 'membership.deactivated':
        await handleMembershipInvalid(eventId, membershipData, companyId);
        return { processed: true, message: 'subscription_deactivated' };

      case 'membership_updated':
      case 'membership.updated':
        await handleMembershipUpdated(eventId, membershipData, companyId);
        return { processed: true, message: 'subscription_updated' };

      case 'payment_failed':
      case 'payment.failed':
        await handleChurnSaverPaymentFailed(eventId, membershipData.id, companyId);
        return { processed: true, message: 'payment_failed_handled' };

      case 'payment_succeeded':
      case 'payment.succeeded':
        await handleChurnSaverPaymentSucceeded(eventId, membershipData.id, companyId);
        return { processed: true, message: 'payment_succeeded_handled' };

      default:
        logger.debug('Unhandled ChurnSaver subscription event type', {
          eventType,
          eventId,
        });
        return { processed: false, message: 'unhandled_event_type' };
    }
  } catch (error) {
    logger.error('Failed to handle ChurnSaver subscription event', {
      eventType,
      eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
