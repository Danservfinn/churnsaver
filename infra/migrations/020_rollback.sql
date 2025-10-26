-- Migration: 020_rollback.sql
-- Rollback job queue enhancements

-- Drop triggers
DROP TRIGGER IF EXISTS update_job_queue_dead_letter_updated_at ON job_queue_dead_letter;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop RLS policies
DROP POLICY IF EXISTS job_queue_dead_letter_company_policy ON job_queue_dead_letter;
DROP POLICY IF EXISTS job_queue_metrics_company_policy ON job_queue_metrics;
DROP POLICY IF EXISTS job_queue_recovery_log_company_policy ON job_queue_recovery_log;

-- Disable RLS on tables
ALTER TABLE job_queue_dead_letter DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue_recovery_log DISABLE ROW LEVEL SECURITY;

-- Drop indexes
DROP INDEX IF EXISTS idx_job_queue_dead_letter_job_type;
DROP INDEX IF EXISTS idx_job_queue_dead_letter_company_id;
DROP INDEX IF EXISTS idx_job_queue_dead_letter_next_retry;
DROP INDEX IF EXISTS idx_job_queue_dead_letter_priority;
DROP INDEX IF EXISTS idx_job_queue_dead_letter_created_at;

DROP INDEX IF EXISTS idx_job_queue_metrics_job_id;
DROP INDEX IF EXISTS idx_job_queue_metrics_job_type;
DROP INDEX IF EXISTS idx_job_queue_metrics_company_id;
DROP INDEX IF EXISTS idx_job_queue_metrics_status;
DROP INDEX IF EXISTS idx_job_queue_metrics_created_at;

DROP INDEX IF EXISTS idx_job_queue_recovery_log_job_id;
DROP INDEX IF EXISTS idx_job_queue_recovery_log_job_type;
DROP INDEX IF EXISTS idx_job_queue_recovery_log_company_id;
DROP INDEX IF EXISTS idx_job_queue_recovery_log_created_at;

-- Drop tables
DROP TABLE IF EXISTS job_queue_recovery_log;
DROP TABLE IF EXISTS job_queue_metrics;
DROP TABLE IF EXISTS job_queue_dead_letter;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 020_rollback.sql completed successfully';
    RAISE NOTICE 'Dropped tables: job_queue_dead_letter, job_queue_metrics, job_queue_recovery_log';
    RAISE NOTICE 'Dropped indexes and RLS policies';
    RAISE NOTICE 'Dropped triggers and functions';
END $$;