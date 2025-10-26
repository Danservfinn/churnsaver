-- Churn Saver Database Schema Migration
-- Migration: 016_data_export_tracking.sql
-- Implements GDPR data export functionality with audit trail

-- Create data export requests table for tracking export requests
CREATE TABLE IF NOT EXISTS data_export_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    company_id text NOT NULL,
    request_ip inet,
    user_agent text,
    export_format text NOT NULL CHECK (export_format IN ('json', 'csv', 'pdf')),
    data_types text[] NOT NULL CHECK (array_length(data_types, 1) > 0),
    date_range_start timestamptz,
    date_range_end timestamptz,
    status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')) DEFAULT 'pending',
    requested_at timestamptz DEFAULT now(),
    processed_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz DEFAULT (now() + interval '7 days'), -- Export files expire after 7 days
    error_message text,
    retry_count int DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    file_size_bytes bigint,
    record_count int
);

-- Create data export files table for managing export files
CREATE TABLE IF NOT EXISTS data_export_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    export_request_id uuid NOT NULL REFERENCES data_export_requests(id) ON DELETE CASCADE,
    filename text NOT NULL,
    file_path text NOT NULL,
    file_size_bytes bigint NOT NULL,
    mime_type text NOT NULL,
    encryption_key_id text, -- Reference to encryption key used
    checksum text NOT NULL, -- SHA-256 checksum for integrity
    created_at timestamptz DEFAULT now(),
    downloaded_at timestamptz,
    download_count int DEFAULT 0,
    max_downloads int DEFAULT 3, -- Limit downloads for security
    is_encrypted boolean DEFAULT true,
    compression_type text DEFAULT 'gzip' CHECK (compression_type IN ('none', 'gzip', 'zip'))
);

-- Create data export audit log table for audit trail
CREATE TABLE IF NOT EXISTS data_export_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    export_request_id uuid NOT NULL REFERENCES data_export_requests(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN ('requested', 'started', 'completed', 'failed', 'downloaded', 'deleted', 'expired')),
    actor_type text NOT NULL CHECK (actor_type IN ('user', 'system', 'admin')),
    actor_id text,
    ip_address inet,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Create indexes for data_export_requests
CREATE INDEX IF NOT EXISTS idx_data_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_company_id ON data_export_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_status ON data_export_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_requested_at ON data_export_requests(requested_at);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_expires_at ON data_export_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_data_export_requests_user_company ON data_export_requests(user_id, company_id);

-- Create indexes for data_export_files
CREATE INDEX IF NOT EXISTS idx_data_export_files_export_request_id ON data_export_files(export_request_id);
CREATE INDEX IF NOT EXISTS idx_data_export_files_created_at ON data_export_files(created_at);
CREATE INDEX IF NOT EXISTS idx_data_export_files_downloaded_at ON data_export_files(downloaded_at);

-- Create indexes for data_export_audit_log
CREATE INDEX IF NOT EXISTS idx_data_export_audit_log_export_request_id ON data_export_audit_log(export_request_id);
CREATE INDEX IF NOT EXISTS idx_data_export_audit_log_action ON data_export_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_data_export_audit_log_created_at ON data_export_audit_log(created_at);

-- Enable Row Level Security for all tables
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_audit_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for data_export_requests
-- Users can only see their own export requests
CREATE POLICY data_export_requests_user_policy ON data_export_requests
    FOR ALL USING (
        user_id = current_setting('app.current_user_id', true)::text
    );

-- Admin policy for data_export_requests
CREATE POLICY data_export_requests_admin_policy ON data_export_requests
    FOR ALL USING (
        current_setting('app.is_admin', true)::boolean = true
    );

-- Create RLS policy for data_export_files
-- Users can only access files for their own export requests
CREATE POLICY data_export_files_user_policy ON data_export_files
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM data_export_requests 
            WHERE id = export_request_id 
            AND user_id = current_setting('app.current_user_id', true)::text
        )
    );

-- Admin policy for data_export_files
CREATE POLICY data_export_files_admin_policy ON data_export_files
    FOR ALL USING (
        current_setting('app.is_admin', true)::boolean = true
    );

-- Create RLS policy for data_export_audit_log
-- Users cannot access audit logs (for privacy)
-- Only system administrators can access audit trail
CREATE POLICY data_export_audit_log_admin_policy ON data_export_audit_log
    FOR ALL USING (
        current_setting('app.is_admin', true)::boolean = true
    );

-- Function to check if user can request data export (rate limiting)
CREATE OR REPLACE FUNCTION can_request_data_export(p_user_id text, p_company_id text)
RETURNS boolean AS $$
DECLARE
    last_request_time timestamptz;
    request_count integer;
BEGIN
    -- Check if user has a pending or processing request
    SELECT 1 INTO request_count
    FROM data_export_requests
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status IN ('pending', 'processing')
    LIMIT 1;
    
    IF request_count = 1 THEN
        RETURN false;
    END IF;
    
    -- Check if user has requested export in the last 24 hours
    SELECT requested_at INTO last_request_time
    FROM data_export_requests
    WHERE user_id = p_user_id 
    AND company_id = p_company_id
    AND status IN ('completed', 'failed')
    ORDER BY requested_at DESC
    LIMIT 1;
    
    IF last_request_time IS NOT NULL AND last_request_time > (now() - interval '24 hours') THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create data export request
CREATE OR REPLACE FUNCTION create_data_export_request(
    p_user_id text,
    p_company_id text,
    p_export_format text,
    p_data_types text[],
    p_date_range_start timestamptz DEFAULT NULL,
    p_date_range_end timestamptz DEFAULT NULL,
    p_request_ip inet DEFAULT NULL,
    p_user_agent text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
    request_id uuid;
BEGIN
    -- Check rate limiting
    IF NOT can_request_data_export(p_user_id, p_company_id) THEN
        RAISE EXCEPTION 'Data export request rate limit exceeded or existing request in progress';
    END IF;
    
    -- Validate data types
    IF p_data_types IS NULL OR array_length(p_data_types, 1) = 0 THEN
        RAISE EXCEPTION 'At least one data type must be specified for export';
    END IF;
    
    -- Validate date range
    IF p_date_range_start IS NOT NULL AND p_date_range_end IS NOT NULL THEN
        IF p_date_range_start > p_date_range_end THEN
            RAISE EXCEPTION 'Date range start must be before end date';
        END IF;
        
        -- Limit date range to 1 year for performance
        IF p_date_range_end - p_date_range_start > interval '1 year' THEN
            RAISE EXCEPTION 'Date range cannot exceed 1 year';
        END IF;
    END IF;
    
    -- Create export request
    INSERT INTO data_export_requests (
        user_id,
        company_id,
        request_ip,
        user_agent,
        export_format,
        data_types,
        date_range_start,
        date_range_end,
        metadata
    ) VALUES (
        p_user_id,
        p_company_id,
        p_request_ip,
        p_user_agent,
        p_export_format,
        p_data_types,
        p_date_range_start,
        p_date_range_end,
        p_metadata
    ) RETURNING id INTO request_id;
    
    -- Log the request
    INSERT INTO data_export_audit_log (
        export_request_id,
        action,
        actor_type,
        actor_id,
        ip_address,
        user_agent,
        details
    ) VALUES (
        request_id,
        'requested',
        'user',
        p_user_id,
        p_request_ip,
        p_user_agent,
        jsonb_build_object('export_format', p_export_format, 'data_types', p_data_types)
    );
    
    RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update export request status
CREATE OR REPLACE FUNCTION update_data_export_request_status(
    p_request_id uuid,
    p_status text,
    p_error_message text DEFAULT NULL,
    p_file_size_bytes bigint DEFAULT NULL,
    p_record_count int DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE data_export_requests 
    SET 
        status = p_status,
        processed_at = CASE WHEN p_status IN ('processing', 'completed', 'failed') THEN now() ELSE processed_at END,
        completed_at = CASE WHEN p_status IN ('completed', 'failed', 'expired') THEN now() ELSE completed_at END,
        error_message = p_error_message,
        retry_count = CASE WHEN p_status = 'failed' THEN retry_count + 1 ELSE retry_count END,
        file_size_bytes = p_file_size_bytes,
        record_count = p_record_count
    WHERE id = p_request_id;
    
    -- Log the status change
    INSERT INTO data_export_audit_log (
        export_request_id,
        action,
        actor_type,
        actor_id,
        details
    ) VALUES (
        p_request_id,
        CASE p_status 
            WHEN 'processing' THEN 'started'
            WHEN 'completed' THEN 'completed'
            WHEN 'failed' THEN 'failed'
            WHEN 'expired' THEN 'expired'
            ELSE p_status
        END,
        'system',
        NULL,
        jsonb_build_object('previous_status', OLD.status, 'new_status', p_status, 'error_message', p_error_message)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create export file record
CREATE OR REPLACE FUNCTION create_data_export_file(
    p_export_request_id uuid,
    p_filename text,
    p_file_path text,
    p_file_size_bytes bigint,
    p_mime_type text,
    p_checksum text,
    p_encryption_key_id text DEFAULT NULL,
    p_is_encrypted boolean DEFAULT true,
    p_compression_type text DEFAULT 'gzip'
)
RETURNS uuid AS $$
DECLARE
    file_id uuid;
BEGIN
    INSERT INTO data_export_files (
        export_request_id,
        filename,
        file_path,
        file_size_bytes,
        mime_type,
        checksum,
        encryption_key_id,
        is_encrypted,
        compression_type
    ) VALUES (
        p_export_request_id,
        p_filename,
        p_file_path,
        p_file_size_bytes,
        p_mime_type,
        p_checksum,
        p_encryption_key_id,
        p_is_encrypted,
        p_compression_type
    ) RETURNING id INTO file_id;
    
    RETURN file_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record file download
CREATE OR REPLACE FUNCTION record_export_file_download(p_file_id uuid, p_user_id text, p_ip_address inet DEFAULT NULL)
RETURNS boolean AS $$
DECLARE
    download_count int;
    max_downloads int;
BEGIN
    -- Get current download count and max allowed
    SELECT download_count, max_downloads INTO download_count, max_downloads
    FROM data_export_files
    WHERE id = p_file_id;
    
    IF download_count >= max_downloads THEN
        RETURN false;
    END IF;
    
    -- Update download information
    UPDATE data_export_files
    SET 
        download_count = download_count + 1,
        downloaded_at = CASE WHEN download_count = 0 THEN now() ELSE downloaded_at END
    WHERE id = p_file_id;
    
    -- Log the download
    INSERT INTO data_export_audit_log (
        export_request_id,
        action,
        actor_type,
        actor_id,
        ip_address,
        details
    ) SELECT 
        export_request_id,
        'downloaded',
        'user',
        p_user_id,
        p_ip_address,
        jsonb_build_object('file_id', p_file_id, 'download_count', download_count + 1)
    FROM data_export_files
    WHERE id = p_file_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up expired exports
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    -- Update expired requests
    UPDATE data_export_requests
    SET status = 'expired'
    WHERE status IN ('pending', 'processing', 'completed')
    AND expires_at < now();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup
    INSERT INTO data_export_audit_log (
        export_request_id,
        action,
        actor_type,
        actor_id,
        details
    ) SELECT 
        id,
        'expired',
        'system',
        NULL,
        jsonb_build_object('auto_cleanup', true)
    FROM data_export_requests
    WHERE status = 'expired'
    AND expires_at < now()
    AND id NOT IN (
        SELECT export_request_id FROM data_export_audit_log 
        WHERE action = 'expired' AND actor_type = 'system'
    );
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE data_export_requests IS 'Tracks GDPR data export requests with rate limiting and audit trail';
COMMENT ON COLUMN data_export_requests.export_format IS 'Format of the export file (json, csv, pdf)';
COMMENT ON COLUMN data_export_requests.data_types IS 'Array of data types to export (users, cases, events, etc.)';
COMMENT ON COLUMN data_export_requests.expires_at IS 'When the export files expire and are no longer accessible';

COMMENT ON TABLE data_export_files IS 'Manages export files with encryption and download limits';
COMMENT ON COLUMN data_export_files.checksum IS 'SHA-256 checksum for file integrity verification';
COMMENT ON COLUMN data_export_files.max_downloads IS 'Maximum number of times the file can be downloaded';

COMMENT ON TABLE data_export_audit_log IS 'Comprehensive audit trail for all export operations';
COMMENT ON COLUMN data_export_audit_log.action IS 'Type of action performed (requested, started, completed, failed, downloaded, deleted, expired)';
COMMENT ON COLUMN data_export_audit_log.actor_type IS 'Type of actor (user, system, admin)';

COMMENT ON FUNCTION can_request_data_export IS 'Checks if user can request data export (rate limiting)';
COMMENT ON FUNCTION create_data_export_request IS 'Creates a new data export request with validation';
COMMENT ON FUNCTION update_data_export_request_status IS 'Updates the status of a data export request';
COMMENT ON FUNCTION create_data_export_file IS 'Creates a record for an export file';
COMMENT ON FUNCTION record_export_file_download IS 'Records file download and enforces limits';
COMMENT ON FUNCTION cleanup_expired_exports IS 'Cleans up expired export requests and files';

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Data export tracking migration completed successfully';
    RAISE NOTICE 'Created tables: data_export_requests, data_export_files, data_export_audit_log with RLS enabled';
    RAISE NOTICE 'Created indexes for performance optimization';
    RAISE NOTICE 'Created functions for export request management';
    RAISE NOTICE 'Implemented rate limiting: 1 request per 24 hours per user';
    RAISE NOTICE 'Implemented file download limits: 3 downloads per file';
    RAISE NOTICE 'Implemented automatic cleanup: files expire after 7 days';
END $$;