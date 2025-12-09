import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { securityMonitor, SecurityEvent } from '@/lib/security-monitoring';
import { errors } from '@/lib/apiResponse';
import { isProductionLikeEnvironment } from '@/lib/env';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate request
    const context = await getRequestContextSDK(request);
    const companyId = context.companyId ?? undefined;
    const userId = context.userId ?? undefined;
    
    // In production, require authentication
    if (isProductionLikeEnvironment() && !context.isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const timeWindow = searchParams.get('timeWindow') as '1h' | '24h' | '7d' || '24h';
    const includeAlerts = searchParams.get('includeAlerts') === 'true';

    // Get security metrics
    const metrics = await securityMonitor.getSecurityMetrics(timeWindow);

    // Get active alerts if requested
    let activeAlerts: SecurityEvent[] = [];
    if (includeAlerts) {
      activeAlerts = securityMonitor.getActiveAlerts();
    }

    // Return security dashboard data
    return NextResponse.json({
      success: true,
      data: {
        metrics,
        activeAlerts: includeAlerts ? activeAlerts : undefined,
        summary: {
          totalEvents: metrics.totalEvents,
          criticalEvents: metrics.eventsBySeverity.critical || 0,
          highSeverityEvents: metrics.eventsBySeverity.high || 0,
          uniqueIPs: metrics.topOffenders.length,
          unusualPatterns: metrics.unusualPatterns.length,
          timeWindow
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Security metrics API error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to retrieve security metrics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate request
    const context = await getRequestContextSDK(request);
    const companyId = context.companyId ?? undefined;
    const userId = context.userId ?? undefined;
    
    // In production, require authentication
    if (isProductionLikeEnvironment() && !context.isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse request body for manual security event reporting
    const body = await request.json();
    const { category, severity, type, description, metadata } = body;

    if (!category || !severity || !type || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: category, severity, type, description' },
        { status: 400 }
      );
    }

    // Get client information
    const clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const userAgent = request.headers.get('user-agent')?.substring(0, 200) || 'unknown';

    // Report security event
    await securityMonitor.processSecurityEvent({
      category,
      severity,
      type,
      description,
      ip: clientIP,
      userAgent,
      userId,
      companyId,
      endpoint: '/api/security/metrics',
      metadata: {
        ...metadata,
        reportedBy: userId,
        manualReport: true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Security event reported successfully'
    });

  } catch (error) {
    logger.error('Security event reporting error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to report security event' },
      { status: 500 }
    );
  }
}