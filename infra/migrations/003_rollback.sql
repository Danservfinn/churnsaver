-- Churn Saver Database Schema Rollback
-- Rollback: 003_rollback.sql
-- Reverses migration: 003_add_job_queue.sql

-- WARNING: This will permanently delete all job queue data and archives
-- Consider backing up critical job data before proceeding

-- Drop archive cleanup function
DROP FUNCTION IF EXISTS pgboss.archive_jobs();

-- Drop archive table first (no dependencies)
DROP TABLE IF EXISTS pgboss.archive;

-- Drop version table
DROP TABLE IF EXISTS pgboss.version;

-- Drop main job table
DROP TABLE IF EXISTS pgboss.job;

-- Drop indexes (they should be dropped with tables, but included for completeness)
DROP INDEX IF EXISTS job_priority;
DROP INDEX IF EXISTS job_keep_until;
DROP INDEX IF EXISTS job_created;
DROP INDEX IF EXISTS job_start_after;
DROP INDEX IF EXISTS job_singleton_on;
DROP INDEX IF EXISTS job_singleton_key;
DROP INDEX IF EXISTS job_state;
DROP INDEX IF EXISTS job_name;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Job queue rollback completed successfully';
    RAISE NOTICE 'Dropped tables: pgboss.job, pgboss.version, pgboss.archive';
    RAISE NOTICE 'Dropped function: pgboss.archive_jobs()';
    RAISE NOTICE 'WARNING: All job queue data and archives have been permanently deleted';
    RAISE NOTICE 'Background job processing will be unavailable until tables are recreated';
END $$;