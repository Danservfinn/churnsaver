-- Migration: 018_rollback.sql
-- Rollback migration for error recovery enhancements

-- Drop tables in reverse order of creation
DROP TABLE IF EXISTS circuit_breaker_events CASCADE;
DROP TABLE IF EXISTS memory_pressure_events CASCADE;
DROP TABLE IF EXISTS job_queue_dead_letter CASCADE;
DROP TABLE IF EXISTS transaction_rollback_log CASCADE;
DROP TABLE IF EXISTS error_recovery_metrics CASCADE;

-- Drop cleanup function
DROP FUNCTION IF EXISTS cleanup_old_error_recovery_metrics() CASCADE;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_job_queue_dead_letter_updated_at() CASCADE;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_job_queue_dead_letter_updated_at ON job_queue_dead_letter;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Error recovery enhancements rollback completed successfully';
    RAISE NOTICE 'Dropped tables: circuit_breaker_events, memory_pressure_events, job_queue_dead_letter, transaction_rollback_log, error_recovery_metrics';
    RAISE NOTICE 'Dropped functions: cleanup_old_error_recovery_metrics, update_job_queue_dead_letter_updated_at';
    RAISE NOTICE 'Dropped trigger: trigger_update_job_queue_dead_letter_updated_at';
END $$;