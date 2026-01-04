/**
 * Tier configuration for ChurnSaver monetization
 * Per churn-saver-monetization-spec-final.md
 */

export const TIER_LIMITS = {
  free: {
    recoveriesPerMonth: 3,
    customTemplates: false,
    maxTemplatesPerChannel: 0,
    basicAnalytics: false,
    csvExport: false,
    prioritySupport: false,
  },
  pro: {
    recoveriesPerMonth: 100,
    customTemplates: true,
    maxTemplatesPerChannel: 5,
    basicAnalytics: true,
    csvExport: true,
    prioritySupport: false,
  },
  max: {
    recoveriesPerMonth: Infinity,
    customTemplates: true,
    maxTemplatesPerChannel: 10,
    basicAnalytics: true,
    csvExport: true,
    prioritySupport: true,
  },
} as const;

export const TIER_PRICING = {
  free: {
    monthly: 0,
    annual: 0,
  },
  pro: {
    monthly: 4900, // cents ($49)
    annual: 47000, // cents (20% off = $470)
  },
  max: {
    monthly: 9900, // cents ($99)
    annual: 95000, // cents (20% off = $950)
  },
} as const;

export const ANALYTICS_RETENTION_DAYS = 365;

export type TierName = keyof typeof TIER_LIMITS;
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled';

export interface TierFeatures {
  recoveriesPerMonth: number;
  customTemplates: boolean;
  maxTemplatesPerChannel: number;
  basicAnalytics: boolean;
  csvExport: boolean;
  prioritySupport: boolean;
}

/**
 * Get tier limits for a given tier name
 */
export function getTierFeatures(tier: TierName): TierFeatures {
  return TIER_LIMITS[tier];
}

/**
 * Get pricing for a tier and billing interval
 */
export function getTierPrice(tier: TierName, interval: BillingInterval): number {
  return TIER_PRICING[tier][interval];
}

/**
 * Check if a tier has a specific feature
 */
export function tierHasFeature(tier: TierName, feature: keyof TierFeatures): boolean {
  const features = TIER_LIMITS[tier];
  const value = features[feature];

  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  return false;
}

/**
 * Check if recovery limit is reached for a tier
 */
export function isRecoveryLimitReached(tier: TierName, currentCount: number): boolean {
  const limit = TIER_LIMITS[tier].recoveriesPerMonth;
  if (limit === Infinity) {
    return false;
  }
  return currentCount >= limit;
}

/**
 * Get remaining recoveries for a tier
 */
export function getRemainingRecoveries(tier: TierName, currentCount: number): number {
  const limit = TIER_LIMITS[tier].recoveriesPerMonth;
  if (limit === Infinity) {
    return Infinity;
  }
  return Math.max(0, limit - currentCount);
}

/**
 * Environment variable keys for Whop product IDs
 */
export const WHOP_PRODUCT_ENV_KEYS = {
  free: 'WHOP_PRODUCT_ID_FREE',
  pro_monthly: 'WHOP_PRODUCT_ID_PRO_MONTHLY',
  pro_annual: 'WHOP_PRODUCT_ID_PRO_ANNUAL',
  max_monthly: 'WHOP_PRODUCT_ID_MAX_MONTHLY',
  max_annual: 'WHOP_PRODUCT_ID_MAX_ANNUAL',
} as const;

/**
 * Map a Whop product ID to tier and billing interval
 */
export function mapWhopProductToTier(productId: string): { tier: TierName; interval: BillingInterval } | null {
  const productIdFree = process.env.WHOP_PRODUCT_ID_FREE;
  const productIdProMonthly = process.env.WHOP_PRODUCT_ID_PRO_MONTHLY;
  const productIdProAnnual = process.env.WHOP_PRODUCT_ID_PRO_ANNUAL;
  const productIdMaxMonthly = process.env.WHOP_PRODUCT_ID_MAX_MONTHLY;
  const productIdMaxAnnual = process.env.WHOP_PRODUCT_ID_MAX_ANNUAL;

  if (productId === productIdFree) {
    return { tier: 'free', interval: 'monthly' };
  }
  if (productId === productIdProMonthly) {
    return { tier: 'pro', interval: 'monthly' };
  }
  if (productId === productIdProAnnual) {
    return { tier: 'pro', interval: 'annual' };
  }
  if (productId === productIdMaxMonthly) {
    return { tier: 'max', interval: 'monthly' };
  }
  if (productId === productIdMaxAnnual) {
    return { tier: 'max', interval: 'annual' };
  }

  return null;
}
