-- Churn Saver Database Schema Migration
-- Migration: 012_received_at.sql
-- Adds received_at column to events table for proper timestamp semantics
-- received_at: When the webhook was received (set on insert)
-- processed_at: When the webhook was successfully processed (set on processing)

-- Add received_at column with default now() for new inserts
ALTER TABLE events ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now();

-- Backfill received_at with processed_at for existing rows
-- Since processed_at was previously used as receive time
UPDATE events SET received_at = processed_at WHERE received_at IS NULL;

-- Add index for received_at to support ordering in processUnprocessedEvents
CREATE INDEX IF NOT EXISTS idx_events_received_at ON events(received_at);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 012_received_at completed successfully';
    RAISE NOTICE 'Added received_at column and backfilled existing rows';
    RAISE NOTICE 'Created index idx_events_received_at';
END $$;