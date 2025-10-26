-- Rollback: 021_fix_rate_limits_schema.sql
-- Rollback rate limiter schema changes

-- Drop the new indexes
DROP INDEX IF EXISTS idx_rate_limits_key_bucket;
DROP INDEX IF EXISTS idx_rate_limits_bucket_start;

-- Drop the composite primary key constraint
ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_pkey;

-- Drop the count constraint
ALTER TABLE rate_limits DROP CONSTRAINT IF EXISTS rate_limits_count_non_negative;

-- Add back the old window_start column
ALTER TABLE rate_limits ADD COLUMN IF NOT EXISTS window_start timestamptz NOT NULL DEFAULT now();

-- Populate window_start from window_bucket_start if it exists
UPDATE rate_limits SET window_start = window_bucket_start WHERE window_start IS NULL AND window_bucket_start IS NOT NULL;

-- Drop the new window_bucket_start column
ALTER TABLE rate_limits DROP COLUMN IF EXISTS window_bucket_start;

-- Restore the original primary key
ALTER TABLE rate_limits ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (company_key);

-- Recreate the original indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window ON rate_limits (company_key, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits (window_start);

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Rate limits schema rollback completed successfully';
    RAISE NOTICE 'Restored original table: rate_limits with company_key primary key';
    RAISE NOTICE 'Restored indexes: idx_rate_limits_key_window, idx_rate_limits_window_start';
END $$;