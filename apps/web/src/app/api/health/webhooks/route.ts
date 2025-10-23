// Webhook Processing Health Check API
// GET /api/health/webhooks - Detailed webhook processing metrics and status

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';

interface WebhookHealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  processing: {
    events_last_24h: number;
    events_last_1h: number;
    success_rate_24h: number;
    success_rate_1h: number;
    avg_processing_time_ms: number;
    last_processed_event: string | null;
    minutes_since_last_event: number | null;
  };
  errors: {
    validation_failures_24h: number;
    processing_failures_24h: number;
    duplicate_events_24h: number;
    error_rate_24h: number;
    recent_errors: Array<{
      timestamp: string;
      error_type: string;
      event_id: string;
    }>;
  };
  types: {
    most_common_type: string;
    type_distribution: Record<string, number>;
  };
  performance: {
    p50_processing_time_ms: number;
    p95_processing_time_ms: number;
    p99_processing_time_ms: number;
  };
}

const SUCCESS_RATE_WARNING = 95;
const SUCCESS_RATE_CRITICAL = 90;
const PROCESSING_TIME_WARNING_MS = 5000;
const ERROR_RATE_WARNING = 5;
const ERROR_RATE_CRITICAL = 10;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    await initDb();
    
    const metrics = await collectWebhookMetrics();
    
    const statusCode = getStatusCodeFromStatus(metrics.status);
    
    // Log webhook health check for monitoring
    logger.info('Webhook health check completed', {
      status: metrics.status,
      events_24h: metrics.processing.events_last_24h,
      success_rate: metrics.processing.success_rate_24h,
      error_rate: metrics.errors.error_rate_24h
    });
    
    return NextResponse.json(metrics, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    logger.error('Webhook health check failed', {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    });
    
    const errorMetrics: Partial<WebhookHealthMetrics> = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      processing: {
        events_last_24h: 0,
        events_last_1h: 0,
        success_rate_24h: 0,
        success_rate_1h: 0,
        avg_processing_time_ms: 0,
        last_processed_event: null,
        minutes_since_last_event: null
      }
    };
    
    return NextResponse.json(errorMetrics, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function collectWebhookMetrics(): Promise<WebhookHealthMetrics> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  // Get processing metrics
  const processingMetrics = await getProcessingMetrics(oneDayAgo, oneHourAgo);
  
  // Get error metrics
  const errorMetrics = await getErrorMetrics(oneDayAgo);
  
  // Get type distribution
  const typeDistribution = await getTypeDistribution(oneDayAgo);
  
  // Get performance metrics
  const performanceMetrics = await getPerformanceMetrics(oneDayAgo);
  
  // Determine overall health status
  const status = determineWebhookHealth(processingMetrics, errorMetrics, performanceMetrics);
  
  return {
    status,
    timestamp: now.toISOString(),
    processing: processingMetrics,
    errors: errorMetrics,
    types: {
      most_common_type: getMostCommonType(typeDistribution),
      type_distribution: typeDistribution
    },
    performance: performanceMetrics
  };
}

async function getProcessingMetrics(oneDayAgo: Date, oneHourAgo: Date) {
  try {
    // Get 24-hour metrics
    const dayMetrics = await sql.select(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE processed = true) as successful_events,
        COUNT(*) FILTER (WHERE processed = false AND error IS NOT NULL) as failed_events,
        MAX(created_at) as last_event_time,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000) as avg_processing_time_ms
      FROM events
      WHERE created_at >= $1
    `, [oneDayAgo]);
    
    const dayResult = dayMetrics[0] as {
      total_events: number;
      successful_events: number;
      failed_events: number;
      last_event_time: Date | null;
      avg_processing_time_ms: number;
    };
    
    // Get 1-hour metrics
    const hourMetrics = await sql.select(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE processed = true) as successful_events
      FROM events
      WHERE created_at >= $1
    `, [oneHourAgo]);
    
    const hourResult = hourMetrics[0] as {
      total_events: number;
      successful_events: number;
    };
    
    const successRate24h = dayResult.total_events > 0 ? 
      (dayResult.successful_events / dayResult.total_events) * 100 : 100;
    
    const successRate1h = hourResult.total_events > 0 ? 
      (hourResult.successful_events / hourResult.total_events) * 100 : 100;
    
    const lastEventTime = dayResult.last_event_time;
    const minutesSinceLastEvent = lastEventTime ? 
      Math.floor((Date.now() - new Date(lastEventTime).getTime()) / (1000 * 60)) : null;
    
    return {
      events_last_24h: dayResult.total_events,
      events_last_1h: hourResult.total_events,
      success_rate_24h: Math.round(successRate24h * 100) / 100,
      success_rate_1h: Math.round(successRate1h * 100) / 100,
      avg_processing_time_ms: Math.round(dayResult.avg_processing_time_ms || 0),
      last_processed_event: lastEventTime?.toISOString() || null,
      minutes_since_last_event: minutesSinceLastEvent
    };
  } catch (error) {
    logger.warn('Failed to get webhook processing metrics', { error });
    return {
      events_last_24h: 0,
      events_last_1h: 0,
      success_rate_24h: 0,
      success_rate_1h: 0,
      avg_processing_time_ms: 0,
      last_processed_event: null,
      minutes_since_last_event: null
    };
  }
}

async function getErrorMetrics(oneDayAgo: Date) {
  try {
    // Get error breakdown
    const errorBreakdown = await sql.select(`
      SELECT 
        COUNT(*) FILTER (WHERE error LIKE '%validation%') as validation_failures,
        COUNT(*) FILTER (WHERE error LIKE '%processing%') as processing_failures,
        COUNT(*) FILTER (WHERE error LIKE '%duplicate%') as duplicate_events,
        COUNT(*) FILTER (WHERE processed = false AND error IS NOT NULL) as total_failures
      FROM events
      WHERE created_at >= $1
    `, [oneDayAgo]);
    
    const errorResult = errorBreakdown[0] as {
      validation_failures: number;
      processing_failures: number;
      duplicate_events: number;
      total_failures: number;
    };
    
    // Get recent errors
    const recentErrors = await sql.select(`
      SELECT 
        created_at as timestamp,
        CASE 
          WHEN error LIKE '%validation%' THEN 'validation'
          WHEN error LIKE '%processing%' THEN 'processing'
          WHEN error LIKE '%duplicate%' THEN 'duplicate'
          ELSE 'unknown'
        END as error_type,
        whop_event_id as event_id
      FROM events
      WHERE error IS NOT NULL
      AND created_at >= $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [oneDayAgo]);
    
    const totalEvents = await sql.select(`
      SELECT COUNT(*) as count FROM events WHERE created_at >= $1
    `, [oneDayAgo]);
    
    const totalEventsCount = parseInt((totalEvents[0] as { count: string }).count);
    const errorRate = totalEventsCount > 0 ? 
      (errorResult.total_failures / totalEventsCount) * 100 : 0;
    
    return {
      validation_failures_24h: errorResult.validation_failures,
      processing_failures_24h: errorResult.processing_failures,
      duplicate_events_24h: errorResult.duplicate_events,
      error_rate_24h: Math.round(errorRate * 100) / 100,
      recent_errors: recentErrors.map((row: any) => ({
        timestamp: row.timestamp.toISOString(),
        error_type: row.error_type,
        event_id: row.event_id
      }))
    };
  } catch (error) {
    logger.warn('Failed to get webhook error metrics', { error });
    return {
      validation_failures_24h: 0,
      processing_failures_24h: 0,
      duplicate_events_24h: 0,
      error_rate_24h: 0,
      recent_errors: []
    };
  }
}

async function getTypeDistribution(oneDayAgo: Date) {
  try {
    const result = await sql.select(`
      SELECT 
        type,
        COUNT(*) as count
      FROM events
      WHERE created_at >= $1
      GROUP BY type
      ORDER BY count DESC
    `, [oneDayAgo]);
    
    const distribution: Record<string, number> = {};
    result.forEach((row: any) => {
      distribution[row.type] = parseInt(row.count);
    });
    
    return distribution;
  } catch (error) {
    logger.warn('Failed to get webhook type distribution', { error });
    return {};
  }
}

async function getPerformanceMetrics(oneDayAgo: Date) {
  try {
    // Get processing time percentiles
    const percentiles = await sql.select(`
      SELECT 
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY processing_time_ms) as p50,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time_ms) as p99
      FROM events
      WHERE created_at >= $1
      AND processing_time_ms IS NOT NULL
    `).catch(() => [{ p50: 0, p95: 0, p99: 0 }]);
    
    const result = percentiles[0] as {
      p50: number;
      p95: number;
      p99: number;
    };
    
    return {
      p50_processing_time_ms: Math.round(result.p50 || 0),
      p95_processing_time_ms: Math.round(result.p95 || 0),
      p99_processing_time_ms: Math.round(result.p99 || 0)
    };
  } catch (error) {
    logger.warn('Failed to get webhook performance metrics', { error });
    return {
      p50_processing_time_ms: 0,
      p95_processing_time_ms: 0,
      p99_processing_time_ms: 0
    };
  }
}

function getMostCommonType(distribution: Record<string, number>): string {
  const types = Object.entries(distribution);
  if (types.length === 0) return 'none';
  
  return types.reduce((a, b) => a[1] > b[1] ? a : b)[0];
}

function determineWebhookHealth(
  processing: any,
  errors: any,
  performance: any
): 'healthy' | 'degraded' | 'unhealthy' {
  // Check for critical issues
  if (processing.success_rate_24h < SUCCESS_RATE_CRITICAL ||
      errors.error_rate_24h > ERROR_RATE_CRITICAL ||
      performance.p95_processing_time_ms > PROCESSING_TIME_WARNING_MS * 2) {
    return 'unhealthy';
  }
  
  // Check for degraded performance
  if (processing.success_rate_24h < SUCCESS_RATE_WARNING ||
      errors.error_rate_24h > ERROR_RATE_WARNING ||
      performance.p95_processing_time_ms > PROCESSING_TIME_WARNING_MS) {
    return 'degraded';
  }
  
  // Check if no events processed recently (might indicate issues)
  if (processing.events_last_1h === 0 && processing.minutes_since_last_event && 
      processing.minutes_since_last_event > 60) {
    return 'degraded';
  }
  
  return 'healthy';
}

function getStatusCodeFromStatus(status: 'healthy' | 'degraded' | 'unhealthy'): number {
  switch (status) {
    case 'healthy':
      return 200;
    case 'degraded':
      return 200; // Still serve traffic but indicate issues
    case 'unhealthy':
      return 503;
    default:
      return 200;
  }
}