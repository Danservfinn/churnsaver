/**
 * Subscription management service
 * Handles tier management, usage tracking, and limit enforcement
 * Per churn-saver-monetization-spec-final.md
 */

import { PoolClient } from 'pg';
import { sqlWithRLS as sql } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import {
  TIER_LIMITS,
  TierName,
  BillingInterval,
  SubscriptionStatus as TierSubscriptionStatus,
  mapWhopProductToTier,
} from '@/lib/tiers';

// Re-export types for external use
export type { TierName, BillingInterval };
export type SubscriptionTier = TierName;

export interface CompanySubscription {
  company_id: string;
  tier: TierName;
  status: TierSubscriptionStatus;
  billing_interval: BillingInterval;
  whop_membership_id: string | null;
  whop_product_id: string | null;
  recoveries_this_period: number;
  period_reset_at: Date;
  current_period_start: Date | null;
  current_period_end: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionStatusResponse {
  tier: TierName;
  status: TierSubscriptionStatus;
  billingInterval: BillingInterval;
  recoveriesUsed: number;
  recoveriesLimit: number;
  recoveriesRemaining: number;
  canProcessRecovery: boolean;
  periodResetsAt: Date;
  features: {
    customTemplates: boolean;
    maxTemplatesPerChannel: number;
    basicAnalytics: boolean;
    csvExport: boolean;
    prioritySupport: boolean;
  };
}

export interface RecoveryAllowance {
  allowed: boolean;
  reason?: 'LIMIT_REACHED' | 'SUBSCRIPTION_INACTIVE';
  subscription: SubscriptionStatusResponse;
}

// Legacy interface for backward compatibility during migration
export interface TierLimits {
  tier: TierName;
  max_recoveries_per_month: number | null;
  price_cents: number;
  name: string;
  has_analytics: boolean;
  has_custom_templates: boolean;
  has_csv_export: boolean;
}

/**
 * Get the next month start date
 */
function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Ensure company exists in companies table before subscription operations
 * Required because company_subscriptions has FK to companies
 */
async function ensureCompanyExists(companyId: string): Promise<void> {
  const rows = await sql.select<{ id: string }>(
    'SELECT id FROM companies WHERE id = $1',
    [companyId],
    { skipRLS: true, enforceCompanyContext: false }
  );

  if (rows.length === 0) {
    logger.info('Auto-creating company record for subscription', { companyId });
    await sql.execute(
      `INSERT INTO companies (id, name, whop_company_id, created_at, updated_at)
       VALUES ($1, $2, $1, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [companyId, `Whop Company ${companyId.slice(-8)}`],
      { skipRLS: true, enforceCompanyContext: false }
    );
  }
}

/**
 * Ensure a subscription record exists for a company (creates free tier if not)
 */
async function ensureSubscriptionExists(companyId: string): Promise<void> {
  // First ensure the company exists (FK constraint)
  await ensureCompanyExists(companyId);

  const nextReset = getNextMonthStart();

  // Skip RLS for initial subscription creation - this is an upsert that
  // ensures a record exists, similar to how company records are auto-created
  await sql.execute(
    `INSERT INTO company_subscriptions (
       company_id, tier, status, billing_interval,
       recoveries_this_period, period_reset_at,
       current_period_start, current_period_end
     ) VALUES ($1, 'free', 'active', 'monthly', 0, $2, $3, $2)
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId, nextReset.toISOString(), new Date().toISOString()],
    { skipRLS: true, enforceCompanyContext: false }
  );
}

/**
 * Check and reset period usage if needed
 */
async function checkAndResetPeriod(
  subscription: CompanySubscription
): Promise<CompanySubscription> {
  const now = new Date();
  const resetAt = new Date(subscription.period_reset_at);

  if (now >= resetAt) {
    const nextReset = getNextMonthStart();

    await sql.execute(
      `UPDATE company_subscriptions
       SET recoveries_this_period = 0,
           period_reset_at = $2,
           current_period_start = $3,
           current_period_end = $2,
           updated_at = now()
       WHERE company_id = $1`,
      [subscription.company_id, nextReset.toISOString(), now.toISOString()],
      { companyId: subscription.company_id, enforceCompanyContext: true }
    );

    logger.info('Period usage reset', {
      companyId: subscription.company_id,
      previousCount: subscription.recoveries_this_period,
      nextReset,
    });

    return {
      ...subscription,
      recoveries_this_period: 0,
      period_reset_at: nextReset,
      current_period_start: now,
      current_period_end: nextReset,
    };
  }

  return subscription;
}

/**
 * Build subscription status response from raw subscription
 */
function buildStatusResponse(subscription: CompanySubscription): SubscriptionStatusResponse {
  const limits = TIER_LIMITS[subscription.tier];
  const remaining =
    limits.recoveriesPerMonth === Infinity
      ? Infinity
      : Math.max(0, limits.recoveriesPerMonth - subscription.recoveries_this_period);

  const canProcess =
    subscription.status === 'active' &&
    (limits.recoveriesPerMonth === Infinity ||
      subscription.recoveries_this_period < limits.recoveriesPerMonth);

  return {
    tier: subscription.tier,
    status: subscription.status,
    billingInterval: subscription.billing_interval,
    recoveriesUsed: subscription.recoveries_this_period,
    recoveriesLimit: limits.recoveriesPerMonth,
    recoveriesRemaining: remaining,
    canProcessRecovery: canProcess,
    periodResetsAt: subscription.period_reset_at,
    features: {
      customTemplates: limits.customTemplates,
      maxTemplatesPerChannel: limits.maxTemplatesPerChannel,
      basicAnalytics: limits.basicAnalytics,
      csvExport: limits.csvExport,
      prioritySupport: limits.prioritySupport,
    },
  };
}

/**
 * Get subscription status for a company
 */
export async function getSubscriptionStatus(
  companyId: string
): Promise<SubscriptionStatusResponse> {
  await ensureSubscriptionExists(companyId);

  // Pass companyId explicitly to set RLS context properly
  // enforceCompanyContext: false skips validation since companyId is already authenticated from Whop
  const rows = await sql.select<CompanySubscription>(
    `SELECT company_id, tier, status, billing_interval, whop_membership_id,
            recoveries_this_period, period_reset_at,
            current_period_start, current_period_end,
            created_at, updated_at
     FROM company_subscriptions
     WHERE company_id = $1`,
    [companyId],
    { companyId, enforceCompanyContext: false }
  );

  if (!rows.length) {
    // This shouldn't happen after ensureSubscriptionExists, but handle defensively
    const nextReset = getNextMonthStart();
    return buildStatusResponse({
      company_id: companyId,
      tier: 'free',
      status: 'active',
      billing_interval: 'monthly',
      whop_membership_id: null,
      whop_product_id: null,
      recoveries_this_period: 0,
      period_reset_at: nextReset,
      current_period_start: new Date(),
      current_period_end: nextReset,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  const subscription = await checkAndResetPeriod(rows[0]);
  return buildStatusResponse(subscription);
}

/**
 * Get raw subscription record (for internal use)
 */
export async function getCompanySubscription(
  companyId: string
): Promise<CompanySubscription | null> {
  await ensureSubscriptionExists(companyId);

  // Pass companyId explicitly to set RLS context properly
  const rows = await sql.select<CompanySubscription>(
    `SELECT company_id, tier, status, billing_interval, whop_membership_id,
            recoveries_this_period, period_reset_at,
            current_period_start, current_period_end,
            created_at, updated_at
     FROM company_subscriptions
     WHERE company_id = $1`,
    [companyId],
    { companyId, enforceCompanyContext: false }
  );

  if (!rows.length) return null;

  return checkAndResetPeriod(rows[0]);
}

/**
 * Increment recovery count - returns false if limit reached (HARD BLOCK)
 * Must be called BEFORE creating a recovery case
 */
export async function incrementRecoveryCount(companyId: string): Promise<boolean> {
  const status = await getSubscriptionStatus(companyId);

  if (!status.canProcessRecovery) {
    logger.warn('Recovery blocked - limit reached or subscription inactive', {
      companyId,
      tier: status.tier,
      used: status.recoveriesUsed,
      limit: status.recoveriesLimit,
      status: status.status,
    });
    return false;
  }

  // Upsert to handle companies without subscription record
  await sql.execute(
    `INSERT INTO company_subscriptions (company_id, recoveries_this_period, updated_at)
     VALUES ($1, 1, now())
     ON CONFLICT (company_id) DO UPDATE SET
       recoveries_this_period = company_subscriptions.recoveries_this_period + 1,
       updated_at = now()`,
    [companyId],
    { companyId, enforceCompanyContext: true }
  );

  logger.info('Recovery count incremented', {
    companyId,
    newCount: status.recoveriesUsed + 1,
    limit: status.recoveriesLimit,
  });

  return true;
}

/**
 * Increment recovery count within a transaction
 * Used for atomic updates when creating recovery cases
 */
export async function incrementRecoveryCountWithClient(
  client: PoolClient,
  companyId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // Ensure subscription row exists
  await client.query(
    `INSERT INTO company_subscriptions (company_id, tier, status, recoveries_this_period, period_reset_at)
     VALUES ($1, 'free', 'active', 0, date_trunc('month', now() + interval '1 month'))
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId]
  );

  // Lock subscription row for update
  const subResult = await client.query<{
    tier: TierName;
    status: TierSubscriptionStatus;
    recoveries_this_period: number;
    period_reset_at: Date;
  }>(
    `SELECT tier, status, recoveries_this_period, period_reset_at
     FROM company_subscriptions
     WHERE company_id = $1
     FOR UPDATE`,
    [companyId]
  );

  const subscription = subResult.rows[0];
  if (!subscription) {
    throw new Error('Unable to load subscription inside transaction');
  }

  // Check period reset
  const now = new Date();
  const resetAt = new Date(subscription.period_reset_at);
  let currentCount = subscription.recoveries_this_period;

  if (now >= resetAt) {
    // Reset the period
    await client.query(
      `UPDATE company_subscriptions
       SET recoveries_this_period = 0,
           period_reset_at = date_trunc('month', now() + interval '1 month'),
           updated_at = now()
       WHERE company_id = $1`,
      [companyId]
    );
    currentCount = 0;
  }

  // Check limits
  const limits = TIER_LIMITS[subscription.tier];

  if (subscription.status !== 'active') {
    return { allowed: false, reason: 'SUBSCRIPTION_INACTIVE' };
  }

  if (
    limits.recoveriesPerMonth !== Infinity &&
    currentCount >= limits.recoveriesPerMonth
  ) {
    return { allowed: false, reason: 'LIMIT_REACHED' };
  }

  // Increment counter
  await client.query(
    `UPDATE company_subscriptions
     SET recoveries_this_period = recoveries_this_period + 1,
         updated_at = now()
     WHERE company_id = $1`,
    [companyId]
  );

  logger.info('Recovery count incremented within transaction', {
    companyId,
    newCount: currentCount + 1,
    limit: limits.recoveriesPerMonth,
  });

  return { allowed: true };
}

/**
 * Create or update subscription from Whop webhook
 */
export async function upsertSubscription(
  companyId: string,
  whopMembershipId: string,
  whopProductId: string,
  status: TierSubscriptionStatus
): Promise<void> {
  const tierInfo = mapWhopProductToTier(whopProductId);
  const tier = tierInfo?.tier ?? 'free';
  const interval = tierInfo?.interval ?? 'monthly';

  const nextReset = getNextMonthStart();

  await sql.execute(
    `INSERT INTO company_subscriptions (
       company_id, whop_membership_id, whop_product_id,
       tier, status, billing_interval,
       recoveries_this_period, period_reset_at,
       current_period_start, current_period_end,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, now(), $7, now())
     ON CONFLICT (company_id) DO UPDATE SET
       whop_membership_id = EXCLUDED.whop_membership_id,
       whop_product_id = EXCLUDED.whop_product_id,
       tier = EXCLUDED.tier,
       status = EXCLUDED.status,
       billing_interval = EXCLUDED.billing_interval,
       updated_at = now()`,
    [companyId, whopMembershipId, whopProductId, tier, status, interval, nextReset.toISOString()],
    { companyId, enforceCompanyContext: true }
  );

  logger.info('Subscription upserted', {
    companyId,
    tier,
    status,
    interval,
    whopMembershipId,
    whopProductId,
  });
}

/**
 * Update subscription status only (for payment events)
 */
export async function updateSubscriptionStatus(
  companyId: string,
  status: TierSubscriptionStatus
): Promise<void> {
  await sql.execute(
    `UPDATE company_subscriptions
     SET status = $2, updated_at = now()
     WHERE company_id = $1`,
    [companyId, status],
    { companyId, enforceCompanyContext: true }
  );

  logger.info('Subscription status updated', { companyId, status });
}

/**
 * Check if a recovery would be allowed (without incrementing)
 */
export async function checkRecoveryAllowed(companyId: string): Promise<RecoveryAllowance> {
  const status = await getSubscriptionStatus(companyId);

  if (status.status !== 'active') {
    return {
      allowed: false,
      reason: 'SUBSCRIPTION_INACTIVE',
      subscription: status,
    };
  }

  if (!status.canProcessRecovery) {
    return {
      allowed: false,
      reason: 'LIMIT_REACHED',
      subscription: status,
    };
  }

  return {
    allowed: true,
    subscription: status,
  };
}

/**
 * Get tier limits from database (legacy compatibility)
 */
export async function getTierLimits(tier: TierName): Promise<TierLimits> {
  const rows = await sql.select<TierLimits>(
    `SELECT tier, max_recoveries_per_month, price_cents, name,
            has_analytics, has_custom_templates, has_csv_export
     FROM tier_limits
     WHERE tier = $1`,
    [tier],
    { skipRLS: true, enforceCompanyContext: false }
  );

  if (!rows.length) {
    // Fallback to hardcoded values if DB doesn't have it
    const limits = TIER_LIMITS[tier];
    return {
      tier,
      max_recoveries_per_month:
        limits.recoveriesPerMonth === Infinity ? null : limits.recoveriesPerMonth,
      price_cents: 0, // Would need to get from TIER_PRICING
      name: tier.charAt(0).toUpperCase() + tier.slice(1),
      has_analytics: limits.basicAnalytics,
      has_custom_templates: limits.customTemplates,
      has_csv_export: limits.csvExport,
    };
  }

  return rows[0];
}

/**
 * Legacy: Record recovery usage (backward compatibility)
 * @deprecated Use incrementRecoveryCount instead
 */
export async function recordRecovery(
  companyId: string,
  _amountCents: number
): Promise<void> {
  await incrementRecoveryCount(companyId);
}

/**
 * Legacy: Record recovery within transaction (backward compatibility)
 * @deprecated Use incrementRecoveryCountWithClient instead
 */
export async function recordRecoveryWithClient(
  client: PoolClient,
  companyId: string,
  _amountCents: number
): Promise<{ allowed: boolean; reason?: string }> {
  return incrementRecoveryCountWithClient(client, companyId);
}

/**
 * Reset monthly usage for a company (admin function)
 */
export async function resetMonthlyUsage(companyId: string): Promise<void> {
  const nextReset = getNextMonthStart();

  await sql.execute(
    `UPDATE company_subscriptions
     SET recoveries_this_period = 0,
         period_reset_at = $2,
         current_period_start = now(),
         current_period_end = $2,
         updated_at = now()
     WHERE company_id = $1`,
    [companyId, nextReset.toISOString()],
    { companyId, enforceCompanyContext: true }
  );

  logger.info('Monthly usage reset', { companyId, nextReset });
}

/**
 * Get all companies that need period reset (for cron job)
 */
export async function getCompaniesNeedingPeriodReset(): Promise<string[]> {
  const rows = await sql.select<{ company_id: string }>(
    `SELECT company_id
     FROM company_subscriptions
     WHERE period_reset_at <= now()`,
    [],
    { skipRLS: true, enforceCompanyContext: false }
  );

  return rows.map((r) => r.company_id);
}

/**
 * Batch reset periods for multiple companies
 */
export async function batchResetPeriods(companyIds: string[]): Promise<number> {
  if (companyIds.length === 0) return 0;

  const nextReset = getNextMonthStart();

  const result = await sql.execute(
    `UPDATE company_subscriptions
     SET recoveries_this_period = 0,
         period_reset_at = $1,
         current_period_start = now(),
         current_period_end = $1,
         updated_at = now()
     WHERE company_id = ANY($2)`,
    [nextReset.toISOString(), companyIds],
    { skipRLS: true, enforceCompanyContext: false }
  );

  logger.info('Batch period reset completed', {
    count: result.rowCount,
    nextReset,
  });

  return result.rowCount;
}
