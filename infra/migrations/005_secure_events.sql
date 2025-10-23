-- Churn Saver Database Schema Migration
-- Migration: 005_secure_events.sql
-- Adds occurred_at column and security-related columns for event attribution

-- Add occurred_at column with default now() for new rows
ALTER TABLE events ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

-- Add payload_min column for minimal payload storage (future use)
ALTER TABLE events ADD COLUMN IF NOT EXISTS payload_min jsonb;

-- Add payload_encrypted column for encrypted payload storage (future use)
ALTER TABLE events ADD COLUMN IF NOT EXISTS payload_encrypted bytea;

-- Create indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed, processed_at);
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at);