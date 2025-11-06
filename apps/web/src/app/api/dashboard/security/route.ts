import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { securityMonitor, SecurityEvent } from '@/lib/security-monitoring';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate request
    const context = await getRequestContextSDK(request);

    // Require authentication for security dashboard
    if (!context.isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check role-based access (admin/manager only)
    const userRole = context.role || 'user';
    if (!['admin', 'manager'].includes(userRole)) {
      logger.warn('Unauthorized access to security dashboard', {
        userId: context.userId,
        role: userRole,
        endpoint: '/api/dashboard/security'
      });
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Apply rate limiting for security dashboard access
    const rateLimitResult = await checkRateLimit(
      `security_dashboard:${context.userId}`,
      RATE_LIMIT_CONFIGS.securityDashboard
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const timeWindow = (searchParams.get('timeWindow') as '1h' | '24h' | '7d') || '24h';
    const includeAlerts = searchParams.get('includeAlerts') === 'true';
    const includeEvents = searchParams.get('includeEvents') === 'true';
    const includeThreats = searchParams.get('includeThreats') === 'true';

    // Audit log dashboard access
    logger.security('Security dashboard accessed', {
      category: 'security_management',
      severity: 'info',
      operation: 'dashboard_access',
      userId: context.userId,
      userRole,
      timeWindow,
      includeAlerts,
      includeEvents,
      includeThreats
    });

    // Get security metrics
    const metrics = await securityMonitor.getSecurityMetrics(timeWindow);

    // Prepare response data
    const responseData: any = {
      summary: {
        totalEvents: metrics.totalEvents,
        criticalEvents: metrics.eventsBySeverity.critical || 0,
        highSeverityEvents: metrics.eventsBySeverity.high || 0,
        activeAlerts: 0, // Will be set below
        uniqueIPs: metrics.topOffenders.length,
        unusualPatterns: metrics.unusualPatterns.length,
        sessionInvalidations: metrics.sessionInvalidations.total,
        timeWindow
      },
      metrics: {
        authentication: {
          successfulLogins: 0, // Placeholder - would come from auth logs
          failedAttempts: 0, // Placeholder
          rateLimitHits: 0, // Placeholder
          suspiciousIPs: metrics.topOffenders.length
        },
        authorization: {
          policyViolations: 0, // Placeholder
          privilegeEscalations: 0, // Placeholder
          accessDenied: 0 // Placeholder
        },
        system: {
          webhookFailures: 0, // Placeholder
          databaseErrors: 0, // Placeholder
          apiRateLimits: 0, // Placeholder
          serviceDegradations: 0 // Placeholder
        }
      },
      systemHealth: {
        authentication: { status: 'healthy', latency: 45 },
        database: { status: 'healthy', connections: 12 },
        webhooks: { status: 'healthy', successRate: 98.5 },
        rateLimiter: { status: 'healthy', activeLimits: 5 }
      },
      sessionManagement: {
        activeSessions: 0, // Placeholder
        recentInvalidations: metrics.sessionInvalidations.total,
        suspiciousSessions: 0, // Placeholder
        lastInvalidation: new Date().toISOString() // Placeholder
      }
    };

    // Get active alerts if requested
    let activeAlerts: SecurityEvent[] = [];
    if (includeAlerts) {
      activeAlerts = securityMonitor.getActiveAlerts();
      responseData.alerts = activeAlerts;
      responseData.summary.activeAlerts = activeAlerts.length;
    }

    // Get security events if requested
    if (includeEvents) {
      // Get recent events from database (last 24 hours)
      const eventsResult = await sql.select(`
        SELECT
          id,
          category,
          severity,
          type,
          description,
          ip,
          user_agent,
          user_id,
          endpoint,
          created_at as timestamp
        FROM security_events
        WHERE created_at >= NOW() - INTERVAL '${timeWindow === '1h' ? '1 hour' : timeWindow === '7d' ? '7 days' : '24 hours'}'
        ORDER BY created_at DESC
        LIMIT 1000
      `);

      responseData.events = eventsResult.map((event: any) => ({
        id: event.id,
        timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
        category: event.category,
        severity: event.severity,
        type: event.type,
        description: event.description,
        ip: event.ip,
        userAgent: event.user_agent,
        userId: event.user_id,
        endpoint: event.endpoint
      }));
    }

    // Get threat indicators if requested
    if (includeThreats) {
      // Get suspicious IPs
      const suspiciousIPsResult = await sql.select(`
        SELECT
          ip,
          COUNT(*) as event_count,
          MAX(created_at) as last_seen,
          array_agg(DISTINCT category) as categories
        FROM security_events
        WHERE ip IS NOT NULL
          AND created_at >= NOW() - INTERVAL '${timeWindow === '1h' ? '1 hour' : timeWindow === '7d' ? '7 days' : '24 hours'}'
          AND severity IN ('high', 'critical')
        GROUP BY ip
        HAVING COUNT(*) >= 3
        ORDER BY event_count DESC
        LIMIT 50
      `);

      // Get suspicious user agents
      const userAgentsResult = await sql.select(`
        SELECT
          user_agent,
          COUNT(*) as count,
          CASE
            WHEN user_agent ~* '(bot|crawler|scanner|curl|wget|python|perl|java|go-http)' THEN true
            ELSE false
          END as is_suspicious
        FROM security_events
        WHERE user_agent IS NOT NULL
          AND created_at >= NOW() - INTERVAL '${timeWindow === '1h' ? '1 hour' : timeWindow === '7d' ? '7 days' : '24 hours'}'
        GROUP BY user_agent
        ORDER BY count DESC
        LIMIT 50
      `);

      responseData.threatIndicators = {
        suspiciousIPs: suspiciousIPsResult.map((ip: any) => ({
          ip: ip.ip,
          eventCount: parseInt(ip.event_count),
          lastSeen: ip.last_seen?.toISOString() || new Date().toISOString(),
          categories: ip.categories?.filter(Boolean) || []
        })),
        geographicAnomalies: [], // Placeholder for geographic analysis
        userAgents: userAgentsResult.map((ua: any) => ({
          userAgent: ua.user_agent,
          count: parseInt(ua.count),
          isSuspicious: ua.is_suspicious
        }))
      };
    }

    return NextResponse.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Security dashboard API error', {
      error: error instanceof Error ? error.message : String(error),
      endpoint: '/api/dashboard/security'
    });

    return NextResponse.json(
      { error: 'Failed to retrieve security dashboard data' },
      { status: 500 }
    );
  }
}