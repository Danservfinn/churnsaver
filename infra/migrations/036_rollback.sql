-- Rollback: 036_monetization_tier_overhaul.sql
-- Reverts tiered monetization changes

-- ============================================================================
-- PHASE 1: Drop new tables
-- ============================================================================

DROP TABLE IF EXISTS skipped_recoveries CASCADE;
DROP TABLE IF EXISTS analytics_snapshots CASCADE;
DROP TABLE IF EXISTS message_templates CASCADE;

-- Drop the cleanup function
DROP FUNCTION IF EXISTS cleanup_old_analytics_snapshots();

-- ============================================================================
-- PHASE 2: Remove new columns from company_subscriptions
-- ============================================================================

ALTER TABLE company_subscriptions
  DROP COLUMN IF EXISTS billing_interval,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS recoveries_this_period,
  DROP COLUMN IF EXISTS period_reset_at,
  DROP COLUMN IF EXISTS current_period_start,
  DROP COLUMN IF EXISTS current_period_end;

-- ============================================================================
-- PHASE 3: Restore old tier constraint
-- ============================================================================

-- NOTE: This rollback cannot restore the original tier values
-- Manual intervention may be required to set appropriate tier values

ALTER TABLE company_subscriptions DROP CONSTRAINT IF EXISTS company_subscriptions_tier_check;
ALTER TABLE company_subscriptions
  ADD CONSTRAINT company_subscriptions_tier_check
  CHECK (tier IN ('free', 'starter', 'growth', 'scale'));

-- Set all subscriptions to 'free' as safe default
UPDATE company_subscriptions SET tier = 'free';

-- ============================================================================
-- PHASE 4: Remove new columns from tier_limits
-- ============================================================================

ALTER TABLE tier_limits
  DROP COLUMN IF EXISTS max_recoveries_per_month,
  DROP COLUMN IF EXISTS has_analytics,
  DROP COLUMN IF EXISTS has_custom_templates,
  DROP COLUMN IF EXISTS has_csv_export,
  DROP COLUMN IF EXISTS has_priority_support,
  DROP COLUMN IF EXISTS max_templates_per_channel;

-- ============================================================================
-- PHASE 5: Restore old tier_limits data
-- ============================================================================

DELETE FROM tier_limits WHERE tier IN ('free', 'pro', 'max');

INSERT INTO tier_limits (tier, max_monthly_recovered_revenue_cents, max_total_recoveries, price_cents, name)
VALUES
  ('free', 50000, 10, 0, 'Free'),
  ('starter', 500000, 100, 2900, 'Starter'),
  ('growth', 2000000, 500, 7900, 'Growth'),
  ('scale', NULL, NULL, 19900, 'Scale');

-- ============================================================================
-- PHASE 6: Remove new indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_company_subscriptions_whop_membership;
DROP INDEX IF EXISTS idx_company_subscriptions_period_reset;
DROP INDEX IF EXISTS idx_company_subscriptions_status;
