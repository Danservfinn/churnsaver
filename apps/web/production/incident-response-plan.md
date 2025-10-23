# Production Incident Response Plan

**Version:** 1.0
**Date:** 2025-10-21
**Document Owner:** Incident Response Team

## Overview

This document outlines the incident response procedures for the Churn Saver production environment. The plan ensures rapid detection, assessment, containment, and resolution of production incidents while maintaining clear communication and post-incident learning.

## Incident Classification Framework

### Severity Levels

#### P0 - Critical (Service Down)
**Impact:** Complete system failure or data corruption
**Examples:**
- Application completely unavailable
- Database inaccessible
- Webhook processing stopped for >15 minutes
- Data loss or corruption detected
- Security breach with active exploitation

**Response SLA:** Immediate (within 5 minutes)
**Resolution Target:** 1 hour
**Communication:** All stakeholders notified immediately

#### P1 - High (Service Degraded)
**Impact:** Major functionality impaired, significant user impact
**Examples:**
- Webhook processing success rate < 90%
- Scheduler not running for >30 minutes
- Push/DM delivery rate < 80%
- Response times >10 seconds sustained
- Database performance severely degraded

**Response SLA:** Within 15 minutes
**Resolution Target:** 2 hours
**Communication:** Engineering team + key stakeholders

#### P2 - Medium (Service Monitoring)
**Impact:** Partial degradation, monitoring alerts active
**Examples:**
- Single feature failures
- Performance degradation (response times 5-10 seconds)
- External service partial failures
- Error rates elevated (5-10%)
- Non-critical functionality broken

**Response SLA:** Within 1 hour
**Resolution Target:** 4 hours
**Communication:** Engineering team notified

#### P3 - Low (Service Maintenance)
**Impact:** Minor issues, no immediate user impact
**Examples:**
- Cosmetic UI issues
- Minor performance degradation
- Log volume issues
- Non-critical monitoring gaps
- Documentation discrepancies

**Response SLA:** Within 4 hours
**Resolution Target:** 24 hours
**Communication:** Internal team coordination

## Incident Response Process

### Phase 1: Detection & Alert (0-5 minutes)

#### Automated Detection
- **Monitoring Systems:** Alert triggers based on predefined thresholds
- **Health Checks:** Automated health endpoint monitoring
- **User Reports:** Customer-reported issues via support channels
- **Synthetic Monitoring:** Automated end-to-end tests

#### Initial Alert Response
1. **Alert Receipt:** On-call engineer receives alert via Slack/PagerDuty
2. **Acknowledgment:** Confirm alert received within 5 minutes for P0/P1
3. **Initial Assessment:** Quick evaluation of alert severity and impact
4. **Escalation:** Notify incident commander if P0 or complex P1 incident

#### Alert Channels
- **Primary:** PagerDuty escalation with SMS/call alerts
- **Secondary:** Slack `#incidents` channel
- **Backup:** Email alerts for non-critical issues

### Phase 2: Assessment & Triage (5-15 minutes)

#### Incident Commander Assignment
- **P0 Incidents:** Engineering Manager or designated incident commander
- **P1 Incidents:** Senior engineer on-call
- **P2/P3 Incidents:** On-call engineer

#### Initial Impact Assessment
1. **Scope:** What systems/components are affected?
2. **Impact:** How many users/customers impacted?
3. **Duration:** How long has this been occurring?
4. **Trend:** Is the issue getting worse or stable?

#### Diagnostic Information Gathering
```bash
# Quick diagnostic commands
curl -I https://your-domain.vercel.app/api/health
vercel logs --app your-app-name --since 10m
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM events WHERE created_at > NOW() - INTERVAL '1 hour';"
```

#### Severity Classification
- Review against classification criteria
- Adjust severity if initial assessment was incorrect
- Document reasoning for severity level

### Phase 3: Containment & Mitigation (15-60 minutes)

#### Immediate Containment Actions

##### For Webhook Processing Issues
```bash
# Emergency webhook disable
vercel env add WEBHOOK_PROCESSING_ENABLED false

# Check webhook backlog
curl https://your-domain.vercel.app/api/health/webhooks

# Manual processing trigger (if safe)
curl -X POST https://your-domain.vercel.app/api/webhooks/whop \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{"action":"process-backlog"}'
```

##### For Scheduler Issues
```bash
# Pause cron jobs
vercel cron pause

# Manual scheduler trigger
curl -X POST https://your-domain.vercel.app/api/scheduler/reminders \
  -H "Authorization: Bearer $SCHEDULER_SECRET_KEY"

# Check job queue status
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM job_queue WHERE status = 'pending';"
```

##### For Database Issues
```bash
# Check database connectivity
psql "$DATABASE_URL" -c "SELECT 1;"

# Monitor connection pool
psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_activity;"

# Emergency read-only mode
vercel env add READ_ONLY_MODE true
```

#### Mitigation Strategies

##### Circuit Breaker Pattern
```typescript
// Emergency circuit breaker implementation
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5;
  private readonly timeout = 60000; // 1 minute

  async execute(operation: () => Promise<any>) {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold &&
           Date.now() - this.lastFailureTime < this.timeout;
  }

  private recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  private reset() {
    this.failures = 0;
  }
}
```

##### Feature Flag Rollback
```bash
# Disable problematic features
vercel env add NOTIFICATIONS_ENABLED false
vercel env add SCHEDULER_ENABLED false
vercel env add WEBHOOK_PROCESSING_ENABLED false

# Enable rollback mode
vercel env add ROLLBACK_MODE true
```

### Phase 4: Recovery & Resolution (1-4 hours)

#### Root Cause Analysis
1. **Log Analysis:** Review application and system logs
2. **Metric Review:** Analyze monitoring data before/during incident
3. **Code Review:** Examine recent deployments and changes
4. **External Factors:** Check for upstream service issues

#### Recovery Execution
1. **Fix Implementation:** Apply hotfix or configuration change
2. **Testing:** Validate fix in staging environment
3. **Deployment:** Deploy fix to production
4. **Verification:** Confirm fix resolves the issue

#### Gradual Service Restoration
```bash
# Gradual feature re-enable
vercel env add WEBHOOK_PROCESSING_ENABLED true
sleep 300  # Wait 5 minutes

vercel env add SCHEDULER_ENABLED true
sleep 300  # Wait 5 minutes

vercel env add NOTIFICATIONS_ENABLED true
sleep 300  # Wait 5 minutes

# Disable rollback mode
vercel env add ROLLBACK_MODE false
```

### Phase 5: Post-Incident Activities (4+ hours)

#### Incident Documentation
1. **Timeline:** Complete chronological record of events
2. **Impact Assessment:** Quantify user and business impact
3. **Root Cause:** Detailed analysis of incident cause
4. **Resolution:** Document fix and verification steps

#### Communication
1. **Internal Debrief:** Engineering team post-mortem
2. **Stakeholder Update:** Business impact and resolution summary
3. **Customer Communication:** If incident affected customers

#### Prevention Measures
1. **Monitoring Improvements:** Add alerts for similar issues
2. **Process Changes:** Update deployment or operational procedures
3. **Code Fixes:** Implement permanent solutions
4. **Testing Enhancements:** Add tests to prevent regression

## Incident Response Tools

### Diagnostic Toolkit

#### Health Check Dashboard
```bash
#!/bin/bash
# comprehensive-health-check.sh

echo "=== Churn Saver Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Application health
echo "Application Health:"
curl -s https://your-domain.vercel.app/api/health | jq .

# Database health
echo -e "\nDatabase Health:"
curl -s https://your-domain.vercel.app/api/health/db | jq .

# Webhook processing
echo -e "\nWebhook Processing:"
curl -s https://your-domain.vercel.app/api/health/webhooks | jq .

# Recent errors
echo -e "\nRecent Errors (last 10 minutes):"
vercel logs --app your-app-name --since 10m | grep ERROR | tail -10

# Database performance
echo -e "\nDatabase Performance:"
psql "$DATABASE_URL" -c "
  SELECT
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC
  LIMIT 5;
"
```

#### Log Analysis Tools
```bash
# Error pattern analysis
vercel logs --app your-app-name --since 1h | grep ERROR | \
  sed 's/.*ERROR//' | sort | uniq -c | sort -nr

# Performance analysis
vercel logs --app your-app-name --since 1h | \
  grep "duration" | awk '{print $NF}' | \
  sort -n | awk '
    BEGIN {sum=0; count=0}
    {sum+=$1; count++; if(min=="")min=$1; if($1<min)min=$1; if($1>max)max=$1}
    END {print "Count:", count, "Avg:", sum/count, "Min:", min, "Max:", max}
  '
```

### Emergency Runbooks

#### Webhook Processing Failure
**Symptoms:** Webhooks not being processed, events backing up

**Immediate Actions:**
1. Check webhook signature validation logs
2. Verify database connectivity and permissions
3. Review rate limiting status and thresholds
4. Check for external API failures (Whop service status)

**Diagnostic Commands:**
```bash
# Check webhook processing status
curl https://your-domain.vercel.app/api/health/webhooks

# Review recent webhook attempts
vercel logs --app your-app-name --since 30m | grep webhook

# Check database event ingestion
psql "$DATABASE_URL" -c "
  SELECT type, COUNT(*) as count,
         MIN(created_at) as oldest,
         MAX(created_at) as newest
  FROM events
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY type;
"
```

**Recovery Steps:**
1. **Temporary Disable:** `vercel env add WEBHOOK_PROCESSING_ENABLED false`
2. **Fix Root Cause:** Address signature validation or database issues
3. **Clear Backlog:** Process queued events manually if safe
4. **Gradual Re-enable:** Re-enable with monitoring

#### Scheduler Processing Failure
**Symptoms:** Reminders not being sent, scheduler jobs failing

**Immediate Actions:**
1. Check Vercel cron job execution logs
2. Verify database locks and connection issues
3. Review job queue status and backlog
4. Test manual scheduler execution

**Diagnostic Commands:**
```bash
# Check scheduler status
curl -X GET https://your-domain.vercel.app/api/scheduler/reminders

# Manual scheduler trigger
curl -X POST https://your-domain.vercel.app/api/scheduler/reminders \
  -H "Authorization: Bearer $SCHEDULER_SECRET_KEY"

# Check job queue
psql "$DATABASE_URL" -c "
  SELECT status, COUNT(*) as count,
         MIN(created_at) as oldest,
         MAX(created_at) as newest
  FROM job_queue
  GROUP BY status;
"
```

**Recovery Steps:**
1. **Pause Automation:** Disable cron jobs temporarily
2. **Manual Processing:** Trigger scheduler manually
3. **Clear Locks:** Resolve any database lock issues
4. **Resume Normal Operation:** Re-enable automated scheduling

#### Database Performance Issues
**Symptoms:** Slow queries, connection timeouts, high CPU usage

**Immediate Actions:**
1. Check database connection pool utilization
2. Review slow query logs and active connections
3. Monitor disk I/O and memory usage
4. Verify backup and maintenance job status

**Diagnostic Commands:**
```bash
# Database connection status
psql "$DATABASE_URL" -c "
  SELECT count(*) as active_connections
  FROM pg_stat_activity
  WHERE state = 'active';
"

# Slow query analysis
psql "$DATABASE_URL" -c "
  SELECT query, total_time, calls, mean_time
  FROM pg_stat_statements
  ORDER BY mean_time DESC
  LIMIT 10;
"

# Index usage analysis
psql "$DATABASE_URL" -c "
  SELECT schemaname, tablename, indexname,
         idx_scan, idx_tup_read, idx_tup_fetch
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
  ORDER BY idx_scan DESC;
"
```

**Recovery Steps:**
1. **Connection Pool Reset:** Restart application instances if needed
2. **Query Optimization:** Kill long-running queries if safe
3. **Index Maintenance:** Rebuild fragmented indexes
4. **Scale Resources:** Increase database capacity if needed

#### External Service Failures
**Symptoms:** Push/DM delivery failures, API timeouts

**Immediate Actions:**
1. Check service status pages and incident reports
2. Review API key validity and rate limit status
3. Monitor error rates and retry logic effectiveness
4. Implement fallback mechanisms if available

**Diagnostic Commands:**
```bash
# Check external service status
curl -s https://api.pushservice.com/status
curl -s https://api.dmservice.com/health

# Review delivery failures
vercel logs --app your-app-name --since 1h | grep -i "push\|dm\|delivery"

# Check API key validity
curl -H "Authorization: Bearer $PUSH_API_KEY" \
  https://api.pushservice.com/validate
```

**Recovery Steps:**
1. **Rate Limit Management:** Implement exponential backoff
2. **API Key Rotation:** Generate new keys if compromised
3. **Circuit Breaker:** Temporarily disable failing services
4. **Alternative Providers:** Switch to backup services if available

## Communication Protocols

### Internal Communication

#### Incident Status Updates
- **P0/P1 Incidents:** Updates every 15-30 minutes
- **P2 Incidents:** Updates every 1-2 hours
- **P3 Incidents:** Daily status updates

#### Communication Channels
- **Real-time:** Slack `#incidents` channel
- **Escalation:** PagerDuty for on-call notifications
- **Documentation:** Incident tracking in project management tool

#### Status Update Template
```
🚨 INCIDENT UPDATE
Incident ID: INC-2025-001
Severity: P1
Status: Investigating
Duration: 45 minutes

What: Webhook processing delayed
Impact: ~20% of webhooks delayed by 5-10 minutes
Users Affected: All customers

Current Actions:
- Investigating database connection pool issues
- Manual processing of critical webhooks
- Monitoring for further degradation

Next Update: 3:00 PM EST
On-call: @john.doe
```

### External Communication

#### Customer Communication Triggers
- **Service Outage > 30 minutes:** Status page update + email notification
- **Data Impact:** Immediate notification if customer data affected
- **Security Incident:** Coordinated disclosure based on severity

#### Stakeholder Communication
- **Executive Team:** P0 incidents + major P1 incidents
- **Product Team:** All incidents affecting product functionality
- **Support Team:** All customer-impacting incidents

#### Communication Templates

##### Status Page Update
```
🔄 Service Update: Churn Saver Webhook Processing

Issue: Experiencing delays in webhook processing
Status: Investigating
Impact: Some webhook events may be delayed by up to 15 minutes
Start Time: 2:30 PM EST

We are actively investigating and will provide updates every 30 minutes.
```

##### Customer Email Notification
```
Subject: Churn Saver Service Update

Dear Customer,

We are currently experiencing a temporary issue with webhook processing that may cause delays of up to 15 minutes for some events.

Our engineering team is actively working to resolve this issue. We apologize for any inconvenience this may cause.

For real-time updates, please check our status page: https://status.churnsaver.com

Thank you for your patience.

Best regards,
Churn Saver Team
```

## Post-Incident Review Process

### Incident Retrospective
**Timing:** Within 24-48 hours of incident resolution
**Attendees:** Incident responders, team leads, product owner
**Duration:** 30-60 minutes

#### Retrospective Agenda
1. **Timeline Review:** What happened and when
2. **Impact Assessment:** Actual vs. potential impact
3. **Root Cause Analysis:** Why did it happen
4. **Response Effectiveness:** What went well, what didn't
5. **Prevention Measures:** How to prevent recurrence

#### Action Items
- **Immediate:** Critical fixes and monitoring improvements
- **Short-term:** Process and tooling improvements
- **Long-term:** Architectural or systemic changes

### Follow-up Actions
1. **Documentation Updates:** Update runbooks and procedures
2. **Training:** Team training on lessons learned
3. **Monitoring Enhancements:** Implement additional alerts
4. **Testing Improvements:** Add regression tests
5. **Communication Improvements:** Update communication templates

### Incident Metrics Tracking
- **MTTD (Mean Time to Detection):** Average time to detect incidents
- **MTTR (Mean Time to Resolution):** Average time to resolve incidents
- **False Positive Rate:** Percentage of alerts that are not actual incidents
- **Severity Accuracy:** Percentage of correct severity classifications

## Emergency Contacts

### On-Call Engineers
- **Primary:** [Name] - [Phone] - [Email] - [Slack]
- **Secondary:** [Name] - [Phone] - [Email] - [Slack]
- **Tertiary:** [Name] - [Phone] - [Email] - [Slack]

### Escalation Contacts
- **Engineering Manager:** [Name] - [Phone] - [Email]
- **VP Engineering:** [Name] - [Phone] - [Email]
- **CTO:** [Name] - [Phone] - [Email]

### External Support
- **Vercel Support:** 24/7 support available
- **Supabase Support:** Business hours + emergency contact
- **Whop Support:** Business hours support
- **Push Provider Support:** 24/7 enterprise support
- **DM Provider Support:** Business hours support

## Continuous Improvement

### Regular Process Reviews
- **Monthly:** Incident response process review
- **Quarterly:** Tool and technology evaluation
- **Annually:** Complete incident response plan overhaul

### Training and Drills
- **Monthly:** Incident response training sessions
- **Quarterly:** Full incident simulation exercises
- **Annually:** Disaster recovery drills

### Metrics and KPIs
- **Response Time Goals:** Meet SLA targets for all severity levels
- **Process Efficiency:** Reduce MTTR by 10% quarterly
- **Prevention Effectiveness:** Reduce similar incidents by 20% annually
- **Team Readiness:** 100% of team members trained on procedures

This incident response plan provides a structured approach to managing production incidents while ensuring rapid resolution, clear communication, and continuous learning. Regular practice and updates will maintain its effectiveness as the system evolves.