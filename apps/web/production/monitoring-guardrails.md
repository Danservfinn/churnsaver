# Production Monitoring Guardrails and Alerting Thresholds

**Version:** 1.0
**Date:** 2025-10-21
**Document Owner:** DevOps Team

## Overview

This document defines the monitoring guardrails and alerting thresholds for the Churn Saver production environment. The monitoring strategy focuses on proactive detection of issues, automated alerting, and clear escalation paths to ensure system reliability and business continuity.

## Monitoring Architecture

### Monitoring Stack
- **Application Monitoring:** Vercel Analytics + Custom health endpoints
- **Database Monitoring:** Supabase built-in monitoring + custom queries
- **Error Tracking:** Sentry for application errors
- **Performance Monitoring:** New Relic APM (if available) or custom metrics
- **Business Metrics:** Custom dashboards for churn prevention KPIs
- **Alerting:** Slack notifications + PagerDuty escalation

### Monitoring Coverage
- **Infrastructure:** Serverless function performance, database health
- **Application:** API response times, error rates, throughput
- **Business Logic:** Webhook processing, reminder delivery, recovery attribution
- **External Dependencies:** Whop API, Push/DM services, external integrations
- **Security:** Authentication failures, rate limiting, data access patterns

## Health Check Endpoints

### Application Health Checks
```bash
# Overall application health
GET /api/health
Response: 200 OK with JSON status

# Database connectivity
GET /api/health/db
Response: 200 OK with connection status

# Webhook processing status
GET /api/health/webhooks
Response: 200 OK with processing metrics

# Scheduler status
GET /api/scheduler/reminders (GET request)
Response: 200 OK with scheduler health
```

### Health Check Implementation
```typescript
// apps/web/src/app/api/health/route.ts
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    status: 'healthy',
    checks: {
      database: await checkDatabaseHealth(),
      redis: await checkRedisHealth(), // if applicable
      external: await checkExternalServices()
    }
  };

  const hasFailures = Object.values(checks.checks).some(check => !check.healthy);
  const statusCode = hasFailures ? 503 : 200;

  return Response.json(checks, { status: statusCode });
}
```

## Critical Metrics and Thresholds

### P0 - Critical Alerts (Immediate Response Required)

#### System Availability
- **Application Down:** No successful health checks for > 5 minutes
- **Database Unavailable:** Cannot connect to database for > 2 minutes
- **Webhook Processing Stopped:** No webhooks processed for > 10 minutes
- **Data Corruption:** Inconsistent data detected in recovery_cases or events tables

#### Security Incidents
- **Authentication Failures:** > 50 auth failures per minute sustained
- **Rate Limit Exceeded:** Sustained rate limiting across multiple endpoints
- **Data Breach Indicators:** Unusual data access patterns or PII exposure

**Response Time:** Immediate (within 5 minutes)
**Escalation:** On-call engineer + incident commander

### P1 - High Priority Alerts (Response within 30 minutes)

#### Performance Degradation
- **Response Time:** P95 > 10 seconds for > 5 minutes
- **Error Rate:** > 10% error rate across all endpoints for > 5 minutes
- **Database Performance:** Query timeout rate > 5% or slow queries > 50%
- **Memory/CPU:** Function execution timeouts > 10% of requests

#### Service Degradation
- **Webhook Failures:** Processing success rate < 95% for > 10 minutes
- **Scheduler Failures:** Reminder processing fails for > 20% of companies
- **External Service Failures:** Push/DM delivery rate < 80% sustained
- **Queue Backlog:** > 1000 pending jobs in job_queue table

**Response Time:** Within 30 minutes
**Escalation:** On-call engineer + team lead

### P2 - Medium Priority Alerts (Response within 2 hours)

#### Performance Warnings
- **Response Time:** P95 > 5 seconds for > 15 minutes
- **Error Rate:** > 5% error rate for > 15 minutes
- **Database Warnings:** Connection pool utilization > 80%
- **Rate Limiting:** Individual endpoint rate limits hit frequently

#### Feature Degradation
- **Partial Failures:** Single feature failures (e.g., export only)
- **External Service Issues:** Single provider degradation (not complete failure)
- **Data Latency:** Webhook processing delay > 30 minutes
- **Monitoring Gaps:** Missing metrics or logging gaps

**Response Time:** Within 2 hours
**Escalation:** Assigned engineer during business hours

### P3 - Low Priority Alerts (Response within 24 hours)

#### Optimization Opportunities
- **Performance Trends:** Gradual degradation over time
- **Resource Usage:** Approaching capacity limits
- **Log Volume:** Unusual logging patterns
- **Deprecation Warnings:** Outdated dependencies or APIs

#### Minor Issues
- **UI/UX Issues:** Non-critical display problems
- **Documentation Gaps:** Missing or outdated docs
- **Test Failures:** Non-production test suite issues
- **Maintenance Tasks:** Routine cleanup or optimization tasks

**Response Time:** Within 24 hours
**Escalation:** Backlog items for next sprint

## Detailed Metric Definitions

### Application Performance Metrics

#### Response Time Metrics
- **P50 (Median):** Target < 500ms, Alert > 2s sustained
- **P95 (95th percentile):** Target < 2s, Alert > 5s for P2, >10s for P1
- **P99 (99th percentile):** Target < 5s, Alert > 15s for P1

#### Error Rate Metrics
- **Overall Error Rate:** Target < 1%, Alert > 5% for P2, >10% for P1
- **Endpoint-specific:** Critical endpoints (webhooks, scheduler) target < 0.5%
- **4xx Errors:** Client errors - monitor for API misuse
- **5xx Errors:** Server errors - immediate investigation required

#### Throughput Metrics
- **Requests per Minute:** Baseline monitoring, alert on > 50% deviation
- **Webhook Processing Rate:** Target 300/hour, alert on < 50% of baseline
- **Concurrent Connections:** Monitor for unusual spikes

### Database Performance Metrics

#### Connection Pool Metrics
- **Active Connections:** Target < 80% of pool capacity
- **Connection Wait Time:** Target < 100ms, Alert > 1s
- **Connection Failures:** Target 0, Alert > 1% of connection attempts

#### Query Performance Metrics
- **Slow Query Threshold:** > 2 seconds execution time
- **Index Hit Rate:** Target > 95%, Alert < 90%
- **Lock Wait Time:** Target < 500ms, Alert > 2s
- **Deadlock Rate:** Target 0, Alert > 1 per hour

#### Storage Metrics
- **Disk Usage:** Alert > 80% of allocated storage
- **Backup Status:** Daily backup completion verification
- **Replication Lag:** For read replicas if implemented

### Business Logic Metrics

#### Webhook Processing Metrics
- **Events Processed:** Real-time count with baseline comparison
- **Processing Success Rate:** Target > 99.5%, Alert < 95%
- **Processing Latency:** Time from webhook receipt to database commit
- **Duplicate Detection:** Rate of duplicate events detected
- **Signature Validation:** Success rate of webhook signature verification

#### Scheduler and Reminder Metrics
- **Job Execution Success:** Target > 99%, Alert < 95%
- **Processing Time per Company:** Target < 30 seconds, Alert > 5 minutes
- **Reminder Delivery Rate:** Target > 95%, Alert < 90%
- **Queue Depth:** Number of pending reminder jobs
- **Company Processing Coverage:** Percentage of companies processed

#### Recovery and Attribution Metrics
- **Recovery Case Creation:** Daily count with trend monitoring
- **Attribution Accuracy:** Percentage of correctly attributed recoveries
- **Nudge Effectiveness:** Conversion rates by nudge type and timing
- **Churn Prevention Rate:** Business impact metric

### External Integration Metrics

#### Whop API Metrics
- **API Success Rate:** Target > 99%, Alert < 95%
- **Response Time:** Target < 2s, Alert > 5s
- **Rate Limit Usage:** Alert > 80% of allocated limits
- **Error Types:** Breakdown by error code and frequency

#### Push Notification Metrics
- **Delivery Success Rate:** Target > 95%, Alert < 90%
- **Delivery Latency:** Time from send to delivery confirmation
- **Bounce Rate:** Invalid tokens or failed deliveries
- **Platform Breakdown:** Success rates by iOS/Android

#### DM Service Metrics
- **Delivery Success Rate:** Target > 90%, Alert < 80%
- **Response Time:** API response times
- **Rate Limiting:** Usage vs. allocated limits
- **Content Filtering:** Messages blocked by spam filters

## Alert Configuration

### Alert Channels and Escalation

#### Primary Alert Channel: Slack
- **Channel:** `#production-alerts`
- **P0 Alerts:** @on-call-engineer + @incident-commander
- **P1 Alerts:** @on-call-engineer
- **P2/P3 Alerts:** @devops-team during business hours

#### Secondary Alert Channel: PagerDuty
- **P0/P1 Alerts:** Immediate escalation to on-call rotation
- **Integration:** Webhook-based alerts from monitoring system
- **Escalation Policy:** 5 minutes → 10 minutes → 30 minutes

#### Email Alerts
- **Daily Digest:** Summary of P2/P3 alerts and system health
- **Weekly Report:** Performance trends and capacity planning data
- **Monthly Review:** Business metrics and incident analysis

### Alert Grouping and Noise Reduction

#### Alert Grouping
- **Time-based Grouping:** Similar alerts within 5-minute windows grouped
- **Severity-based Grouping:** Multiple P2 alerts may be batched
- **Component-based Grouping:** Related alerts from same service grouped

#### Alert Suppression
- **Maintenance Windows:** Alerts suppressed during planned maintenance
- **Known Issues:** Temporary suppression for acknowledged issues
- **Dependency Alerts:** Suppressed when upstream service is down

#### Alert Fatigue Prevention
- **Threshold Tuning:** Alerts only trigger after sustained violations
- **Cooldown Periods:** No re-alerting for same issue within 30 minutes
- **Smart Alerting:** Machine learning-based anomaly detection

## Monitoring Dashboards

### Real-time Dashboard (Primary)
- **System Status:** Overall health with traffic lights (green/yellow/red)
- **Key Metrics:** Response times, error rates, throughput
- **Active Alerts:** Current incidents with status and assignee
- **Recent Activity:** Last 24 hours of key events

### Database Dashboard
- **Connection Pool:** Active/idle connections, wait times
- **Query Performance:** Slow queries, index usage, lock statistics
- **Storage:** Disk usage, backup status, replication health
- **Table Statistics:** Row counts, growth trends, cleanup status

### Business Dashboard
- **Webhook Processing:** Events processed, success rates, latency
- **Reminder System:** Jobs completed, delivery rates, queue status
- **Recovery Metrics:** Cases created, attribution accuracy, churn impact
- **External Services:** API health, delivery rates, error breakdowns

### Security Dashboard
- **Authentication:** Login attempts, failures, suspicious activity
- **Access Patterns:** API usage by endpoint and user
- **Data Protection:** Encryption status, PII handling, audit logs
- **Compliance:** GDPR compliance metrics, data retention status

## Incident Response Integration

### Alert-Driven Incident Creation
1. **Alert Triggered:** Monitoring system creates incident ticket
2. **Initial Assessment:** Automated runbook execution for common issues
3. **Escalation:** Based on severity and response time requirements
4. **Resolution Tracking:** Incident status updates from alerts

### Post-Incident Analysis
- **Alert Effectiveness:** Did alerts trigger appropriately?
- **Response Time:** Was SLA met for incident resolution?
- **Root Cause:** Did monitoring provide sufficient diagnostic data?
- **Prevention:** What additional monitoring could prevent recurrence?

## Maintenance and Calibration

### Regular Review Cycles
- **Daily:** Alert queue review, false positive identification
- **Weekly:** Threshold tuning, alert effectiveness analysis
- **Monthly:** Capacity planning, trend analysis
- **Quarterly:** Technology stack evaluation, major threshold updates

### Threshold Calibration
- **Baseline Establishment:** 30-day baseline for normal operation
- **Seasonal Adjustments:** Traffic pattern adjustments for business cycles
- **Gradual Changes:** 10% threshold adjustments to avoid alert storms
- **A/B Testing:** Threshold changes tested in staging before production

### Documentation Updates
- **Alert Playbooks:** Step-by-step response procedures for each alert type
- **Runbooks:** Automated remediation scripts for common issues
- **Contact Lists:** Updated on-call schedules and escalation paths
- **Post-Mortems:** Incident analysis and prevention recommendations

## Implementation Checklist

### Monitoring Setup
- [ ] Health check endpoints implemented and tested
- [ ] Alerting system configured with proper thresholds
- [ ] Dashboards created and populated with metrics
- [ ] Alert channels tested and verified
- [ ] On-call rotation established and documented

### Alert Validation
- [ ] P0 alerts tested with immediate response
- [ ] P1 alerts validated with 30-minute SLA
- [ ] P2 alerts confirmed with appropriate routing
- [ ] P3 alerts configured for backlog tracking
- [ ] Alert grouping and suppression working

### Team Training
- [ ] Incident response procedures documented
- [ ] Alert response playbooks created
- [ ] Escalation paths clearly defined
- [ ] Regular drills and simulations conducted
- [ ] Post-incident review process established

### Continuous Improvement
- [ ] Alert effectiveness metrics tracked
- [ ] False positive rate monitored and reduced
- [ ] Mean time to resolution measured
- [ ] Monitoring coverage gaps identified and filled
- [ ] Technology stack kept current with best practices

## Emergency Override Procedures

### Alert Suppression During Maintenance
1. **Planned Maintenance:** Alerts suppressed via maintenance window flag
2. **Emergency Maintenance:** Immediate suppression with incident ticket
3. **Validation:** Suppression confirmed before maintenance begins
4. **Restoration:** Alerts re-enabled immediately after maintenance

### Manual Alert Management
1. **Temporary Disabling:** Individual alerts can be disabled for investigation
2. **Custom Thresholds:** Temporary overrides for unusual circumstances
3. **Documentation:** All overrides logged with justification and duration
4. **Review:** Overrides reviewed weekly for necessity

## Success Metrics

### Monitoring Effectiveness
- **Alert Accuracy:** > 95% of alerts represent actual issues
- **Response Time:** 100% of P0/P1 alerts acknowledged within SLA
- **False Positive Rate:** < 5% of alerts are false positives
- **Coverage:** 100% of critical system components monitored

### Incident Prevention
- **P0 Incidents:** < 1 per month through proactive monitoring
- **Mean Time to Detection:** < 5 minutes for critical issues
- **Mean Time to Resolution:** < 1 hour for P0, < 4 hours for P1
- **Customer Impact:** Minimized through early detection and response

## Appendices

### Alert Configuration Templates

#### Vercel Alert Configuration
```json
{
  "alerts": [
    {
      "name": "High Error Rate",
      "query": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m]) > 0.1",
      "severity": "critical",
      "channels": ["slack", "pagerduty"]
    }
  ]
}
```

#### Database Alert Configuration
```sql
-- Slow query alert
SELECT query, total_time, calls
FROM pg_stat_statements
WHERE total_time / calls > 2000  -- 2 seconds
ORDER BY total_time DESC
LIMIT 10;
```

### Monitoring Tool Integrations

#### Sentry Configuration
```javascript
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: 'production',
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Console(),
    new Sentry.Integrations.OnUncaughtException(),
    new Sentry.Integrations.OnUnhandledRejection(),
  ],
  tracesSampleRate: 1.0,
});
```

#### Custom Metrics Collection
```typescript
// apps/web/src/lib/metrics.ts
export class Metrics {
  static incrementCounter(name: string, value = 1, tags = {}) {
    // Implementation depends on metrics backend
  }

  static recordTiming(name: string, duration: number, tags = {}) {
    // Record response times, processing durations, etc.
  }

  static recordGauge(name: string, value: number, tags = {}) {
    // Record current values like queue depth, connection count
  }
}
```

This monitoring guardrails document provides a comprehensive framework for maintaining system reliability and ensuring rapid response to production issues. Regular review and calibration of these thresholds will ensure they remain effective as the system evolves.