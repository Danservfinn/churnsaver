-- Migration: 010_rate_limits_table.sql
-- Move rate_limits table creation from runtime to migration with proper schema

-- Create the rate_limits table with proper schema
CREATE TABLE IF NOT EXISTS rate_limits (
    company_key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count int NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add index for efficient cleanup queries (also created in 008_performance_indexes.sql)
-- This is idempotent, so it's safe to include here as well
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
ON rate_limits (company_key, window_start);

-- Add index for cleanup by window_start (for periodic cleanup jobs)
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
ON rate_limits (window_start);

-- Enable Row Level Security for multi-tenant isolation
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - rate limits are scoped by company_key prefix
-- This allows companies to only see/modify their own rate limit records
CREATE POLICY rate_limits_company_policy ON rate_limits
    FOR ALL USING (
        company_key LIKE (current_setting('app.current_company_id', true)::text || ':%') OR
        company_key = current_setting('app.current_company_id', true)::text OR
        company_key LIKE 'global:%' OR
        company_key = 'global'
    );

-- Add comments for documentation
COMMENT ON TABLE rate_limits IS 'Rate limiting storage using token bucket algorithm';
COMMENT ON COLUMN rate_limits.company_key IS 'Unique identifier combining company_id and rate limit type';
COMMENT ON COLUMN rate_limits.window_start IS 'Start time of the current rate limit window';
COMMENT ON COLUMN rate_limits.count IS 'Number of requests made in the current window';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Rate limits table migration completed successfully';
    RAISE NOTICE 'Created table: rate_limits with RLS enabled';
    RAISE NOTICE 'Created indexes: idx_rate_limits_key_window, idx_rate_limits_window_start';
END $$;