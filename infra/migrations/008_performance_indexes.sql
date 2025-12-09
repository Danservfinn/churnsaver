-- Migration: 008_performance_indexes.sql
-- Add performance indexes for high-traffic queries

-- Composite index on recovery_cases (company_id, status, first_failure_at)
-- Used for filtering cases by company, status, and ordering by failure time
CREATE INDEX IF NOT EXISTS idx_recovery_cases_company_status_failure
ON recovery_cases (company_id, status, first_failure_at);

-- Index on recovery_actions (company_id, case_id, created_at)
-- Used for querying actions by company and case, ordered by creation time
CREATE INDEX IF NOT EXISTS idx_recovery_actions_company_case_created
ON recovery_actions (company_id, case_id, created_at);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Performance indexes migration completed successfully';
    RAISE NOTICE 'Created indexes: idx_recovery_cases_company_status_failure, idx_recovery_actions_company_case_created';
END $$;