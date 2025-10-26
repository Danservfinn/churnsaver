-- Migration: 018_error_recovery_enhancements.sql
-- Enhanced error recovery tables for comprehensive error tracking and recovery metrics

-- Error recovery metrics table for tracking recovery patterns
CREATE TABLE IF NOT EXISTS error_recovery_metrics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name text NOT NULL,
  operation_type text NOT NULL,
  error_category text NOT NULL,
  error_code text NOT NULL,
  recovery_strategy text NOT NULL,
  success boolean NOT NULL,
  attempts int NOT NULL DEFAULT 1,
  duration_ms int NOT NULL,
  circuit_breaker_state text,
  memory_usage_mb int,
  error_message text,
  metadata jsonb DEFAULT '{}',
  company_id text,
  user_id text,
  request_id text,
  created_at timestamptz DEFAULT now()
);

-- Transaction rollback log table for audit trail
CREATE TABLE IF NOT EXISTS transaction_rollback_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id text NOT NULL,
  service_name text NOT NULL,
  operation_type text NOT NULL,
  rollback_reason text NOT NULL,
  rollback_success boolean NOT NULL,
  rollback_duration_ms int,
  affected_tables text[] DEFAULT '{}',
  rollback_data jsonb DEFAULT '{}',
  error_message text,
  company_id text,
  user_id text,
  request_id text,
  created_at timestamptz DEFAULT now()
);

-- Job queue dead letter table for failed job handling
CREATE TABLE IF NOT EXISTS job_queue_dead_letter (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_job_id text NOT NULL,
  job_type text NOT NULL,
  job_data jsonb NOT NULL,
  failure_reason text NOT NULL,
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  max_retries int NOT NULL DEFAULT 3,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz,
  priority int DEFAULT 0,
  company_id text,
  recovery_attempts int DEFAULT 0,
  auto_recovery_enabled boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Memory pressure events table for tracking memory-related recovery
CREATE TABLE IF NOT EXISTS memory_pressure_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name text NOT NULL,
  memory_usage_mb int NOT NULL,
  memory_threshold_mb int NOT NULL,
  pressure_duration_ms int,
  recovery_action text NOT NULL,
  recovery_success boolean NOT NULL,
  gc_triggered boolean DEFAULT false,
  process_restart boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  company_id text,
  request_id text,
  created_at timestamptz DEFAULT now()
);

-- Circuit breaker events table for tracking circuit breaker state changes
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  circuit_name text NOT NULL,
  previous_state text NOT NULL,
  new_state text NOT NULL,
  trigger_reason text NOT NULL,
  failure_count int NOT NULL DEFAULT 0,
  success_count int NOT NULL DEFAULT 0,
  timeout_ms int,
  recovery_timeout_ms int,
  metadata jsonb DEFAULT '{}',
  company_id text,
  created_at timestamptz DEFAULT now()
);

-- Indexes for error_recovery_metrics
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_service_created ON error_recovery_metrics(service_name, created_at);
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_category_success ON error_recovery_metrics(error_category, success, created_at);
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_strategy ON error_recovery_metrics(recovery_strategy, created_at);
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_company ON error_recovery_metrics(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_error_recovery_metrics_request_id ON error_recovery_metrics(request_id);

-- Indexes for transaction_rollback_log
CREATE INDEX IF NOT EXISTS idx_transaction_rollback_transaction_id ON transaction_rollback_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_rollback_service_created ON transaction_rollback_log(service_name, created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_rollback_success ON transaction_rollback_log(rollback_success, created_at);
CREATE INDEX IF NOT EXISTS idx_transaction_rollback_company ON transaction_rollback_log(company_id, created_at);

-- Indexes for job_queue_dead_letter
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_job_type ON job_queue_dead_letter(job_type, created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_retry ON job_queue_dead_letter(next_retry_at, auto_recovery_enabled);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_original_job ON job_queue_dead_letter(original_job_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_company ON job_queue_dead_letter(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_priority ON job_queue_dead_letter(priority DESC, created_at);

-- Indexes for memory_pressure_events
CREATE INDEX IF NOT EXISTS idx_memory_pressure_service_created ON memory_pressure_events(service_name, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_pressure_success ON memory_pressure_events(recovery_success, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_pressure_company ON memory_pressure_events(company_id, created_at);

-- Indexes for circuit_breaker_events
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_name_created ON circuit_breaker_events(circuit_name, created_at);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state_change ON circuit_breaker_events(new_state, created_at);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_company ON circuit_breaker_events(company_id, created_at);

-- Row Level Security policies
ALTER TABLE error_recovery_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_rollback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_pressure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuit_breaker_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for error_recovery_metrics
CREATE POLICY "Users can view their own error recovery metrics" ON error_recovery_metrics
  FOR SELECT USING (
    company_id IS NULL OR 
    current_setting('app.current_company_id', true) = company_id OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Service accounts can insert error recovery metrics" ON error_recovery_metrics
  FOR INSERT WITH CHECK (
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- RLS policies for transaction_rollback_log
CREATE POLICY "Users can view their own transaction rollback logs" ON transaction_rollback_log
  FOR SELECT USING (
    company_id IS NULL OR 
    current_setting('app.current_company_id', true) = company_id OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Service accounts can insert transaction rollback logs" ON transaction_rollback_log
  FOR INSERT WITH CHECK (
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- RLS policies for job_queue_dead_letter
CREATE POLICY "Users can view their own dead letter jobs" ON job_queue_dead_letter
  FOR SELECT USING (
    company_id IS NULL OR 
    current_setting('app.current_company_id', true) = company_id OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Service accounts can manage dead letter jobs" ON job_queue_dead_letter
  FOR ALL WITH CHECK (
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- RLS policies for memory_pressure_events
CREATE POLICY "Users can view their own memory pressure events" ON memory_pressure_events
  FOR SELECT USING (
    company_id IS NULL OR 
    current_setting('app.current_company_id', true) = company_id OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Service accounts can insert memory pressure events" ON memory_pressure_events
  FOR INSERT WITH CHECK (
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- RLS policies for circuit_breaker_events
CREATE POLICY "Users can view their own circuit breaker events" ON circuit_breaker_events
  FOR SELECT USING (
    company_id IS NULL OR 
    current_setting('app.current_company_id', true) = company_id OR
    current_setting('app.user_role', true) = 'admin'
  );

CREATE POLICY "Service accounts can insert circuit breaker events" ON circuit_breaker_events
  FOR INSERT WITH CHECK (
    current_setting('app.user_role', true) IN ('service', 'admin')
  );

-- Function to update updated_at timestamp on job_queue_dead_letter
CREATE OR REPLACE FUNCTION update_job_queue_dead_letter_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_job_queue_dead_letter_updated_at
  BEFORE UPDATE ON job_queue_dead_letter
  FOR EACH ROW
  EXECUTE FUNCTION update_job_queue_dead_letter_updated_at();

-- Function to clean up old error recovery metrics (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_error_recovery_metrics()
RETURNS void AS $$
BEGIN
  -- Delete error recovery metrics older than 90 days
  DELETE FROM error_recovery_metrics 
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- Delete transaction rollback logs older than 1 year
  DELETE FROM transaction_rollback_log 
  WHERE created_at < NOW() - INTERVAL '1 year';
  
  -- Delete resolved dead letter jobs older than 30 days
  DELETE FROM job_queue_dead_letter 
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND (recovery_attempts >= max_retries OR auto_recovery_enabled = false);
  
  -- Delete memory pressure events older than 30 days
  DELETE FROM memory_pressure_events 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete circuit breaker events older than 60 days
  DELETE FROM circuit_breaker_events 
  WHERE created_at < NOW() - INTERVAL '60 days';
  
  RAISE NOTICE 'Error recovery metrics cleanup completed';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to service role
GRANT SELECT, INSERT ON error_recovery_metrics TO service_role;
GRANT SELECT, INSERT ON transaction_rollback_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON job_queue_dead_letter TO service_role;
GRANT SELECT, INSERT ON memory_pressure_events TO service_role;
GRANT SELECT, INSERT ON circuit_breaker_events TO service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Error recovery enhancements migration completed successfully';
    RAISE NOTICE 'Created tables: error_recovery_metrics, transaction_rollback_log, job_queue_dead_letter, memory_pressure_events, circuit_breaker_events';
    RAISE NOTICE 'Created indexes for performance optimization';
    RAISE NOTICE 'Enabled Row Level Security with appropriate policies';
    RAISE NOTICE 'Created cleanup function for data retention';
END $$;