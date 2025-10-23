# Emergency Rollback Playbook

## Overview

This playbook provides step-by-step procedures for handling database migration emergencies in the Churn Saver production environment. It covers incident response, rollback procedures, communication protocols, and post-incident analysis.

## Table of Contents

1. [Emergency Contacts](#emergency-contacts)
2. [Incident Classification](#incident-classification)
3. [Immediate Response Procedures](#immediate-response-procedures)
4. [Rollback Procedures](#rollback-procedures)
5. [Verification Procedures](#verification-procedures)
6. [Communication Protocols](#communication-protocols)
7. [Post-Incident Procedures](#post-incident-procedures)
8. [Prevention Measures](#prevention-measures)
9. [Checklists](#checklists)

## Emergency Contacts

### Primary On-Call Team
- **Engineering Lead**: [Phone] | [Slack] | [Email]
- **DevOps Lead**: [Phone] | [Slack] | [Email]
- **Database Administrator**: [Phone] | [Slack] | [Email]
- **Product Owner**: [Phone] | [Slack] | [Email]

### Escalation Contacts
- **CTO**: [Phone] | [Slack] | [Email]
- **VP Engineering**: [Phone] | [Slack] | [Email]

### External Contacts
- **Vercel Support**: [Support Portal] | [Phone]
- **Supabase Support**: [Support Portal] | [Phone]

## Incident Classification

### P0 - Critical (Immediate Response Required)
- Complete service outage
- Data corruption or loss
- Security breach
- Database migration failure affecting production
- No webhook processing for >15 minutes

### P1 - High (Response within 15 minutes)
- Partial service degradation
- Migration rollback failure
- Performance degradation >50%
- Error rate >10%

### P2 - Medium (Response within 1 hour)
- Minor performance issues
- Single feature failures
- Migration validation failures

### P3 - Low (Response within 4 hours)
- Cosmetic issues
- Documentation updates
- Non-critical bugs

## Immediate Response Procedures

### Step 1: Incident Detection (0-5 minutes)

**Automatic Detection:**
- Monitoring alerts trigger
- Error rate thresholds exceeded
- Health check failures
- Database connectivity issues

**Manual Detection:**
- User reports
- Dashboard anomalies
- Performance monitoring alerts

**Immediate Actions:**
1. Acknowledge all alerts
2. Join incident response Slack channel
3. Start incident timer
4. Page on-call engineer if not already engaged

### Step 2: Initial Assessment (5-15 minutes)

**Information Gathering:**
```bash
# Check system status
./infra/scripts/emergency-rollback.sh --status-only

# Check recent deployments
vercel ls churn-saver --recent

# Check migration status
cd infra && npm run migrate:status

# Check error logs
tail -f /var/log/application.log
```

**Assessment Checklist:**
- [ ] Scope of impact identified
- [ ] Root cause hypotheses formed
- [ ] Emergency rollback decision made
- [ ] Stakeholders notified

### Step 3: Incident Stabilization (15-30 minutes)

**Immediate Stabilization:**
1. Stop all non-critical processing
2. Enable maintenance mode if needed
3. Create emergency backup
4. Prepare rollback procedures

**Commands:**
```bash
# Create emergency backup
./infra/scripts/emergency-rollback.sh --full-emergency

# Stop processing
vercel env set PROCESSING_ENABLED false
vercel env set SCHEDULER_ENABLED false
```

## Rollback Procedures

### Pre-Rollback Preparation

**Safety Checklist:**
- [ ] Emergency backup created
- [ ] Rollback target identified
- [ ] Communication plan prepared
- [ ] Verification procedures ready
- [ ] Rollback window scheduled (if possible)

**Backup Creation:**
```bash
# Database backup
pg_dump $DATABASE_URL > emergency-backup-$(date +%s).sql

# Migration state backup
cd infra && npm run migrate:status > migration-state-backup.txt

# Application state backup
vercel ls churn-saver --json > app-state-backup.json
```

### Type 1: Migration Rollback

**When to Use:**
- Migration failure during deployment
- Data corruption after migration
- Performance degradation after migration

**Procedure:**
1. Identify rollback target migration
2. Execute emergency rollback script
3. Verify rollback success
4. Monitor system performance

**Commands:**
```bash
# Rollback to specific migration
./infra/scripts/emergency-rollback.sh --migration-target=8

# Rollback to last known stable state
./infra/scripts/emergency-rollback.sh --last-stable
```

### Type 2: Application Rollback

**When to Use:**
- Application deployment failure
- API endpoint failures
- Frontend functionality issues

**Procedure:**
1. Identify previous stable deployment
2. Execute application rollback
3. Verify application functionality
4. Monitor performance metrics

**Commands:**
```bash
# Rollback to previous deployment
./infra/scripts/emergency-rollback.sh --app-rollback

# Rollback to specific deployment
./infra/scripts/emergency-rollback.sh --app-rollback=dep_123abc
```

### Type 3: Database Restore

**When to Use:**
- Critical data corruption
- Migration rollback failure
- Database integrity issues

**Procedure:**
1. Identify appropriate backup
2. Execute database restore
3. Verify data integrity
4. Re-run migrations if needed

**Commands:**
```bash
# Restore from backup
./infra/scripts/emergency-rollback.sh --backup-restore=backup-file.sql
```

### Type 4: Full Emergency Rollback

**When to Use:**
- Complete system failure
- Multiple component failures
- Security incidents

**Procedure:**
1. Execute full emergency rollback
2. Verify all systems
3. Restore from backups if needed
4. Gradual service restoration

**Commands:**
```bash
# Full emergency rollback
./infra/scripts/emergency-rollback.sh --full-emergency
```

## Verification Procedures

### Post-Rollback Health Checks

**Application Health:**
```bash
# Check application health
curl -f https://churn-saver.vercel.app/api/health

# Check critical endpoints
curl -f https://churn-saver.vercel.app/api/health/db
curl -f https://churn-saver.vercel.app/api/health/webhooks
```

**Database Health:**
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# Check critical tables
psql $DATABASE_URL -c "SELECT COUNT(*) FROM events;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM recovery_cases;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM creator_settings;"
```

**Migration State:**
```bash
# Verify migration state
cd infra && npm run migrate:status

# Validate migration integrity
npm run validate
```

**Performance Verification:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://churn-saver.vercel.app/api/health

# Check database performance
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### Functional Testing

**Webhook Processing:**
```bash
# Test webhook endpoint
curl -X POST https://churn-saver.vercel.app/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "X-Whop-Signature: test" \
  -d '{"test": "post-rollback-test"}'
```

**Dashboard Functionality:**
- [ ] Dashboard loads successfully
- [ ] Data displays correctly
- [ ] Manual actions work
- [ ] Export functionality works

**Background Processing:**
- [ ] Scheduler running
- [ ] Job queue processing
- [ ] Notifications sending

## Communication Protocols

### Internal Communication

**Slack Channels:**
- `#incidents` - Real-time incident updates
- `#engineering` - Technical discussions
- `#product` - Business impact assessment

**Update Frequency:**
- P0: Every 15 minutes
- P1: Every 30 minutes
- P2: Every hour
- P3: Every 4 hours

**Update Template:**
```
🚨 INCIDENT UPDATE - [SEVERITY]
Status: [Investigating/Mitigating/Resolved]
Impact: [Description]
Timeline: [Key events]
Next Update: [Time]
On-call: [Name]
```

### External Communication

**Customer Communication:**
- Status page updates for P0/P1 incidents
- Email notifications for outages >1 hour
- In-app notifications for partial degradation

**Stakeholder Communication:**
- Executive updates for P0 incidents
- Department heads for P1 incidents
- Team leads for P2 incidents

**Communication Templates:**

**Initial Incident Notification:**
```
🚨 PRODUCTION INCIDENT DECLARED 🚨

Service: Churn Saver
Severity: [P0/P1/P2/P3]
Time: [Timestamp]
Impact: [Description]

Investigation in progress. Next update in [15/30/60] minutes.

On-call: [Name]
```

**Resolution Notification:**
```
✅ INCIDENT RESOLVED ✅

Service: Churn Saver
Severity: [P0/P1/P2/P3]
Duration: [X hours Y minutes]
Resolution: [Description]

Service is now fully operational. Post-incident analysis will follow.

On-call: [Name]
```

## Post-Incident Procedures

### Immediate Post-Incident (0-2 hours)

**Stabilization:**
- [ ] System fully operational
- [ ] All monitoring normal
- [ ] Performance baseline restored
- [ ] Data integrity verified

**Documentation:**
- [ ] Incident timeline documented
- [ ] Root cause identified
- [ ] Resolution steps recorded
- [ ] Artifacts preserved

### Post-Mortem Analysis (24-48 hours)

**Timeline Creation:**
- Detection time and method
- Response actions and timestamps
- Decision points and rationale
- Resolution verification

**Root Cause Analysis:**
- Technical factors
- Process gaps
- Training needs
- Tool limitations

**Action Items:**
- Immediate fixes
- Process improvements
- Tool enhancements
- Training requirements

**Post-Mortem Template:**
```markdown
# Post-Mortem: [Incident Title]

## Summary
- **Date**: [Date]
- **Duration**: [X hours Y minutes]
- **Severity**: [P0/P1/P2/P3]
- **Impact**: [Description]

## Timeline
- **[Time]**: [Event]
- **[Time]**: [Action]
- **[Time]**: [Decision]

## Root Cause
[Detailed analysis of what went wrong and why]

## Impact Assessment
- **Users Affected**: [Number]
- **Revenue Impact**: [Amount]
- **Reputation Impact**: [Description]

## Resolution
[Steps taken to resolve the incident]

## Lessons Learned
[What we learned from this incident]

## Action Items
- [ ] [Action item 1] - [Owner] - [Due date]
- [ ] [Action item 2] - [Owner] - [Due date]

## Prevention Measures
[How we'll prevent this from happening again]
```

## Prevention Measures

### Pre-Deployment Measures

**Migration Validation:**
- Run all validation scripts
- Test rollback procedures
- Review security implications
- Verify dependencies

**Staging Testing:**
- Full deployment rehearsal
- Rollback procedure testing
- Performance testing
- Security validation

**Deployment Readiness:**
- Backup procedures verified
- Rollback scripts tested
- Communication plan prepared
- On-call team notified

### Monitoring Enhancements

**Critical Metrics:**
- Migration success rate
- Rollback success rate
- Time to detection
- Time to resolution

**Alerting:**
- Migration failure alerts
- Performance degradation alerts
- Error rate threshold alerts
- Data integrity alerts

### Process Improvements

**Regular Drills:**
- Monthly rollback drills
- Quarterly incident simulations
- Annual disaster recovery tests

**Documentation:**
- Regular playbook updates
- Runbook maintenance
- Contact list updates
- Procedure validation

## Checklists

### Pre-Rollback Checklist

**Safety Checks:**
- [ ] Emergency backup created
- [ ] Rollback target identified
- [ ] Impact assessed
- [ ] Stakeholders notified

**Technical Preparation:**
- [ ] Access credentials verified
- [ ] Rollback scripts tested
- [ ] Monitoring dashboard ready
- [ ] Communication channels open

**Risk Assessment:**
- [ ] Data loss risk evaluated
- [ ] Downtime impact assessed
- [ ] Rollback failure plan prepared
- [ ] Escalation path identified

### During Rollback Checklist

**Execution:**
- [ ] Rollback procedure initiated
- [ ] Progress monitored continuously
- [ ] Errors documented
- [ ] Decisions timestamped

**Communication:**
- [ ] Status updates sent regularly
- [ ] Stakeholders informed of progress
- [ ] Impact assessments updated
- [ ] ETA estimates provided

**Verification:**
- [ ] Each step verified before proceeding
- [ ] System health checked continuously
- [ ] Performance metrics monitored
- [ ] User feedback collected

### Post-Rollback Checklist

**Verification:**
- [ ] System functionality verified
- [ ] Performance metrics normal
- [ ] Data integrity confirmed
- [ ] Security measures active

**Documentation:**
- [ ] Incident timeline completed
- [ ] Root cause documented
- [ ] Resolution steps recorded
- [ ] Lessons learned captured

**Follow-up:**
- [ ] Post-mortem scheduled
- [ ] Action items assigned
- [ ] Prevention measures planned
- [ ] Training needs identified

## Appendix

### Useful Commands

**Migration Status:**
```bash
cd infra && npm run migrate:status
cd infra && npm run migrate:validate
```

**Database Diagnostics:**
```bash
psql $DATABASE_URL -c "SELECT * FROM pg_stat_activity;"
psql $DATABASE_URL -c "SELECT * FROM pg_stat_user_tables;"
psql $DATABASE_URL -c "SELECT schemaname, tablename, attname, n_distinct, correlation FROM pg_stats LIMIT 10;"
```

**Application Diagnostics:**
```bash
vercel ls churn-saver --recent
vercel logs churn-saver --limit 100
curl -I https://churn-saver.vercel.app/api/health
```

### Emergency Contacts (Current)

Update this section with current contact information.

### Runbook Location

- **Production Runbook**: [Link to runbook]
- **Monitoring Dashboard**: [Link to dashboard]
- **Status Page**: [Link to status page]
- **Documentation**: [Link to documentation]

---

**Version**: 1.0  
**Last Updated**: $(date)  
**Next Review**: $(date -d "+1 month")  
**Owner**: DevOps Team  
**Approved**: CTO