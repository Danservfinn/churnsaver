-- Churn Saver Database Schema Rollback Migration
-- Migration: 012_rollback.sql
-- Removes received_at column and associated index

-- Drop the index first
DROP INDEX IF EXISTS idx_events_received_at;

-- Remove the received_at column
ALTER TABLE events DROP COLUMN IF EXISTS received_at;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Rollback migration 012_rollback completed successfully';
    RAISE NOTICE 'Removed received_at column and idx_events_received_at index';
END $$;