-- Churn Saver Database Schema Rollback
-- Rollback: 001_rollback.sql
-- Reverses migration: 001_init.sql

-- WARNING: This will permanently delete all core application data
-- This includes events, recovery cases, settings, and audit trails
-- Consider backing up critical data before proceeding

-- Drop indexes first (idempotent)
DROP INDEX IF EXISTS idx_recovery_actions_created_at;
DROP INDEX IF EXISTS idx_recovery_actions_type;
DROP INDEX IF EXISTS idx_recovery_actions_membership;
DROP INDEX IF EXISTS idx_recovery_actions_company_case;
DROP INDEX IF EXISTS idx_cases_user_id;
DROP INDEX IF EXISTS idx_cases_membership_id;
DROP INDEX IF EXISTS idx_cases_first_failure_at;
DROP INDEX IF EXISTS idx_cases_company_status;
DROP INDEX IF EXISTS idx_events_whop_event_id;
DROP INDEX IF EXISTS idx_events_company;
DROP INDEX IF EXISTS idx_events_processed;

-- Drop tables in reverse order of creation (due to foreign key dependencies)
-- Drop recovery_actions first (references recovery_cases)
DROP TABLE IF EXISTS recovery_actions;

-- Drop recovery_cases
DROP TABLE IF EXISTS recovery_cases;

-- Drop creator_settings
DROP TABLE IF EXISTS creator_settings;

-- Drop events
DROP TABLE IF EXISTS events;

-- Drop UUID extension (only if no other tables are using it)
-- Note: This is commented out as other extensions might depend on it
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Initial schema rollback completed successfully';
    RAISE NOTICE 'Dropped tables: recovery_actions, recovery_cases, creator_settings, events';
    RAISE NOTICE 'Dropped all related indexes';
    RAISE NOTICE 'WARNING: All core application data has been permanently deleted';
    RAISE NOTICE 'Database is now in a clean state - application will be non-functional';
END $$;