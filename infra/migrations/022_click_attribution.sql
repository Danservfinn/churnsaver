-- Click-through attribution and subscription tier schema

-- Table: recovery_link_sends (one row per message containing a tracked link)
CREATE TABLE IF NOT EXISTS recovery_link_sends (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  membership_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'dm', 'email')),
  token TEXT NOT NULL UNIQUE, -- HMAC-signed token for URL
  whop_manage_url TEXT NOT NULL, -- Original Whop URL we're wrapping
  message_id TEXT, -- External message ID from Whop
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL -- Token expiration (attribution window)
);

-- Table: recovery_click_events (one row per click)
CREATE TABLE IF NOT EXISTS recovery_click_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_send_id UUID NOT NULL REFERENCES recovery_link_sends(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT, -- Hashed for privacy, used for bot detection
  is_bot_suspected BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'
);

-- Extend recovery_cases for attribution metadata
ALTER TABLE recovery_cases 
  ADD COLUMN IF NOT EXISTS recovery_type TEXT 
    CHECK (recovery_type IN ('CLICK_THROUGH', 'ORGANIC', 'LEGACY_UNKNOWN', NULL)),
  ADD COLUMN IF NOT EXISTS attributed_click_id UUID REFERENCES recovery_click_events(id),
  ADD COLUMN IF NOT EXISTS attribution_window_days INT DEFAULT 7;

-- Company subscription tracking (Churn Saver’s own tiers)
CREATE TABLE IF NOT EXISTS company_subscriptions (
  company_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'growth', 'scale')),
  whop_membership_id TEXT, -- Whop membership for Churn Saver itself
  total_recoveries_used INT DEFAULT 0, -- For free tier limit
  monthly_recovered_revenue_cents BIGINT DEFAULT 0, -- Current month
  month_start_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tier limits configuration
CREATE TABLE IF NOT EXISTS tier_limits (
  tier TEXT PRIMARY KEY,
  max_monthly_recovered_revenue_cents BIGINT, -- NULL = unlimited
  max_total_recoveries INT, -- For free tier (1 recovery limit)
  price_cents INT NOT NULL,
  name TEXT NOT NULL
);

-- Insert tier definitions (idempotent)
INSERT INTO tier_limits (tier, max_monthly_recovered_revenue_cents, max_total_recoveries, price_cents, name)
VALUES
  ('free', NULL, 1, 0, 'Free Trial'),
  ('starter', 50000, NULL, 2900, 'Starter'),
  ('growth', 200000, NULL, 5900, 'Growth'),
  ('scale', NULL, NULL, 9900, 'Scale')
ON CONFLICT (tier) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_link_sends_case ON recovery_link_sends(case_id);
CREATE INDEX IF NOT EXISTS idx_link_sends_token ON recovery_link_sends(token);
CREATE INDEX IF NOT EXISTS idx_link_sends_membership ON recovery_link_sends(membership_id);
CREATE INDEX IF NOT EXISTS idx_clicks_case ON recovery_click_events(case_id);
CREATE INDEX IF NOT EXISTS idx_clicks_time ON recovery_click_events(clicked_at);
CREATE INDEX IF NOT EXISTS idx_cases_recovery_type ON recovery_cases(recovery_type);

