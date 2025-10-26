-- Churn Saver Database Schema - Multi-tenancy Support
-- Migration: 013_multi_tenancy.sql
-- Description: Add company_id columns to all tables for multi-tenant data isolation

-- Add company_id to events table (already exists from 001_init.sql, but ensure it's properly indexed)
ALTER TABLE events ADD COLUMN IF NOT EXISTS company_id text;
CREATE INDEX IF NOT EXISTS idx_events_company ON events(company_id);

-- Add company_id to recovery_cases table (already exists from 001_init.sql)
-- Ensure proper indexing for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_recovery_cases_company_status ON recovery_cases(company_id, status);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_company_first_failure ON recovery_cases(company_id, first_failure_at);

-- Add company_id to creator_settings table (already exists from 001_init.sql)
-- Ensure proper indexing
CREATE INDEX IF NOT EXISTS idx_creator_settings_company ON creator_settings(company_id);

-- Add company_id to recovery_actions table (already exists from 001_init.sql)
-- Ensure proper indexing for multi-tenant audit trails
CREATE INDEX IF NOT EXISTS idx_recovery_actions_company_case ON recovery_actions(company_id, case_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_company_created ON recovery_actions(company_id, created_at);

-- Add company_id to ab_tests table (from 004_add_ab_testing.sql)
DO $$
BEGIN
  IF to_regclass('ab_tests') IS NOT NULL THEN
    ALTER TABLE ab_tests ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
    CREATE INDEX IF NOT EXISTS idx_ab_tests_company ON ab_tests(company_id);
  ELSE
    RAISE NOTICE 'ab_tests table not present; skipping ab_tests multi-tenancy updates';
  END IF;
END
$$;

-- Add company_id to ab_test_variants table
ALTER TABLE ab_test_variants ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
CREATE INDEX IF NOT EXISTS idx_ab_test_variants_company ON ab_test_variants(company_id);

-- Add company_id to ab_test_participants table
DO $$
BEGIN
  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    ALTER TABLE ab_test_participants ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
    CREATE INDEX IF NOT EXISTS idx_ab_test_participants_company ON ab_test_participants(company_id);
  ELSE
    RAISE NOTICE 'ab_test_participants not present; skipping ab_test_participants multi-tenancy updates';
  END IF;
END
$$;

-- Add company_id to job_queue table (from 003_add_job_queue.sql)
DO $$
BEGIN
  IF to_regclass('job_queue') IS NOT NULL THEN
    ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
    CREATE INDEX IF NOT EXISTS idx_job_queue_company ON job_queue(company_id);
  ELSE
    RAISE NOTICE 'job_queue not present; skipping job_queue multi-tenancy updates';
  END IF;
END
$$;

-- Add company_id to rate_limits table (from 010_rate_limits_table.sql)
ALTER TABLE rate_limits ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
CREATE INDEX IF NOT EXISTS idx_rate_limits_company ON rate_limits(company_id);

-- Add company_id to migration_history table (from 011_migration_tracking.sql)
ALTER TABLE migration_history ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
CREATE INDEX IF NOT EXISTS idx_migration_history_company ON migration_history(company_id);

-- Add company_id to security_alerts table (from 011_security_alerts.sql)
ALTER TABLE security_alerts ADD COLUMN IF NOT EXISTS company_id text NOT NULL DEFAULT 'biz_hqNeRcxEMkuyOL';
CREATE INDEX IF NOT EXISTS idx_security_alerts_company ON security_alerts(company_id);

-- Update RLS policies to include new tables
-- AB Tests policies
DO $$
BEGIN
  IF to_regclass('ab_tests') IS NOT NULL THEN
    CREATE POLICY ab_tests_company_select_policy ON ab_tests FOR SELECT USING (company_id = get_current_company_id());
    CREATE POLICY ab_tests_company_insert_policy ON ab_tests FOR INSERT WITH CHECK (company_id = get_current_company_id());
    CREATE POLICY ab_tests_company_update_policy ON ab_tests FOR UPDATE USING (company_id = get_current_company_id());
  ELSE
    RAISE NOTICE 'ab_tests not present; skipping ab_tests policy creation';
  END IF;
END
$$;

-- AB Test Variants policies
CREATE POLICY ab_test_variants_company_select_policy ON ab_test_variants
FOR SELECT USING (company_id = get_current_company_id());

CREATE POLICY ab_test_variants_company_insert_policy ON ab_test_variants
FOR INSERT WITH CHECK (company_id = get_current_company_id());

CREATE POLICY ab_test_variants_company_update_policy ON ab_test_variants
FOR UPDATE USING (company_id = get_current_company_id());

-- AB Test Participants policies
DO $$
BEGIN
  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE polname = 'ab_test_participants_company_select_policy'
        AND schemaname = current_schema()
        AND tablename = 'ab_test_participants'
    ) THEN
      EXECUTE 'CREATE POLICY ab_test_participants_company_select_policy ON ab_test_participants FOR SELECT USING (company_id = get_current_company_id())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE polname = 'ab_test_participants_company_insert_policy'
        AND schemaname = current_schema()
        AND tablename = 'ab_test_participants'
    ) THEN
      EXECUTE 'CREATE POLICY ab_test_participants_company_insert_policy ON ab_test_participants FOR INSERT WITH CHECK (company_id = get_current_company_id())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE polname = 'ab_test_participants_company_update_policy'
        AND schemaname = current_schema()
        AND tablename = 'ab_test_participants'
    ) THEN
      EXECUTE 'CREATE POLICY ab_test_participants_company_update_policy ON ab_test_participants FOR UPDATE USING (company_id = get_current_company_id())';
    END IF;
  ELSE
    RAISE NOTICE 'ab_test_participants not present; skipping ab_test_participants policy creation';
  END IF;
END
$$;

-- Job Queue policies
DO $$
BEGIN
  IF to_regclass('job_queue') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE polname = 'job_queue_company_select_policy'
        AND schemaname = current_schema()
        AND tablename = 'job_queue'
    ) THEN
      EXECUTE 'CREATE POLICY job_queue_company_select_policy ON job_queue FOR SELECT USING (company_id = get_current_company_id())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE polname = 'job_queue_company_insert_policy'
        AND schemaname = current_schema()
        AND tablename = 'job_queue'
    ) THEN
      EXECUTE 'CREATE POLICY job_queue_company_insert_policy ON job_queue FOR INSERT WITH CHECK (company_id = get_current_company_id())';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE polname = 'job_queue_company_update_policy'
        AND schemaname = current_schema()
        AND tablename = 'job_queue'
    ) THEN
      EXECUTE 'CREATE POLICY job_queue_company_update_policy ON job_queue FOR UPDATE USING (company_id = get_current_company_id())';
    END IF;
  ELSE
    RAISE NOTICE 'job_queue not present; skipping job_queue policy creation';
  END IF;
END
$$;

-- Rate Limits policies
CREATE POLICY rate_limits_company_select_policy ON rate_limits
FOR SELECT USING (company_id = get_current_company_id());

CREATE POLICY rate_limits_company_insert_policy ON rate_limits
FOR INSERT WITH CHECK (company_id = get_current_company_id());

CREATE POLICY rate_limits_company_update_policy ON rate_limits
FOR UPDATE USING (company_id = get_current_company_id());

-- Migration History policies
CREATE POLICY migration_history_company_select_policy ON migration_history
FOR SELECT USING (company_id = get_current_company_id());

CREATE POLICY migration_history_company_insert_policy ON migration_history
FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Security Alerts policies
CREATE POLICY security_alerts_company_select_policy ON security_alerts
FOR SELECT USING (company_id = get_current_company_id());

CREATE POLICY security_alerts_company_insert_policy ON security_alerts
FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Enable RLS on new tables
DO $$
BEGIN
  IF to_regclass('ab_tests') IS NOT NULL THEN
    ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
  ELSE
    RAISE NOTICE 'ab_tests not present; skipping RLS enable';
  END IF;
END
$$;
ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    ALTER TABLE ab_test_participants ENABLE ROW LEVEL SECURITY;
  ELSE
    RAISE NOTICE 'ab_test_participants not present; skipping RLS enable';
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('job_queue') IS NOT NULL THEN
    ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
  ELSE
    RAISE NOTICE 'job_queue not present; skipping RLS enable';
  END IF;
END
$$;

-- Create a function to backfill company_id for existing records
-- This sets all existing records to the default company
CREATE OR REPLACE FUNCTION backfill_company_ids()
RETURNS void AS $$
BEGIN
  -- Update events with company_id from payload if available, otherwise use default
  UPDATE events SET company_id = COALESCE(
    (payload->>'company_id'),
    'biz_hqNeRcxEMkuyOL'
  ) WHERE company_id IS NULL;

  -- Set default company_id for any remaining NULL values
  UPDATE events SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  UPDATE recovery_cases SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  UPDATE creator_settings SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  UPDATE recovery_actions SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  IF to_regclass('ab_tests') IS NOT NULL THEN
    UPDATE ab_tests SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  END IF;
  UPDATE ab_test_variants SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    UPDATE ab_test_participants SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  END IF;
  IF to_regclass('job_queue') IS NOT NULL THEN
    UPDATE job_queue SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  END IF;
  UPDATE rate_limits SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  UPDATE migration_history SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
  UPDATE security_alerts SET company_id = 'biz_hqNeRcxEMkuyOL' WHERE company_id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Execute the backfill
SELECT backfill_company_ids();

-- Make company_id NOT NULL for all tables (after backfill)
ALTER TABLE events ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE recovery_cases ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE creator_settings ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE recovery_actions ALTER COLUMN company_id SET NOT NULL;
DO $$
BEGIN
  IF to_regclass('ab_tests') IS NOT NULL THEN
    ALTER TABLE ab_tests ALTER COLUMN company_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'ab_tests not present; skipping NOT NULL alter';
  END IF;
END
$$;
ALTER TABLE ab_test_variants ALTER COLUMN company_id SET NOT NULL;
DO $$
BEGIN
  IF to_regclass('ab_test_participants') IS NOT NULL THEN
    ALTER TABLE ab_test_participants ALTER COLUMN company_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'ab_test_participants not present; skipping NOT NULL alter';
  END IF;
END
$$;
DO $$
BEGIN
  IF to_regclass('job_queue') IS NOT NULL THEN
    ALTER TABLE job_queue ALTER COLUMN company_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'job_queue not present; skipping NOT NULL alter';
  END IF;
END
$$;
ALTER TABLE rate_limits ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE migration_history ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE security_alerts ALTER COLUMN company_id SET NOT NULL;

-- Create a companies table for future multi-company support
CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  whop_company_id text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Companies policies (companies can see themselves, but this is for future expansion)
CREATE POLICY companies_select_policy ON companies FOR SELECT USING (true);
CREATE POLICY companies_insert_policy ON companies FOR INSERT WITH CHECK (true);

-- Insert the default company
INSERT INTO companies (id, name, whop_company_id)
VALUES ('biz_hqNeRcxEMkuyOL', 'Default Company', 'biz_hqNeRcxEMkuyOL')
ON CONFLICT (id) DO NOTHING;

-- Add foreign key constraints (optional, for data integrity)
-- Note: We use text types for flexibility with external IDs
-- ALTER TABLE recovery_cases ADD CONSTRAINT fk_recovery_cases_company
--   FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Create a view for company-scoped data access (useful for debugging)
CREATE OR REPLACE VIEW company_data_summary AS
SELECT
  c.id as company_id,
  c.name as company_name,
  COUNT(DISTINCT rc.id) as recovery_cases_count,
  COUNT(DISTINCT ra.id) as recovery_actions_count,
  COUNT(DISTINCT e.id) as events_count
FROM companies c
LEFT JOIN recovery_cases rc ON rc.company_id = c.id
LEFT JOIN recovery_actions ra ON ra.company_id = c.id
LEFT JOIN events e ON e.company_id = c.id
GROUP BY c.id, c.name;

-- Grant appropriate permissions (adjust based on your auth setup)
-- GRANT SELECT ON company_data_summary TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE companies IS 'Companies table for multi-tenant support. Currently contains default company only.';
COMMENT ON COLUMN events.company_id IS 'Company identifier for multi-tenant data isolation';
COMMENT ON COLUMN recovery_cases.company_id IS 'Company identifier for multi-tenant data isolation';
COMMENT ON COLUMN creator_settings.company_id IS 'Company identifier for multi-tenant data isolation';
COMMENT ON COLUMN recovery_actions.company_id IS 'Company identifier for multi-tenant data isolation';
