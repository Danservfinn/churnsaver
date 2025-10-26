-- Rollback Migration: 015_user_deletion_tracking.sql
-- Removes GDPR user deletion functionality

-- Drop functions first (due to dependencies)
DROP FUNCTION IF EXISTS can_request_user_deletion(text, text);
DROP FUNCTION IF EXISTS create_user_deletion_request(text, text, inet, text, boolean, jsonb);
DROP FUNCTION IF EXISTS update_deletion_request_status(uuid, text, text);
DROP FUNCTION IF EXISTS create_deleted_user_record(text, text, uuid, text, text, jsonb, text);

-- Drop RLS policies
DROP POLICY IF EXISTS user_deletion_requests_user_policy ON user_deletion_requests;
DROP POLICY IF EXISTS user_deletion_requests_admin_policy ON user_deletion_requests;
DROP POLICY IF EXISTS deleted_users_admin_policy ON deleted_users;

-- Drop indexes
DROP INDEX IF EXISTS idx_user_deletion_requests_user_id;
DROP INDEX IF EXISTS idx_user_deletion_requests_company_id;
DROP INDEX IF EXISTS idx_user_deletion_requests_status;
DROP INDEX IF EXISTS idx_user_deletion_requests_requested_at;
DROP INDEX IF EXISTS idx_user_deletion_requests_user_company;

DROP INDEX IF EXISTS idx_deleted_users_original_user_id;
DROP INDEX IF EXISTS idx_deleted_users_original_company_id;
DROP INDEX IF EXISTS idx_deleted_users_deleted_at;
DROP INDEX IF EXISTS idx_deleted_users_retention_expiry;
DROP INDEX IF EXISTS idx_deleted_users_deletion_request_id;

-- Disable Row Level Security
ALTER TABLE user_deletion_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_users DISABLE ROW LEVEL SECURITY;

-- Drop tables
DROP TABLE IF EXISTS deleted_users;
DROP TABLE IF EXISTS user_deletion_requests;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'User deletion tracking rollback completed successfully';
    RAISE NOTICE 'Dropped tables: user_deletion_requests, deleted_users';
    RAISE NOTICE 'Dropped indexes and RLS policies';
    RAISE NOTICE 'Dropped functions for deletion request management';
END $$;