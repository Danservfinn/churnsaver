# Rollback Plan and Procedures

## Overview

This document outlines the rollback procedures for the Churn Saver application in case of issues discovered during or after production deployment. The plan covers application rollbacks, database rollbacks, and data recovery procedures.

## Critical Incident Classification

### P0 - Service Down
- Complete system failure
- No recovery processes working
- Immediate rollback required

### P1 - Service Degraded
- Partial failure
- Some recovery processes failing
- Rollback within 1 hour

### P2 - Service Monitoring
- Performance issues
- Alerts active but service functional
- Rollback within 4 hours

### P3 - Service Maintenance
- Non-critical issues
- Service operational but suboptimal
- Rollback within 24 hours

## Application Rollback Procedures

### Vercel Deployment Rollback

**Prerequisites:**
- Vercel CLI installed and authenticated
- Access to Vercel dashboard
- Previous deployment still available

**Procedure:**
```bash
# Option 1: CLI Rollback
vercel rollback [deployment-url-or-id]

# Option 2: Dashboard Rollback
# 1. Go to Vercel dashboard
# 2. Navigate to project deployments
# 3. Find previous working deployment
# 4. Click "Rollback" button
```

**Verification:**
- Check deployment status in Vercel dashboard
- Verify application health at rollback URL
- Confirm all endpoints responding
- Test webhook processing manually

**Timeline:** 2-5 minutes

### Emergency Application Shutdown

**If rollback fails or issues persist:**

```bash
# Temporarily disable webhook processing
vercel env add WEBHOOK_DISABLED true

# Or remove webhook URL from Whop dashboard temporarily
# This stops new events from being processed
```

## Database Rollback Procedures

### Migration Rollback Strategy

**Important Notes:**
- Most migrations are additive and safe to leave in place
- Only rollback if data corruption or blocking issues occur
- Always test rollback procedures in staging first

#### Down Migration Scripts

**For each migration that needs rollback capability:**

```sql
-- Example down migration for adding a column
-- File: infra/migrations/004_add_ab_testing.down.sql

ALTER TABLE creator_settings DROP COLUMN IF EXISTS ab_test_enabled;
ALTER TABLE creator_settings DROP COLUMN IF EXISTS ab_test_variant;
```

**Execution:**
```bash
# Manual rollback (not recommended for production)
psql "$DATABASE_URL" -f infra/migrations/004_add_ab_testing.down.sql
```

#### Point-in-Time Recovery

**Using Supabase backup/restore:**

1. **Identify restore point:**
   ```sql
   -- Check recent backup timestamps
   SELECT * FROM pg_stat_archiver ORDER BY archived_count DESC LIMIT 5;
   ```

2. **Initiate restore:**
   - Go to Supabase dashboard
   - Navigate to Database > Backups
   - Select point-in-time restore
   - Choose timestamp before issue occurred

3. **Timeline:** 10-30 minutes depending on database size

### Data Recovery Procedures

#### Recovery Case Data Recovery

**If recovery cases corrupted:**

```sql
-- Restore from backup table (if exists)
INSERT INTO recovery_cases
SELECT * FROM recovery_cases_backup
WHERE created_at > '2024-01-01'
ON CONFLICT (id) DO NOTHING;
```

#### Event Data Recovery

**If webhook events lost:**

```sql
-- Restore from backup (if available)
INSERT INTO events
SELECT * FROM events_backup
WHERE created_at > '2024-01-01'
ON CONFLICT (whop_event_id) DO NOTHING;
```

## Communication Plan

### Internal Communication

**Slack Channels:**
- `#incidents` - Real-time incident updates
- `#engineering` - Technical details
- `#product` - Business impact assessment

**Update Frequency:**
- P0: Every 15 minutes
- P1: Every 30 minutes
- P2: Every 2 hours
- P3: Daily updates

### External Communication

**Customer Communication:**
- Status page updates
- Email notifications for prolonged outages
- Social media updates if needed

**Stakeholder Updates:**
- Executive summary every 2 hours for P0/P1
- Daily reports for P2/P3

## Rollback Testing Procedures

### Pre-Production Rollback Testing

**Required before production deployment:**

1. **Application Rollback Test:**
   ```bash
   # Deploy current version
   vercel --prod

   # Immediately rollback
   vercel rollback

   # Verify rollback successful
   curl https://your-domain.vercel.app/api/health
   ```

2. **Database Migration Test:**
   ```bash
   # Create test migration
   # Apply it
   npm run init-db

   # Test rollback
   psql "$DATABASE_URL" -f test-migration.down.sql

   # Verify data integrity
   ```

3. **Data Recovery Test:**
   - Create test data
   - Simulate corruption
   - Test restore procedures
   - Verify data consistency

### Rollback Validation Checklist

- [ ] Application responding on rollback URL
- [ ] Database connections working
- [ ] Webhook processing functional
- [ ] Scheduler operational
- [ ] No data loss occurred
- [ ] External integrations working
- [ ] Monitoring alerts cleared
- [ ] Customer impact minimized

## Recovery Time Objectives (RTO)

### By Incident Severity

**P0 Incidents:**
- Detection: < 5 minutes
- Initial Response: < 15 minutes
- Rollback Execution: < 30 minutes
- Full Recovery: < 2 hours

**P1 Incidents:**
- Detection: < 15 minutes
- Initial Response: < 30 minutes
- Rollback Execution: < 1 hour
- Full Recovery: < 4 hours

**P2 Incidents:**
- Detection: < 1 hour
- Initial Response: < 2 hours
- Rollback Execution: < 4 hours
- Full Recovery: < 24 hours

## Post-Rollback Actions

### Immediate Actions

1. **Root Cause Analysis:**
   - Review logs from failed deployment
   - Identify what caused the issue
   - Document findings

2. **Fix Implementation:**
   - Address root cause in code
   - Test fix in staging
   - Prepare new deployment

3. **Verification:**
   - Re-run staging rehearsal
   - Validate all test scenarios
   - Get approval for re-deployment

### Long-term Improvements

1. **Update Documentation:**
   - Add incident to runbook
   - Update rollback procedures if needed
   - Improve monitoring/alerting

2. **Process Improvements:**
   - Review deployment process
   - Enhance testing procedures
   - Update incident response plan

3. **Technical Improvements:**
   - Add feature flags for risky changes
   - Implement canary deployments
   - Enhance automated testing

## Backup and Recovery Verification

### Daily Backup Verification

**Automated checks:**
```bash
# Verify backup completion
#!/bin/bash
BACKUP_STATUS=$(supabase db backup status)
if [[ $BACKUP_STATUS != *"completed"* ]]; then
  echo "Backup failed!" | slack-notify
  exit 1
fi

# Test backup restoration (weekly)
# This should be automated in staging environment
```

### Recovery Testing Schedule

- **Daily:** Backup completion verification
- **Weekly:** Full restore test in staging
- **Monthly:** Complete disaster recovery drill
- **Quarterly:** Cross-region recovery test

## Emergency Contacts

### On-Call Engineers
- Primary: [Name] - [Phone] - [Email]
- Secondary: [Name] - [Phone] - [Email]
- Tertiary: [Name] - [Phone] - [Email]

### External Support
- Vercel Support: [Contact Info]
- Supabase Support: [Contact Info]
- Whop Support: [Contact Info]

### Escalation Path
1. On-call engineer
2. Engineering Manager
3. CTO
4. CEO

## Appendix: Rollback Scripts

### Emergency Shutdown Script

```bash
#!/bin/bash
# emergency-shutdown.sh

echo "🚨 EMERGENCY SHUTDOWN INITIATED"

# Disable webhooks
vercel env add WEBHOOK_DISABLED true --yes

# Stop scheduler
vercel env add SCHEDULER_DISABLED true --yes

# Notify team
curl -X POST $SLACK_WEBHOOK \
  -H 'Content-type: application/json' \
  -d '{"text":"🚨 Emergency shutdown activated"}'

echo "✅ Emergency shutdown complete"
```

### Quick Rollback Script

```bash
#!/bin/bash
# quick-rollback.sh

DEPLOYMENT_ID=$1

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "Usage: $0 <deployment-id>"
  exit 1
fi

echo "Rolling back to deployment: $DEPLOYMENT_ID"

# Execute rollback
vercel rollback $DEPLOYMENT_ID

# Wait for deployment
sleep 30

# Verify health
if curl -s -f https://your-domain.vercel.app/api/health > /dev/null; then
  echo "✅ Rollback successful"
else
  echo "❌ Rollback verification failed"
  exit 1
fi