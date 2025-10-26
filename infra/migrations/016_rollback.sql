-- Rollback Migration: 016_data_export_tracking.sql
-- Removes GDPR data export functionality

-- Drop functions first (due to dependencies)
DROP FUNCTION IF EXISTS can_request_data_export(text, text);
DROP FUNCTION IF EXISTS create_data_export_request(text, text, text, text[], timestamptz, timestamptz, inet, text, jsonb);
DROP FUNCTION IF EXISTS update_data_export_request_status(uuid, text, text, bigint, int);
DROP FUNCTION IF EXISTS create_data_export_file(uuid, text, text, bigint, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS record_export_file_download(uuid, text, inet);
DROP FUNCTION IF EXISTS cleanup_expired_exports();

-- Drop RLS policies
DROP POLICY IF EXISTS data_export_requests_user_policy ON data_export_requests;
DROP POLICY IF EXISTS data_export_requests_admin_policy ON data_export_requests;
DROP POLICY IF EXISTS data_export_files_user_policy ON data_export_files;
DROP POLICY IF EXISTS data_export_files_admin_policy ON data_export_files;
DROP POLICY IF EXISTS data_export_audit_log_admin_policy ON data_export_audit_log;

-- Drop indexes
DROP INDEX IF EXISTS idx_data_export_requests_user_id;
DROP INDEX IF EXISTS idx_data_export_requests_company_id;
DROP INDEX IF EXISTS idx_data_export_requests_status;
DROP INDEX IF EXISTS idx_data_export_requests_requested_at;
DROP INDEX IF EXISTS idx_data_export_requests_expires_at;
DROP INDEX IF EXISTS idx_data_export_requests_user_company;

DROP INDEX IF EXISTS idx_data_export_files_export_request_id;
DROP INDEX IF EXISTS idx_data_export_files_created_at;
DROP INDEX IF EXISTS idx_data_export_files_downloaded_at;

DROP INDEX IF EXISTS idx_data_export_audit_log_export_request_id;
DROP INDEX IF EXISTS idx_data_export_audit_log_action;
DROP INDEX IF EXISTS idx_data_export_audit_log_created_at;

-- Disable Row Level Security
ALTER TABLE data_export_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_audit_log DISABLE ROW LEVEL SECURITY;

-- Drop tables
DROP TABLE IF EXISTS data_export_audit_log;
DROP TABLE IF EXISTS data_export_files;
DROP TABLE IF EXISTS data_export_requests;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Data export tracking rollback completed successfully';
    RAISE NOTICE 'Dropped tables: data_export_requests, data_export_files, data_export_audit_log';
    RAISE NOTICE 'Dropped indexes and RLS policies';
    RAISE NOTICE 'Dropped functions for export request management';
END $$;