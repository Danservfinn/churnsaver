-- Migration: 010_additional_performance_indexes.sql
-- Add additional performance indexes for critical query patterns

-- Index for event lookup by whop_event_id and company (duplicate prevention)
CREATE INDEX IF NOT EXISTS idx_events_whop_event_id_company
ON events (whop_event_id, company_id);

-- Index for filtering events by company, type, and processed status
CREATE INDEX IF NOT EXISTS idx_events_company_type_processed
ON events (company_id, type, processed);

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Additional performance indexes migration completed successfully';
    RAISE NOTICE 'Created indexes: idx_events_whop_event_id_company, idx_events_company_type_processed';
END $$;