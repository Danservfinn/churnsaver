-- Rollback Migration: 019_rollback.sql
-- Rollback debug tables and related objects

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_debug_sessions_updated_at ON debug_sessions;

-- Drop functions
DROP FUNCTION IF EXISTS update_debug_sessions_updated_at();
DROP FUNCTION IF EXISTS expire_debug_sessions();
DROP FUNCTION IF EXISTS cleanup_old_debug_data();
DROP FUNCTION IF EXISTS generate_debug_report(text);

-- Drop indexes
DROP INDEX IF EXISTS idx_debug_sessions_session_id;
DROP INDEX IF EXISTS idx_debug_sessions_user_company;
DROP INDEX IF EXISTS idx_debug_sessions_status;
DROP INDEX IF EXISTS idx_debug_sessions_environment;
DROP INDEX IF EXISTS idx_debug_sessions_expires_at;
DROP INDEX IF EXISTS idx_debug_sessions_created_at;

DROP INDEX IF EXISTS idx_debug_logs_session_id;
DROP INDEX IF EXISTS idx_debug_logs_user_company;
DROP INDEX IF EXISTS idx_debug_logs_level;
DROP INDEX IF EXISTS idx_debug_logs_category;
DROP INDEX IF EXISTS idx_debug_logs_request_id;
DROP INDEX IF EXISTS idx_debug_logs_endpoint;
DROP INDEX IF EXISTS idx_debug_logs_created_at;
DROP INDEX IF EXISTS idx_debug_logs_session_level;
DROP INDEX IF EXISTS idx_debug_logs_session_created;

DROP INDEX IF EXISTS idx_debug_reports_session_id;
DROP INDEX IF EXISTS idx_debug_reports_user_company;
DROP INDEX IF EXISTS idx_debug_reports_generated_at;
DROP INDEX IF EXISTS idx_debug_reports_created_at;

-- Drop tables (in correct order due to foreign key constraints)
DROP TABLE IF EXISTS debug_reports;
DROP TABLE IF EXISTS debug_logs;
DROP TABLE IF EXISTS debug_sessions;

-- Log rollback completion
DO $$
BEGIN
    RAISE NOTICE 'Debug tables rollback completed successfully';
    RAISE NOTICE 'Dropped tables: debug_reports, debug_logs, debug_sessions';
    RAISE NOTICE 'Dropped indexes, triggers, and functions';
END $$;