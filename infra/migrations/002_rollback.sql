-- Churn Saver Database Schema Rollback
-- Rollback: 002_rollback.sql
-- Reverses migration: 002_enable_rls_policies.sql

-- WARNING: This will disable Row Level Security and remove all security policies
-- This will expose all data to all users with database access
-- Consider security implications before proceeding

-- Drop triggers first
DROP TRIGGER IF EXISTS creator_settings_updated_at_trigger ON creator_settings;
DROP TRIGGER IF EXISTS recovery_cases_updated_at_trigger ON recovery_cases;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_creator_settings_updated_at();
DROP FUNCTION IF EXISTS update_recovery_cases_updated_at();

-- Drop RLS policies (idempotent)
DROP POLICY IF EXISTS recovery_actions_company_delete_policy ON recovery_actions;
DROP POLICY IF EXISTS recovery_actions_company_select_policy ON recovery_actions;
DROP POLICY IF EXISTS recovery_actions_company_insert_policy ON recovery_actions;
DROP POLICY IF EXISTS creator_settings_company_update_policy ON creator_settings;
DROP POLICY IF EXISTS creator_settings_company_select_policy ON creator_settings;
DROP POLICY IF EXISTS creator_settings_company_insert_policy ON creator_settings;
DROP POLICY IF EXISTS recovery_cases_company_update_policy ON recovery_cases;
DROP POLICY IF EXISTS recovery_cases_company_select_policy ON recovery_cases;
DROP POLICY IF EXISTS recovery_cases_company_insert_policy ON recovery_cases;
DROP POLICY IF EXISTS events_company_update_policy ON events;
DROP POLICY IF EXISTS events_company_select_policy ON events;
DROP POLICY IF EXISTS events_webhook_insert_policy ON events;

-- Disable Row Level Security on all tables
ALTER TABLE recovery_actions DISABLE ROW LEVEL SECURITY;
ALTER TABLE creator_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;

-- Drop helper functions
DROP FUNCTION IF EXISTS get_current_company_id();
DROP FUNCTION IF EXISTS set_company_context(text);

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'RLS policies rollback completed successfully';
    RAISE NOTICE 'Disabled Row Level Security on all tables';
    RAISE NOTICE 'Dropped all RLS policies, triggers, and helper functions';
    RAISE NOTICE 'WARNING: Multi-tenant security has been disabled';
    RAISE NOTICE 'All data is now accessible to all users with database access';
END $$;