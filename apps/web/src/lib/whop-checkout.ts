/**
 * Whop Checkout URL utilities
 * Generates checkout URLs for tier upgrades
 *
 * NOTE: Whop checkout URLs use PLAN IDs (plan_xxx), not product IDs (prod_xxx)
 */

import { TierName, BillingInterval } from './tiers';

/**
 * Get Whop checkout URL for a specific tier and billing interval
 * Server-side only - uses non-public env vars
 *
 * Environment variables should contain plan IDs (e.g., plan_nu3yWd2kUX1PV)
 */
export function getWhopCheckoutUrl(tier: TierName, interval: BillingInterval): string | null {
  if (tier === 'free') return null; // Free tier doesn't need checkout

  // Plan IDs from Whop dashboard (Checkout links section)
  const planIds: Record<string, string | undefined> = {
    pro_monthly: process.env.WHOP_PLAN_ID_PRO_MONTHLY,
    pro_annual: process.env.WHOP_PLAN_ID_PRO_ANNUAL,
    max_monthly: process.env.WHOP_PLAN_ID_MAX_MONTHLY,
    max_annual: process.env.WHOP_PLAN_ID_MAX_ANNUAL,
  };

  const planId = planIds[`${tier}_${interval}`];
  if (!planId) return null;

  return `https://whop.com/checkout/${planId}/`;
}

/**
 * Get all checkout URLs for pricing page
 * Returns an object with URLs for each paid tier/interval combination
 */
export function getAllCheckoutUrls(): {
  pro_monthly: string | null;
  pro_annual: string | null;
  max_monthly: string | null;
  max_annual: string | null;
} {
  return {
    pro_monthly: getWhopCheckoutUrl('pro', 'monthly'),
    pro_annual: getWhopCheckoutUrl('pro', 'annual'),
    max_monthly: getWhopCheckoutUrl('max', 'monthly'),
    max_annual: getWhopCheckoutUrl('max', 'annual'),
  };
}

export type CheckoutUrls = ReturnType<typeof getAllCheckoutUrls>;
