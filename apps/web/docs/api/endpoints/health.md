# Health Check API

## Overview

The Health Check API provides endpoints for monitoring system health, including database connectivity, webhook processing, job queue status, and external service availability. These endpoints are essential for monitoring, alerting, and ensuring system reliability.

## Table of Contents

1. [Application Health](#application-health)
2. [Database Health](#database-health)
3. [Webhook Health](#webhook-health)
4. [Queue Health](#queue-health)
5. [External Service Health](#external-service-health)
6. [Comprehensive Health](#comprehensive-health)
7. [Health Monitoring](#health-monitoring)

## Application Health

### GET /api/health

Returns basic application health status and uptime information.

#### Authentication

- **Required**: No
- **Purpose**: Basic health monitoring

#### Rate Limiting

- **Limit**: 1000 requests/hour
- **Key**: IP-based

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `detailed` | boolean | No | `false` | Include detailed system information |
| `type` | string | No | - | Specific health check type |

#### Request Example

```http
GET /api/health
GET /api/health?detailed=true
```

#### Response Example

**Basic Health Check**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production"
}
```

**Detailed Health Check**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "details": {
    "node_version": "v18.17.0",
    "memory_usage": {
      "used_mb": 256,
      "total_mb": 1024,
      "percentage": 25.0
    },
    "cpu_usage": 15.5,
    "disk_usage": {
      "used_gb": 50,
      "total_gb": 200,
      "percentage": 25.0
    }
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Overall health status (`healthy`, `unhealthy`) |
| `timestamp` | string | Response timestamp (ISO 8601) |
| `uptime` | number | Application uptime in seconds |
| `version` | string | Application version |
| `environment` | string | Current environment (`development`, `staging`, `production`) |

## Database Health

### GET /api/health?type=db

Returns database connectivity and performance metrics.

#### Authentication

- **Required**: No
- **Purpose**: Database monitoring

#### Rate Limiting

- **Limit**: 100 requests/hour
- **Key**: IP-based

#### Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "connectionTime": 15,
  "tablesCount": 15,
  "details": {
    "active_connections": 25,
    "max_connections": 100,
    "connection_utilization": 25.0,
    "slow_queries_count": 2,
    "avg_query_time_ms": 45,
    "database_size_gb": 10.5,
    "last_backup": "2025-10-25T18:00:00.000Z"
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `connectionTime` | number | Time to establish database connection (ms) |
| `tablesCount` | number | Number of application tables |
| `active_connections` | number | Currently active database connections |
| `max_connections` | number | Maximum allowed connections |
| `connection_utilization` | number | Connection utilization percentage |
| `slow_queries_count` | number | Number of slow queries in last hour |
| `avg_query_time_ms` | number | Average query execution time |
| `database_size_gb` | number | Database size in gigabytes |

## Webhook Health

### GET /api/health?type=webhooks

Returns webhook processing status and metrics.

#### Authentication

- **Required**: No
- **Purpose**: Webhook system monitoring

#### Rate Limiting

- **Limit**: 100 requests/hour
- **Key**: IP-based

#### Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "recentEventsCount": 1250,
  "recentEventsTimeframe": "24 hours",
  "details": {
    "events_processed_today": 1250,
    "events_failed_today": 12,
    "success_rate": 99.04,
    "avg_processing_time_ms": 150,
    "last_event_received": "2025-10-25T19:45:00.000Z",
    "queue_depth": 5,
    "processing_lag_minutes": 2,
    "error_rate_by_type": {
      "payment.succeeded": 0.1,
      "payment.failed": 2.5,
      "membership.cancelled": 0.0
    }
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `recentEventsCount` | number | Events processed in last 24 hours |
| `recentEventsTimeframe` | string | Time window for recent events |
| `events_processed_today` | number | Total events processed today |
| `events_failed_today` | number | Total events failed today |
| `success_rate` | number | Processing success rate percentage |
| `avg_processing_time_ms` | number | Average processing time |
| `last_event_received` | string | Timestamp of last received event |
| `queue_depth` | number | Number of events in processing queue |
| `processing_lag_minutes` | number | Processing delay in minutes |

## Queue Health

### GET /api/health?type=queue

Returns job queue health and performance metrics.

#### Authentication

- **Required**: No
- **Purpose**: Job queue monitoring

#### Rate Limiting

- **Limit**: 100 requests/hour
- **Key**: IP-based

#### Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "queues": [
    {
      "name": "webhook_processing",
      "active": 5,
      "completed": 1250,
      "failed": 12,
      "delayed": 2
    },
    {
      "name": "email_notifications",
      "active": 3,
      "completed": 850,
      "failed": 5,
      "delayed": 1
    },
    {
      "name": "data_export",
      "active": 1,
      "completed": 25,
      "failed": 0,
      "delayed": 0
    }
  ],
  "totalJobs": 2154,
  "healthyQueues": 3,
  "unhealthyQueues": 0,
  "details": {
    "total_active": 9,
    "total_completed": 2125,
    "total_failed": 17,
    "total_delayed": 3,
    "overall_success_rate": 99.21,
    "avg_processing_time_ms": 200,
    "max_queue_age_minutes": 5
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `queues` | array | Array of queue statistics |
| `totalJobs` | number | Total jobs across all queues |
| `healthyQueues` | number | Number of healthy queues |
| `unhealthyQueues` | number | Number of unhealthy queues |
| `total_active` | number | Total active jobs |
| `total_completed` | number | Total completed jobs |
| `total_failed` | number | Total failed jobs |
| `overall_success_rate` | number | Overall success rate percentage |

#### Queue Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Queue name |
| `active` | number | Currently active jobs |
| `completed` | number | Completed jobs |
| `failed` | number | Failed jobs |
| `delayed` | number | Delayed jobs |

## External Service Health

### GET /api/health?type=external

Returns external service connectivity and availability.

#### Authentication

- **Required**: No
- **Purpose**: External service monitoring

#### Rate Limiting

- **Limit**: 100 requests/hour
- **Key**: IP-based

#### Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "services": [
    {
      "name": "whop_api",
      "status": "healthy",
      "response_time_ms": 150,
      "last_check": "2025-10-25T19:50:00.000Z",
      "error_rate": 0.1
    },
    {
      "name": "email_service",
      "status": "healthy",
      "response_time_ms": 200,
      "last_check": "2025-10-25T19:50:00.000Z",
      "error_rate": 0.5
    },
    {
      "name": "payment_processor",
      "status": "degraded",
      "response_time_ms": 500,
      "last_check": "2025-10-25T19:50:00.000Z",
      "error_rate": 2.0
    }
  ],
  "overall_status": "degraded",
  "details": {
    "healthy_services": 2,
    "degraded_services": 1,
    "unhealthy_services": 0,
    "avg_response_time_ms": 283,
    "overall_error_rate": 0.87
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `services` | array | Array of external service health |
| `overall_status` | string | Overall external service status |
| `healthy_services` | number | Number of healthy services |
| `degraded_services` | number | Number of degraded services |
| `unhealthy_services` | number | Number of unhealthy services |

#### Service Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Service name |
| `status` | string | Service status (`healthy`, `degraded`, `unhealthy`) |
| `response_time_ms` | number | Service response time |
| `last_check` | string | Last health check timestamp |
| `error_rate` | number | Service error rate percentage |

## Comprehensive Health

### GET /api/health?detailed=true

Returns comprehensive health status across all system components.

#### Authentication

- **Required**: No
- **Purpose**: Complete system health overview

#### Rate Limiting

- **Limit**: 60 requests/hour
- **Key**: IP-based

#### Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T19:50:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": {
      "status": "healthy",
      "connectionTime": 15,
      "tablesCount": 15
    },
    "webhooks": {
      "status": "healthy",
      "recentEventsCount": 1250,
      "success_rate": 99.04
    },
    "queue": {
      "status": "healthy",
      "totalJobs": 2154,
      "healthyQueues": 3
    },
    "external": {
      "status": "degraded",
      "healthy_services": 2,
      "degraded_services": 1
    }
  },
  "summary": {
    "total_checks": 4,
    "healthy_checks": 3,
    "degraded_checks": 1,
    "unhealthy_checks": 0
  },
  "response_time_ms": 125,
  "details": {
    "system_load": {
      "cpu_percentage": 25.5,
      "memory_percentage": 45.2,
      "disk_percentage": 30.1
    },
    "performance_metrics": {
      "avg_response_time_ms": 125,
      "requests_per_minute": 150,
      "error_rate_percentage": 0.5
    }
  }
}
```

## Health Monitoring

### Health Status Levels

| Status | Description | Action Required |
|--------|-------------|-----------------|
| `healthy` | All systems operating normally | No action required |
| `degraded` | Some systems experiencing issues | Monitor closely |
| `unhealthy` | Critical system failures | Immediate attention required |

### Monitoring Integration

#### Prometheus Metrics

```bash
# Application uptime
curl http://localhost:3000/api/health/metrics

# Custom health metrics
curl http://localhost:3000/api/health/metrics/custom
```

#### Health Check Automation

```bash
#!/bin/bash
# Health check script for monitoring systems

HEALTH_URL="http://localhost:3000/api/health"
RESPONSE=$(curl -s -w "%{http_code}" "$HEALTH_URL")
HTTP_CODE="${RESPONSE: -3}"

if [ "$HTTP_CODE" -eq 200 ]; then
    STATUS=$(echo "$RESPONSE" | jq -r '.status')
    if [ "$STATUS" = "healthy" ]; then
        echo "✅ Application is healthy"
        exit 0
    elif [ "$STATUS" = "degraded" ]; then
        echo "⚠️ Application is degraded"
        exit 1
    else
        echo "❌ Application is unhealthy"
        exit 2
    fi
else
    echo "❌ Health check failed with HTTP $HTTP_CODE"
    exit 3
fi
```

### Alerting Integration

#### Slack Integration

```typescript
// Health check alert to Slack
async function sendHealthAlert(status: string, details: any) {
  if (status !== 'healthy') {
    await fetch('https://hooks.slack.com/services/YOUR/WEBHOOK/URL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Health Alert: ${status.toUpperCase()}`,
        attachments: [{
          color: status === 'unhealthy' ? 'danger' : 'warning',
          fields: Object.entries(details).map(([key, value]) => ({
            title: key,
            value: JSON.stringify(value),
            short: true
          }))
        }]
      })
    });
  }
}
```

#### PagerDuty Integration

```typescript
// Critical health alerts to PagerDuty
async function sendCriticalAlert(checks: any) {
  const unhealthyChecks = Object.entries(checks)
    .filter(([_, check]) => check.status === 'unhealthy');
    
  if (unhealthyChecks.length > 0) {
    await fetch('https://events.pagerduty.com/v2/enqueue/YOUR/INTEGRATION/KEY', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: process.env.PAGERDUTY_ROUTING_KEY,
        event_action: 'trigger',
        payload: {
          summary: 'Critical system health failure',
          source: 'health-check-api',
          severity: 'critical',
          custom_details: { unhealthy_checks: unhealthyChecks }
        }
      })
    });
  }
}
```

### Health Check Best Practices

1. **Monitoring Frequency**
   - Basic checks: Every 30 seconds
   - Comprehensive checks: Every 5 minutes
   - External service checks: Every 2 minutes

2. **Alert Thresholds**
   - Response time > 500ms: Warning
   - Response time > 2000ms: Critical
   - Error rate > 1%: Warning
   - Error rate > 5%: Critical

3. **Health Check Caching**
   - Cache basic health for 10 seconds
   - Cache comprehensive health for 30 seconds
   - Use different cache keys per check type

4. **Graceful Degradation**
   - Continue serving during degraded status
   - Provide limited functionality during issues
   - Clear communication about system status

## Troubleshooting

### Common Health Issues

1. **Database Connection Failed**
   - Check database server status
   - Verify connection string
   - Check network connectivity

2. **High Memory Usage**
   - Monitor memory leaks
   - Check for memory-intensive operations
   - Consider increasing memory limits

3. **Slow Response Times**
   - Profile application performance
   - Check database query performance
   - Monitor external service latency

4. **External Service Issues**
   - Verify service availability
   - Check API rate limits
   - Review authentication tokens

### Debug Health Checks

```bash
# Enable debug logging
DEBUG_HEALTH=true

# Check specific component
curl "http://localhost:3000/api/health?type=db&debug=true"

# Force health check refresh
curl -X POST "http://localhost:3000/api/health/refresh"
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0