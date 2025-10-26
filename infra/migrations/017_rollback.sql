-- Rollback Migration: 017_rollback.sql
-- Rollback for Consent Management System

-- Drop triggers first
DROP TRIGGER IF EXISTS consent_audit_trigger ON user_consents;
DROP TRIGGER IF EXISTS update_user_consents_updated_at ON user_consents;
DROP TRIGGER IF EXISTS update_consent_templates_updated_at ON consent_templates;

-- Drop functions
DROP FUNCTION IF EXISTS create_consent_audit_entry();
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS check_expired_consents();

-- Drop tables in reverse order of creation (due to foreign key dependencies)
DROP TABLE IF EXISTS consent_audit_log;
DROP TABLE IF EXISTS user_consents;
DROP TABLE IF EXISTS consent_templates;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Consent management rollback completed successfully';
    RAISE NOTICE 'Dropped tables: consent_audit_log, user_consents, consent_templates';
    RAISE NOTICE 'Dropped triggers and functions';
END $$;