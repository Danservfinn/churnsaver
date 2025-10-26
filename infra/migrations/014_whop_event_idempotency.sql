-- Migration: 013_whop_event_idempotency
-- Description: Add table for Whop webhook event idempotency
CREATE TABLE IF NOT EXISTS whop_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whop_events_received_at ON whop_events(received_at);