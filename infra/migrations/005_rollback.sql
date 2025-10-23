-- Churn Saver Database Schema Rollback
-- Rollback: 005_rollback.sql
-- Reverses migration: 005_secure_events.sql

-- WARNING: This will drop security-related columns and indexes from events table
-- Consider backing up critical data before proceeding

-- Drop indexes created in migration 005 (idempotent)
DROP INDEX IF EXISTS idx_events_occurred_at;

-- Drop security-related columns added in migration 005
-- Note: We check if columns exist before dropping them to avoid errors

-- Drop payload_encrypted column (encrypted payload storage)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'payload_encrypted'
    ) THEN
        ALTER TABLE events DROP COLUMN payload_encrypted;
        RAISE NOTICE 'Dropped column: events.payload_encrypted';
    END IF;
END $$;

-- Drop payload_min column (minimal payload storage)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'payload_min'
    ) THEN
        ALTER TABLE events DROP COLUMN payload_min;
        RAISE NOTICE 'Dropped column: events.payload_min';
    END IF;
END $$;

-- Drop occurred_at column (event attribution timestamp)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'occurred_at'
    ) THEN
        ALTER TABLE events DROP COLUMN occurred_at;
        RAISE NOTICE 'Dropped column: events.occurred_at';
    END IF;
END $$;

-- Note: We do NOT drop idx_events_processed and idx_events_company 
-- as they were created in earlier migrations and may be used elsewhere

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Secure events rollback completed successfully';
    RAISE NOTICE 'Dropped columns: payload_encrypted, payload_min, occurred_at (if they existed)';
    RAISE NOTICE 'Dropped index: idx_events_occurred_at';
    RAISE NOTICE 'WARNING: Security features and event attribution data have been removed';
END $$;