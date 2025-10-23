-- Churn Saver Database Schema
-- Migration: 001_init.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Events table for webhook idempotency
-- NOTE: payload contains sensitive webhook data (payment info, user data)
-- Consider data minimization and retention policies for GDPR/privacy compliance
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  whop_event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  membership_id text NOT NULL,
  payload jsonb NOT NULL, -- WARNING: Contains sensitive data
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Recovery cases table
CREATE TABLE IF NOT EXISTS recovery_cases (
  id text PRIMARY KEY, -- Using text for custom ID format
  company_id text NOT NULL,
  membership_id text NOT NULL,
  user_id text NOT NULL,
  first_failure_at timestamptz NOT NULL,
  last_nudge_at timestamptz,
  attempts int DEFAULT 0,
  incentive_days int DEFAULT 0,
  status text CHECK (status IN ('open', 'recovered', 'closed_no_recovery')) NOT NULL DEFAULT 'open',
  failure_reason text,
  recovered_amount_cents int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Creator settings table for configuration
CREATE TABLE IF NOT EXISTS creator_settings (
  company_id text PRIMARY KEY,
  enable_push boolean DEFAULT true,
  enable_dm boolean DEFAULT true,
  incentive_days int DEFAULT 3,
  reminder_offsets_days int[] DEFAULT ARRAY[0, 2, 4],
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_whop_event_id ON events(whop_event_id);
CREATE INDEX IF NOT EXISTS idx_cases_company_status ON recovery_cases(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_first_failure_at ON recovery_cases(first_failure_at);
CREATE INDEX IF NOT EXISTS idx_cases_membership_id ON recovery_cases(membership_id);
CREATE INDEX IF NOT EXISTS idx_cases_user_id ON recovery_cases(user_id);

-- Row Level Security (optional - can be enabled later for multi-tenant security)
-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE recovery_cases ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE creator_settings ENABLE ROW LEVEL SECURITY;

-- === Incremental additions for production readiness ===
-- Add processed flag, error column, and company_id to events if they don't exist
ALTER TABLE events ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS company_id text;

-- Indexes to support faster event processing scans
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed, processed_at);
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);

-- Audit table for recovery actions (nudge logs, incentive applications, cancellations)
CREATE TABLE IF NOT EXISTS recovery_actions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id text NOT NULL,
  case_id text REFERENCES recovery_cases(id) ON DELETE CASCADE,
  membership_id text NOT NULL,
  user_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('nudge_push', 'nudge_dm', 'incentive_applied', 'case_cancelled', 'membership_terminated')),
  channel text CHECK (channel IS NULL OR channel IN ('push', 'dm')), -- Only for nudge types
  metadata jsonb DEFAULT '{}', -- Additional context (attempt number, amounts, etc.)
  created_at timestamptz DEFAULT now()
);

-- Indexes for recovery_actions
CREATE INDEX IF NOT EXISTS idx_recovery_actions_company_case ON recovery_actions(company_id, case_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_membership ON recovery_actions(membership_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_type ON recovery_actions(type);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_created_at ON recovery_actions(created_at);
