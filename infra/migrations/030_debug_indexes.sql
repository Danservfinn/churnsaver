-- Migration: 030_debug_indexes.sql
-- Moves debug-related indexes to run after debug tables are created

-- Debug logs indexes
CREATE INDEX IF NOT EXISTS idx_debug_logs_company_created
ON debug_logs (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_debug_logs_company_level_created
ON debug_logs (company_id, level, created_at);

-- Debug sessions indexes
CREATE INDEX IF NOT EXISTS idx_debug_sessions_company_created
ON debug_sessions (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_debug_sessions_session_company
ON debug_sessions (session_id, company_id);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Debug indexes migration completed successfully';
    RAISE NOTICE 'Created indexes: idx_debug_logs_company_created, idx_debug_logs_company_level_created, idx_debug_sessions_company_created, idx_debug_sessions_session_company';
END $$;

