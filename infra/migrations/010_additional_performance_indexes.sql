-- Migration: 010_additional_performance_indexes.sql
-- Add additional performance indexes for critical query patterns

-- Events table indexes (critical for webhook processing performance)
-- Composite index for unprocessed events by company and received time
CREATE INDEX IF NOT EXISTS idx_events_company_processed_received
ON events (company_id, processed, received_at);

-- Index for event lookup by whop_event_id and company (duplicate prevention)
CREATE INDEX IF NOT EXISTS idx_events_whop_event_id_company
ON events (whop_event_id, company_id);

-- Index for filtering events by company, type, and processed status
CREATE INDEX IF NOT EXISTS idx_events_company_type_processed
ON events (company_id, type, processed);

-- Debug logs indexes (for debugging and monitoring)
-- Index for filtering debug logs by company and creation time
CREATE INDEX IF NOT EXISTS idx_debug_logs_company_created
ON debug_logs (company_id, created_at);

-- Composite index for debug logs by company, level, and time
CREATE INDEX IF NOT EXISTS idx_debug_logs_company_level_created
ON debug_logs (company_id, level, created_at);

-- Debug sessions indexes
-- Index for filtering debug sessions by company and creation time
CREATE INDEX IF NOT EXISTS idx_debug_sessions_company_created
ON debug_sessions (company_id, created_at);

-- Index for debug session lookup by session_id and company
CREATE INDEX IF NOT EXISTS idx_debug_sessions_session_company
ON debug_sessions (session_id, company_id);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Additional performance indexes migration completed successfully';
    RAISE NOTICE 'Created indexes: idx_events_company_processed_received, idx_events_whop_event_id_company, idx_events_company_type_processed, idx_debug_logs_company_created, idx_debug_logs_company_level_created, idx_debug_sessions_company_created, idx_debug_sessions_session_company';
END $$;