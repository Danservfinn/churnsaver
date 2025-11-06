-- Migration: 011_slow_queries_table.sql
-- Create table for storing slow query performance data

CREATE TABLE IF NOT EXISTS slow_queries (
  id SERIAL PRIMARY KEY,
  query_text TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  row_count INTEGER DEFAULT 0,
  company_id TEXT,
  user_id TEXT,
  endpoint TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Add indexes for performance analysis
  CONSTRAINT chk_duration_positive CHECK (duration_ms > 0),
  CONSTRAINT chk_row_count_non_negative CHECK (row_count >= 0)
);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_slow_queries_created_at
ON slow_queries (created_at);

-- Index for company-based analysis
CREATE INDEX IF NOT EXISTS idx_slow_queries_company_created
ON slow_queries (company_id, created_at);

-- Index for duration-based analysis
CREATE INDEX IF NOT EXISTS idx_slow_queries_duration_created
ON slow_queries (duration_ms, created_at);

-- Index for endpoint-based analysis
CREATE INDEX IF NOT EXISTS idx_slow_queries_endpoint_created
ON slow_queries (endpoint, created_at);

-- Add RLS policy for company isolation
ALTER TABLE slow_queries ENABLE ROW LEVEL SECURITY;

-- Policy: Companies can only see their own slow queries
CREATE POLICY slow_queries_company_isolation ON slow_queries
  FOR ALL USING (
    company_id IS NULL OR
    company_id = current_setting('app.company_context', true)
  );

-- Policy: Allow service role to manage all records (for monitoring)
CREATE POLICY slow_queries_service_role ON slow_queries
  FOR ALL USING (
    current_setting('role') = 'service_role' OR
    current_setting('request.jwt.claim.role') = 'service_role'
  );

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Slow queries table migration completed successfully';
    RAISE NOTICE 'Created table: slow_queries with indexes and RLS policies';
END $$;