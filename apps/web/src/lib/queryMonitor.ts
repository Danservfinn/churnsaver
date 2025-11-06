// Query performance monitoring and slow query logging
// Integrates with database layer to track and alert on performance issues

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { metrics } from '@/lib/metrics';

export interface QueryMetrics {
  query: string;
  duration: number;
  rowCount: number;
  timestamp: Date;
  companyId?: string;
  userId?: string;
  endpoint?: string;
}

export interface SlowQueryAlert {
  query: string;
  duration: number;
  threshold: number;
  companyId?: string;
  timestamp: Date;
  context?: Record<string, any>;
}

// Configuration for query monitoring
export const QUERY_MONITOR_CONFIG = {
  slowQueryThreshold: 1000, // 1 second
  verySlowQueryThreshold: 5000, // 5 seconds
  enableDetailedLogging: process.env.NODE_ENV !== 'production',
  enableMetrics: true,
  sampleRate: 0.1, // Sample 10% of queries for detailed analysis
} as const;

/**
 * Log query performance metrics
 */
export function logQueryMetrics(metrics: QueryMetrics): void {
  // Always log slow queries
  if (metrics.duration >= QUERY_MONITOR_CONFIG.slowQueryThreshold) {
    const level = metrics.duration >= QUERY_MONITOR_CONFIG.verySlowQueryThreshold ? 'error' : 'warn';

    logger[level]('Slow query detected', {
      query: metrics.query.substring(0, 500), // Truncate for logging
      duration: metrics.duration,
      rowCount: metrics.rowCount,
      companyId: metrics.companyId,
      userId: metrics.userId,
      endpoint: metrics.endpoint,
      timestamp: metrics.timestamp.toISOString(),
    });
  }

  // Sample detailed metrics for analysis
  if (Math.random() < QUERY_MONITOR_CONFIG.sampleRate) {
    logger.debug('Query performance sample', {
      query: metrics.query.substring(0, 200),
      duration: metrics.duration,
      rowCount: metrics.rowCount,
      companyId: metrics.companyId,
    });
  }

  // Record metrics for monitoring
  if (QUERY_MONITOR_CONFIG.enableMetrics) {
    recordQueryMetrics(metrics);
  }
}

/**
 * Record query metrics for monitoring dashboards
 */
function recordQueryMetrics(queryMetrics: QueryMetrics): void {
  try {
    // Record query count and duration histograms
    metrics.recordHistogram('query_duration_ms', queryMetrics.duration);
    metrics.recordCounter('query_count', 1);

    // Record slow query metrics
    if (queryMetrics.duration >= QUERY_MONITOR_CONFIG.slowQueryThreshold) {
      metrics.recordHistogram('slow_query_duration_ms', queryMetrics.duration);
    }

    // Record query throughput by company (if available)
    if (queryMetrics.companyId) {
      metrics.recordCounter('query_count', 1, { companyId: queryMetrics.companyId });
    }
  } catch (error) {
    logger.error('Failed to record query metrics', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Store slow query for analysis and alerting
 */
export async function storeSlowQuery(metrics: QueryMetrics): Promise<void> {
  if (metrics.duration < QUERY_MONITOR_CONFIG.slowQueryThreshold) {
    return;
  }

  try {
    await sql.execute(`
      INSERT INTO slow_queries (
        query_text,
        duration_ms,
        row_count,
        company_id,
        user_id,
        endpoint,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      metrics.query.substring(0, 2000), // Limit query text length
      metrics.duration,
      metrics.rowCount,
      metrics.companyId,
      metrics.userId,
      metrics.endpoint,
      metrics.timestamp
    ]);
  } catch (error) {
    logger.error('Failed to store slow query', {
      error: error instanceof Error ? error.message : String(error),
      duration: metrics.duration,
    });
  }
}

/**
 * Get slow query statistics
 */
export async function getSlowQueryStats(hours: number = 24): Promise<{
  totalSlowQueries: number;
  averageDuration: number;
  topSlowQueries: Array<{
    query: string;
    count: number;
    avgDuration: number;
    maxDuration: number;
  }>;
  companyBreakdown: Array<{
    companyId: string;
    slowQueryCount: number;
    avgDuration: number;
  }>;
}> {
  try {
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));

    // Get total count and average duration
    const statsResult = await sql.select<{ count: number; avg_duration: number }>(`
      SELECT
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration
      FROM slow_queries
      WHERE created_at >= $1
    `, [cutoffTime]);

    const totalSlowQueries = statsResult[0]?.count || 0;
    const averageDuration = statsResult[0]?.avg_duration || 0;

    // Get top slow queries
    const topQueriesResult = await sql.select<{
      query_text: string;
      count: number;
      avg_duration: number;
      max_duration: number;
    }>(`
      SELECT
        LEFT(query_text, 100) as query_text,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        MAX(duration_ms) as max_duration
      FROM slow_queries
      WHERE created_at >= $1
      GROUP BY LEFT(query_text, 100)
      ORDER BY avg_duration DESC
      LIMIT 10
    `, [cutoffTime]);

    // Get company breakdown
    const companyResult = await sql.select<{
      company_id: string;
      slow_query_count: number;
      avg_duration: number;
    }>(`
      SELECT
        company_id,
        COUNT(*) as slow_query_count,
        AVG(duration_ms) as avg_duration
      FROM slow_queries
      WHERE created_at >= $1
        AND company_id IS NOT NULL
      GROUP BY company_id
      ORDER BY slow_query_count DESC
      LIMIT 10
    `, [cutoffTime]);

    return {
      totalSlowQueries,
      averageDuration,
      topSlowQueries: topQueriesResult.map(row => ({
        query: row.query_text,
        count: row.count,
        avgDuration: row.avg_duration,
        maxDuration: row.max_duration,
      })),
      companyBreakdown: companyResult.map(row => ({
        companyId: row.company_id,
        slowQueryCount: row.slow_query_count,
        avgDuration: row.avg_duration,
      })),
    };
  } catch (error) {
    logger.error('Failed to get slow query stats', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      totalSlowQueries: 0,
      averageDuration: 0,
      topSlowQueries: [],
      companyBreakdown: [],
    };
  }
}

/**
 * Clean up old slow query records (keep last 30 days)
 */
export async function cleanupSlowQueries(): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));

    const result = await sql.execute(`
      DELETE FROM slow_queries
      WHERE created_at < $1
    `, [cutoffDate]);

    const deletedCount = (result as any).rowCount || 0;

    if (deletedCount > 0) {
      logger.info('Cleaned up old slow query records', { deletedCount });
    }

    return deletedCount;
  } catch (error) {
    logger.error('Failed to cleanup slow queries', {
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

/**
 * Enhanced database query wrapper with monitoring
 */
export async function monitoredQuery<T = unknown>(
  text: string,
  params?: unknown[],
  options?: {
    companyId?: string;
    userId?: string;
    endpoint?: string;
    skipMetrics?: boolean;
  }
): Promise<any> {
  const startTime = Date.now();

  try {
    const result = await sql.query<T>(text, params, options?.companyId);

    const duration = Date.now() - startTime;

    // Log performance metrics
    const queryMetrics: QueryMetrics = {
      query: text,
      duration,
      rowCount: result.rowCount || 0,
      timestamp: new Date(),
      companyId: options?.companyId,
      userId: options?.userId,
      endpoint: options?.endpoint,
    };

    logQueryMetrics(queryMetrics);

    // Store slow queries for analysis
    if (!options?.skipMetrics) {
      await storeSlowQuery(queryMetrics);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Database query failed', {
      query: text.substring(0, 500),
      duration,
      companyId: options?.companyId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Enhanced database select wrapper with monitoring
 */
export async function monitoredSelect<T = unknown>(
  text: string,
  params?: unknown[],
  options?: {
    companyId?: string;
    userId?: string;
    endpoint?: string;
    skipMetrics?: boolean;
  }
): Promise<T[]> {
  const startTime = Date.now();

  try {
    const result = await sql.select<T>(text, params, options?.companyId);

    const duration = Date.now() - startTime;

    // Log performance metrics
    const queryMetrics: QueryMetrics = {
      query: text,
      duration,
      rowCount: result.length,
      timestamp: new Date(),
      companyId: options?.companyId,
      userId: options?.userId,
      endpoint: options?.endpoint,
    };

    logQueryMetrics(queryMetrics);

    // Store slow queries for analysis
    if (!options?.skipMetrics) {
      await storeSlowQuery(queryMetrics);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Database select failed', {
      query: text.substring(0, 500),
      duration,
      companyId: options?.companyId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}