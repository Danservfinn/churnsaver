-- Churn Saver Database Schema Rollback
-- Rollback: 007_rollback.sql
-- Reverses migration: 007_pgboss_schema.sql

-- WARNING: This will drop the entire pgboss schema and all its contents
-- This includes job queue tables, archive tables, and version tracking
-- Consider backing up critical job data before proceeding

-- Drop the pgboss schema and all objects within it
-- This will cascade and drop all tables, functions, and indexes in the schema
DROP SCHEMA IF EXISTS pgboss CASCADE;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'pgboss schema rollback completed successfully';
    RAISE NOTICE 'Dropped schema: pgboss (and all contained objects)';
    RAISE NOTICE 'WARNING: All job queue data, archives, and version tracking have been permanently deleted';
    RAISE NOTICE 'Job queue functionality will be unavailable until schema is recreated';
END $$;