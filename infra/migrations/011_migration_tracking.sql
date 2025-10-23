-- Churn Saver Database Schema Migration
-- Migration: 011_migration_tracking.sql
-- Creates migration tracking system for rollback capabilities

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS migration_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_number integer NOT NULL UNIQUE,
    migration_name text NOT NULL,
    migration_type text NOT NULL CHECK (migration_type IN ('forward', 'rollback')),
    status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
    checksum text NOT NULL,
    executed_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    error_message text,
    execution_time_ms integer,
    rollback_data jsonb DEFAULT '{}'::jsonb -- Store data needed for rollback
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_migration_history_number ON migration_history(migration_number);
CREATE INDEX IF NOT EXISTS idx_migration_history_status ON migration_history(status);
CREATE INDEX IF NOT EXISTS idx_migration_history_type ON migration_history(migration_type);
CREATE INDEX IF NOT EXISTS idx_migration_history_executed_at ON migration_history(executed_at);

-- Enable Row Level Security for migration tracking
ALTER TABLE migration_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policy - only allow system administrators to modify migration history
CREATE POLICY migration_history_admin_policy ON migration_history
    FOR ALL USING (
        -- This should be updated to match your admin role check
        current_setting('app.is_admin', true)::boolean = true
    );

-- Function to record migration execution
CREATE OR REPLACE FUNCTION record_migration_execution(
    migration_number_param integer,
    migration_name_param text,
    migration_type_param text,
    checksum_param text,
    rollback_data_param jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
    migration_id uuid;
BEGIN
    INSERT INTO migration_history (
        migration_number, 
        migration_name, 
        migration_type, 
        status, 
        checksum,
        rollback_data
    ) VALUES (
        migration_number_param,
        migration_name_param,
        migration_type_param,
        'running',
        checksum_param,
        rollback_data_param
    ) RETURNING id INTO migration_id;
    
    RETURN migration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to complete migration execution
CREATE OR REPLACE FUNCTION complete_migration_execution(
    migration_id_param uuid,
    success_param boolean DEFAULT true,
    error_message_param text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE migration_history 
    SET 
        status = CASE WHEN success_param THEN 'completed' ELSE 'failed' END,
        completed_at = now(),
        error_message = error_message_param,
        execution_time_ms = EXTRACT(EPOCH FROM (now() - executed_at)) * 1000
    WHERE id = migration_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get last executed migration
CREATE OR REPLACE FUNCTION get_last_executed_migration()
RETURNS integer AS $$
DECLARE
    last_migration integer;
BEGIN
    SELECT COALESCE(MAX(migration_number), 0) INTO last_migration
    FROM migration_history
    WHERE status = 'completed' AND migration_type = 'forward';
    
    RETURN last_migration;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if migration can be rolled back
CREATE OR REPLACE FUNCTION can_rollback_migration(migration_number_param integer)
RETURNS boolean AS $$
DECLARE
    can_rollback boolean;
BEGIN
    -- Check if migration was completed and hasn't been rolled back
    SELECT EXISTS(
        SELECT 1 FROM migration_history 
        WHERE migration_number = migration_number_param 
        AND status = 'completed' 
        AND migration_type = 'forward'
    ) INTO can_rollback;
    
    RETURN can_rollback;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON TABLE migration_history IS 'Tracks execution history of database migrations and rollbacks';
COMMENT ON COLUMN migration_history.rollback_data IS 'Data needed to safely rollback the migration';
COMMENT ON FUNCTION record_migration_execution IS 'Records the start of a migration execution';
COMMENT ON FUNCTION complete_migration_execution IS 'Marks a migration as completed or failed';
COMMENT ON FUNCTION get_last_executed_migration IS 'Returns the last successfully executed forward migration number';
COMMENT ON FUNCTION can_rollback_migration IS 'Checks if a migration can be safely rolled back';

-- Initialize with current migration state (migration 010 should be the last one)
INSERT INTO migration_history (
    migration_number, 
    migration_name, 
    migration_type, 
    status, 
    checksum,
    executed_at,
    completed_at
) VALUES 
(1, '001_init.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '10 days', now() - interval '10 days'),
(2, '002_enable_rls_policies.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '9 days', now() - interval '9 days'),
(3, '003_add_job_queue.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '8 days', now() - interval '8 days'),
(4, '004_add_ab_testing.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '7 days', now() - interval '7 days'),
(5, '005_secure_events.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '6 days', now() - interval '6 days'),
(6, '006_backfill_occurred_at.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '5 days', now() - interval '5 days'),
(7, '007_pgboss_schema.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '4 days', now() - interval '4 days'),
(8, '008_performance_indexes.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '3 days', now() - interval '3 days'),
(9, '009_foreign_keys.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '2 days', now() - interval '2 days'),
(10, '010_rate_limits_table.sql', 'forward', 'completed', 'placeholder_checksum', now() - interval '1 day', now() - interval '1 day')
ON CONFLICT (migration_number, migration_type) DO NOTHING;

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration tracking system completed successfully';
    RAISE NOTICE 'Created table: migration_history with RLS enabled';
    RAISE NOTICE 'Created functions for migration management';
    RAISE NOTICE 'Initialized with existing migration history';
END $$;