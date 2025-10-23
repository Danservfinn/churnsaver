-- Churn Saver Database Schema - Row Level Security enablement
-- Migration: 002_enable_rls_policies.sql
-- Description: Enable Row Level Security policies for multi-tenant data isolation

-- Enable Row Level Security on all application tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_actions ENABLE ROW LEVEL SECURITY;

-- Create a function to set session variables for company context
-- This is used by application code to set the company context for queries
CREATE OR REPLACE FUNCTION set_company_context(company_id_param text)
RETURNS void AS $$
BEGIN
  -- Set session variable for RLS policies
  PERFORM set_config('app.current_company_id', company_id_param, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a helper function to get current company from session
CREATE OR REPLACE FUNCTION get_current_company_id()
RETURNS text AS $$
BEGIN
  RETURN current_setting('app.current_company_id', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===================================================================
-- EVENTS TABLE POLICIES
-- ===================================================================

-- Allow INSERT for webhook processing (before company context is established)
CREATE POLICY events_webhook_insert_policy ON events
FOR INSERT WITH CHECK (true);

-- Allow SELECT for authenticated company access (read their own data)
CREATE POLICY events_company_select_policy ON events
FOR SELECT USING (company_id = get_current_company_id());

-- Allow UPDATE for processing events (marking as processed/adding errors)
CREATE POLICY events_company_update_policy ON events
FOR UPDATE USING (company_id = get_current_company_id());

-- ===================================================================
-- RECOVERY_CASES TABLE POLICIES
-- ===================================================================

-- Allow INSERT for company-specific case creation
CREATE POLICY recovery_cases_company_insert_policy ON recovery_cases
FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Allow SELECT for company to view their cases
CREATE POLICY recovery_cases_company_select_policy ON recovery_cases
FOR SELECT USING (company_id = get_current_company_id());

-- Allow UPDATE for company to modify their cases (nudges, recoveries, closures)
CREATE POLICY recovery_cases_company_update_policy ON recovery_cases
FOR UPDATE USING (company_id = get_current_company_id());

-- ===================================================================
-- CREATOR_SETTINGS TABLE POLICIES
-- ===================================================================

-- Allow INSERT for new company settings initialization
CREATE POLICY creator_settings_company_insert_policy ON creator_settings
FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Allow SELECT for company to access their settings
CREATE POLICY creator_settings_company_select_policy ON creator_settings
FOR SELECT USING (company_id = get_current_company_id());

-- Allow UPDATE for company to modify their settings
CREATE POLICY creator_settings_company_update_policy ON creator_settings
FOR UPDATE USING (company_id = get_current_company_id());

-- ===================================================================
-- RECOVERY_ACTIONS TABLE POLICIES
-- ===================================================================

-- Allow INSERT for logging company-specific actions (nudges, incentives, etc.)
CREATE POLICY recovery_actions_company_insert_policy ON recovery_actions
FOR INSERT WITH CHECK (company_id = get_current_company_id());

-- Allow SELECT for company audit trail access
CREATE POLICY recovery_actions_company_select_policy ON recovery_actions
FOR SELECT USING (company_id = get_current_company_id());

-- Allow DELETE for data retention compliance (if needed)
CREATE POLICY recovery_actions_company_delete_policy ON recovery_actions
FOR DELETE USING (company_id = get_current_company_id());

-- ===================================================================
-- ADDITIONAL SECURITY MEASURES
-- ===================================================================

-- Update triggers to automatically set updated_at timestamps
-- These ensure audit trails are maintained with proper security context

-- Recovery cases updated_at trigger
CREATE OR REPLACE FUNCTION update_recovery_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure only the owning company can modify their cases
  IF get_current_company_id() IS NOT NULL AND NEW.company_id != get_current_company_id() THEN
    RAISE EXCEPTION 'Access denied: Cannot modify cases for different company';
  END IF;

  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER recovery_cases_updated_at_trigger
  BEFORE UPDATE ON recovery_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_recovery_cases_updated_at();

-- Creator settings updated_at trigger
CREATE OR REPLACE FUNCTION update_creator_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure only the owning company can modify their settings
  IF get_current_company_id() IS NOT NULL AND NEW.company_id != get_current_company_id() THEN
    RAISE EXCEPTION 'Access denied: Cannot modify settings for different company';
  END IF;

  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER creator_settings_updated_at_trigger
  BEFORE UPDATE ON creator_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_settings_updated_at();

-- ===================================================================
-- SECURITY VALIDATION QUERIES
-- ===================================================================

-- Test queries that can be run to validate RLS is working correctly:
--
-- SET app.current_company_id = 'company_123';
-- SELECT COUNT(*) FROM recovery_cases; -- Should only see company_123's data
-- INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at)
-- VALUES ('test_case', 'company_456', 'mem_123', 'user_123', NOW());
-- -- This should FAIL because company_id (company_456) != current_company (company_123)
--
-- RESET app.current_company_id;
-- SELECT COUNT(*) FROM recovery_cases;
-- -- This should return 0 rows (no company context = no access)
