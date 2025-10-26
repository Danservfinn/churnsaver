-- Migration: 019_debug_tables.sql
-- Debug tables for comprehensive debugging and troubleshooting

-- Debug sessions table for managing debug sessions
CREATE TABLE IF NOT EXISTS debug_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL UNIQUE,
  user_id text NOT NULL,
  company_id text NOT NULL,
  title text NOT NULL,
  description text,
  debug_level text NOT NULL CHECK (debug_level IN ('debug', 'info', 'warn', 'error')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'expired')),
  environment text NOT NULL DEFAULT 'development' CHECK (environment IN ('development', 'staging', 'production')),
  filters jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Debug logs table for storing debug entries
CREATE TABLE IF NOT EXISTS debug_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL REFERENCES debug_sessions(session_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  company_id text NOT NULL,
  level text NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  category text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}',
  request_id text,
  endpoint text,
  method text,
  query_duration_ms int,
  query_text text,
  query_params jsonb DEFAULT '{}',
  stack_trace text,
  file_path text,
  line_number int,
  function_name text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Debug reports table for completed debug session reports
CREATE TABLE IF NOT EXISTS debug_reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id text NOT NULL REFERENCES debug_sessions(session_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  company_id text NOT NULL,
  title text NOT NULL,
  summary text,
  total_logs int NOT NULL DEFAULT 0,
  logs_by_level jsonb DEFAULT '{}',
  logs_by_category jsonb DEFAULT '{}',
  errors_count int NOT NULL DEFAULT 0,
  warnings_count int NOT NULL DEFAULT 0,
  performance_metrics jsonb DEFAULT '{}',
  recommendations jsonb DEFAULT '[]',
  report_data jsonb DEFAULT '{}',
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for debug_sessions
CREATE INDEX IF NOT EXISTS idx_debug_sessions_session_id ON debug_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_user_company ON debug_sessions(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_status ON debug_sessions(status);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_environment ON debug_sessions(environment);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_expires_at ON debug_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_debug_sessions_created_at ON debug_sessions(created_at);

-- Indexes for debug_logs
CREATE INDEX IF NOT EXISTS idx_debug_logs_session_id ON debug_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_debug_logs_user_company ON debug_logs(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_debug_logs_level ON debug_logs(level);
CREATE INDEX IF NOT EXISTS idx_debug_logs_category ON debug_logs(category);
CREATE INDEX IF NOT EXISTS idx_debug_logs_request_id ON debug_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_debug_logs_endpoint ON debug_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at ON debug_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_debug_logs_session_level ON debug_logs(session_id, level);
CREATE INDEX IF NOT EXISTS idx_debug_logs_session_created ON debug_logs(session_id, created_at);

-- Indexes for debug_reports
CREATE INDEX IF NOT EXISTS idx_debug_reports_session_id ON debug_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_debug_reports_user_company ON debug_reports(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_debug_reports_generated_at ON debug_reports(generated_at);
CREATE INDEX IF NOT EXISTS idx_debug_reports_created_at ON debug_reports(created_at);

-- Row Level Security policies
ALTER TABLE debug_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies for debug_sessions
CREATE POLICY "Users can view their own debug sessions" ON debug_sessions
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Users can create their own debug sessions" ON debug_sessions
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

CREATE POLICY "Users can update their own debug sessions" ON debug_sessions
  FOR UPDATE USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Users can delete their own debug sessions" ON debug_sessions
  FOR DELETE USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) = 'admin'
  );

-- RLS policies for debug_logs
CREATE POLICY "Users can view their own debug logs" ON debug_logs
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Service accounts can insert debug logs" ON debug_logs
  FOR INSERT WITH CHECK (
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- RLS policies for debug_reports
CREATE POLICY "Users can view their own debug reports" ON debug_reports
  FOR SELECT USING (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Users can create their own debug reports" ON debug_reports
  FOR INSERT WITH CHECK (
    user_id = current_setting('app.current_user_id', true) OR
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- Function to update updated_at timestamp on debug_sessions
CREATE OR REPLACE FUNCTION update_debug_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_debug_sessions_updated_at
  BEFORE UPDATE ON debug_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_debug_sessions_updated_at();

-- Function to automatically expire debug sessions
CREATE OR REPLACE FUNCTION expire_debug_sessions()
RETURNS void AS $$
BEGIN
  UPDATE debug_sessions 
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < NOW();
  
  RAISE NOTICE 'Expired debug sessions updated';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old debug data (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_debug_data()
RETURNS void AS $$
BEGIN
  -- Delete debug sessions older than 90 days
  DELETE FROM debug_sessions 
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND status IN ('completed', 'expired');
  
  -- Delete debug logs older than 30 days for non-production environments
  DELETE FROM debug_logs 
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND session_id IN (
      SELECT session_id FROM debug_sessions 
      WHERE environment != 'production'
    );
  
  -- Delete debug logs older than 7 days for production environment
  DELETE FROM debug_logs 
  WHERE created_at < NOW() - INTERVAL '7 days'
    AND session_id IN (
      SELECT session_id FROM debug_sessions 
      WHERE environment = 'production'
    );
  
  -- Delete debug reports older than 90 days
  DELETE FROM debug_reports 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  RAISE NOTICE 'Debug data cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Function to generate debug report from session
CREATE OR REPLACE FUNCTION generate_debug_report(p_session_id text)
RETURNS uuid AS $$
DECLARE
  v_report_id uuid;
  v_session_user_id text;
  v_session_company_id text;
  v_session_title text;
  v_total_logs int;
  v_logs_by_level jsonb;
  v_logs_by_category jsonb;
  v_errors_count int;
  v_warnings_count int;
BEGIN
  -- Get session information
  SELECT user_id, company_id, title
  INTO v_session_user_id, v_session_company_id, v_session_title
  FROM debug_sessions
  WHERE session_id = p_session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debug session not found: %', p_session_id;
  END IF;
  
  -- Calculate statistics
  SELECT COUNT(*)
  INTO v_total_logs
  FROM debug_logs
  WHERE session_id = p_session_id;
  
  SELECT jsonb_object_agg(level, count)
  INTO v_logs_by_level
  FROM (
    SELECT level, COUNT(*) as count
    FROM debug_logs
    WHERE session_id = p_session_id
    GROUP BY level
  ) AS level_counts;
  
  SELECT jsonb_object_agg(category, count)
  INTO v_logs_by_category
  FROM (
    SELECT category, COUNT(*) as count
    FROM debug_logs
    WHERE session_id = p_session_id
    GROUP BY category
  ) AS category_counts;
  
  SELECT COUNT(*)
  INTO v_errors_count
  FROM debug_logs
  WHERE session_id = p_session_id AND level = 'error';
  
  SELECT COUNT(*)
  INTO v_warnings_count
  FROM debug_logs
  WHERE session_id = p_session_id AND level = 'warn';
  
  -- Generate report
  INSERT INTO debug_reports (
    session_id,
    user_id,
    company_id,
    title,
    summary,
    total_logs,
    logs_by_level,
    logs_by_category,
    errors_count,
    warnings_count,
    performance_metrics,
    recommendations,
    report_data
  ) VALUES (
    p_session_id,
    v_session_user_id,
    v_session_company_id,
    CONCAT('Debug Report: ', v_session_title),
    CONCAT('Generated debug report for session ', p_session_id),
    v_total_logs,
    COALESCE(v_logs_by_level, '{}'),
    COALESCE(v_logs_by_category, '{}'),
    v_errors_count,
    v_warnings_count,
    jsonb_build_object(
      'avg_query_duration', (
        SELECT AVG(query_duration_ms)
        FROM debug_logs
        WHERE session_id = p_session_id AND query_duration_ms IS NOT NULL
      ),
      'max_query_duration', (
        SELECT MAX(query_duration_ms)
        FROM debug_logs
        WHERE session_id = p_session_id AND query_duration_ms IS NOT NULL
      )
    ),
    jsonb_build_array(
      CASE 
        WHEN v_errors_count > 10 THEN 'High error count detected - investigate critical issues'
        WHEN v_warnings_count > 20 THEN 'High warning count - review warnings for potential issues'
        WHEN v_total_logs > 1000 THEN 'High log volume - consider log filtering'
        ELSE 'Session appears normal'
      END
    ),
    jsonb_build_object(
      'generated_at', NOW(),
      'session_duration_hours', EXTRACT(EPOCH FROM (NOW() - (
        SELECT created_at FROM debug_sessions WHERE session_id = p_session_id
      ))) / 3600
    )
  )
  RETURNING id INTO v_report_id;
  
  -- Update session status to completed
  UPDATE debug_sessions
  SET status = 'completed'
  WHERE session_id = p_session_id;
  
  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to service role
GRANT SELECT, INSERT, UPDATE, DELETE ON debug_sessions TO service_role;
GRANT SELECT, INSERT ON debug_logs TO service_role;
GRANT SELECT, INSERT ON debug_reports TO service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Debug tables migration completed successfully';
    RAISE NOTICE 'Created tables: debug_sessions, debug_logs, debug_reports';
    RAISE NOTICE 'Created indexes for performance optimization';
    RAISE NOTICE 'Enabled Row Level Security with appropriate policies';
    RAISE NOTICE 'Created utility functions for session management and cleanup';
END $$;