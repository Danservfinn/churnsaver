-- Migration: 020_job_queue_enhancements.sql
-- Enhanced job queue error handling with dead letter queue, metrics, and recovery tracking

-- Create job_queue_dead_letter table for failed job handling
CREATE TABLE IF NOT EXISTS job_queue_dead_letter (
    id VARCHAR(255) PRIMARY KEY,
    original_job_id VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    job_data JSONB NOT NULL,
    failure_reason VARCHAR(255) NOT NULL,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0 NOT NULL,
    max_retries INTEGER DEFAULT 5 NOT NULL,
    first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    priority INTEGER DEFAULT 0 NOT NULL,
    company_id VARCHAR(255),
    recovery_attempts INTEGER DEFAULT 0 NOT NULL,
    auto_recovery_enabled BOOLEAN DEFAULT true NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create job_queue_metrics table for performance monitoring
CREATE TABLE IF NOT EXISTS job_queue_metrics (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    company_id VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    duration_ms INTEGER,
    attempts INTEGER DEFAULT 1 NOT NULL,
    error_category VARCHAR(100),
    error_code VARCHAR(100),
    error_message TEXT,
    recovery_strategy VARCHAR(100),
    circuit_breaker_state VARCHAR(50),
    memory_usage_mb INTEGER,
    queue_depth INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create job_queue_recovery_log table for recovery tracking
CREATE TABLE IF NOT EXISTS job_queue_recovery_log (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    company_id VARCHAR(255),
    recovery_strategy VARCHAR(100) NOT NULL,
    action VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    duration_ms INTEGER,
    attempts INTEGER DEFAULT 1 NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_job_type ON job_queue_dead_letter(job_type);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_company_id ON job_queue_dead_letter(company_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_next_retry ON job_queue_dead_letter(next_retry_at) WHERE auto_recovery_enabled = true;
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_priority ON job_queue_dead_letter(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_job_queue_dead_letter_created_at ON job_queue_dead_letter(created_at);

CREATE INDEX IF NOT EXISTS idx_job_queue_metrics_job_id ON job_queue_metrics(job_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_metrics_job_type ON job_queue_metrics(job_type);
CREATE INDEX IF NOT EXISTS idx_job_queue_metrics_company_id ON job_queue_metrics(company_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_metrics_status ON job_queue_metrics(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_metrics_created_at ON job_queue_metrics(created_at);

CREATE INDEX IF NOT EXISTS idx_job_queue_recovery_log_job_id ON job_queue_recovery_log(job_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_recovery_log_job_type ON job_queue_recovery_log(job_type);
CREATE INDEX IF NOT EXISTS idx_job_queue_recovery_log_company_id ON job_queue_recovery_log(company_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_recovery_log_created_at ON job_queue_recovery_log(created_at);

-- Row Level Security policies for multi-tenant isolation
ALTER TABLE job_queue_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_queue_recovery_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for job_queue_dead_letter
CREATE POLICY job_queue_dead_letter_company_policy ON job_queue_dead_letter
    FOR ALL
    TO authenticated
    USING (company_id IS NULL OR company_id = current_setting('app.current_company_id', true));

-- RLS policies for job_queue_metrics
CREATE POLICY job_queue_metrics_company_policy ON job_queue_metrics
    FOR ALL
    TO authenticated
    USING (company_id IS NULL OR company_id = current_setting('app.current_company_id', true));

-- RLS policies for job_queue_recovery_log
CREATE POLICY job_queue_recovery_log_company_policy ON job_queue_recovery_log
    FOR ALL
    TO authenticated
    USING (company_id IS NULL OR company_id = current_setting('app.current_company_id', true));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_job_queue_dead_letter_updated_at
    BEFORE UPDATE ON job_queue_dead_letter
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE job_queue_dead_letter IS 'Stores failed jobs that exceeded retry limits for later recovery';
COMMENT ON TABLE job_queue_metrics IS 'Tracks performance metrics and execution details for job queue operations';
COMMENT ON TABLE job_queue_recovery_log IS 'Logs recovery attempts and strategies applied to failed jobs';

COMMENT ON COLUMN job_queue_dead_letter.original_job_id IS 'Original job ID from the main queue';
COMMENT ON COLUMN job_queue_dead_letter.job_type IS 'Type of job (webhook-processing, reminder-processing, etc.)';
COMMENT ON COLUMN job_queue_dead_letter.job_data IS 'Original job payload data';
COMMENT ON COLUMN job_queue_dead_letter.failure_reason IS 'Primary reason for job failure';
COMMENT ON COLUMN job_queue_dead_letter.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN job_queue_dead_letter.max_retries IS 'Maximum allowed retry attempts';
COMMENT ON COLUMN job_queue_dead_letter.next_retry_at IS 'Scheduled time for next recovery attempt';
COMMENT ON COLUMN job_queue_dead_letter.priority IS 'Job priority for recovery processing (higher = more important)';
COMMENT ON COLUMN job_queue_dead_letter.recovery_attempts IS 'Number of recovery strategy attempts';
COMMENT ON COLUMN job_queue_dead_letter.auto_recovery_enabled IS 'Whether automatic recovery is enabled';

COMMENT ON COLUMN job_queue_metrics.job_id IS 'Identifier for the job';
COMMENT ON COLUMN job_queue_metrics.job_type IS 'Type of job processed';
COMMENT ON COLUMN job_queue_metrics.status IS 'Final status (completed, failed, dead_letter)';
COMMENT ON COLUMN job_queue_metrics.duration_ms IS 'Processing duration in milliseconds';
COMMENT ON COLUMN job_queue_metrics.attempts IS 'Number of attempts made';
COMMENT ON COLUMN job_queue_metrics.error_category IS 'Category of error if failed';
COMMENT ON COLUMN job_queue_metrics.error_code IS 'Specific error code if failed';
COMMENT ON COLUMN job_queue_metrics.recovery_strategy IS 'Recovery strategy applied if applicable';
COMMENT ON COLUMN job_queue_metrics.circuit_breaker_state IS 'State of circuit breaker during processing';
COMMENT ON COLUMN job_queue_metrics.memory_usage_mb IS 'Memory usage in MB during processing';
COMMENT ON COLUMN job_queue_metrics.queue_depth IS 'Depth of queue when job was processed';

COMMENT ON COLUMN job_queue_recovery_log.recovery_strategy IS 'Name of recovery strategy used';
COMMENT ON COLUMN job_queue_recovery_log.action IS 'Specific action taken during recovery';
COMMENT ON COLUMN job_queue_recovery_log.success IS 'Whether the recovery attempt was successful';
COMMENT ON COLUMN job_queue_recovery_log.duration_ms IS 'Duration of recovery attempt in milliseconds';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 020_job_queue_enhancements.sql completed successfully';
    RAISE NOTICE 'Created tables: job_queue_dead_letter, job_queue_metrics, job_queue_recovery_log';
    RAISE NOTICE 'Created indexes for performance optimization';
    RAISE NOTICE 'Enabled Row Level Security for multi-tenant isolation';
    RAISE NOTICE 'Added triggers for updated_at columns';
END $$;