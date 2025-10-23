-- Churn Saver Database Schema Rollback
-- Rollback: 006_rollback.sql
-- Reverses migration: 006_backfill_occurred_at.sql

-- WARNING: This will restore the DEFAULT value to occurred_at column
-- This may affect application behavior that expects explicit occurred_at values

-- Restore the DEFAULT value for occurred_at column
-- This allows new rows to use now() as default if occurred_at is not explicitly set
ALTER TABLE events ALTER COLUMN occurred_at SET DEFAULT now();

-- Note: We do NOT reverse the data backfill operation as that would be destructive
-- The backfilled data in occurred_at column should be preserved

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Backfill occurred_at rollback completed successfully';
    RAISE NOTICE 'Restored DEFAULT value for events.occurred_at column';
    RAISE NOTICE 'Preserved existing occurred_at data from backfill operation';
    RAISE NOTICE 'New rows will now default occurred_at to now() if not explicitly set';
END $$;