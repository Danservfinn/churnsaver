-- Rollback migration for security monitoring tables

-- Drop triggers and functions
DROP TRIGGER IF EXISTS trigger_update_security_metrics ON security_alerts;
DROP FUNCTION IF EXISTS update_security_metrics();
DROP FUNCTION IF EXISTS cleanup_old_security_audit_logs();

-- Drop tables in reverse order of creation
DROP TABLE IF EXISTS security_audit_log;
DROP TABLE IF EXISTS security_patterns;
DROP TABLE IF EXISTS security_metrics;
DROP TABLE IF EXISTS security_alerts;

-- Note: This will also drop the associated indexes and policies automatically