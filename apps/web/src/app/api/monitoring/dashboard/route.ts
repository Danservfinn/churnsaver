// Real-time Monitoring Dashboard API
// GET /api/monitoring/dashboard - Provides comprehensive monitoring data for dashboard

import { NextRequest, NextResponse } from 'next/server';
import { metrics } from '@/lib/metrics';
import { alerting } from '@/lib/alerting';
import { logger } from '@/lib/logger';
import { initDb, sql } from '@/lib/db';

interface DashboardData {
  timestamp: string;
  overview: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    version: string;
    environment: string;
    activeAlertsCount: number;
    totalRequests: number;
    avgResponseTime: number;
  };
  metrics: {
    http: {
      requestsTotal: number;
      avgResponseTime: number;
      errorRate: number;
      requestsPerMinute: number;
    };
    webhooks: {
      eventsProcessed: number;
      successRate: number;
      processingTime: number;
      eventsPerHour: number;
    };
    database: {
      activeConnections: number;
      avgQueryTime: number;
      slowQueries: number;
      connectionUtilization: number;
    };
    business: {
      recoveryCases: number;
      remindersSent: number;
      reminderSuccessRate: number;
      activeCompanies: number;
    };
    queue: {
      depth: number;
      processingTime: number;
      throughput: number;
      failedJobs: number;
    };
    external: {
      apiCalls: number;
      successRate: number;
      avgResponseTime: number;
    };
  };
  alerts: {
    active: Array<{
      id: string;
      ruleName: string;
      severity: string;
      message: string;
      timestamp: string;
      metricName: string;
      currentValue: number;
      threshold: number;
    }>;
    recent: Array<{
      id: string;
      ruleName: string;
      severity: string;
      message: string;
      timestamp: string;
      resolved: boolean;
      duration: number;
    }>;
  };
  health: {
    database: any;
    webhooks: any;
    queue: any;
    external: any;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    const dashboardData = await collectDashboardData();
    
    logger.info('Dashboard data retrieved', {
      duration_ms: Date.now() - startTime,
      activeAlerts: dashboardData.alerts.active.length
    });
    
    return NextResponse.json(dashboardData, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve dashboard data', {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    });
    
    return NextResponse.json({
      error: 'Failed to retrieve dashboard data',
      timestamp: new Date().toISOString()
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function collectDashboardData(): Promise<DashboardData> {
  const now = new Date();
  
  // Get overview data
  const overview = await getOverviewData();
  
  // Get metrics data
  const metricsData = await getMetricsData();
  
  // Get alerts data
  const alertsData = await getAlertsData();
  
  // Get health data
  const healthData = await getHealthData();
  
  // Determine overall status
  const status = determineOverallStatus(overview, alertsData, healthData);
  
  return {
    timestamp: now.toISOString(),
    overview: {
      ...overview,
      status
    },
    metrics: metricsData,
    alerts: alertsData,
    health: healthData
  };
}

async function getOverviewData() {
  const httpMetric = metrics.getMetric('http_requests_total');
  const responseTimeMetric = metrics.getMetric('http_request_duration_ms');
  
  const totalRequests = httpMetric?.aggregation?.sum || 0;
  const avgResponseTime = responseTimeMetric?.aggregation?.avg || 0;
  
  // Calculate uptime (simplified - in production this would come from a more reliable source)
  const uptime = process.uptime();
  
  return {
    uptime: Math.floor(uptime),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    activeAlertsCount: alerting.getNotifications().filter(n => n.status === 'sent' && !n.error).length,
    totalRequests,
    avgResponseTime: Math.round(avgResponseTime)
  };
}

async function getMetricsData() {
  // HTTP Metrics
  const httpMetric = metrics.getMetric('http_requests_total');
  const httpDurationMetric = metrics.getMetric('http_request_duration_ms');
  const httpTotal = httpMetric?.aggregation?.sum || 0;
  const httpAvgTime = httpDurationMetric?.aggregation?.avg || 0;
  
  // Calculate requests per minute (last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentRequests = httpMetric?.values.filter(v => v.timestamp > fiveMinutesAgo).length || 0;
  const requestsPerMinute = Math.round(recentRequests / 5);
  
  // Calculate error rate (simplified)
  const errorRate = await calculateErrorRate();
  
  // Webhook Metrics
  const webhookMetric = metrics.getMetric('webhook_events_processed_total');
  const webhookDurationMetric = metrics.getMetric('webhook_processing_duration_ms');
  const webhookSuccessMetric = metrics.getMetric('webhook_success_rate');
  
  const webhookTotal = webhookMetric?.aggregation?.sum || 0;
  const webhookAvgTime = webhookDurationMetric?.aggregation?.avg || 0;
  const webhookSuccessRate = webhookSuccessMetric?.values[webhookSuccessMetric.values.length - 1]?.value || 0;
  
  // Calculate events per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentWebhooks = webhookMetric?.values.filter(v => v.timestamp > oneHourAgo).length || 0;
  const eventsPerHour = recentWebhooks;
  
  // Database Metrics
  const dbConnectionsMetric = metrics.getMetric('database_connections_active');
  const dbQueryMetric = metrics.getMetric('database_query_duration_ms');
  const slowQueriesMetric = metrics.getMetric('database_slow_queries_total');
  
  const activeConnections = dbConnectionsMetric?.values[dbConnectionsMetric.values.length - 1]?.value || 0;
  const avgQueryTime = dbQueryMetric?.aggregation?.avg || 0;
  const slowQueries = slowQueriesMetric?.aggregation?.sum || 0;
  const connectionUtilization = Math.min((activeConnections / 100) * 100, 100); // Assuming max 100 connections
  
  // Business Metrics
  const recoveryCasesMetric = metrics.getMetric('recovery_cases_created_total');
  const remindersMetric = metrics.getMetric('reminders_sent_total');
  const reminderSuccessMetric = metrics.getMetric('reminder_success_rate');
  const activeCompaniesMetric = metrics.getMetric('active_companies');
  
  const recoveryCases = recoveryCasesMetric?.aggregation?.sum || 0;
  const remindersSent = remindersMetric?.aggregation?.sum || 0;
  const reminderSuccessRate = reminderSuccessMetric?.values[reminderSuccessMetric.values.length - 1]?.value || 0;
  const activeCompanies = activeCompaniesMetric?.values[activeCompaniesMetric.values.length - 1]?.value || 0;
  
  // Queue Metrics
  const queueDepthMetric = metrics.getMetric('job_queue_depth');
  const queueProcessingMetric = metrics.getMetric('job_processing_duration_ms');
  
  const queueDepth = queueDepthMetric?.values[queueDepthMetric.values.length - 1]?.value || 0;
  const queueProcessingTime = queueProcessingMetric?.aggregation?.avg || 0;
  const queueThroughput = await calculateQueueThroughput();
  const failedJobs = await calculateFailedJobs();
  
  // External API Metrics
  const externalCallsMetric = metrics.getMetric('external_api_calls_total');
  const externalDurationMetric = metrics.getMetric('external_api_duration_ms');
  const externalSuccessMetric = metrics.getMetric('external_api_success_rate');
  
  const externalCalls = externalCallsMetric?.aggregation?.sum || 0;
  const externalAvgTime = externalDurationMetric?.aggregation?.avg || 0;
  const externalSuccessRate = externalSuccessMetric?.values[externalSuccessMetric.values.length - 1]?.value || 0;
  
  return {
    http: {
      requestsTotal: httpTotal,
      avgResponseTime: Math.round(httpAvgTime),
      errorRate: Math.round(errorRate * 100) / 100,
      requestsPerMinute
    },
    webhooks: {
      eventsProcessed: webhookTotal,
      successRate: Math.round(webhookSuccessRate * 100) / 100,
      processingTime: Math.round(webhookAvgTime),
      eventsPerHour
    },
    database: {
      activeConnections,
      avgQueryTime: Math.round(avgQueryTime),
      slowQueries,
      connectionUtilization: Math.round(connectionUtilization)
    },
    business: {
      recoveryCases,
      remindersSent,
      reminderSuccessRate: Math.round(reminderSuccessRate * 100) / 100,
      activeCompanies
    },
    queue: {
      depth: queueDepth,
      processingTime: Math.round(queueProcessingTime),
      throughput: queueThroughput,
      failedJobs
    },
    external: {
      apiCalls: externalCalls,
      successRate: Math.round(externalSuccessRate * 100) / 100,
      avgResponseTime: Math.round(externalAvgTime)
    }
  };
}

async function getAlertsData() {
  const activeAlerts = alerting.getNotifications().filter(n => n.status === 'sent' && !n.error);
  const allAlerts = alerting.getNotifications();
  
  // Get recent alerts (last 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentAlerts = allAlerts
    .filter((alert: any) => alert.sentAt && new Date(alert.sentAt) > twentyFourHoursAgo)
    .sort((a: any, b: any) => new Date(b.sentAt!).getTime() - new Date(a.sentAt!).getTime())
    .slice(0, 50)
    .map((alert: any) => ({
      id: alert.id,
      ruleName: alert.alertId,
      severity: 'P2', // Default severity since we don't have the original alert data
      message: `Alert sent via ${alert.channelName}`,
      timestamp: alert.sentAt,
      resolved: alert.status === 'sent',
      duration: alert.sentAt ?
        Math.round((Date.now() - new Date(alert.sentAt).getTime()) / 60000) :
        0
    }));
  
  const activeAlertsFormatted = activeAlerts.map((alert: any) => ({
    id: alert.id,
    ruleName: alert.alertId,
    severity: 'P2', // Default severity
    message: `Active alert via ${alert.channelName}`,
    timestamp: alert.sentAt,
    metricName: 'unknown',
    currentValue: 0,
    threshold: 0
  }));
  
  return {
    active: activeAlertsFormatted,
    recent: recentAlerts
  };
}

async function getHealthData() {
  try {
    // Get health data from various endpoints
    const [dbHealth, webhookHealth, queueHealth, externalHealth] = await Promise.allSettled([
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/health/db`),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/health/webhooks`),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/health/queue`),
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/health/external`)
    ]);
    
    return {
      database: dbHealth.status === 'fulfilled' ? await dbHealth.value.json() : { status: 'unhealthy', error: 'Health check failed' },
      webhooks: webhookHealth.status === 'fulfilled' ? await webhookHealth.value.json() : { status: 'unhealthy', error: 'Health check failed' },
      queue: queueHealth.status === 'fulfilled' ? await queueHealth.value.json() : { status: 'unhealthy', error: 'Health check failed' },
      external: externalHealth.status === 'fulfilled' ? await externalHealth.value.json() : { status: 'unhealthy', error: 'Health check failed' }
    };
  } catch (error) {
    logger.warn('Failed to get health data', { error });
    return {
      database: { status: 'unhealthy', error: 'Health check failed' },
      webhooks: { status: 'unhealthy', error: 'Health check failed' },
      queue: { status: 'unhealthy', error: 'Health check failed' },
      external: { status: 'unhealthy', error: 'Health check failed' }
    };
  }
}

async function calculateErrorRate(): Promise<number> {
  // Simplified error rate calculation
  // In production, this would be more sophisticated
  const httpMetric = metrics.getMetric('http_requests_total');
  if (!httpMetric || httpMetric.values.length === 0) return 0;
  
  const recentValues = httpMetric.values.slice(-100); // Last 100 requests
  const errorCount = recentValues.filter(v => v.labels?.status_code && parseInt(v.labels.status_code) >= 400).length;
  
  return recentValues.length > 0 ? (errorCount / recentValues.length) * 100 : 0;
}

async function calculateQueueThroughput(): Promise<number> {
  // Calculate jobs processed per minute
  const queueMetric = metrics.getMetric('job_processing_duration_ms');
  if (!queueMetric || queueMetric.values.length === 0) return 0;
  
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentJobs = queueMetric.values.filter(v => v.timestamp > fiveMinutesAgo).length;
  
  return Math.round(recentJobs / 5);
}

async function calculateFailedJobs(): Promise<number> {
  try {
    await initDb();
    const result = await sql.select(`
      SELECT COUNT(*) as count
      FROM job_queue
      WHERE state = 'failed'
      AND created_at >= $1
    `, [new Date(Date.now() - 60 * 60 * 1000)]); // Last hour
    
    return parseInt((result[0] as { count: string }).count);
  } catch (error) {
    logger.warn('Failed to calculate failed jobs', { error });
    return 0;
  }
}

function determineOverallStatus(
  overview: any,
  alerts: any,
  health: any
): 'healthy' | 'degraded' | 'unhealthy' {
  // Check for critical health issues
  const healthChecks = [health.database, health.webhooks, health.queue, health.external];
  const hasUnhealthyHealth = healthChecks.some(check => check.status === 'unhealthy');
  
  if (hasUnhealthyHealth) {
    return 'unhealthy';
  }
  
  // Check for P0/P1 alerts
  const criticalAlerts = alerts.active.filter((alert: any) => 
    alert.severity === 'P0' || alert.severity === 'P1'
  );
  
  if (criticalAlerts.length > 0) {
    return 'unhealthy';
  }
  
  // Check for P2 alerts or degraded health
  const hasDegradedHealth = healthChecks.some(check => check.status === 'degraded');
  const hasP2Alerts = alerts.active.some((alert: any) => alert.severity === 'P2');
  
  if (hasDegradedHealth || hasP2Alerts) {
    return 'degraded';
  }
  
  // Check for high error rate
  if (overview.avgResponseTime > 5000) { // 5 seconds
    return 'degraded';
  }
  
  return 'healthy';
}