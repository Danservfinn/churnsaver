-- Migration: 021_fix_rate_limits_schema.sql
-- Fix rate limiter schema/algorithm mismatch with composite primary key and proper time bucketing

-- First, let's check if the new column already exists (for idempotent migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'rate_limits' AND column_name = 'window_bucket_start'
    ) THEN
        -- Add the new column for time bucketing
        ALTER TABLE rate_limits ADD COLUMN window_bucket_start timestamptz NOT NULL DEFAULT now();
        
        -- Populate the new column with existing window_start values
        UPDATE rate_limits SET window_bucket_start = window_start WHERE window_bucket_start IS NULL;
        
        RAISE NOTICE 'Added window_bucket_start column to rate_limits table';
    END IF;
END $$;

-- Drop the old primary key constraint
ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_pkey;

-- Add composite primary key matching the index pattern
-- This ensures unique rate limit records per company per time bucket
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_pkey 
    PRIMARY KEY (company_key, window_bucket_start);

-- Drop the old window_start column since we're using bucketed time windows
ALTER TABLE rate_limits DROP COLUMN IF EXISTS window_start;

-- Add constraint to ensure count is always non-negative
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_count_non_negative 
    CHECK (count >= 0);

-- Add comments for documentation
COMMENT ON COLUMN rate_limits.window_bucket_start IS 'Start time of the fixed time bucket for rate limiting (floor(timestamp/windowSize) * windowSize)';
COMMENT ON CONSTRAINT rate_limits_pkey ON rate_limits IS 'Composite primary key ensuring one rate limit record per company per time bucket';

-- Create index for efficient cleanup queries (recreate with new column name)
DROP INDEX IF EXISTS idx_rate_limits_key_window;
CREATE INDEX idx_rate_limits_key_bucket ON rate_limits (company_key, window_bucket_start);

-- Create index for cleanup by window_bucket_start (for periodic cleanup jobs)
DROP INDEX IF EXISTS idx_rate_limits_window_start;
CREATE INDEX idx_rate_limits_bucket_start ON rate_limits (window_bucket_start);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Rate limits schema fix migration completed successfully';
    RAISE NOTICE 'Updated table: rate_limits with composite primary key (company_key, window_bucket_start)';
    RAISE NOTICE 'Created indexes: idx_rate_limits_key_bucket, idx_rate_limits_bucket_start';
    RAISE NOTICE 'Added constraint: rate_limits_count_non_negative';
END $$;