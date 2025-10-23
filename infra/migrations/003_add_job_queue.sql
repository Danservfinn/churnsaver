-- DEPRECATED: Custom pg-boss DDL removed
-- pg-boss should manage its own schema to avoid version drift
-- This migration is kept for rollback compatibility but should not be applied
-- The schema creation has been moved to migration 007_pgboss_schema.sql

-- The following DDL has been removed:
-- - pgboss.job table creation
-- - pgboss.version table creation
-- - pgboss.archive table creation
-- - All associated indexes and functions

-- Log deprecation notice
DO $$
BEGIN
    RAISE NOTICE 'Migration 003_add_job_queue.sql is deprecated';
    RAISE NOTICE 'pg-boss schema management has been moved to migration 007_pgboss_schema.sql';
    RAISE NOTICE 'Custom DDL removed to prevent version drift - pg-boss manages its own schema';
END $$;
