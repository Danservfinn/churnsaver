-- Churn Saver Database Schema Migration
-- Migration: 006_backfill_occurred_at.sql
-- Backfills occurred_at column with trustworthy event timestamps

-- Backfill occurred_at with the earliest trustworthy signal:
-- 1. If payload contains top-level created_at as string timestamp, use that
-- 2. Else fallback to events.created_at
-- Only update where occurred_at is null or equals default now() (rows created before code changes)
UPDATE events
SET occurred_at = CASE
  -- Extract created_at from payload if it exists and is a valid timestamp string
  WHEN payload::jsonb ? 'created_at'
    AND jsonb_typeof(payload::jsonb->'created_at') = 'string'
    AND (occurred_at IS NULL OR occurred_at = now()::timestamptz)
    THEN (payload::jsonb->>'created_at')::timestamptz
  -- Fallback to events.created_at for rows created before column addition
  WHEN occurred_at IS NULL OR occurred_at = now()::timestamptz
    THEN created_at
  -- Keep existing values for other rows
  ELSE occurred_at
END
WHERE occurred_at IS NULL OR occurred_at = now()::timestamptz;

-- Remove DEFAULT from occurred_at so future inserts must set it explicitly
ALTER TABLE events ALTER COLUMN occurred_at DROP DEFAULT;