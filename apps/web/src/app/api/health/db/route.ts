// Database Health Check API
// GET /api/health/db - Detailed database connectivity and performance metrics

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';

interface DatabaseHealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  connection: {
    status: 'connected' | 'disconnected';
    latency_ms: number;
    pool_stats: {
      total_count: number;
      idle_count: number;
      waiting_count: number;
    };
  };
  performance: {
    slow_queries_count: number;
    avg_query_time_ms: number;
    connection_utilization_percent: number;
  };
  tables: {
    total_count: number;
    required_tables: string[];
    missing_tables: string[];
  };
  storage: {
    database_size_mb: number;
    total_size_mb: number;
    utilization_percent: number;
  };
  replication?: {
    lag_seconds: number;
    status: 'healthy' | 'lagging' | 'disconnected';
  };
}

const REQUIRED_TABLES = [
  'events',
  'recovery_cases', 
  'creator_settings',
  'job_queue',
  'companies',
  'memberships'
];

const SLOW_QUERY_THRESHOLD_MS = 2000;
const CONNECTION_UTILIZATION_WARNING = 80;
const STORAGE_UTILIZATION_WARNING = 85;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    await initDb();
    
    const metrics = await collectDatabaseMetrics(startTime);
    
    const statusCode = getStatusCodeFromStatus(metrics.status);
    
    // Log database health check for monitoring
    logger.info('Database health check completed', {
      status: metrics.status,
      connection_latency_ms: metrics.connection.latency_ms,
      slow_queries: metrics.performance.slow_queries_count,
      utilization_percent: metrics.performance.connection_utilization_percent
    });
    
    return NextResponse.json(metrics, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    });
    
    const errorMetrics: Partial<DatabaseHealthMetrics> = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      connection: {
        status: 'disconnected',
        latency_ms: Date.now() - startTime,
        pool_stats: { total_count: 0, idle_count: 0, waiting_count: 0 }
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

async function collectDatabaseMetrics(startTime: number): Promise<DatabaseHealthMetrics> {
  const connectionTime = Date.now() - startTime;
  
  // Get connection pool statistics
  const poolStats = await getConnectionPoolStats();
  
  // Get table information
  const tableInfo = await getTableInfo();
  
  // Get performance metrics
  const performanceMetrics = await getPerformanceMetrics();
  
  // Get storage information
  const storageInfo = await getStorageInfo();
  
  // Get replication info if available
  const replicationInfo = await getReplicationInfo();
  
  // Determine overall health status
  const status = determineDatabaseHealth({
    connectionTime,
    poolStats,
    tableInfo,
    performanceMetrics,
    storageInfo,
    replicationInfo
  });
  
  return {
    status,
    timestamp: new Date().toISOString(),
    connection: {
      status: 'connected',
      latency_ms: connectionTime,
      pool_stats: poolStats
    },
    performance: performanceMetrics,
    tables: tableInfo,
    storage: storageInfo,
    replication: replicationInfo
  };
}

async function getConnectionPoolStats() {
  try {
    const result = await sql.select(`
      SELECT 
        count(*) as total_count,
        count(*) FILTER (WHERE state = 'idle') as idle_count,
        count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting_count
      FROM pg_stat_activity 
      WHERE datname = current_database()
      AND pid != pg_backend_pid()
    `);
    
    const stats = result[0] as {
      total_count: number;
      idle_count: number;
      waiting_count: number;
    };
    
    return {
      total_count: stats.total_count,
      idle_count: stats.idle_count,
      waiting_count: stats.waiting_count
    };
  } catch (error) {
    logger.warn('Failed to get connection pool stats', { error });
    return { total_count: 0, idle_count: 0, waiting_count: 0 };
  }
}

async function getTableInfo() {
  try {
    const result = await sql.select(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ANY($1)
    `, [REQUIRED_TABLES]);
    
    const existingTables = result.map((row: any) => row.table_name);
    const missingTables = REQUIRED_TABLES.filter(table => !existingTables.includes(table));
    
    return {
      total_count: existingTables.length,
      required_tables: REQUIRED_TABLES,
      missing_tables: missingTables
    };
  } catch (error) {
    logger.warn('Failed to get table info', { error });
    return {
      total_count: 0,
      required_tables: REQUIRED_TABLES,
      missing_tables: REQUIRED_TABLES
    };
  }
}

async function getPerformanceMetrics() {
  try {
    // Get slow query count from pg_stat_statements if available
    const slowQueriesResult = await sql.select(`
      SELECT COUNT(*) as count
      FROM pg_stat_statements
      WHERE mean_time > $1
    `, [SLOW_QUERY_THRESHOLD_MS]).catch(() => [{ count: 0 }]);
    
    const slowQueriesCount = parseInt((slowQueriesResult[0] as { count: string }).count);
    
    // Get average query time
    const avgQueryTimeResult = await sql.select(`
      SELECT COALESCE(AVG(mean_time), 0) as avg_time
      FROM pg_stat_statements
    `).catch(() => [{ avg_time: 0 }]);
    
    const avgQueryTime = parseFloat((avgQueryTimeResult[0] as { avg_time: string }).avg_time);
    
    // Calculate connection utilization (simplified)
    const poolStats = await getConnectionPoolStats();
    const maxConnections = 100; // Default Supabase limit, should be configurable
    const connectionUtilization = (poolStats.total_count / maxConnections) * 100;
    
    return {
      slow_queries_count: slowQueriesCount,
      avg_query_time_ms: Math.round(avgQueryTime),
      connection_utilization_percent: Math.round(connectionUtilization)
    };
  } catch (error) {
    logger.warn('Failed to get performance metrics', { error });
    return {
      slow_queries_count: 0,
      avg_query_time_ms: 0,
      connection_utilization_percent: 0
    };
  }
}

async function getStorageInfo() {
  try {
    const result = await sql.select(`
      SELECT 
        pg_database_size(current_database()) / 1024 / 1024 as database_size_mb,
        pg_size_pretty(pg_database_size(current_database())) as database_size_pretty
    `);
    
    const databaseSizeMb = parseFloat((result[0] as { database_size_mb: string }).database_size_mb);
    
    // Estimate total available space (this is approximate for Supabase)
    const estimatedTotalSizeMb = 1024 * 10; // 10GB estimate
    const utilizationPercent = (databaseSizeMb / estimatedTotalSizeMb) * 100;
    
    return {
      database_size_mb: Math.round(databaseSizeMb),
      total_size_mb: estimatedTotalSizeMb,
      utilization_percent: Math.round(utilizationPercent)
    };
  } catch (error) {
    logger.warn('Failed to get storage info', { error });
    return {
      database_size_mb: 0,
      total_size_mb: 0,
      utilization_percent: 0
    };
  }
}

async function getReplicationInfo() {
  try {
    // This is only relevant if read replicas are configured
    const result = await sql.select(`
      SELECT 
        COALESCE(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn()) as last_lsn,
        pg_last_xact_replay_timestamp() as last_replay_timestamp
    `).catch(() => []);
    
    if (result.length === 0) {
      return undefined;
    }
    
    const replayTime = (result[0] as any).last_replay_timestamp;
    const lagSeconds = replayTime ? 
      Math.floor((Date.now() - new Date(replayTime).getTime()) / 1000) : 0;
    
    return {
      lag_seconds: lagSeconds,
      status: lagSeconds > 60 ? 'lagging' : 'healthy' as 'healthy' | 'lagging' | 'disconnected'
    };
  } catch (error) {
    logger.info('Replication info not available', { error });
    return undefined;
  }
}

function determineDatabaseHealth(metrics: {
  connectionTime: number;
  poolStats: any;
  tableInfo: any;
  performanceMetrics: any;
  storageInfo: any;
  replicationInfo?: any;
}): 'healthy' | 'degraded' | 'unhealthy' {
  const { connectionTime, tableInfo, performanceMetrics, storageInfo, replicationInfo } = metrics;
  
  // Check for critical issues
  if (tableInfo.missing_tables.length > 0) {
    return 'unhealthy';
  }
  
  if (connectionTime > 5000) { // 5 second connection time is critical
    return 'unhealthy';
  }
  
  if (performanceMetrics.connection_utilization_percent > 95) {
    return 'unhealthy';
  }
  
  // Check for degraded performance
  if (connectionTime > 2000 || // 2 second connection time
      performanceMetrics.connection_utilization_percent > CONNECTION_UTILIZATION_WARNING ||
      performanceMetrics.slow_queries_count > 10 ||
      storageInfo.utilization_percent > STORAGE_UTILIZATION_WARNING) {
    return 'degraded';
  }
  
  // Check replication lag if available
  if (replicationInfo && replicationInfo.status === 'lagging') {
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