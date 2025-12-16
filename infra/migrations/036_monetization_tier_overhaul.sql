-- Migration: 036_monetization_tier_overhaul.sql
-- Implements tiered monetization per churn-saver-monetization-spec-final.md
-- Replaces existing tier system (free/starter/growth/scale) with (free/pro/max)

-- ============================================================================
-- PHASE 1: Modify company_subscriptions table
-- ============================================================================

-- Add new columns for the updated subscription model
ALTER TABLE company_subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'cancelled')),
  ADD COLUMN IF NOT EXISTS recoveries_this_period INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', now() + interval '1 month'),
  ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

-- Migrate existing tier data before changing constraint
-- starter, growth -> pro; scale -> max; free -> free
UPDATE company_subscriptions
SET tier = CASE
  WHEN tier IN ('starter', 'growth') THEN 'pro'
  WHEN tier = 'scale' THEN 'max'
  ELSE 'free'
END;

-- Drop old tier constraint and add new one
ALTER TABLE company_subscriptions DROP CONSTRAINT IF EXISTS company_subscriptions_tier_check;
ALTER TABLE company_subscriptions
  ADD CONSTRAINT company_subscriptions_tier_check
  CHECK (tier IN ('free', 'pro', 'max'));

-- Reset period usage for fresh start
UPDATE company_subscriptions
SET recoveries_this_period = 0,
    period_reset_at = date_trunc('month', now() + interval '1 month'),
    current_period_start = date_trunc('month', now()),
    current_period_end = date_trunc('month', now() + interval '1 month');

-- ============================================================================
-- PHASE 2: Update tier_limits table
-- ============================================================================

-- Add new columns for feature flags
ALTER TABLE tier_limits
  ADD COLUMN IF NOT EXISTS max_recoveries_per_month INT,
  ADD COLUMN IF NOT EXISTS has_analytics BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_custom_templates BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_csv_export BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_priority_support BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_templates_per_channel INT DEFAULT 0;

-- Clear old tier definitions and insert new ones
DELETE FROM tier_limits WHERE tier IN ('free', 'starter', 'growth', 'scale', 'pro', 'max');

INSERT INTO tier_limits (
  tier,
  max_monthly_recovered_revenue_cents,
  max_total_recoveries,
  max_recoveries_per_month,
  price_cents,
  name,
  has_analytics,
  has_custom_templates,
  has_csv_export,
  has_priority_support,
  max_templates_per_channel
) VALUES
  ('free', NULL, NULL, 3, 0, 'Free', false, false, false, false, 0),
  ('pro', NULL, NULL, 100, 4900, 'Pro', true, false, true, false, 0),
  ('max', NULL, NULL, NULL, 9900, 'Max', true, true, true, true, 10);

-- ============================================================================
-- PHASE 3: Create message_templates table
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,

  -- Template identification
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'dm')),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('immediate', 'day_2', 'day_4', 'manual')),

  -- Template content
  push_title TEXT CHECK (char_length(push_title) <= 100),
  push_body TEXT CHECK (char_length(push_body) <= 500),
  dm_message TEXT CHECK (char_length(dm_message) <= 2000),

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(company_id, name, channel)
);

-- Indexes for message_templates
CREATE INDEX IF NOT EXISTS idx_message_templates_company_channel
  ON message_templates(company_id, channel, is_active);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger
  ON message_templates(company_id, trigger_type, is_active);

-- RLS for message_templates
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_templates_isolation ON message_templates;
CREATE POLICY message_templates_isolation ON message_templates
  FOR ALL USING (company_id = current_setting('app.current_company_id', true));

-- ============================================================================
-- PHASE 4: Create analytics_snapshots table
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,

  -- Snapshot timing
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'daily'
    CHECK (snapshot_type IN ('daily', 'weekly', 'monthly')),

  -- Case metrics
  total_cases INT NOT NULL DEFAULT 0,
  active_cases INT NOT NULL DEFAULT 0,
  recovered_cases INT NOT NULL DEFAULT 0,
  closed_no_recovery INT NOT NULL DEFAULT 0,

  -- Recovery metrics
  recovery_rate DECIMAL(5,2),
  avg_recovery_hours DECIMAL(10,2),

  -- Revenue metrics (cents)
  recovered_revenue_cents BIGINT NOT NULL DEFAULT 0,
  incentive_cost_cents BIGINT NOT NULL DEFAULT 0,

  -- Channel metrics
  push_sent INT NOT NULL DEFAULT 0,
  push_delivered INT NOT NULL DEFAULT 0,
  dm_sent INT NOT NULL DEFAULT 0,
  dm_delivered INT NOT NULL DEFAULT 0,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent duplicates
  UNIQUE(company_id, snapshot_date, snapshot_type)
);

-- Indexes for analytics_snapshots
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_company_date
  ON analytics_snapshots(company_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_cleanup
  ON analytics_snapshots(snapshot_date);

-- RLS for analytics_snapshots
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_snapshots_isolation ON analytics_snapshots;
CREATE POLICY analytics_snapshots_isolation ON analytics_snapshots
  FOR ALL USING (company_id = current_setting('app.current_company_id', true));

-- Cleanup function for 365-day retention
CREATE OR REPLACE FUNCTION cleanup_old_analytics_snapshots()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM analytics_snapshots
  WHERE snapshot_date < CURRENT_DATE - INTERVAL '365 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PHASE 5: Create skipped_recoveries table
-- ============================================================================

CREATE TABLE IF NOT EXISTS skipped_recoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  -- Reason for skipping
  reason TEXT NOT NULL CHECK (reason IN ('LIMIT_REACHED', 'SUBSCRIPTION_INACTIVE', 'DUPLICATE')),

  -- Subscription context at time of skip
  tier TEXT NOT NULL,
  recoveries_used INT NOT NULL,
  recoveries_limit INT,

  -- Timestamps
  skipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Event reference (for traceability)
  event_id TEXT,
  event_payload JSONB
);

-- Indexes for skipped_recoveries
CREATE INDEX IF NOT EXISTS idx_skipped_recoveries_company
  ON skipped_recoveries(company_id, skipped_at DESC);
CREATE INDEX IF NOT EXISTS idx_skipped_recoveries_membership
  ON skipped_recoveries(membership_id);

-- RLS for skipped_recoveries
ALTER TABLE skipped_recoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS skipped_recoveries_isolation ON skipped_recoveries;
CREATE POLICY skipped_recoveries_isolation ON skipped_recoveries
  FOR ALL USING (company_id = current_setting('app.current_company_id', true));

-- ============================================================================
-- PHASE 6: Update indexes for company_subscriptions
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_whop_membership
  ON company_subscriptions(whop_membership_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_period_reset
  ON company_subscriptions(period_reset_at);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status
  ON company_subscriptions(status);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE message_templates IS 'Custom message templates for Max tier companies';
COMMENT ON TABLE analytics_snapshots IS 'Daily analytics snapshots for Pro/Max tier companies';
COMMENT ON TABLE skipped_recoveries IS 'Audit log of recoveries skipped due to tier limits';
COMMENT ON COLUMN company_subscriptions.recoveries_this_period IS 'Number of recoveries used in current billing period';
COMMENT ON COLUMN company_subscriptions.period_reset_at IS 'When the current billing period ends and counters reset';
COMMENT ON COLUMN tier_limits.max_recoveries_per_month IS 'Maximum recoveries per month (NULL = unlimited)';
