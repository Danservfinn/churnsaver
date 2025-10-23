#!/bin/bash

# Emergency Rollback Script
# For use in production incidents requiring immediate rollback
# 
# USAGE:
#   ./emergency-rollback.sh --migration-target=<number>  # Rollback to specific migration
#   ./emergency-rollback.sh --last-stable                  # Rollback to last known stable state
#   ./emergency-rollback.sh --backup-restore=<backup_file> # Restore from backup
#   ./emergency-rollback.sh --help                         # Show help

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="emergency-rollback-$(date +%Y%m%d-%H%M%S).log"
INCIDENT_REPORT_FILE="incident-report-$(date +%Y%m%d-%H%M%S).md"
BACKUP_DIR="emergency-backups-$(date +%Y%m%d-%H%M%S)"

# Emergency contact and configuration
EMERGENCY_SLACK_CHANNEL="#incidents"
EMERGENCY_EMAIL="oncall@company.com"
DATABASE_URL="${DATABASE_URL}"
VERCEL_PROJECT="${VERCEL_PROJECT:-churn-saver}"

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

critical() {
    echo -e "${PURPLE}🚨 CRITICAL: $1${NC}" | tee -a "$LOG_FILE"
}

# Help function
show_help() {
    cat << EOF
Emergency Rollback Script - USAGE:

OPTIONS:
  --migration-target=<number>    Rollback to specific migration number
  --last-stable                  Rollback to last known stable state
  --backup-restore=<backup_file> Restore database from backup file
  --app-rollback=<deployment_id> Rollback application to specific deployment
  --full-emergency               Full emergency rollback (app + database)
  --status-only                  Show current status without taking action
  --help                         Show this help message

EXAMPLES:
  ./emergency-rollback.sh --migration-target=8      # Rollback to migration 8
  ./emergency-rollback.sh --last-stable              # Rollback to last stable
  ./emergency-rollback.sh --backup-restore=backup.sql # Restore from backup
  ./emergency-rollback.sh --app-rollback=dep_123     # Rollback app deployment
  ./emergency-rollback.sh --full-emergency           # Full emergency rollback

ENVIRONMENT VARIABLES REQUIRED:
  - DATABASE_URL: Database connection string
  - VERCEL_TOKEN: Vercel authentication token
  - VERCEL_PROJECT: Vercel project name

EMERGENCY CONTACTS:
  - Slack: $EMERGENCY_SLACK_CHANNEL
  - Email: $EMERGENCY_EMAIL

EOF
}

# Incident notification functions
notify_incident_start() {
    local reason="$1"
    local severity="$2"
    
    critical "EMERGENCY ROLLBACK INITIATED"
    critical "Reason: $reason"
    critical "Severity: $severity"
    critical "Time: $(date)"
    
    # Log incident start
    {
        echo "# Emergency Rollback Incident Report"
        echo "**Started:** $(date)"
        echo "**Reason:** $reason"
        echo "**Severity:** $severity"
        echo "**Operator:** $(whoami)"
        echo "**Environment:** ${NODE_ENV:-unknown}"
        echo ""
        echo "## Timeline"
        echo "- $(date): Emergency rollback initiated"
    } > "$INCIDENT_REPORT_FILE"
    
    # Send Slack notification (if slack CLI is available)
    if command -v slack &> /dev/null; then
        slack chat send \
            --channel "$EMERGENCY_SLACK_CHANNEL" \
            --text "🚨 **EMERGENCY ROLLBACK INITIATED** 🚨\n*Reason:* $reason\n*Severity:* $severity\n*Operator:* $(whoami)\n*Time:* $(date)" \
            || warning "Failed to send Slack notification"
    fi
    
    # Send email notification (if mail command is available)
    if command -v mail &> /dev/null; then
        echo "Emergency rollback initiated. Reason: $reason. Severity: $severity. Time: $(date)" | \
            mail -s "🚨 EMERGENCY ROLLBACK - $severity" "$EMERGENCY_EMAIL" \
            || warning "Failed to send email notification"
    fi
}

notify_incident_complete() {
    local result="$1"
    local duration="$2"
    
    if [ "$result" = "SUCCESS" ]; then
        success "EMERGENCY ROLLBACK COMPLETED SUCCESSFULLY"
        success "Duration: $duration"
    else
        error "EMERGENCY ROLLBACK FAILED"
        error "Duration: $duration"
        error "Manual intervention required"
    fi
    
    # Complete incident report
    {
        echo "- $(date): Emergency rollback $result"
        echo "- Total duration: $duration"
        echo ""
        echo "## Summary"
        echo "**Result:** $result"
        echo "**Duration:** $duration"
        echo "**Final State:** $(npm run migrate:status 2>/dev/null || echo 'Unknown')"
    } >> "$INCIDENT_REPORT_FILE"
    
    # Send completion notification
    local emoji="✅"
    if [ "$result" != "SUCCESS" ]; then
        emoji="❌"
    fi
    
    if command -v slack &> /dev/null; then
        slack chat send \
            --channel "$EMERGENCY_SLACK_CHANNEL" \
            --text "$emoji **EMERGENCY ROLLBACK $result** $emoji\n*Duration:* $duration\n*Time:* $(date)" \
            || warning "Failed to send Slack notification"
    fi
}

# Safety checks
perform_safety_checks() {
    log "Performing emergency rollback safety checks..."
    
    # Check database connectivity
    if ! psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
        error "Database connectivity check failed"
        return 1
    fi
    
    # Check current migration state
    local current_migration=$(cd "$INFRA_DIR" && npm run migrate:status 2>/dev/null | grep "Current migration:" | awk '{print $3}' || echo "0")
    log "Current migration: $current_migration"
    
    # Check for active connections
    local active_connections=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" | tr -d ' ')
    log "Active database connections: $active_connections"
    
    if [ "$active_connections" -gt 50 ]; then
        warning "High number of active connections: $active_connections"
    fi
    
    # Check disk space
    local disk_usage=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 80 ]; then
        warning "High disk usage: ${disk_usage}%"
    fi
    
    success "Safety checks completed"
    return 0
}

# Create emergency backup
create_emergency_backup() {
    log "Creating emergency backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Database backup
    local backup_file="$BACKUP_DIR/emergency-db-backup-$(date +%s).sql"
    log "Creating database backup: $backup_file"
    
    if pg_dump "$DATABASE_URL" > "$backup_file"; then
        success "Database backup created: $backup_file"
        echo "$backup_file" > "$BACKUP_DIR/latest-backup.txt"
    else
        error "Failed to create database backup"
        return 1
    fi
    
    # Migration state backup
    local migration_state_file="$BACKUP_DIR/migration-state-$(date +%s).txt"
    cd "$INFRA_DIR"
    npm run migrate:status > "$migration_state_file" 2>/dev/null || echo "Failed to get migration state" > "$migration_state_file"
    success "Migration state backed up: $migration_state_file"
    
    # Application state backup
    if command -v vercel &> /dev/null; then
        local app_state_file="$BACKUP_DIR/app-state-$(date +%s).json"
        vercel ls "$VERCEL_PROJECT" --json > "$app_state_file" 2>/dev/null || echo "Failed to get app state" > "$app_state_file"
        success "Application state backed up: $app_state_file"
    fi
    
    success "Emergency backup completed in: $BACKUP_DIR"
    return 0
}

# Migration rollback function
rollback_migration() {
    local target_migration="$1"
    
    log "Rolling back migrations to target: $target_migration"
    
    cd "$INFRA_DIR"
    
    # Get current migration
    local current_migration=$(npm run migrate:status | grep "Current migration:" | awk '{print $3}' || echo "0")
    
    if [ "$current_migration" -le "$target_migration" ]; then
        warning "Current migration ($current_migration) is already at or before target ($target_migration)"
        return 0
    fi
    
    # Execute rollback
    log "Executing migration rollback from $current_migration to $target_migration"
    
    if npm run migrate:down "$target_migration"; then
        success "Migration rollback completed successfully"
        
        # Verify rollback
        local new_migration=$(npm run migrate:status | grep "Current migration:" | awk '{print $3}' || echo "0")
        if [ "$new_migration" -eq "$target_migration" ]; then
            success "Rollback verified: now at migration $new_migration"
        else
            error "Rollback verification failed: expected $target_migration, got $new_migration"
            return 1
        fi
    else
        error "Migration rollback failed"
        return 1
    fi
    
    return 0
}

# Application rollback function
rollback_application() {
    local deployment_id="$1"
    
    log "Rolling back application deployment..."
    
    if ! command -v vercel &> /dev/null; then
        error "Vercel CLI not found. Cannot rollback application."
        return 1
    fi
    
    # Get current deployment info
    local current_deployment=$(vercel ls "$VERCEL_PROJECT" --json | jq -r '.[] | select(.current === true) | .id' 2>/dev/null)
    
    if [ -n "$current_deployment" ]; then
        log "Current deployment: $current_deployment"
    fi
    
    # Execute rollback
    if [ -n "$deployment_id" ]; then
        log "Rolling back to deployment: $deployment_id"
        if vercel rollback "$deployment_id" --scope "$VERCEL_PROJECT"; then
            success "Application rollback completed to deployment: $deployment_id"
        else
            error "Application rollback failed"
            return 1
        fi
    else
        log "Rolling back to previous deployment"
        if vercel rollback --scope "$VERCEL_PROJECT"; then
            success "Application rollback completed to previous deployment"
        else
            error "Application rollback failed"
            return 1
        fi
    fi
    
    return 0
}

# Database restore function
restore_database() {
    local backup_file="$1"
    
    log "Restoring database from backup: $backup_file"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Create backup before restore
    local pre_restore_backup="$BACKUP_DIR/pre-restore-backup-$(date +%s).sql"
    log "Creating pre-restore backup: $pre_restore_backup"
    pg_dump "$DATABASE_URL" > "$pre_restore_backup"
    
    # Restore database
    if psql "$DATABASE_URL" < "$backup_file"; then
        success "Database restore completed successfully"
    else
        error "Database restore failed"
        return 1
    fi
    
    return 0
}

# Post-rollback verification
verify_rollback_success() {
    log "Verifying rollback success..."
    
    # Check application health
    local app_url="https://$VERCEL_PROJECT.vercel.app"
    if curl -s -f "$app_url/api/health" >/dev/null 2>&1; then
        success "Application health check passed"
    else
        error "Application health check failed"
        return 1
    fi
    
    # Check database connectivity
    if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
        success "Database connectivity verified"
    else
        error "Database connectivity failed"
        return 1
    fi
    
    # Check critical tables exist
    local critical_tables=("events" "recovery_cases" "creator_settings")
    for table in "${critical_tables[@]}"; do
        if psql "$DATABASE_URL" -c "SELECT 1 FROM $table LIMIT 1;" >/dev/null 2>&1; then
            success "Critical table $table accessible"
        else
            error "Critical table $table not accessible"
            return 1
        fi
    done
    
    # Check migration state
    cd "$INFRA_DIR"
    npm run migrate:status
    
    success "Rollback verification completed"
    return 0
}

# Show current status
show_status() {
    log "Current System Status"
    echo "=================="
    
    # Migration status
    echo "Migration Status:"
    cd "$INFRA_DIR"
    npm run migrate:status
    echo ""
    
    # Application status
    echo "Application Status:"
    if command -v vercel &> /dev/null; then
        vercel ls "$VERCEL_PROJECT" --json | jq -r '.[] | "Deployment: \(.id) | Current: \(.current) | URL: \(.url)"' 2>/dev/null || echo "Unable to get application status"
    else
        echo "Vercel CLI not available"
    fi
    echo ""
    
    # Database status
    echo "Database Status:"
    local connection_count=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM pg_stat_activity;" | tr -d ' ')
    local db_size=$(psql "$DATABASE_URL" -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" | tr -d ' ')
    echo "Connections: $connection_count"
    echo "Size: $db_size"
    echo ""
    
    # Recent backups
    echo "Recent Backups:"
    if [ -d "emergency-backups-"* ]; then
        local latest_backup_dir=$(ls -t emergency-backups-* | head -1)
        if [ -n "$latest_backup_dir" ]; then
            echo "Latest backup directory: $latest_backup_dir"
            ls -la "$latest_backup_dir/" | head -10
        fi
    else
        echo "No emergency backups found"
    fi
}

# Full emergency rollback
full_emergency_rollback() {
    local target_migration="$1"
    
    critical "INITIATING FULL EMERGENCY ROLLBACK"
    
    # Create emergency backup
    if ! create_emergency_backup; then
        error "Failed to create emergency backup"
        return 1
    fi
    
    # Rollback application first
    if ! rollback_application; then
        error "Failed to rollback application"
        return 1
    fi
    
    # Then rollback database
    if ! rollback_migration "$target_migration"; then
        error "Failed to rollback database"
        return 1
    fi
    
    # Verify rollback success
    if ! verify_rollback_success; then
        error "Rollback verification failed"
        return 1
    fi
    
    success "Full emergency rollback completed successfully"
    return 0
}

# Main execution function
main() {
    local start_time=$(date +%s)
    local rollback_type=""
    local target_migration=""
    local backup_file=""
    local deployment_id=""
    local status_only=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --migration-target=*)
                target_migration="${1#*=}"
                rollback_type="migration"
                shift
                ;;
            --last-stable)
                rollback_type="last_stable"
                shift
                ;;
            --backup-restore=*)
                backup_file="${1#*=}"
                rollback_type="restore"
                shift
                ;;
            --app-rollback=*)
                deployment_id="${1#*=}"
                rollback_type="application"
                shift
                ;;
            --full-emergency)
                rollback_type="full_emergency"
                target_migration="8"  # Default to last known stable
                shift
                ;;
            --status-only)
                status_only=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Show status only
    if [ "$status_only" = true ]; then
        show_status
        exit 0
    fi
    
    # Validate environment
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL environment variable is required"
        exit 1
    fi
    
    if [ -z "$VERCEL_PROJECT" ]; then
        warning "VERCEL_PROJECT environment variable not set"
    fi
    
    # Initialize log
    log "Emergency Rollback Script Started"
    log "Rollback type: $rollback_type"
    log "Arguments: $*"
    log "Operator: $(whoami)"
    log "Environment: ${NODE_ENV:-unknown}"
    
    # Notify incident start
    notify_incident_start "$rollback_type" "CRITICAL"
    
    # Perform safety checks
    if ! perform_safety_checks; then
        error "Safety checks failed"
        notify_incident_complete "FAILED" "$(($(date +%s) - start_time))s"
        exit 1
    fi
    
    # Execute rollback based on type
    local result="SUCCESS"
    case $rollback_type in
        migration)
            if [ -z "$target_migration" ]; then
                error "Target migration number required for migration rollback"
                result="FAILED"
            else
                if ! create_emergency_backup || ! rollback_migration "$target_migration" || ! verify_rollback_success; then
                    result="FAILED"
                fi
            fi
            ;;
        last_stable)
            if ! create_emergency_backup || ! rollback_migration "8" || ! verify_rollback_success; then
                result="FAILED"
            fi
            ;;
        restore)
            if [ -z "$backup_file" ]; then
                error "Backup file required for restore"
                result="FAILED"
            else
                if ! create_emergency_backup || ! restore_database "$backup_file" || ! verify_rollback_success; then
                    result="FAILED"
                fi
            fi
            ;;
        application)
            if ! create_emergency_backup || ! rollback_application "$deployment_id" || ! verify_rollback_success; then
                result="FAILED"
            fi
            ;;
        full_emergency)
            if ! full_emergency_rollback "$target_migration"; then
                result="FAILED"
            fi
            ;;
        *)
            error "Invalid rollback type: $rollback_type"
            result="FAILED"
            ;;
    esac
    
    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Notify incident completion
    notify_incident_complete "$result" "${duration}s"
    
    # Generate final report
    {
        echo ""
        echo "## Artifacts"
        echo "- Log file: $LOG_FILE"
        echo "- Incident report: $INCIDENT_REPORT_FILE"
        echo "- Backup directory: $BACKUP_DIR"
        echo ""
        echo "## Next Steps"
        if [ "$result" = "SUCCESS" ]; then
            echo "- Monitor system performance"
            echo "- Verify all functionality"
            echo "- Communicate with stakeholders"
            echo "- Schedule post-mortem"
        else
            echo "- Manual intervention required"
            echo "- Contact on-call engineer"
            echo "- Escalate to management"
            echo "- Consider emergency procedures"
        fi
    } >> "$INCIDENT_REPORT_FILE"
    
    if [ "$result" = "SUCCESS" ]; then
        success "Emergency rollback completed successfully"
        success "Duration: ${duration}s"
        success "Incident report: $INCIDENT_REPORT_FILE"
        success "Backup directory: $BACKUP_DIR"
        exit 0
    else
        error "Emergency rollback failed"
        error "Duration: ${duration}s"
        error "Incident report: $INCIDENT_REPORT_FILE"
        error "Manual intervention required"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"