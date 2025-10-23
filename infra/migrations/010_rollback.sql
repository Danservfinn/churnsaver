-- Churn Saver Database Schema Rollback
-- Rollback: 010_rollback.sql
-- Reverses migration: 010_rate_limits_table.sql

-- WARNING: This will permanently delete all rate limit data
-- Consider backing up critical data before proceeding

-- Drop RLS policy first
DROP POLICY IF EXISTS rate_limits_company_policy ON rate_limits;

-- Disable Row Level Security
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;

-- Drop indexes (idempotent)
DROP INDEX IF EXISTS idx_rate_limits_key_window;
DROP INDEX IF EXISTS idx_rate_limits_window_start;

-- Drop the rate_limits table
DROP TABLE IF EXISTS rate_limits;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Rate limits table rollback completed successfully';
    RAISE NOTICE 'Dropped table: rate_limits';
    RAISE NOTICE 'Dropped indexes: idx_rate_limits_key_window, idx_rate_limits_window_start';
    RAISE NOTICE 'WARNING: All rate limit data has been permanently deleted';
END $$;