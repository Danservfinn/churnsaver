-- Security alerts table for intrusion detection and security monitoring
-- Stores security events, alerts, and threat intelligence

CREATE TABLE IF NOT EXISTS security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert classification
    category VARCHAR(50) NOT NULL CHECK (category IN ('authentication', 'authorization', 'intrusion', 'data_breach', 'rate_limit', 'anomaly')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    
    -- Source information
    ip INET,
    user_agent TEXT,
    user_id VARCHAR(255),
    company_id VARCHAR(255),
    endpoint VARCHAR(500),
    
    -- Additional metadata as JSON
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps and resolution
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    
    -- Constraints
    CHECK (resolved_at IS NULL OR resolved = TRUE),
    CHECK (resolved_by IS NULL OR resolved = TRUE)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_alerts_category_severity ON security_alerts(category, severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_ip ON security_alerts(ip) WHERE ip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_alerts_user_id ON security_alerts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_alerts_company_id ON security_alerts(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_alerts_resolved ON security_alerts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_security_alerts_metadata_gin ON security_alerts USING gin(metadata);

-- Security metrics table for dashboard analytics
CREATE TABLE IF NOT EXISTS security_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    tags JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_metrics_name_time ON security_metrics(metric_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_metrics_tags_gin ON security_metrics USING gin(tags);

-- Security event patterns table for known threat signatures
CREATE TABLE IF NOT EXISTS security_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern_name VARCHAR(100) NOT NULL UNIQUE,
    pattern_type VARCHAR(50) NOT NULL,
    description TEXT,
    signature JSONB NOT NULL, -- Pattern matching rules
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_patterns_active ON security_patterns(is_active) WHERE is_active = TRUE;

-- Security audit log table for compliance
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    
    -- Context information
    user_id VARCHAR(255),
    company_id VARCHAR(255),
    ip INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    
    -- Event details
    endpoint VARCHAR(500),
    method VARCHAR(10),
    status_code INTEGER,
    duration_ms INTEGER,
    
    -- Additional context
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Partition audit log by month for performance
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_partitioned_table pt
        JOIN pg_class c ON c.oid = pt.partrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'security_audit_log'
          AND n.nspname = ANY (current_schemas(true))
    ) THEN
        EXECUTE $stmt$
            CREATE TABLE IF NOT EXISTS security_audit_log_y2024m10
            PARTITION OF security_audit_log
            FOR VALUES FROM ('2024-10-01') TO ('2024-11-01')
        $stmt$;
    ELSE
        RAISE NOTICE 'security_audit_log is not partitioned; skipping partition creation';
    END IF;
END;
$$;

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at ON security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_event_type ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_category_severity ON security_audit_log(category, severity);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id ON security_audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_audit_log_ip ON security_audit_log(ip) WHERE ip IS NOT NULL;

-- Row Level Security for multi-tenant access
ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see alerts/audit logs for their company
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Users can view own company security alerts'
          AND tablename = 'security_alerts'
          AND schemaname = ANY(current_schemas(true))
    ) THEN
        EXECUTE $pol$
        CREATE POLICY "Users can view own company security alerts" ON security_alerts
            FOR SELECT USING (
                company_id = current_setting('app.current_company_id', true) OR
                current_setting('app.current_company_id', true) IS NULL
            )
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE policyname = 'Users can view own company audit logs'
          AND tablename = 'security_audit_log'
          AND schemaname = ANY(current_schemas(true))
    ) THEN
        EXECUTE $pol$
        CREATE POLICY "Users can view own company audit logs" ON security_audit_log
            FOR SELECT USING (
                company_id = current_setting('app.current_company_id', true) OR
                current_setting('app.current_company_id', true) IS NULL
            )
        $pol$;
    END IF;
END;
$$;

-- Insert default security patterns
INSERT INTO security_patterns (pattern_name, pattern_type, description, signature, severity) VALUES
('brute_force_attack', 'threshold', 'Multiple authentication failures from same IP', 
 '{"failures": 5, "time_window": "5m", "category": "authentication"}', 'critical'),
('distributed_attack', 'threshold', 'Same event type from many different IPs',
 '{"unique_ips": 10, "time_window": "1h", "category": "rate_limit"}', 'high'),
('unusual_access_pattern', 'anomaly', 'Unusual access patterns for a user',
 '{"unique_endpoints": 20, "failure_rate": 0.5, "time_window": "1h"}', 'medium'),
('webhook_abuse', 'threshold', 'Excessive webhook failures',
 '{"failures": 50, "time_window": "1h", "endpoint": "webhook"}', 'high'),
('suspicious_user_agent', 'pattern', 'Known bot/scanner user agents',
 '{"patterns": ["bot", "crawler", "scanner", "curl", "wget", "python"]}', 'low'),
('geographic_anomaly', 'anomaly', 'Unusual geographic access patterns',
 '{"unique_ips": 5, "time_window": "24h", "same_user": true}', 'medium')
ON CONFLICT (pattern_name) DO NOTHING;

-- Create security monitoring function
CREATE OR REPLACE FUNCTION update_security_metrics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update security metrics when new alerts are created
    INSERT INTO security_metrics (metric_name, metric_value, tags)
    VALUES 
        ('security.alerts.total', 1, jsonb_build_object('category', NEW.category, 'severity', NEW.severity)),
        ('security.alerts.' || NEW.category, 1, jsonb_build_object('severity', NEW.severity));
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update metrics
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_update_security_metrics'
    ) THEN
        CREATE TRIGGER trigger_update_security_metrics
            AFTER INSERT ON security_alerts
            FOR EACH ROW
            EXECUTE FUNCTION update_security_metrics();
    END IF;
END;
$$;

-- Function to clean up old audit logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_security_audit_logs()
RETURNS void AS $$
BEGIN
    -- Delete audit logs older than 1 year
    DELETE FROM security_audit_log 
    WHERE created_at < NOW() - INTERVAL '1 year';
    
    -- Delete resolved alerts older than 6 months
    DELETE FROM security_alerts 
    WHERE resolved = TRUE 
    AND resolved_at < NOW() - INTERVAL '6 months';
    
    -- Delete old metrics (keep last 30 days)
    DELETE FROM security_metrics 
    WHERE recorded_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT ON security_alerts TO authenticated;
GRANT SELECT ON security_metrics TO authenticated;
GRANT SELECT ON security_patterns TO authenticated;
GRANT SELECT, INSERT ON security_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_security_audit_logs TO authenticated;

-- Add comment
COMMENT ON TABLE security_alerts IS 'Security alerts for intrusion detection and threat monitoring';
COMMENT ON TABLE security_metrics IS 'Security metrics for dashboard analytics and monitoring';
COMMENT ON TABLE security_patterns IS 'Known threat patterns and signatures for detection';
COMMENT ON TABLE security_audit_log IS 'Security audit log for compliance and forensic analysis';