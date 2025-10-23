# Comprehensive Monitoring and Alerting Setup Guide

**Version:** 1.0  
**Date:** 2025-10-21  
**Document Owner:** DevOps Team  

## Overview

This guide provides comprehensive instructions for setting up and maintaining the monitoring and alerting system for the Churn Saver production environment. The system includes health checks, metrics collection, alerting, and real-time dashboards.

## Architecture Overview

### Components

1. **Health Check Endpoints**
   - `/api/health` - Overall application health
   - `/api/health/db` - Database connectivity and performance
   - `/api/health/webhooks` - Webhook processing metrics
   - `/api/health/external` - External service health
   - `/api/health/queue` - Job queue status

2. **Metrics Collection System**
   - In-memory metrics with configurable retention
   - Counters, gauges, and histograms
   - Business KPIs tracking
   - Performance metrics

3. **Alerting System**
   - Configurable thresholds (P0-P3 severity)
   - Multiple notification channels (Slack, PagerDuty, Email)
   - Escalation policies
   - Rate limiting and alert fatigue prevention

4. **Real-time Dashboard**
   - System overview and status
   - Detailed metrics visualization
   - Active and recent alerts
   - Health status indicators

## Installation and Setup

### 1. Environment Variables

Add the following environment variables to your production environment:

```bash
# Notification Channels
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-integration-key

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL_FROM=alerts@churnsaver.com
ALERT_EMAIL_TO=devops@churnsaver.com,team@churnsaver.com

# OpenTelemetry Configuration (Optional)
OTEL_EXPORTER_ENDPOINT=http://your-otel-collector:4317
OTEL_SERVICE_NAME=churn-saver
OTEL_SERVICE_VERSION=1.0.0
OTEL_ENVIRONMENT=production
```

### 2. Dependencies Installation

Install the required monitoring dependencies:

```bash
npm install lucide-react
```

For OpenTelemetry integration (optional):
```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/resources @opentelemetry/semantic-conventions @opentelemetry/exporter-metrics-otlp-http @opentelemetry/exporter-trace-otlp-http @opentelemetry/instrumentation-http @opentelemetry/instrumentation-fetch
```

### 3. Integration with Application

Initialize the monitoring system in your application entry point:

```typescript
// apps/web/src/app/layout.tsx or similar entry point
import { initializeMonitoring, startPeriodicMetricsCollection } from '@/lib/monitoring-integration';

// Initialize monitoring systems
initializeMonitoring();
startPeriodicMetricsCollection();
```

### 4. Health Check Configuration

Configure your load balancer or monitoring service to check the health endpoints:

```bash
# Basic health check
curl https://your-app.com/api/health

# Comprehensive health check
curl https://your-app.com/api/health?detailed=true

# Specific component checks
curl https://your-app.com/api/health/db
curl https://your-app.com/api/health/webhooks
curl https://your-app.com/api/health/external
curl https://your-app.com/api/health/queue
```

## Configuration

### Alert Rules

The system includes pre-configured alert rules. You can customize them by modifying the alerting configuration:

```typescript
// Example: Add custom alert rule
import { alerting } from '@/lib/alerting';

alerting.createAlertRule({
  name: 'custom_high_error_rate',
  metricName: 'http_request_duration_ms',
  condition: 'gt',
  threshold: 5000, // 5 seconds
  severity: 'P1',
  duration: 300, // 5 minutes
  enabled: true
});
```

### Notification Channels

Configure notification channels for different alert severities:

```typescript
// Example: Add custom notification channel
alerting.createChannel({
  name: 'custom-webhook',
  type: 'webhook',
  config: {
    webhookUrl: 'https://your-webhook-endpoint.com/alerts',
    headers: {
      'Authorization': 'Bearer your-token'
    }
  },
  enabled: true,
  rateLimit: {
    maxAlertsPerHour: 10,
    cooldownMinutes: 5
  }
});
```

### Escalation Policies

Configure escalation policies for different alert severities:

```typescript
// Example: Custom escalation policy
alerting.createEscalationPolicy({
  name: 'Custom-P1',
  severity: 'P1',
  channels: ['slack-production'],
  escalationRules: [
    {
      delayMinutes: 15,
      channels: ['pagerduty-production'],
      condition: 'no_response'
    },
    {
      delayMinutes: 30,
      channels: ['email-production'],
      condition: 'still_firing'
    }
  ]
});
```

## Monitoring Endpoints

### Health Endpoints

#### Overall Health
```bash
GET /api/health
GET /api/health?detailed=true
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-21T21:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": { "status": "healthy", ... },
    "webhooks": { "status": "healthy", ... },
    "queue": { "status": "healthy", ... },
    "external": { "status": "healthy", ... }
  },
  "summary": {
    "total_checks": 4,
    "healthy_checks": 4,
    "degraded_checks": 0,
    "unhealthy_checks": 0
  }
}
```

#### Database Health
```bash
GET /api/health/db
```

Response includes:
- Connection status and latency
- Pool statistics
- Query performance metrics
- Storage utilization
- Replication status (if applicable)

#### Webhook Health
```bash
GET /api/health/webhooks
```

Response includes:
- Events processed (24h, 1h)
- Success rates
- Processing times
- Error breakdown
- Type distribution

#### External Services Health
```bash
GET /api/health/external
```

Response includes:
- Whop API status
- Push service status
- DM service status
- Response times
- Error rates

### Dashboard Endpoint

```bash
GET /api/monitoring/dashboard
```

Provides comprehensive data for the monitoring dashboard including:
- System overview
- Detailed metrics
- Active and recent alerts
- Health status

## Integration Examples

### API Route Monitoring

```typescript
// Example: Wrap API routes with monitoring
import { withMonitoring } from '@/lib/monitoring-integration';

export const GET = withMonitoring(async (request: NextRequest) => {
  // Your API logic here
  return NextResponse.json({ data: 'success' });
});
```

### Database Query Monitoring

```typescript
// Example: Monitor database queries
import { withDatabaseMonitoring } from '@/lib/monitoring-integration';

const result = await withDatabaseMonitoring(
  'select',
  'events',
  () => sql.select('SELECT * FROM events WHERE created_at > $1', [date])
);
```

### External API Monitoring

```typescript
// Example: Monitor external API calls
import { withExternalApiMonitoring } from '@/lib/monitoring-integration';

const response = await withExternalApiMonitoring(
  'whop',
  '/api/memberships',
  () => fetch('https://api.whop.com/v1/memberships', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
);
```

### Custom Metrics

```typescript
// Example: Record custom business metrics
import { metrics } from '@/lib/metrics';

// Record a recovery case
metrics.recordRecoveryCase('company-123', 'cancellation_attempt');

// Record active companies
metrics.setGauge('active_companies', 45);

// Record custom counter
metrics.recordCounter('custom_feature_usage', 1, { 
  feature: 'advanced_analytics',
  user_tier: 'premium' 
});
```

## Dashboard Setup

### 1. Add Dashboard Route

Create a monitoring dashboard page:

```typescript
// apps/web/src/app/monitoring/page.tsx
import MonitoringDashboard from '@/components/dashboard/MonitoringDashboardSimple';

export default function MonitoringPage() {
  return <MonitoringDashboard />;
}
```

### 2. Navigation

Add the monitoring dashboard to your navigation:

```typescript
// Add to your navigation component
<Link href="/monitoring">Monitoring Dashboard</Link>
```

### 3. Access Control

Implement access control for the monitoring dashboard:

```typescript
// Example middleware for monitoring access
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/monitoring')) {
    // Implement your authentication logic here
    const isAuthenticated = checkAuth(request);
    
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
}
```

## Maintenance and Operations

### Daily Tasks

1. **Review Active Alerts**
   - Check for unresolved P0/P1 alerts
   - Verify alert notifications are working
   - Review alert fatigue indicators

2. **Monitor Dashboard**
   - Check system status indicators
   - Review performance trends
   - Identify unusual patterns

3. **Log Review**
   - Check for error patterns
   - Review performance degradation
   - Monitor resource utilization

### Weekly Tasks

1. **Alert Rule Review**
   - Evaluate false positive rates
   - Adjust thresholds if needed
   - Review alert effectiveness

2. **Performance Analysis**
   - Review response time trends
   - Analyze error rates
   - Check resource utilization trends

3. **Capacity Planning**
   - Review growth trends
   - Plan for capacity increases
   - Update scaling thresholds

### Monthly Tasks

1. **System Health Review**
   - Comprehensive system audit
   - Review all monitoring components
   - Update documentation

2. **Alert System Maintenance**
   - Test notification channels
   - Update contact information
   - Review escalation policies

3. **Performance Optimization**
   - Analyze long-term trends
   - Identify optimization opportunities
   - Plan system improvements

## Troubleshooting

### Common Issues

#### Health Check Failures

1. **Database Health Check Fails**
   ```bash
   # Check database connectivity
   curl https://your-app.com/api/health/db
   
   # Review database logs
   # Check connection pool settings
   # Verify database server status
   ```

2. **External Service Health Check Fails**
   ```bash
   # Check external service status
   curl https://your-app.com/api/health/external
   
   # Verify API keys and tokens
   # Check rate limits
   # Review service status pages
   ```

#### Alert System Issues

1. **Alerts Not Triggering**
   ```bash
   # Check alert rules configuration
   # Verify metrics are being collected
   # Review alert system logs
   ```

2. **Notifications Not Sending**
   ```bash
   # Test notification channels
   curl -X POST https://your-app.com/api/alerts/test-channel \
     -H "Content-Type: application/json" \
     -d '{"channelName": "slack-production"}'
   
   # Verify channel configuration
   # Check API keys and webhooks
   # Review rate limiting settings
   ```

#### Dashboard Issues

1. **Dashboard Not Loading**
   ```bash
   # Check dashboard API endpoint
   curl https://your-app.com/api/monitoring/dashboard
   
   # Review browser console for errors
   # Check network connectivity
   # Verify API responses
   ```

### Performance Issues

1. **High Memory Usage**
   - Monitor metric retention settings
   - Review alert rule complexity
   - Check for memory leaks

2. **Slow Response Times**
   - Optimize database queries
   - Review external API call patterns
   - Check for blocking operations

## Security Considerations

### Access Control

1. **Dashboard Access**
   - Implement authentication
   - Use role-based access control
   - Log all dashboard access

2. **API Endpoints**
   - Secure health check endpoints
   - Rate limit monitoring APIs
   - Use authentication for sensitive endpoints

### Data Protection

1. **PII in Logs**
   - Ensure PII redaction is working
   - Review log sampling settings
   - Audit log retention policies

2. **Metric Data**
   - Review metric retention periods
   - Implement data cleanup policies
   - Secure metric storage

## Scaling and Performance

### Metric Retention

Configure appropriate retention periods:

```typescript
// Example: Configure metric retention
const metrics = new MetricsService({
  retentionPeriods: {
    counters: '7d',      // 7 days for counters
    gauges: '24h',       // 24 hours for gauges
    histograms: '3d'     // 3 days for histograms
  }
});
```

### Performance Optimization

1. **Metric Collection**
   - Use sampling for high-volume metrics
   - Implement metric aggregation
   - Optimize metric storage

2. **Alert Processing**
   - Use efficient alert evaluation
   - Implement alert grouping
   - Optimize notification delivery

## Integration with External Systems

### OpenTelemetry Integration

For advanced observability, integrate with OpenTelemetry:

```typescript
// Initialize OpenTelemetry
import { initializeTelemetry } from '@/lib/telemetry';

const telemetry = initializeTelemetry({
  serviceName: 'churn-saver',
  serviceVersion: '1.0.0',
  environment: 'production',
  otelExporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT,
  enabled: true
});

await telemetry.initialize();
```

### Third-Party Monitoring Services

Integrate with external monitoring services:

1. **DataDog**
   - Configure metrics export
   - Set up custom dashboards
   - Configure alert integration

2. **New Relic**
   - Install APM agent
   - Configure custom metrics
   - Set up alert policies

3. **Grafana**
   - Configure Prometheus exporter
   - Create custom dashboards
   - Set up alert rules

## Backup and Recovery

### Configuration Backup

Regularly backup monitoring configuration:

```bash
# Export alert rules
curl https://your-app.com/api/alerts/rules > alert-rules-backup.json

# Export notification channels
curl https://your-app.com/api/alerts/channels > channels-backup.json
```

### Disaster Recovery

1. **Monitoring System Recovery**
   - Document recovery procedures
   - Test backup restoration
   - Maintain offline copies

2. **Alert System Recovery**
   - Implement fallback notification channels
   - Test alert delivery during outages
   - Maintain manual override procedures

## Compliance and Auditing

### Audit Trail

Maintain comprehensive audit logs:

1. **Alert History**
   - Log all alert triggers
   - Track alert resolutions
   - Record notification delivery

2. **Configuration Changes**
   - Log alert rule modifications
   - Track channel configuration changes
   - Record system access

### Compliance Requirements

Ensure compliance with relevant standards:

1. **Data Retention**
   - Implement appropriate retention policies
   - Secure data deletion procedures
   - Maintain audit trails

2. **Access Logging**
   - Log all system access
   - Monitor privileged access
   - Regular access reviews

## Support and Escalation

### Contact Information

Maintain up-to-date contact information:

- **Primary On-call**: [Contact Information]
- **Secondary On-call**: [Contact Information]
- **DevOps Team**: [Contact Information]
- **Management**: [Contact Information]

### Escalation Procedures

Document clear escalation procedures:

1. **P0 Alerts**: Immediate notification (5 minutes)
2. **P1 Alerts**: On-call notification (30 minutes)
3. **P2 Alerts**: Team notification (2 hours)
4. **P3 Alerts**: Business hours notification (24 hours)

## Conclusion

This comprehensive monitoring and alerting system provides real-time visibility into the Churn Saver application health and performance. Regular maintenance and monitoring of the system itself ensures reliable operation and quick detection of issues.

For questions or support, contact the DevOps team or refer to the incident response plan.