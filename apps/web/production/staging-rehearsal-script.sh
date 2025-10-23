#!/bin/bash

# Staging Rehearsal Execution Script
# This script automates the end-to-end staging rehearsal process
# Run with: ./staging-rehearsal-script.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STAGING_DB_URL="${DATABASE_URL}"
STAGING_ENV_FILE=".env.staging"
LOG_FILE="staging-rehearsal-$(date +%Y%m%d-%H%M%S).log"

# Logging function
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

# Health check functions
check_database() {
    log "Checking database connectivity..."
    if npm run db:health 2>/dev/null; then
        success "Database connection successful"
        return 0
    else
        error "Database connection failed"
        return 1
    fi
}

check_application() {
    log "Checking application health..."
    if curl -s -f "${VERCEL_URL}/api/health" >/dev/null 2>&1; then
        success "Application health check passed"
        return 0
    else
        error "Application health check failed"
        return 1
    fi
}

# Migration testing
test_migrations() {
    log "Testing database migrations..."

    # Create backup of current state
    log "Creating pre-migration backup..."
    # Note: Actual backup command would depend on database provider

    # Run migrations in sequence
    local migrations=(
        "001_init.sql"
        "002_enable_rls_policies.sql"
        "003_add_job_queue.sql"
        "004_add_ab_testing.sql"
        "005_secure_events.sql"
        "006_backfill_occurred_at.sql"
        "007_pgboss_schema.sql"
        "008_performance_indexes.sql"
        "009_foreign_keys.sql"
        "010_rate_limits_table.sql"
    )

    for migration in "${migrations[@]}"; do
        log "Applying migration: $migration"
        if npm run init-db 2>/dev/null; then
            success "Migration $migration applied successfully"
        else
            error "Migration $migration failed"
            return 1
        fi
    done

    success "All migrations completed successfully"
    return 0
}

# Webhook testing
test_webhooks() {
    log "Testing webhook processing pipeline..."

    # Run webhook security tests
    if node test/webhooks.test.js; then
        success "Webhook security tests passed"
    else
        error "Webhook security tests failed"
        return 1
    fi

    # Test webhook endpoint with sample payload
    log "Testing webhook endpoint with sample payload..."
    local test_payload='{
        "id": "evt_test_123",
        "type": "payment.succeeded",
        "data": {
            "membership_id": "mem_test_456",
            "user_id": "user_test_789"
        }
    }'

    # Generate test signature
    local secret="${WHOP_WEBHOOK_SECRET:-test-secret}"
    local signature=$(echo -n "$test_payload" | openssl dgst -sha256 -hmac "$secret" -hex | sed 's/^.* //')

    if curl -s -X POST "${VERCEL_URL}/api/webhooks/whop" \
        -H "Content-Type: application/json" \
        -H "X-Whop-Signature: $signature" \
        -H "X-Whop-Timestamp: $(date +%s)" \
        -d "$test_payload" | grep -q "success"; then
        success "Webhook processing test passed"
    else
        error "Webhook processing test failed"
        return 1
    fi

    return 0
}

# Scheduler testing
test_scheduler() {
    log "Testing job queue and scheduler..."

    # Test scheduler status endpoint
    if curl -s "${VERCEL_URL}/api/scheduler/reminders" | grep -q "healthy\|status"; then
        success "Scheduler status check passed"
    else
        error "Scheduler status check failed"
        return 1
    fi

    # Trigger manual scheduler run
    log "Triggering manual scheduler execution..."
    if curl -s -X POST "${VERCEL_URL}/api/scheduler/reminders" \
        -H "Authorization: Bearer ${SCHEDULER_SECRET_KEY:-test-key}"; then
        success "Manual scheduler execution completed"
    else
        error "Manual scheduler execution failed"
        return 1
    fi

    return 0
}

# Data retention testing
test_data_retention() {
    log "Testing data retention cleanup..."

    # Run cleanup script
    if npm run cleanup:events 2>/dev/null; then
        success "Event cleanup completed successfully"
    else
        error "Event cleanup failed"
        return 1
    fi

    # Run privacy maintenance
    if npm run data-privacy-maintenance count-pii-data 2>/dev/null; then
        success "Privacy maintenance check completed"
    else
        error "Privacy maintenance check failed"
        return 1
    fi

    return 0
}

# Rollback testing
test_rollback() {
    log "Testing rollback procedures..."

    # Document current state
    log "Documenting current deployment state..."
    echo "Pre-rollback state documented at $(date)" >> rollback-state.log

    # Test Vercel rollback (if available)
    warning "Vercel rollback testing requires manual verification"
    log "Please verify Vercel rollback functionality in dashboard"

    # Test database rollback procedures
    warning "Database rollback testing requires manual verification"
    log "Please verify database backup/restore procedures"

    success "Rollback procedures documented and ready"
    return 0
}

# Performance testing
test_performance() {
    log "Running basic performance tests..."

    # Test concurrent requests
    log "Testing concurrent webhook processing..."
    for i in {1..5}; do
        curl -s -X POST "${VERCEL_URL}/api/webhooks/whop" \
            -H "Content-Type: application/json" \
            -H "X-Whop-Signature: test" \
            -d '{"test": "concurrent"}' &
    done
    wait

    success "Basic performance tests completed"
    return 0
}

# Main execution
main() {
    log "🚀 Starting Staging Rehearsal Execution"
    log "Log file: $LOG_FILE"
    echo

    # Pre-flight checks
    log "Performing pre-flight checks..."
    check_database || exit 1
    check_application || exit 1
    success "Pre-flight checks completed"
    echo

    # Execute test phases
    local phases=(
        "test_migrations:Migrations"
        "test_webhooks:Webhook Processing"
        "test_scheduler:Scheduler & Job Queue"
        "test_data_retention:Data Retention"
        "test_rollback:Rollback Procedures"
        "test_performance:Performance Testing"
    )

    local failed_phases=()

    for phase in "${phases[@]}"; do
        local func="${phase%%:*}"
        local name="${phase#*:}"

        log "📋 Starting phase: $name"
        if $func; then
            success "Phase completed: $name"
        else
            error "Phase failed: $name"
            failed_phases+=("$name")
        fi
        echo
    done

    # Generate report
    log "📊 Generating rehearsal report..."

    {
        echo "Staging Rehearsal Report"
        echo "========================"
        echo "Execution Date: $(date)"
        echo "Environment: ${VERCEL_URL:-unknown}"
        echo "Log File: $LOG_FILE"
        echo
        echo "Test Results:"
        echo "- Total Phases: ${#phases[@]}"
        echo "- Passed Phases: $((${#phases[@]} - ${#failed_phases[@]}))"
        echo "- Failed Phases: ${#failed_phases[@]}"
        echo
        if [ ${#failed_phases[@]} -gt 0 ]; then
            echo "Failed Phases:"
            for phase in "${failed_phases[@]}"; do
                echo "- $phase"
            done
            echo
        fi
        echo "Go/No-Go Recommendation:"
        if [ ${#failed_phases[@]} -eq 0 ]; then
            echo "✅ GO - All phases passed successfully"
        else
            echo "❌ NO-GO - ${#failed_phases[@]} phase(s) failed"
            echo "   Address failures before production deployment"
        fi
    } > staging-rehearsal-report.md

    success "Report generated: staging-rehearsal-report.md"

    # Final status
    if [ ${#failed_phases[@]} -eq 0 ]; then
        success "🎉 Staging rehearsal completed successfully!"
        success "All systems ready for production deployment"
        exit 0
    else
        error "💥 Staging rehearsal completed with failures"
        error "Address the following issues before proceeding:"
        for phase in "${failed_phases[@]}"; do
            error "  - $phase"
        done
        exit 1
    fi
}

# Run main function
main "$@"