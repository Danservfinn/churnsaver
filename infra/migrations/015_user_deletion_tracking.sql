-- Churn Saver Database Schema Migration
-- Migration: 015_user_deletion_tracking.sql
-- Implements GDPR "right to be forgotten" functionality

-- Create user deletion requests table for tracking deletion requests
CREATE TABLE IF NOT EXISTS user_deletion_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    company_id text NOT NULL,
    request_ip inet,
    user_agent text,
    consent_given boolean NOT NULL DEFAULT false,
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
    requested_at timestamptz DEFAULT now(),
    processed_at timestamptz,
    completed_at timestamptz,
    error_message text,
    retry_count int DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb
);

-- Create deleted users table for audit trail of deleted users
CREATE TABLE IF NOT EXISTS deleted_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_user_id text NOT NULL,
    original_company_id text NOT NULL,
    deletion_request_id uuid REFERENCES user_deletion_requests(id) ON DELETE SET NULL,
    deleted_at timestamptz DEFAULT now(),
    deleted_by text, -- System or user identifier
    deletion_reason text,
    data_summary jsonb DEFAULT '{}'::jsonb, -- Summary of deleted data for audit
    retention_expiry timestamptz DEFAULT (now() + interval '30 days'), -- GDPR retention period
    compliance_notes text
);

-- Create indexes for user_deletion_requests
CREATE INDEX IF NOT EXISTS idx_user_deletion_requests_user_id ON user_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_deletion_requests_company_id ON user_deletion_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_user_deletion_requests_status ON user_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_deletion_requests_requested_at ON user_deletion_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_user_deletion_requests_user_company ON user_deletion_requests(user_id, company_id);

-- Create indexes for deleted_users
CREATE INDEX IF NOT EXISTS idx_deleted_users_original_user_id ON deleted_users(original_user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_users_original_company_id ON deleted_users(original_company_id);
CREATE INDEX IF NOT EXISTS idx_deleted_users_deleted_at ON deleted_users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_deleted_users_retention_expiry ON deleted_users(retention_expiry);
CREATE INDEX IF NOT EXISTS idx_deleted_users_deletion_request_id ON deleted_users(deletion_request_id);

-- Enable Row Level Security for both tables
ALTER TABLE user_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_users ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for user_deletion_requests
-- Users can only see their own deletion requests
CREATE POLICY user_deletion_requests_user_policy ON user_deletion_requests
    FOR ALL USING (
        user_id = current_setting('app.current_user_id', true)::text
    );

-- Admin policy for user_deletion_requests
CREATE POLICY user_deletion_requests_admin_policy ON user_deletion_requests
    FOR ALL USING (
        current_setting('app.is_admin', true)::boolean = true
    );

-- Create RLS policy for deleted_users
-- Users cannot access deleted_users (for privacy)
-- Only system administrators can access audit trail
CREATE POLICY deleted_users_admin_policy ON deleted_users
    FOR ALL USING (
        current_setting('app.is_admin', true)::boolean = true
    );

-- Function to check if user can request deletion (rate limiting)
CREATE OR REPLACE FUNCTION can_request_user_deletion(p_user_id text, p_company_id text)
RETURNS boolean AS $$
DECLARE
    last_request_time timestamptz;
    request_count integer;
BEGIN
    -- Check if user has a pending or processing request
    SELECT 1 INTO request_count
    FROM user_deletion_requests
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status IN ('pending', 'processing')
    LIMIT 1;
    
    IF request_count = 1 THEN
        RETURN false;
    END IF;
    
    -- Check if user has requested deletion in the last 24 hours
    SELECT requested_at INTO last_request_time
    FROM user_deletion_requests
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status = 'completed'
    ORDER BY requested_at DESC
    LIMIT 1;
    
    IF last_request_time IS NOT NULL AND last_request_time > (now() - interval '24 hours') THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create user deletion request
CREATE OR REPLACE FUNCTION create_user_deletion_request(
    p_user_id text,
    p_company_id text,
    p_request_ip inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_consent_given boolean DEFAULT false,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
    request_id uuid;
BEGIN
    -- Check rate limiting
    IF NOT can_request_user_deletion(p_user_id, p_company_id) THEN
        RAISE EXCEPTION 'User deletion request rate limit exceeded or existing request in progress';
    END IF;
    
    -- Create deletion request
    INSERT INTO user_deletion_requests (
        user_id,
        company_id,
        request_ip,
        user_agent,
        consent_given,
        status,
        metadata
    ) VALUES (
        p_user_id,
        p_company_id,
        p_request_ip,
        p_user_agent,
        p_consent_given,
        'pending',
        p_metadata
    ) RETURNING id INTO request_id;
    
    RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update deletion request status
CREATE OR REPLACE FUNCTION update_deletion_request_status(
    p_request_id uuid,
    p_status text,
    p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE user_deletion_requests 
    SET 
        status = p_status,
        processed_at = CASE WHEN p_status IN ('processing', 'completed', 'failed') THEN now() ELSE processed_at END,
        completed_at = CASE WHEN p_status IN ('completed', 'failed') THEN now() ELSE completed_at END,
        error_message = p_error_message,
        retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END
    WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create deleted user audit record
CREATE OR REPLACE FUNCTION create_deleted_user_record(
    p_original_user_id text,
    p_original_company_id text,
    p_deletion_request_id uuid DEFAULT NULL,
    p_deleted_by text DEFAULT NULL,
    p_deletion_reason text DEFAULT NULL,
    p_data_summary jsonb DEFAULT '{}'::jsonb,
    p_compliance_notes text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    deleted_user_id uuid;
BEGIN
    INSERT INTO deleted_users (
        original_user_id,
        original_company_id,
        deletion_request_id,
        deleted_by,
        deletion_reason,
        data_summary,
        compliance_notes
    ) VALUES (
        p_original_user_id,
        p_original_company_id,
        p_deletion_request_id,
        p_deleted_by,
        p_deletion_reason,
        p_data_summary,
        p_compliance_notes
    ) RETURNING id INTO deleted_user_id;
    
    RETURN deleted_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE user_deletion_requests IS 'Tracks GDPR user deletion requests with rate limiting and audit trail';
COMMENT ON COLUMN user_deletion_requests.consent_given IS 'Explicit user consent for data deletion';
COMMENT ON COLUMN user_deletion_requests.status IS 'Current status of deletion request';
COMMENT ON COLUMN user_deletion_requests.metadata IS 'Additional context and request metadata';

COMMENT ON TABLE deleted_users IS 'Audit trail for deleted users complying with GDPR requirements';
COMMENT ON COLUMN deleted_users.original_user_id IS 'Original user ID before deletion';
COMMENT ON COLUMN deleted_users.original_company_id IS 'Original company ID before deletion';
COMMENT ON COLUMN deleted_users.data_summary IS 'Summary of deleted data for compliance auditing';
COMMENT ON COLUMN deleted_users.retention_expiry IS 'When audit record can be permanently deleted';

COMMENT ON FUNCTION can_request_user_deletion IS 'Checks if user can request deletion (rate limiting)';
COMMENT ON FUNCTION create_user_deletion_request IS 'Creates a new user deletion request with validation';
COMMENT ON FUNCTION update_deletion_request_status IS 'Updates the status of a deletion request';
COMMENT ON FUNCTION create_deleted_user_record IS 'Creates audit record for deleted user';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'User deletion tracking migration completed successfully';
    RAISE NOTICE 'Created tables: user_deletion_requests, deleted_users with RLS enabled';
    RAISE NOTICE 'Created indexes for performance optimization';
    RAISE NOTICE 'Created functions for deletion request management';
    RAISE NOTICE 'Implemented rate limiting: 1 request per 24 hours per user';
END $$;