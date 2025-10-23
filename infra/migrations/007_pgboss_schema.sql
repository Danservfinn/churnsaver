-- Migration: 007_pgboss_schema.sql
-- Ensure pgboss schema exists for job queue functionality
-- Minimal schema guard - pg-boss manages its own DDL to avoid version drift

-- Create the pgboss schema if it doesn't exist (minimal guard)
CREATE SCHEMA IF NOT EXISTS pgboss;

-- Note: pg-boss will create its own tables, indexes, and functions
-- This migration only ensures the schema exists
-- Custom DDL has been removed from migration 003_add_job_queue.sql

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'pgboss schema migration completed successfully';
    RAISE NOTICE 'Created schema: pgboss (if not exists)';
    RAISE NOTICE 'pg-boss will manage its own tables and DDL';
END $$;