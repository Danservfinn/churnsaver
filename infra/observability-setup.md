# Observability & Monitoring Setup

This document outlines how to configure monitoring, alerting, and dashboards for the Churn Saver application in production.

## Provider Routing & Mock Enforcement

### Provider Routing Behavior

The application uses intelligent provider routing to ensure production reliability while allowing safe development testing:

#### Push Notifications (`apps/web/src/server/services/push.ts`)
- **Production**: Routes to Whop's push notification service
- **Development**: Uses mock service for testing (unless `AGENT_FORCE_WHOP_PROVIDERS=true`)
- **Routing Logic**: `process.env.NODE_ENV === 'production' || process.env.AGENT_FORCE_WHOP_PROVIDERS`

#### Direct Messages (`apps/web/src/server/services/dm.ts`)
- **Production**: Routes to Whop's direct messaging service
- **Development**: Uses mock service for testing (unless `AGENT_FORCE_WHOP_PROVIDERS=true`)
- **Routing Logic**: `process.env.NODE_ENV === 'production' || process.env.AGENT_FORCE_WHOP_PROVIDERS`

#### Mock Provider Enforcement
- **Purpose**: Prevents accidental use of mock providers in production
- **Environment Variable**: `AGENT_FORCE_WHOP_PROVIDERS=true` forces production providers even in development
- **Safety**: Mock providers are automatically disabled in production environments
- **Testing**: Mock providers include configurable failure rates for testing error scenarios

### Scheduler Implementation

The application supports two scheduler implementations for different deployment scenarios:

#### Serverless Scheduler (`apps/web/src/server/services/scheduler.ts`)
- **Usage**: Production deployments (Vercel, Netlify, serverless functions)
- **Trigger**: External cron calls `/api/scheduler/reminders` endpoint every 5-15 minutes
- **Architecture**: Job queue based with pg-boss for durability across serverless restarts
- **Benefits**: Reliable in serverless environments, prevents duplicate processing

#### Local Node-Cron Scheduler (`apps/web/src/server/cron/processReminders.ts`)
- **Usage**: Local development and testing only
- **Trigger**: Internal node-cron job running every minute
- **Architecture**: Direct function calls with in-memory state
- **Warning**: NOT FOR PRODUCTION - Can cause issues in serverless environments
- **Purpose**: Development convenience and testing

### Usage Guidelines

#### Production Deployments
1. Use serverless scheduler with external cron triggers
2. Never deploy node-cron scheduler to production
3. Configure external cron to call `/api/scheduler/reminders` every 5-15 minutes
4. Monitor job queue health via `/api/health?type=queue`

#### Development Environment
1. Use local node-cron scheduler for rapid testing
2. Set `AGENT_FORCE_WHOP_PROVIDERS=true` to test production providers
3. Use mock providers for isolated testing without external dependencies
4. Monitor logs for provider routing decisions

## Overview

The application includes structured logging with metrics that can be scraped by monitoring systems like Datadog, Grafana + Prometheus, or cloud-native solutions (CloudWatch, Azure Monitor, etc.).

## Log Structure

All logs include structured fields that monitoring systems can parse and aggregate:

### Common Log Fields
- `level`: 'info', 'warn', 'error'
- `operation`: 'webhook', 'reminder', 'scheduler', 'api_call'
- `operation_type`: Specific action (e.g., 'sent', 'failed', 'processed')
- `success`: Boolean indicating operation result
- `duration_ms`: Operation duration in milliseconds
- `company_id`: Company context for multi-tenant queries
- `metric_name`: Standard metric name for aggregation
- `metric_value`: Numeric metric value (usually 1 for counters)
- `error_category`: 'authentication', 'validation', 'network', 'database', 'rate_limit', 'provider_failure'
- `timestamp`: ISO 8601 timestamp

### Operation-Specific Fields
- **Webhook logs**: `event_id`, `membership_id`
- **Reminder logs**: `case_id`, `membership_id`, `channel` ('push', 'dm'), `attempt_number`, `message_id`
- **Scheduler logs**: `total_reminders`, `successful_reminders`, `failed_reminders`, `companies_processed`
- **API logs**: `endpoint`, `method`, `status_code`, `user_id`

## Key Metrics to Monitor

#### Provider-Specific Metrics (New)
```
push.mock_success_total            - Mock push notification successes
push.mock_failure_total            - Mock push notification failures
push.mock_failure_TIMEOUT          - Mock push timeout failures
push.mock_failure_NETWORK_ERROR    - Mock push network failures
dm.mock_success_total              - Mock DM successes
dm.mock_failure_total              - Mock DM failures
dm.mock_failure_USER_NOT_FOUND     - Mock DM user not found failures
```

### Critical Metrics
```
webhook.failure.count               - Webhook processing failures
reminder.push.failure.count         - Push notification failures
reminder.dm.failure.count          - Direct message failures
scheduler.failure.count            - Reminder processing failures
api.error.count                    - API endpoint errors (4xx/5xx)
api.rate_limited.count             - Rate limit hits
queue.failed_jobs                  - Job queue failures (>10 failed jobs indicates unhealthy)
```

### Performance Metrics
```
webhook.success.count              - Successfully processed webhooks
reminder.push.success.count        - Successfully sent push notifications
reminder.dm.success.count          - Successfully sent direct messages
scheduler.success.count           - Successfully completed reminder cycles
queue.active_jobs                  - Currently processing jobs
queue.completed_jobs               - Successfully completed jobs
```

### Business Metrics
```
Total companies with active reminder processing
Average reminders sent per company per day
Recovery success rate by reminder attempt number
Time-to-recovery after first reminder
Provider routing decisions (production vs mock usage)
```

## Setting Up Monitoring

### Option 1: Datadog (Recommended)

1. **Install Datadog Agent** on your deployment environment:
   ```bash
   # For Vercel, use serverless function logs
   # For Railway/Docker, install Datadog agent
   DD_API_KEY=your_api_key DD_SITE=datadoghq.com datadog-agent run
   ```

2. **Configure Log Parsing**:
   ```
   Filter: source:console, service:churn-saver
   Parsing Rule:
   (?P<timestamp>%{date("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")}) %{word:level} %{data::keyvalue("message","level","operation","company_id","metric_name","metric_value")}
   ```

3. **Create Dashboards**:

   **Webhook Health Dashboard**:
   - `sum:webhook.failure.count{operation:webhook}` - Webhook failures by error category
   - `sum:webhook.success.count{operation:webhook}` - Successful webhook processing rate
   - Alert if failure rate > 5% over 5 minutes

   **Reminder Delivery Dashboard**:
   - `sum:reminder.push.success.count{operation:reminder}` - Push success rate
   - `sum:reminder.dm.success.count{operation:reminder}` - DM success rate
   - `sum:reminder.push.failure.count{operation:reminder}` - Push failures by error category
   - `sum:reminder.dm.failure.count{operation:reminder}` - DM failures by error category
   - Alert if combined failure rate > 10% over 10 minutes

   **Scheduler Performance Dashboard**:
   - `sum:scheduler.success.count{operation:scheduler}` - Scheduler run success rate
   - `avg:scheduler.total_reminders{operation:scheduler}` - Average reminders per run
   - `avg:scheduler.failed_reminders{operation:scheduler}` - Average failures per run
   - Alert if scheduler failure rate > 0 over 15 minutes

   **API Health Dashboard**:
   - `sum:api.error.count{operation:api_call,status_code:>=500}` - 5xx errors by endpoint
   - `sum:api.error.count{operation:api_call,status_code:>=400}` - 4xx errors (excluding authentication)
   - `sum:api.rate_limited.count{operation:api_call}` - Rate limiting hits
   - Alert if 5xx rate > 1% over 5 minutes

4. **Configure Alerts**:
   ```
   # Critical - Webhook Processing Failing
   Triggers: threshold(sum:webhook.failure.count{operation:webhook}) > 10 over 5m
   Channels: PagerDuty/Slack

   # Critical - Reminder Delivery Failing
   Triggers: threshold(sum:reminder.*.failure.count{operation:reminder}) > 50 over 10m
   Channels: PagerDuty/Slack

   # Warning - API Errors High
   Triggers: threshold(sum:api.error.count{operation:api_call,status_code:>=500}) > 5 over 5m
   Channels: Slack

   # Warning - Rate Limiting Hit
   Triggers: threshold(sum:api.rate_limited.count{operation:api_call}) > 10 over 1m
   Channels: Slack
   ```

### Option 2: Grafana + Prometheus (Open Source)

1. **Install Prometheus** to scrape logs/metrics:
   ```yaml
   # prometheus.yml
   scrape_configs:
     - job_name: 'churn-saver-logs'
       static_configs:
         - targets: ['localhost:3100']  # Loki or log aggregation endpoint
       relabel_configs:
         - source_labels: [__address__]
           target_label: instance
           replacement: churn-saver-prod
   ```

2. **Install Loki** for log aggregation or use Fluent Bit.

3. **Create Grafana Dashboards** with panels for:
   - Rate: `rate(webhook_success_count[5m])`
   - Histogram: `histogram_quantile(0.95, rate(webhook_duration_bucket[5m]))`
   - Counter: `increase(reminder_failure_count[5m])`

### Option 3: Vercel-built Monitoring (For Vercel Deployments)

If deployed on Vercel, use built-in features:

1. **Vercel Analytics** - View response times and error rates
2. **Vercel Logs** - Real-time log tailing
3. **Vercel Health Checks** - Configure endpoint monitoring

For advanced alerting, export logs to external monitoring.

## Alert Thresholds

### Critical (Page immediately)
- Webhook processing failure rate > 5% for 5 minutes
- Reminder delivery failure rate > 10% for 10 minutes
- Scheduler completely failing (> 3 failures in 15 minutes)
- API 5xx rate > 1% for 5 minutes
- Job queue unhealthy (>10 failed jobs in queue)

### Warning (Monitor and fix)
- API 4xx rate > 5% for 5 minutes (excludes auth failures)
- Rate limiting triggered > 10 times per minute
- Single notification provider (push or DM) > 20% failure rate for 10 minutes
- Mock providers used in production environment

### Info (Trend monitoring)
- Recovery rate drops below 50%
- Average response time > 1000ms for webhook processing
- Company onboarding stalled (no reminders sent for 2+ days)
- Provider routing changes (unexpected mock/production usage)

## Log Locations

### Local Development
- Console output with structured JSON logs
- Use `tail -f` or log aggregation tools

### Production (Vercel)
- Vercel dashboard logs section
- Real-time log tailing available
- Logs retained for 30 days

### Production (Other Platforms)
```
# Railway/Render
- Built-in log viewer
- Export to external aggregation (Datadog, Papertrail)

# Docker containers
- docker logs <container_name> -f
- Mount volumes for persistent logging

# Standard locations
- /var/log/application/churn-saver.log
- /var/log/nginx/access.log (if using nginx)
```

## Testing Monitoring

### Generate Test Data
```bash
# Trigger webhook failures (10x)
for i in {1..10}; do
  curl -X POST https://your-app.com/api/webhooks/whop \
    -H "Content-Type: application/json" \
    -d '{"id":"test_fail_'"$i"'","type":"payment_failed","data":{}}'
done

# Trigger rate limiting (50x)
for i in {1..50}; do
  curl -X GET https://your-app.com/api/dashboard/kpis &
done

# Check logs contain metrics
grep "webhook.failure.count" /var/log/application/churn-saver.log
```

### Verify Alert Setup
- Manually trigger webhook failure burst
- Confirm alerts fire within expected timeframes
- Test alert channels (Slack/PagerDuty)

## Troubleshooting Common Issues

### Metrics Not Appearing
1. Check log format is valid JSON
2. Verify monitoring agent can parse logs
3. Confirm metric names match expected patterns
4. Check log ingestion rate limits

### False Positive Alerts
1. Adjust thresholds based on normal traffic patterns
2. Add filters for expected maintenance periods
3. Use alerting windows to reduce noise (e.g., only alert during business hours)

### Log Volume Too High
1. Add log sampling for low-value operations
2. Use log levels appropriately (debug only in development)
3. Archive old logs to reduce storage costs

## Cost Optimization

### Logging Costs
- Use structured JSON logs (more expensive but searchable)
- Consider log sampling in high-volume scenarios
- Archive old logs to cheaper storage

### Monitoring Costs
- Start with essential dashboards/alerts
- Use anomaly detection instead of static thresholds where possible
- Review and delete unused dashboards regularly

This setup provides comprehensive observability while keeping costs reasonable for a production application.
