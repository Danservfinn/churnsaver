// Health Check API
// GET /api/health - Application health status
// GET /api/health/db - Database connectivity check
// GET /api/health/webhooks - Webhook processing status

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { errors } from '@/lib/apiResponse';
import { jobQueue } from '@/server/services/jobQueue';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

interface DatabaseHealth extends HealthStatus {
  connectionTime: number;
  tablesCount: number;
}

interface WebhookHealth extends HealthStatus {
  recentEventsCount: number;
  recentEventsTimeframe: string;
}

interface QueueHealth extends HealthStatus {
  queues: Array<{
    name: string;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;
  totalJobs: number;
  healthyQueues: number;
  unhealthyQueues: number;
}

// Start time for uptime calculation
const START_TIME = Date.now();

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const checkType = searchParams.get('type');
  const detailed = searchParams.get('detailed') === 'true';

  try {
    switch (checkType) {
      case 'db':
        return await checkDatabaseHealth();
      case 'webhooks':
        return await checkWebhookHealth();
      case 'queue':
        return await checkQueueHealth();
      case 'external':
        return await checkExternalServiceHealth(request);
      default:
        return detailed ? await checkComprehensiveHealth(request) : await checkApplicationHealth();
    }
  } catch (error) {
    logger.error('Health check failed', {
      checkType: checkType || 'application',
      error: error instanceof Error ? error.message : String(error)
    });

    return errors.serviceUnavailable(
      'Health check failed',
      {
        checkType: checkType || 'application',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    );
  }
}

async function checkApplicationHealth(): Promise<NextResponse> {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - START_TIME) / 1000), // uptime in seconds
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  return NextResponse.json(health, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}

async function checkDatabaseHealth(): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Test basic connectivity
    const connectionTime = Date.now() - startTime;

    // Check if required tables exist
    const tablesResult = await sql.select(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('events', 'recovery_cases', 'creator_settings')
    `);

    const tablesCount = parseInt((tablesResult[0] as { count: string }).count);

    const health: DatabaseHealth = {
      status: tablesCount >= 3 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      connectionTime,
      tablesCount
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;

    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    const health: Partial<DatabaseHealth> = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      connectionTime: Date.now() - startTime
    };

    return NextResponse.json(health, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function checkWebhookHealth(): Promise<NextResponse> {
  try {
    // Initialize database connection
    await initDb();

    // Check recent webhook events (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const eventsResult = await sql.select(`
      SELECT COUNT(*) as count
      FROM events
      WHERE created_at >= $1
    `, [oneDayAgo]);

    const recentEventsCount = parseInt((eventsResult[0] as { count: string }).count);

    // Get the most recent event timestamp
    const recentEventResult = await sql.select(`
      SELECT created_at
      FROM events
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const lastEventTime = recentEventResult.length > 0 ? (recentEventResult[0] as { created_at: Date }).created_at : null;
    const hoursSinceLastEvent = lastEventTime
      ? Math.floor((Date.now() - new Date(lastEventTime).getTime()) / (1000 * 60 * 60))
      : null;

    const health: WebhookHealth = {
      status: 'healthy', // Webhooks are healthy as long as we can query the database
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      recentEventsCount,
      recentEventsTimeframe: '24 hours'
    };

    // Add warning if no events in the last 24 hours (might indicate issues)
    if (recentEventsCount === 0) {
      health.status = 'healthy'; // Still healthy, just no traffic
    }

    return NextResponse.json(health, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    const health: Partial<WebhookHealth> = {
      status: 'unhealthy',
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(health, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function checkQueueHealth(): Promise<NextResponse> {
  try {
    // Get queue statistics from job queue service
    const stats = await jobQueue.getStats();

    // Transform pg-boss queue data into our health format
    const queues = Object.entries(stats.queues).map(([name, queueStats]) => ({
      name,
      active: queueStats.active || 0,
      completed: queueStats.completed || 0,
      failed: queueStats.failed || 0,
      delayed: queueStats.created + queueStats.retry || 0 // created + retry = delayed
    }));

    // Calculate totals
    const totalJobs = queues.reduce((sum, q) => sum + q.active + q.completed + q.failed + q.delayed, 0);
    const unhealthyQueues = queues.filter(q => q.failed > 10).length; // Consider unhealthy if >10 failed jobs
    const healthyQueues = queues.length - unhealthyQueues;

    const health: QueueHealth = {
      status: stats.healthy && unhealthyQueues === 0 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      queues,
      totalJobs,
      healthyQueues,
      unhealthyQueues
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;

    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    const health: Partial<QueueHealth> = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      queues: [],
      totalJobs: 0,
      healthyQueues: 0,
      unhealthyQueues: 0
    };

    return NextResponse.json(health, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function checkExternalServiceHealth(request: NextRequest): Promise<NextResponse> {
  try {
    // Import the external health check
    const { GET: externalHealthCheck } = await import('./external/route');
    
    // Call the external health check
    const response = await externalHealthCheck(request);
    return response;
  } catch (error) {
    const health = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    return NextResponse.json(health, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

async function checkComprehensiveHealth(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Run all health checks in parallel
    const [dbResponse, webhookResponse, queueResponse, externalResponse] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkWebhookHealth(),
      checkQueueHealth(),
      checkExternalServiceHealth(request)
    ]);

    // Extract results
    const dbHealth = dbResponse.status === 'fulfilled' ? await dbResponse.value.json() : { status: 'unhealthy', error: 'Database check failed' };
    const webhookHealth = webhookResponse.status === 'fulfilled' ? await webhookResponse.value.json() : { status: 'unhealthy', error: 'Webhook check failed' };
    const queueHealth = queueResponse.status === 'fulfilled' ? await queueResponse.value.json() : { status: 'unhealthy', error: 'Queue check failed' };
    const externalHealth = externalResponse.status === 'fulfilled' ? await externalResponse.value.json() : { status: 'unhealthy', error: 'External services check failed' };

    // Determine overall status
    const allChecks = [dbHealth, webhookHealth, queueHealth, externalHealth];
    const hasUnhealthy = allChecks.some(check => check.status === 'unhealthy');
    const hasDegraded = allChecks.some(check => check.status === 'degraded');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (hasUnhealthy) overallStatus = 'unhealthy';
    else if (hasDegraded) overallStatus = 'degraded';

    const comprehensiveHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: dbHealth,
        webhooks: webhookHealth,
        queue: queueHealth,
        external: externalHealth
      },
      summary: {
        total_checks: allChecks.length,
        healthy_checks: allChecks.filter(check => check.status === 'healthy').length,
        degraded_checks: allChecks.filter(check => check.status === 'degraded').length,
        unhealthy_checks: allChecks.filter(check => check.status === 'unhealthy').length
      },
      response_time_ms: Date.now() - startTime
    };

    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(comprehensiveHealth, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    logger.error('Comprehensive health check failed', {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    });

    const errorHealth = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      error: error instanceof Error ? error.message : 'Unknown error',
      response_time_ms: Date.now() - startTime
    };

    return NextResponse.json(errorHealth, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}

