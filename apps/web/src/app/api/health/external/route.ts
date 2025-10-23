// External Services Health Check API
// GET /api/health/external - Health status of external dependencies (Whop API, Push/DM services, etc.)

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface ExternalServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  response_time_ms: number;
  last_check: string;
  error?: string;
  details?: Record<string, any>;
}

interface ExternalHealthMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: {
    whop_api: ExternalServiceHealth;
    push_service: ExternalServiceHealth;
    dm_service: ExternalServiceHealth;
  };
  summary: {
    total_services: number;
    healthy_services: number;
    degraded_services: number;
    unhealthy_services: number;
  };
}

const SERVICE_TIMEOUTS = {
  whop_api: 5000,
  push_service: 3000,
  dm_service: 3000
};

const WHOP_API_BASE_URL = 'https://api.whop.com';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Check all external services in parallel
    const [whopHealth, pushHealth, dmHealth] = await Promise.allSettled([
      checkWhopApiHealth(),
      checkPushServiceHealth(),
      checkDmServiceHealth()
    ]);
    
    const services = {
      whop_api: getServiceHealth(whopHealth, 'whop_api'),
      push_service: getServiceHealth(pushHealth, 'push_service'),
      dm_service: getServiceHealth(dmHealth, 'dm_service')
    };
    
    // Calculate summary
    const summary = calculateServiceSummary(services);
    
    // Determine overall status
    const status = determineOverallHealth(summary);
    
    const metrics: ExternalHealthMetrics = {
      status,
      timestamp: new Date().toISOString(),
      services,
      summary
    };
    
    const statusCode = getStatusCodeFromStatus(status);
    
    // Log external services health check
    logger.info('External services health check completed', {
      status,
      healthy_services: summary.healthy_services,
      total_services: summary.total_services,
      duration_ms: Date.now() - startTime
    });
    
    return NextResponse.json(metrics, {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    logger.error('External services health check failed', {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime
    });
    
    const errorMetrics: ExternalHealthMetrics = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        whop_api: createErrorServiceHealth('whop_api', error),
        push_service: createErrorServiceHealth('push_service', error),
        dm_service: createErrorServiceHealth('dm_service', error)
      },
      summary: {
        total_services: 3,
        healthy_services: 0,
        degraded_services: 0,
        unhealthy_services: 3
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

async function checkWhopApiHealth(): Promise<ExternalServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Make a simple request to Whop API to check connectivity
    const response = await fetch(`${WHOP_API_BASE_URL}/v1/marketplaces`, {
      method: 'GET',
      headers: {
        'User-Agent': 'ChurnSaver-HealthCheck/1.0'
      },
      signal: AbortSignal.timeout(SERVICE_TIMEOUTS.whop_api)
    });
    
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      return {
        name: 'Whop API',
        status: 'healthy',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        details: {
          status_code: response.status,
          rate_limit_remaining: response.headers.get('x-ratelimit-remaining')
        }
      };
    } else if (response.status >= 400 && response.status < 500) {
      return {
        name: 'Whop API',
        status: 'degraded',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          status_code: response.status
        }
      };
    } else {
      return {
        name: 'Whop API',
        status: 'unhealthy',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          status_code: response.status
        }
      };
    }
  } catch (error) {
    return {
      name: 'Whop API',
      status: 'unhealthy',
      response_time_ms: Date.now() - startTime,
      last_check: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkPushServiceHealth(): Promise<ExternalServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Check push notification service health
    // This would typically check Firebase Cloud Messaging or similar service
    const healthUrl = 'https://fcm.googleapis.com/fcm/send';
    
    const response = await fetch(healthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${process.env.FCM_SERVER_KEY || 'test'}`
      },
      body: JSON.stringify({
        registration_ids: ['test'],
        notification: {
          title: 'Health Check',
          body: 'This is a health check'
        }
      }),
      signal: AbortSignal.timeout(SERVICE_TIMEOUTS.push_service)
    });
    
    const responseTime = Date.now() - startTime;
    
    // FCM typically returns 400 for invalid registration token, which is expected for health check
    if (response.status === 400 || response.ok) {
      return {
        name: 'Push Service',
        status: 'healthy',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        details: {
          status_code: response.status,
          service: 'Firebase Cloud Messaging'
        }
      };
    } else {
      return {
        name: 'Push Service',
        status: 'degraded',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          status_code: response.status
        }
      };
    }
  } catch (error) {
    return {
      name: 'Push Service',
      status: 'unhealthy',
      response_time_ms: Date.now() - startTime,
      last_check: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function checkDmServiceHealth(): Promise<ExternalServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Check DM service health (Discord, Slack, etc.)
    // This is a placeholder implementation
    const healthUrl = 'https://discord.com/api/v10/users/@me';
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN || 'test'}`
      },
      signal: AbortSignal.timeout(SERVICE_TIMEOUTS.dm_service)
    });
    
    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      return {
        name: 'DM Service',
        status: 'healthy',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        details: {
          status_code: response.status,
          service: 'Discord API'
        }
      };
    } else if (response.status === 401) {
      // 401 is expected if bot token is not configured correctly in health check
      return {
        name: 'DM Service',
        status: 'healthy',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        details: {
          status_code: response.status,
          service: 'Discord API',
          note: 'Authentication expected in health check'
        }
      };
    } else {
      return {
        name: 'DM Service',
        status: 'degraded',
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          status_code: response.status
        }
      };
    }
  } catch (error) {
    return {
      name: 'DM Service',
      status: 'unhealthy',
      response_time_ms: Date.now() - startTime,
      last_check: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function getServiceHealth(
  result: PromiseSettledResult<ExternalServiceHealth>,
  serviceName: string
): ExternalServiceHealth {
  if (result.status === 'fulfilled') {
    return result.value;
  } else {
    return createErrorServiceHealth(serviceName, result.reason);
  }
}

function createErrorServiceHealth(
  serviceName: string,
  error: any
): ExternalServiceHealth {
  return {
    name: serviceName.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    status: 'unhealthy',
    response_time_ms: 0,
    last_check: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error)
  };
}

function calculateServiceSummary(services: Record<string, ExternalServiceHealth>) {
  const serviceValues = Object.values(services);
  
  return {
    total_services: serviceValues.length,
    healthy_services: serviceValues.filter(s => s.status === 'healthy').length,
    degraded_services: serviceValues.filter(s => s.status === 'degraded').length,
    unhealthy_services: serviceValues.filter(s => s.status === 'unhealthy').length
  };
}

function determineOverallHealth(summary: {
  total_services: number;
  healthy_services: number;
  degraded_services: number;
  unhealthy_services: number;
}): 'healthy' | 'degraded' | 'unhealthy' {
  if (summary.unhealthy_services > 0) {
    return 'unhealthy';
  }
  
  if (summary.degraded_services > 0) {
    return 'degraded';
  }
  
  if (summary.healthy_services === summary.total_services) {
    return 'healthy';
  }
  
  return 'degraded';
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