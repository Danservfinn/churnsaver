// Security metrics API endpoint
// GET /api/security/metrics - Returns security monitoring data for dashboard

import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/auth/whop-sdk';
import { securityMonitor, SecurityEvent } from '@/lib/security-monitoring';
import { errors } from '@/lib/apiResponse';

export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const context = await getRequestContextSDK(request);
    
    // In production, require authentication
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      return errors.unauthorized('Authentication required');
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
    console.error('Security metrics API error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve security metrics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const context = await getRequestContextSDK(request);
    
    // In production, require authentication
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      return errors.unauthorized('Authentication required');
    }

    // Parse request body for manual security event reporting
    const body = await request.json();
    const { category, severity, type, description, metadata } = body;

    if (!category || !severity || !type || !description) {
      return errors.badRequest('Missing required fields: category, severity, type, description');
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
      userId: context.userId,
      companyId: context.companyId,
      endpoint: '/api/security/metrics',
      metadata: {
        ...metadata,
        reportedBy: context.userId,
        manualReport: true
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Security event reported successfully'
    });

  } catch (error) {
    console.error('Security event reporting error:', error);
    return NextResponse.json(
      { error: 'Failed to report security event' },
      { status: 500 }
    );
  }
}