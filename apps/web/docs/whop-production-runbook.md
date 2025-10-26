# Whop SDK Production Runbook

This runbook provides operational procedures for deploying, monitoring, and maintaining the Whop SDK integration in production environments.

## Table of Contents

1. [Overview](#overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Procedures](#deployment-procedures)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Monitoring & Alerting](#monitoring--alerting)
6. [Incident Response](#incident-response)
7. [Maintenance Procedures](#maintenance-procedures)
8. [Emergency Procedures](#emergency-procedures)
9. [Rollback Procedures](#rollback-procedures)
10. [Performance Optimization](#performance-optimization)

## Overview

The Whop SDK integration handles membership management, payment processing, and webhook event processing for the Churn Saver application. This runbook ensures reliable operation in production.

### Key Components

- **Authentication Service**: JWT token validation and session management
- **API Client**: Resilient HTTP client with retry logic and circuit breaker
- **Webhook Handler**: Secure webhook processing with signature validation
- **Resilience Layer**: Circuit breaker, retry policies, and fallback mechanisms
- **Observability**: Comprehensive logging, metrics, and tracing

### Service Dependencies

- Whop API (primary)
- PostgreSQL database (for idempotency and caching)
- Redis (for session storage and caching)
- Monitoring stack (DataDog/New Relic)

## Pre-Deployment Checklist

### Environment Configuration

- [ ] **Environment Variables Verified**
  ```bash
  # Required production variables
  echo "NEXT_PUBLIC_WHOP_APP_ID: $NEXT_PUBLIC_WHOP_APP_ID"
  echo "WHOP_API_KEY: ${WHOP_API_KEY:0:10}..."
  echo "WHOP_WEBHOOK_SECRET: ${WHOP_WEBHOOK_SECRET:0:10}..."

  # Validate formats
  [[ "$NEXT_PUBLIC_WHOP_APP_ID" =~ ^app_ ]] || exit 1
  [[ ${#WHOP_API_KEY} -ge 16 ]] || exit 1
  [[ ${#WHOP_WEBHOOK_SECRET} -ge 16 ]] || exit 1
  ```

- [ ] **Webhook Endpoints Configured**
  ```bash
  # Verify webhook URL in Whop dashboard
  WEBHOOK_URL="https://your-app.com/api/webhooks/whop"
  echo "Webhook URL configured: $WEBHOOK_URL"

  # Test webhook endpoint availability
  curl -f "$WEBHOOK_URL" || exit 1
  ```

- [ ] **Database Migrations Applied**
  ```bash
  # Check migration status
  npm run db:migrate:status

  # Apply any pending migrations
  npm run db:migrate
  ```

### Security Validation

- [ ] **API Keys Rotated**
  ```bash
  # Generate new production keys if needed
  # Ensure keys are stored in secure vault
  ```

- [ ] **Network Security**
  ```bash
  # Verify firewall rules
  # Check SSL/TLS configuration
  # Validate certificate expiry
  ```

### Testing Validation

- [ ] **Integration Tests Passed**
  ```bash
  npm run test:whop:integration
  npm run test:webhooks
  npm run test:auth
  ```

- [ ] **Load Tests Completed**
  ```bash
  npm run load-test:whop-api -- --duration 300
  npm run load-test:webhooks -- --events 1000
  ```

## Deployment Procedures

### Blue-Green Deployment

1. **Prepare Blue Environment**
   ```bash
   # Deploy to blue environment
   export DEPLOY_ENV=blue
   npm run build
   npm run deploy:$DEPLOY_ENV

   # Run smoke tests
   npm run test:smoke -- --env $DEPLOY_ENV
   ```

2. **Health Checks**
   ```bash
   # Health endpoint checks
   curl -f https://blue.your-app.com/api/health
   curl -f https://blue.your-app.com/api/health/external
   curl -f https://blue.your-app.com/api/health/webhooks
   ```

3. **Whop Integration Tests**
   ```bash
   # Test Whop API connectivity
   npm run test:whop:connectivity -- --env blue

   # Send test webhook
   npm run webhook:test-send -- --env blue
   ```

4. **Traffic Switch**
   ```bash
   # Switch load balancer to blue
   kubectl patch service app-lb -p '{"spec":{"selector":{"env":"blue"}}}'

   # Monitor traffic switch
   watch -n 5 kubectl get pods -l env=blue
   ```

5. **Green Environment Cleanup**
   ```bash
   # Scale down green environment
   kubectl scale deployment app-green --replicas=0

   # Verify no traffic to green
   kubectl logs -l env=green --tail=10
   ```

### Rolling Deployment

1. **Gradual Rollout**
   ```bash
   # Deploy with 25% traffic
   kubectl set image deployment/app app=new-version
   kubectl rollout pause deployment/app

   # Monitor metrics for 10 minutes
   sleep 600

   # Increase to 50% traffic
   kubectl rollout resume deployment/app
   kubectl rollout pause deployment/app

   # Monitor again
   sleep 600

   # Full rollout
   kubectl rollout resume deployment/app
   ```

2. **Canary Analysis**
   ```bash
   # Compare metrics between versions
   npm run compare:metrics -- --baseline green --canary blue

   # Check error rates
   npm run monitor:errors -- --duration 1800
   ```

### Configuration Updates

1. **Environment Variable Updates**
   ```bash
   # Update via secure method (vault, kubernetes secrets, etc.)
   kubectl create secret generic whop-config \
     --from-literal=whop-api-key=$NEW_API_KEY \
     --dry-run=client -o yaml | kubectl apply -f -

   # Rolling restart pods
   kubectl rollout restart deployment/app
   ```

2. **Webhook URL Changes**
   ```bash
   # Update in Whop dashboard first
   echo "Update webhook URL in Whop dashboard to: https://new-domain.com/api/webhooks/whop"

   # Deploy application changes
   npm run deploy

   # Verify webhook delivery
   npm run webhook:test-delivery
   ```

## Post-Deployment Verification

### Automated Verification

```bash
#!/bin/bash
# post-deployment-verification.sh

echo "=== Post-Deployment Verification ==="

# 1. Health Checks
echo "Checking health endpoints..."
curl -f https://your-app.com/api/health || exit 1
curl -f https://your-app.com/api/health/external || exit 1

# 2. Whop API Connectivity
echo "Testing Whop API connectivity..."
npm run test:whop:health || exit 1

# 3. Webhook Processing
echo "Testing webhook processing..."
npm run webhook:test-endpoint || exit 1

# 4. Authentication Flow
echo "Testing authentication..."
npm run test:auth:smoke || exit 1

# 5. Database Connectivity
echo "Checking database..."
npm run db:health-check || exit 1

# 6. Metrics Validation
echo "Validating metrics..."
npm run metrics:validate || exit 1

echo "✅ All checks passed!"
```

### Manual Verification Steps

1. **User Authentication**
   - Test login flow through Whop
   - Verify JWT token generation
   - Check session creation and validation

2. **Membership Operations**
   - Create test membership
   - Verify membership data sync
   - Test membership updates and cancellations

3. **Payment Processing**
   - Process test payment
   - Verify webhook event processing
   - Check payment status updates

4. **Webhook Events**
   - Send test webhook from Whop dashboard
   - Verify event processing and logging
   - Check idempotency handling

### Performance Validation

```bash
# Response time checks
curl -w "@curl-format.txt" -o /dev/null -s https://your-app.com/api/health

# Load test verification
npm run load-test:verification -- --requests 100 --concurrency 5

# Memory and CPU checks
kubectl top pods
```

## Monitoring & Alerting

### Key Metrics to Monitor

#### API Health Metrics

```sql
-- API response times and error rates
SELECT
  service,
  endpoint,
  AVG(response_time_ms) as avg_response_time,
  COUNT(*) as request_count,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as error_rate
FROM api_request_logs
WHERE timestamp > NOW() - INTERVAL '5 minutes'
  AND service = 'whop_api'
GROUP BY service, endpoint;

-- Circuit breaker status
SELECT
  service_name,
  state,
  failure_count,
  last_failure_time,
  last_success_time
FROM circuit_breaker_metrics
WHERE service_name = 'whop_api';
```

#### Webhook Processing Metrics

```sql
-- Webhook success rates
SELECT
  event_type,
  COUNT(*) as total_events,
  SUM(CASE WHEN processing_status = 'success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN processing_status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(processing_time_ms) as avg_processing_time
FROM webhook_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

#### Authentication Metrics

```sql
-- Authentication success/failure rates
SELECT
  event_type,
  COUNT(*) as count,
  AVG(processing_time_ms) as avg_time
FROM auth_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

### Alert Configuration

#### Critical Alerts

```yaml
# Circuit breaker open
alert: WhopAPICircuitBreakerOpen
expr: circuit_breaker_state{state="open", service="whop_api"} == 1
for: 5m
labels:
  severity: critical
annotations:
  summary: "Whop API circuit breaker is OPEN"
  description: "Circuit breaker for Whop API has opened due to failures"

# High error rate
alert: WhopAPIHighErrorRate
expr: rate(whop_api_requests_total{status=~"5.."}[5m]) / rate(whop_api_requests_total[5m]) > 0.05
for: 5m
labels:
  severity: warning
annotations:
  summary: "High Whop API error rate detected"
  description: "Whop API error rate is above 5%"

# Webhook processing failures
alert: WhopWebhookProcessingFailed
expr: increase(whop_webhook_processing_failed_total[10m]) > 10
for: 5m
labels:
  severity: warning
annotations:
  summary: "High webhook processing failure rate"
  description: "More than 10 webhook processing failures in 10 minutes"
```

#### Warning Alerts

```yaml
# Response time degradation
alert: WhopAPIResponseTimeDegraded
expr: histogram_quantile(0.95, rate(whop_api_request_duration_seconds_bucket[5m])) > 5
for: 10m
labels:
  severity: warning
annotations:
  summary: "Whop API response time degraded"
  description: "95th percentile response time above 5 seconds"

# Rate limit approaching
alert: WhopAPIRateLimitApproaching
expr: whop_api_rate_limit_remaining < 100
for: 2m
labels:
  severity: warning
annotations:
  summary: "Whop API rate limit approaching"
  description: "Rate limit remaining below 100 requests"
```

### Dashboard Setup

#### Key Dashboard Panels

1. **API Health Dashboard**
   - Request rate and success rate
   - Response time percentiles (p50, p95, p99)
   - Error rate by endpoint
   - Circuit breaker status

2. **Webhook Processing Dashboard**
   - Events processed per minute
   - Processing success/failure rates
   - Processing latency
   - Event type distribution

3. **Authentication Dashboard**
   - Authentication attempts and success rate
   - Token validation times
   - Session creation/destruction rates

4. **Resilience Dashboard**
   - Retry attempt counts
   - Circuit breaker state transitions
   - Fallback activation frequency

## Incident Response

### Incident Classification

#### Severity Levels

- **P0 (Critical)**: Complete service outage, data loss, security breach
- **P1 (High)**: Major functionality broken, significant user impact
- **P2 (Medium)**: Partial functionality degraded, workaround available
- **P3 (Low)**: Minor issues, monitoring alerts, no user impact

#### Common Incident Types

| Incident Type | Classification | Response Time | Examples |
|---------------|----------------|---------------|----------|
| Service Outage | P0 | 15 minutes | Whop API completely unavailable |
| Authentication Failures | P1 | 30 minutes | Users unable to login |
| Payment Processing Issues | P1 | 30 minutes | Payments not processing |
| Webhook Delivery Problems | P2 | 1 hour | Delayed webhook processing |
| Performance Degradation | P2 | 1 hour | Slow response times |

### Response Procedures

#### P0 Incident Response

1. **Immediate Assessment (0-15 minutes)**
   ```bash
   # Check service status
   curl -f https://your-app.com/api/health || echo "Service down"

   # Check Whop API status
   curl -f https://api.whop.com/api/v5/app || echo "Whop API down"

   # Alert incident response team
   ```

2. **Containment (15-60 minutes)**
   ```bash
   # Enable emergency mode if needed
   export WHOP_EMERGENCY_MODE=true

   # Scale up resources if needed
   kubectl scale deployment app --replicas=10

   # Enable fallback mechanisms
   ```

3. **Recovery (1-4 hours)**
   ```bash
   # Restore from backup if needed
   # Deploy hotfix if available
   # Gradually restore normal operations
   ```

4. **Post-Incident Review**
   - Root cause analysis
   - Timeline documentation
   - Prevention measures
   - Process improvements

#### Authentication Incident Response

1. **Isolate the Issue**
   ```bash
   # Check authentication logs
   npm run logs:auth -- --since "1 hour ago"

   # Test authentication endpoints
   npm run test:auth:health
   ```

2. **Temporary Mitigation**
   ```typescript
   // Enable relaxed authentication for critical operations
   process.env.AUTH_RELAXED_MODE = 'true';
   ```

3. **Full Resolution**
   ```bash
   # Rotate API keys if compromised
   # Update authentication configuration
   # Deploy fix
   ```

### Communication Templates

#### Customer Communication

```
Subject: [URGENT] Churn Saver Service Interruption

Dear valued customer,

We are currently experiencing a service interruption affecting [specific functionality].
Our team is working to resolve this issue as quickly as possible.

Status: Investigating
Estimated resolution: [timeframe]
Impact: [describe impact]

We apologize for any inconvenience this may cause.
Updates will be provided as they become available.

Best regards,
Churn Saver Team
```

#### Internal Communication

```
INCIDENT REPORT

Incident: [Brief description]
Severity: P[X]
Start Time: [timestamp]
Detected By: [who/how]
Current Status: [status]
Affected Systems: [systems]
Affected Users: [estimate/percentage]

IMMEDIATE ACTIONS TAKEN:
- [action 1]
- [action 2]

CURRENT THEORY: [hypothesis]

NEXT STEPS:
- [step 1]
- [step 2]

COMMUNICATIONS SENT:
- [timestamp] - [communication method] - [recipient]
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Weekly Tasks

1. **Certificate Rotation**
   ```bash
   # Check certificate expiry
   openssl x509 -in cert.pem -text -noout | grep "Not After"

   # Rotate certificates if needed
   npm run certs:rotate
   ```

2. **API Key Rotation**
   ```bash
   # Generate new API keys
   NEW_API_KEY=$(openssl rand -hex 32)
   NEW_WEBHOOK_SECRET=$(openssl rand -hex 32)

   # Update in secure storage
   # Deploy configuration update
   ```

3. **Log Rotation and Cleanup**
   ```bash
   # Archive old logs
   npm run logs:archive -- --days 30

   # Clean up old webhook data
   npm run db:cleanup -- --table webhook_logs --days 90
   ```

#### Monthly Tasks

1. **Performance Analysis**
   ```bash
   # Generate performance report
   npm run report:performance -- --month $(date +%Y-%m)

   # Analyze bottlenecks
   npm run analyze:bottlenecks
   ```

2. **Security Audit**
   ```bash
   # Run security scan
   npm run security:audit

   # Review access logs
   npm run audit:access -- --month $(date +%Y-%m)
   ```

3. **Backup Verification**
   ```bash
   # Test backup restoration
   npm run backup:test-restore

   # Verify backup integrity
   npm run backup:verify
   ```

### Version Updates

#### SDK Updates

1. **Pre-Update Assessment**
   ```bash
   # Check for SDK updates
   npm outdated @whop/sdk

   # Review changelog
   # Check compatibility
   ```

2. **Update Process**
   ```bash
   # Update dependencies
   npm update @whop/sdk

   # Run tests
   npm run test:whop

   # Deploy to staging
   npm run deploy:staging

   # Test in staging
   npm run test:staging:whop
   ```

3. **Production Deployment**
   ```bash
   # Follow deployment procedures above
   # Monitor for issues
   # Rollback if needed
   ```

## Emergency Procedures

### Service Outage Response

#### Immediate Actions

1. **Status Assessment**
   ```bash
   # Check all health endpoints
   ./scripts/health-check.sh

   # Check Whop service status
   curl -s https://status.whop.com/api/v2/status.json | jq .status.indicator
   ```

2. **Emergency Mode Activation**
   ```bash
   # Enable emergency mode
   export WHOP_EMERGENCY_MODE=true
   export EMERGENCY_CACHE_TTL=3600000  # 1 hour

   # Restart services
   kubectl rollout restart deployment/app
   ```

3. **Fallback Activation**
   ```typescript
   // Enable fallback mechanisms
   const emergencyResilience = new ResilienceService({
     circuitBreaker: {
       failureThreshold: 1, // Open immediately
       recoveryTimeout: 3600000 // 1 hour
     },
     telemetry: {
       onCircuitBreakerOpen: () => {
         console.log('Emergency mode: Circuit breaker opened');
       }
     }
   });
   ```

#### Communication Strategy

1. **Internal Alert**
   - Slack channel: #incidents
   - Email: incident-response@company.com
   - PagerDuty escalation

2. **External Communication**
   - Status page update
   - Customer email notifications
   - Social media updates if widespread

### Data Recovery

#### From Backup

```bash
# Identify backup point
BACKUP_TIMESTAMP=$(date -d '1 hour ago' +%Y%m%d_%H%M%S)

# Restore database
pg_restore -d churnsaver_prod /backups/churnsaver_$BACKUP_TIMESTAMP.sql

# Verify data integrity
npm run db:verify-integrity

# Re-sync with Whop if needed
npm run sync:whop-data -- --since $BACKUP_TIMESTAMP
```

#### Point-in-Time Recovery

```bash
# Use WAL logs for point-in-time recovery
pg_basebackup -D /tmp/backup -X stream

# Restore to specific transaction
pg_ctl -D /tmp/backup promote

# Apply WAL logs up to desired point
```

## Rollback Procedures

### Application Rollback

1. **Identify Rollback Point**
   ```bash
   # Check deployment history
   kubectl rollout history deployment/app

   # Identify last known good version
   LAST_GOOD_VERSION=$(kubectl rollout history deployment/app --revision=1 | grep -o "app:.*")
   ```

2. **Execute Rollback**
   ```bash
   # Rollback to previous version
   kubectl rollout undo deployment/app

   # Verify rollback
   kubectl rollout status deployment/app
   ```

3. **Configuration Rollback**
   ```bash
   # Revert configuration changes
   kubectl rollout undo configmap/whop-config

   # Restart pods to pick up changes
   kubectl rollout restart deployment/app
   ```

### Database Rollback

1. **Migration Rollback**
   ```bash
   # Check migration status
   npm run db:migrate:status

   # Rollback specific migration
   npm run db:migrate:rollback -- --migration whop_integration_v1
   ```

2. **Data Rollback**
   ```bash
   # Use backup restoration
   # Or manual data correction scripts
   npm run db:rollback-data -- --table whop_events --hours 2
   ```

### Verification After Rollback

```bash
# Run post-deployment verification
./scripts/post-deployment-verification.sh

# Test critical functionality
npm run test:critical-path

# Monitor for issues
npm run monitor:post-rollback -- --duration 1800
```

## Performance Optimization

### Monitoring Performance Metrics

```sql
-- Query performance analysis
SELECT
  query,
  avg_exec_time,
  calls,
  total_exec_time,
  rows
FROM pg_stat_statements
WHERE query LIKE '%whop%'
ORDER BY avg_exec_time DESC
LIMIT 10;

-- Cache hit ratios
SELECT
  'index hit rate' as metric,
  (sum(idx_blks_hit)) / sum(idx_blks_hit + idx_blks_read) as ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate' as metric,
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
```

### Optimization Strategies

#### API Client Optimization

1. **Connection Pooling**
   ```typescript
   const optimizedClient = createWhopApiClient({
     // Enable connection reuse
     keepAlive: true,
     maxConnections: 20,

     // Optimize timeouts
     timeout: 25000, // 25 seconds
     retryDelay: 500,

     // Enable compression
     compression: true
   });
   ```

2. **Request Batching**
   ```typescript
   // Batch multiple user lookups
   const userIds = ['user1', 'user2', 'user3'];
   const userPromises = userIds.map(id =>
     whopApiClient.get(`/users/${id}`)
   );

   // Execute in parallel with concurrency limit
   const results = await Promise.allSettled(userPromises);
   ```

#### Database Optimization

1. **Index Optimization**
   ```sql
   -- Add indexes for common queries
   CREATE INDEX CONCURRENTLY idx_whop_events_type_created
   ON whop_events(event_type, created_at);

   CREATE INDEX CONCURRENTLY idx_whop_events_idempotency
   ON whop_events(whop_event_id, processed_at);
   ```

2. **Query Optimization**
   ```sql
   -- Use efficient queries
   SELECT * FROM whop_events
   WHERE event_type = $1
     AND created_at > $2
     AND processed_at IS NULL
   ORDER BY created_at ASC
   LIMIT 100;
   ```

#### Caching Strategies

1. **Response Caching**
   ```typescript
   const cachedClient = createWhopApiClient({
     cache: {
       enabled: true,
       ttl: 300000, // 5 minutes
       maxSize: 1000
     }
   });
   ```

2. **Session Caching**
   ```typescript
   // Use Redis for session storage
   const redisStorage = new RedisTokenStorage({
     host: process.env.REDIS_HOST,
     password: process.env.REDIS_PASSWORD,
     db: 1
   });

   const authService = new WhopAuthService(config, redisStorage);
   ```

### Capacity Planning

#### Scaling Guidelines

1. **Horizontal Scaling**
   ```bash
   # Scale based on CPU utilization
   kubectl autoscale deployment app --cpu-percent=70 --min=3 --max=20

   # Scale based on custom metrics
   kubectl autoscale deployment app \
     --metric-selector="whop_api_error_rate<0.05" \
     --min=3 --max=20
   ```

2. **Resource Allocation**
   ```yaml
   # Optimized resource requests/limits
   resources:
     requests:
       cpu: 500m
       memory: 1Gi
     limits:
       cpu: 1000m
       memory: 2Gi
   ```

#### Performance Benchmarks

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| API Response Time (p95) | < 2 seconds | > 10 seconds |
| Error Rate | < 1% | > 5% |
| Webhook Processing Time | < 500ms | > 5 seconds |
| Authentication Time | < 100ms | > 1 second |
| Circuit Breaker Open Rate | < 1 per day | > 1 per hour |

---

This production runbook provides comprehensive operational procedures for the Whop SDK integration. Regular review and updates are recommended to ensure continued reliability and performance.