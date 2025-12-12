import { PoolClient } from 'pg';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export type SubscriptionTier = 'free' | 'starter' | 'growth' | 'scale';

export interface CompanySubscription {
  company_id: string;
  tier: SubscriptionTier;
  whop_membership_id: string | null;
  total_recoveries_used: number;
  monthly_recovered_revenue_cents: number;
  month_start_date: string;
}

export interface TierLimits {
  tier: SubscriptionTier;
  max_monthly_recovered_revenue_cents: number | null;
  max_total_recoveries: number | null;
  price_cents: number;
  name: string;
}

export interface RecoveryAllowance {
  allowed: boolean;
  reason?: string;
  subscription: CompanySubscription;
  limits: TierLimits;
}

async function upsertDefaultSubscription(companyId: string): Promise<void> {
  await sql.execute(
    `INSERT INTO company_subscriptions (company_id, tier)
     VALUES ($1, 'free')
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId],
    companyId
  );
}

async function ensureMonth(subscription: CompanySubscription): Promise<CompanySubscription> {
  const start = new Date(subscription.month_start_date);
  const now = new Date();
  if (start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth()) {
    return subscription;
  }

  await sql.execute(
    `UPDATE company_subscriptions
     SET month_start_date = CURRENT_DATE,
         monthly_recovered_revenue_cents = 0,
         updated_at = NOW()
     WHERE company_id = $1`,
    [subscription.company_id],
    subscription.company_id
  );

  return {
    ...subscription,
    month_start_date: new Date().toISOString(),
    monthly_recovered_revenue_cents: 0,
  };
}

async function upsertDefaultSubscriptionWithClient(client: PoolClient, companyId: string): Promise<void> {
  await client.query(
    `INSERT INTO company_subscriptions (company_id, tier)
     VALUES ($1, 'free')
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId]
  );
}

async function getCompanySubscriptionWithClient(
  client: PoolClient,
  companyId: string
): Promise<CompanySubscription | null> {
  await upsertDefaultSubscriptionWithClient(client, companyId);

  const result = await client.query<CompanySubscription>(
    `SELECT company_id, tier, whop_membership_id, total_recoveries_used, monthly_recovered_revenue_cents, month_start_date
     FROM company_subscriptions
     WHERE company_id = $1`,
    [companyId]
  );

  const subscription = result.rows[0];
  if (!subscription) return null;
  return ensureMonthWithClient(client, subscription);
}

async function ensureMonthWithClient(
  client: PoolClient,
  subscription: CompanySubscription
): Promise<CompanySubscription> {
  const start = new Date(subscription.month_start_date);
  const now = new Date();
  if (start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth()) {
    return subscription;
  }

  await client.query(
    `UPDATE company_subscriptions
     SET month_start_date = CURRENT_DATE,
         monthly_recovered_revenue_cents = 0,
         updated_at = NOW()
     WHERE company_id = $1`,
    [subscription.company_id]
  );

  return {
    ...subscription,
    month_start_date: new Date().toISOString(),
    monthly_recovered_revenue_cents: 0,
  };
}

export async function getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
  await upsertDefaultSubscription(companyId);

  const result = await sql.select<CompanySubscription>(
    `SELECT company_id, tier, whop_membership_id, total_recoveries_used, monthly_recovered_revenue_cents, month_start_date
     FROM company_subscriptions
     WHERE company_id = $1`,
    [companyId],
    companyId
  );

  if (!result[0]) return null;
  return ensureMonth(result[0]);
}

export async function getTierLimits(tier: SubscriptionTier): Promise<TierLimits> {
  const result = await sql.select<TierLimits>(
    `SELECT tier, max_monthly_recovered_revenue_cents, max_total_recoveries, price_cents, name
     FROM tier_limits
     WHERE tier = $1`,
    [tier]
  );

  if (!result[0]) {
    throw new Error(`Tier limits missing for tier ${tier}`);
  }

  return result[0];
}

export async function checkRecoveryAllowed(
  companyId: string,
  amountCents: number
): Promise<RecoveryAllowance> {
  const subscription = await getCompanySubscription(companyId);
  if (!subscription) {
    throw new Error('Unable to load subscription');
  }

  const limits = await getTierLimits(subscription.tier);
  const subWithFreshMonth = await ensureMonth(subscription);

  // Lifetime limit for free tier
  if (limits.max_total_recoveries !== null) {
    if (subWithFreshMonth.total_recoveries_used >= limits.max_total_recoveries) {
      return {
        allowed: false,
        reason: 'free_limit_reached',
        subscription: subWithFreshMonth,
        limits,
      };
    }
  }

  // Monthly recovered revenue limit
  if (limits.max_monthly_recovered_revenue_cents !== null) {
    const projected = subWithFreshMonth.monthly_recovered_revenue_cents + amountCents;
    if (projected > limits.max_monthly_recovered_revenue_cents) {
      return {
        allowed: false,
        reason: 'monthly_limit_reached',
        subscription: subWithFreshMonth,
        limits,
      };
    }
  }

  return {
    allowed: true,
    subscription: subWithFreshMonth,
    limits,
  };
}

export async function recordRecovery(
  companyId: string,
  amountCents: number
): Promise<void> {
  const subscription = await getCompanySubscription(companyId);
  if (!subscription) {
    throw new Error('Unable to load subscription');
  }

  const subWithFreshMonth = await ensureMonth(subscription);

  await sql.execute(
    `UPDATE company_subscriptions
     SET total_recoveries_used = total_recoveries_used + 1,
         monthly_recovered_revenue_cents = monthly_recovered_revenue_cents + $2,
         updated_at = NOW()
     WHERE company_id = $1`,
    [companyId, amountCents],
    companyId
  );

  logger.info('Recorded recovery usage for company', {
    companyId,
    previousTotal: subWithFreshMonth.total_recoveries_used,
    amountCents,
  });
}

export async function resetMonthlyUsage(companyId: string): Promise<void> {
  await sql.execute(
    `UPDATE company_subscriptions
     SET month_start_date = CURRENT_DATE,
         monthly_recovered_revenue_cents = 0,
         updated_at = NOW()
     WHERE company_id = $1`,
    [companyId],
    companyId
  );
}

/**
 * Record a recovery inside an existing transaction using the provided client.
 * This keeps subscription usage updates atomic with case updates.
 */
export async function recordRecoveryWithClient(
  client: PoolClient,
  companyId: string,
  amountCents: number
): Promise<{ allowed: boolean; reason?: string }> {
  // Ensure subscription row exists
  await client.query(
    `INSERT INTO company_subscriptions (company_id, tier)
     VALUES ($1, 'free')
     ON CONFLICT (company_id) DO NOTHING`,
    [companyId]
  );

  // Lock subscription row for update
  const subResult = await client.query<CompanySubscription>(
    `SELECT company_id, tier, month_start_date, total_recoveries_used, monthly_recovered_revenue_cents
     FROM company_subscriptions
     WHERE company_id = $1
     FOR UPDATE`,
    [companyId]
  );

  const subscription = subResult.rows[0];
  if (!subscription) {
    throw new Error('Unable to load subscription inside transaction');
  }

  // Refresh month if needed
  const start = new Date(subscription.month_start_date);
  const now = new Date();
  const sameMonth =
    start.getUTCFullYear() === now.getUTCFullYear() &&
    start.getUTCMonth() === now.getUTCMonth();

  if (!sameMonth) {
    await client.query(
      `UPDATE company_subscriptions
       SET month_start_date = CURRENT_DATE,
           monthly_recovered_revenue_cents = 0,
           updated_at = NOW()
       WHERE company_id = $1`,
      [companyId]
    );
    subscription.month_start_date = new Date().toISOString() as any;
    subscription.monthly_recovered_revenue_cents = 0;
  }

  // Load tier limits inside the same transaction to avoid races
  const tierResult = await client.query<TierLimits>(
    `SELECT tier, max_monthly_recovered_revenue_cents, max_total_recoveries, price_cents, name
     FROM tier_limits
     WHERE tier = $1`,
    [subscription.tier]
  );

  const limits = tierResult.rows[0];
  if (!limits) {
    throw new Error(`Tier limits missing for tier ${subscription.tier}`);
  }

  const projectedTotal = subscription.total_recoveries_used + 1;
  const projectedMonthly = subscription.monthly_recovered_revenue_cents + amountCents;

  if (limits.max_total_recoveries !== null && projectedTotal > limits.max_total_recoveries) {
    return { allowed: false, reason: 'free_limit_reached' };
  }

  if (
    limits.max_monthly_recovered_revenue_cents !== null &&
    projectedMonthly > limits.max_monthly_recovered_revenue_cents
  ) {
    return { allowed: false, reason: 'monthly_limit_reached' };
  }

  await client.query(
    `UPDATE company_subscriptions
     SET total_recoveries_used = total_recoveries_used + 1,
         monthly_recovered_revenue_cents = monthly_recovered_revenue_cents + $2,
         updated_at = NOW()
     WHERE company_id = $1`,
    [companyId, amountCents]
  );

  logger.info('Recorded recovery usage within transaction', {
    companyId,
    amountCents
  });

  return { allowed: true };
}

