-- Churn Saver Database Schema Rollback
-- Rollback: 008_rollback.sql
-- Reverses migration: 008_performance_indexes.sql

-- Drop performance indexes created in migration 008
-- These indexes improve query performance but can be safely removed

-- Drop composite index on recovery_cases (company_id, status, first_failure_at)
DROP INDEX IF EXISTS idx_recovery_cases_company_status_failure;

-- Drop index on recovery_actions (company_id, case_id, created_at)
DROP INDEX IF EXISTS idx_recovery_actions_company_case_created;

-- Drop index on rate_limits (company_key, window_start)
-- Note: This might also be dropped in 010_rollback if rate_limits table is dropped
DROP INDEX IF EXISTS idx_rate_limits_key_window;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Performance indexes rollback completed successfully';
    RAISE NOTICE 'Dropped indexes: idx_recovery_cases_company_status_failure, idx_recovery_actions_company_case_created, idx_rate_limits_key_window';
    RAISE NOTICE 'WARNING: Query performance may degrade without these indexes';
END $$;