# Migration Deployment Guide with Rollback Capabilities

## Overview

This guide provides comprehensive procedures for database migration deployment with robust rollback capabilities. It covers the complete migration lifecycle from development through production deployment, including validation, testing, and emergency procedures.

## Table of Contents

1. [Migration Development](#migration-development)
2. [Testing and Validation](#testing-and-validation)
3. [Staging Deployment](#staging-deployment)
4. [Production Deployment](#production-deployment)
5. [Rollback Procedures](#rollback-procedures)
6. [Monitoring and Verification](#monitoring-and-verification)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

## Migration Development

### Migration File Structure

**Forward Migration Format:**
```sql
-- Migration: XXX_description.sql
-- Description: Brief description of changes
-- Author: Developer name
-- Date: YYYY-MM-DD

-- Use idempotent operations
CREATE TABLE IF NOT EXISTS example_table (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- columns...
);

-- Include proper indexes
CREATE INDEX IF NOT EXISTS idx_example_column ON example_table(column);

-- Add comments for documentation
COMMENT ON TABLE example_table IS 'Table description';
```

**Rollback Migration Format:**
```sql
-- Rollback: XXX_rollback.sql
-- Reverses migration: XXX_description.sql
-- Author: Developer name
-- Date: YYYY-MM-DD

-- WARNING: This will permanently delete data
-- Consider backing up critical data before proceeding

-- Use transactions for safety
BEGIN;

-- Drop indexes first
DROP INDEX IF EXISTS idx_example_column;

-- Drop tables with proper warnings
DROP TABLE IF EXISTS example_table;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Rollback XXX completed successfully';
    RAISE NOTICE 'WARNING: All data in example_table has been permanently deleted';
END $$;
```

### Migration Development Guidelines

**Safety Requirements:**
- All operations must be idempotent (use IF NOT EXISTS/DROP IF EXISTS)
- Include proper transaction handling (BEGIN/COMMIT/ROLLBACK)
- Add data preservation warnings for destructive operations
- Include comprehensive comments and documentation

**Validation Requirements:**
- Each migration must have a corresponding rollback file
- Rollback files must reverse all changes safely
- Include proper error handling and logging
- Test rollback procedures in isolation

**Security Requirements:**
- No sensitive data in migration files
- Use parameterized queries where possible
- Include proper access control considerations
- Validate data integrity constraints

## Testing and Validation

### Local Development Testing

**Setup:**
```bash
# Install dependencies
cd infra && npm install

# Set up test database
export TEST_DATABASE_URL="postgresql://user:pass@localhost/test_db"

# Run migration validation
npm run validate
npm run validate:deps
npm run validate:safety
```

**Testing Procedures:**
```bash
# Test forward migration
npm run migrate:up

# Test rollback
npm run migrate:down [target_migration]

# Test rollback integrity
npm run test:rollback -- --migration=[migration_number]

# Run comprehensive rollback tests
npm run test:rollback:all
```

### Automated Validation

**Pre-commit Validation:**
```bash
# Validate migration files
npm run validate

# Check rollback file integrity
npm run test:rollback:dry-run

# Verify dependencies
npm run validate:deps
```

**CI/CD Pipeline Validation:**
- Migration file structure validation
- Dependency analysis
- Safety constraint checks
- Rollback procedure testing
- Security validation

## Staging Deployment

### Pre-Deployment Checklist

**Environment Preparation:**
- [ ] Staging database backed up
- [ ] Application deployed to staging
- [ ] Feature flags configured
- [ ] Monitoring dashboards ready

**Migration Validation:**
- [ ] All validation checks passed
- [ ] Rollback procedures tested
- [ ] Dependencies verified
- [ ] Security scan completed

### Staging Deployment Process

**Step 1: Enhanced Staging Rehearsal**
```bash
# Run comprehensive staging rehearsal
cd infra
chmod +x scripts/enhanced-staging-rehearsal.sh
./scripts/enhanced-staging-rehearsal.sh
```

**Step 2: Rollback Testing**
```bash
# Test rollback procedures in staging
npm run test:rollback:all

# Test emergency rollback procedures
./scripts/emergency-rollback.sh --migration-target=8
./scripts/emergency-rollback.sh --migration-target=10
```

**Step 3: Functional Testing**
- [ ] Webhook processing functional
- [ ] Dashboard loads correctly
- [ ] API endpoints responding
- [ ] Background processing working
- [ ] Data integrity verified

### Staging Validation Criteria

**Technical Validation:**
- All migrations applied successfully
- Rollback procedures tested and verified
- Application performance within thresholds
- Error rates below acceptable limits
- Security measures active

**Business Validation:**
- Core functionality working
- Data accuracy verified
- User workflows functional
- Integration points operational

## Production Deployment

### Pre-Deployment Requirements

**Approval Requirements:**
- [ ] Engineering lead approval
- [ ] Product owner sign-off
- [ ] DevOps validation
- [ ] Executive approval for high-risk changes

**Safety Requirements:**
- [ ] Production database backed up
- [ ] Rollback procedures documented
- [ ] Emergency contacts notified
- [ ] Monitoring alerts configured

### Production Deployment Process

**Step 1: Pre-Deployment Validation**
```bash
# Validate migration integrity
cd infra
npm run validate
npm run migrate:validate

# Check current migration state
npm run migrate:status
```

**Step 2: Backup Creation**
```bash
# Create production backup
pg_dump $DATABASE_URL > production-backup-$(date +%s).sql

# Create migration state backup
npm run migrate:status > migration-state-backup.txt
```

**Step 3: Migration Deployment**
```bash
# Apply migrations
npm run migrate:up

# Verify migration success
npm run migrate:status
npm run migrate:validate
```

**Step 4: Post-Deployment Verification**
```bash
# Verify application health
curl -f https://churn-saver.vercel.app/api/health

# Verify database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Verify critical functionality
./scripts/verify-production-deployment.sh
```

### Production Rollback Procedures

**Immediate Rollback Triggers:**
- Migration failure during deployment
- Application deployment failure
- Critical functionality broken
- Performance degradation >50%

**Rollback Execution:**
```bash
# Emergency rollback to last stable state
./scripts/emergency-rollback.sh --full-emergency

# Rollback to specific migration
./scripts/emergency-rollback.sh --migration-target=8

# Application rollback
./scripts/emergency-rollback.sh --app-rollback
```

## Rollback Procedures

### Rollback Types

**Type 1: Migration Rollback**
- Used for migration-specific issues
- Rolls back database schema changes
- Preserves application deployment
- Targeted rollback capability

**Type 2: Application Rollback**
- Used for application-specific issues
- Rolls back application deployment
- Preserves database state
- Fast rollback capability

**Type 3: Full Emergency Rollback**
- Used for critical system failures
- Rolls back both application and database
- Complete system restoration
- Maximum downtime

### Rollback Decision Matrix

| Issue Type | Severity | Rollback Type | Time to Execute |
|------------|----------|---------------|-----------------|
| Migration failure | P0 | Full Emergency | 5-10 minutes |
| Application failure | P0 | Application | 2-5 minutes |
| Performance degradation | P1 | Migration | 10-15 minutes |
| Feature failure | P2 | Application | 5-10 minutes |
| Minor issue | P3 | None (fix in place) | N/A |

### Rollback Execution Steps

**Pre-Rollback:**
1. Assess impact and scope
2. Create emergency backup
3. Notify stakeholders
4. Prepare rollback plan

**During Rollback:**
1. Execute rollback procedure
2. Monitor progress continuously
3. Verify each step
4. Communicate status

**Post-Rollback:**
1. Verify system functionality
2. Monitor performance metrics
3. Document incident
4. Schedule post-mortem

## Monitoring and Verification

### Real-time Monitoring

**Critical Metrics:**
- Migration success rate
- Application response time
- Error rate by endpoint
- Database performance
- User experience metrics

**Alert Thresholds:**
- Migration failure: Immediate alert
- Error rate >5%: P1 alert
- Response time >2s: P2 alert
- Database connections >80%: P1 alert

### Post-Deployment Verification

**Automated Verification:**
```bash
# Health checks
curl -f https://churn-saver.vercel.app/api/health
curl -f https://churn-saver.vercel.app/api/health/db

# Data integrity checks
psql $DATABASE_URL -c "SELECT COUNT(*) FROM events;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM recovery_cases;"

# Performance checks
curl -w "@curl-format.txt" -o /dev/null -s \
  https://churn-saver.vercel.app/api/health
```

**Manual Verification:**
- [ ] Dashboard loads correctly
- [ ] Data displays accurately
- [ ] Manual actions work
- [ ] Export functionality works
- [ ] Background processing active

### Long-term Monitoring

**24-Hour Monitoring:**
- System stability
- Performance metrics
- Error rates
- User feedback

**7-Day Monitoring:**
- Business metrics
- User satisfaction
- System performance
- Incident frequency

## Troubleshooting

### Common Issues

**Migration Failures:**
```bash
# Check migration status
npm run migrate:status

# Check error logs
tail -f /var/log/migration.log

# Validate migration files
npm run validate

# Test rollback procedures
npm run test:rollback:dry-run
```

**Rollback Failures:**
```bash
# Check emergency backup
ls -la emergency-backups-*/

# Verify database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check system status
./scripts/emergency-rollback.sh --status-only

# Manual rollback if needed
psql $DATABASE_URL < rollback-file.sql
```

**Performance Issues:**
```bash
# Check database performance
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"

# Check slow queries
psql $DATABASE_URL -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Check indexes
psql $DATABASE_URL -c "SELECT schemaname, tablename, attname, n_distinct, correlation FROM pg_stats LIMIT 10;"
```

### Emergency Procedures

**Complete System Failure:**
1. Execute full emergency rollback
2. Restore from latest backup
3. Verify system functionality
4. Communicate with stakeholders

**Data Corruption:**
1. Stop all processing
2. Create emergency backup
3. Restore from known good backup
4. Re-run migrations if needed
5. Verify data integrity

**Security Incident:**
1. Isolate affected systems
2. Preserve forensic evidence
3. Execute security rollback procedures
4. Notify security team
5. Document incident

## Best Practices

### Development Best Practices

**Migration Design:**
- Keep migrations small and focused
- Use idempotent operations
- Include proper error handling
- Document all changes thoroughly
- Test rollback procedures extensively

**Rollback Design:**
- Make rollbacks complete and safe
- Include data preservation warnings
- Use proper transaction handling
- Verify rollback integrity
- Document rollback procedures

### Testing Best Practices

**Comprehensive Testing:**
- Test both forward and rollback migrations
- Test in isolated environments
- Test with realistic data volumes
- Test failure scenarios
- Test emergency procedures

**Automated Testing:**
- Include migration tests in CI/CD
- Run validation automatically
- Test rollback procedures
- Monitor test coverage
- Fail fast on issues

### Deployment Best Practices

**Safe Deployment:**
- Use feature flags for risky changes
- Deploy during low-traffic periods
- Have rollback procedures ready
- Monitor continuously
- Communicate proactively

**Rollback Readiness:**
- Test rollback procedures regularly
- Keep rollback scripts updated
- Train team on emergency procedures
- Document all procedures
- Have contact information ready

### Monitoring Best Practices

**Proactive Monitoring:**
- Monitor key metrics continuously
- Set appropriate alert thresholds
- Use automated health checks
- Monitor rollback success rates
- Track incident response times

**Reactive Monitoring:**
- Have monitoring dashboards ready
- Use structured logging
- Correlate events across systems
- Track user experience metrics
- Monitor business impact

## Appendix

### Useful Commands

**Migration Management:**
```bash
# Check migration status
npm run migrate:status

# Apply pending migrations
npm run migrate:up

# Rollback to specific migration
npm run migrate:down [migration_number]

# Validate migration integrity
npm run migrate:validate
```

**Testing Commands:**
```bash
# Validate all migrations
npm run validate

# Test rollback procedures
npm run test:rollback:all

# Dry-run rollback testing
npm run test:rollback:dry-run

# Test specific rollback
npm run test:rollback -- --migration=[number]
```

**Emergency Commands:**
```bash
# Full emergency rollback
./scripts/emergency-rollback.sh --full-emergency

# Check system status
./scripts/emergency-rollback.sh --status-only

# Rollback to specific migration
./scripts/emergency-rollback.sh --migration-target=[number]

# Application rollback
./scripts/emergency-rollback.sh --app-rollback
```

### Contact Information

**Primary Contacts:**
- Engineering Lead: [Contact]
- DevOps Lead: [Contact]
- Database Administrator: [Contact]

**Escalation Contacts:**
- CTO: [Contact]
- VP Engineering: [Contact]

### Documentation Links

- [Emergency Rollback Playbook](emergency-rollback-playbook.md)
- [Staging Rehearsal Guide](../staging-rehearsal-script.sh)
- [Production Rollout Plan](../../apps/web/production/production-rollout-plan.md)
- [Incident Response Plan](../../apps/web/production/incident-response-plan.md)

---

**Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: $(date -d "+1 month")  
**Owner**: DevOps Team  
**Approved**: CTO