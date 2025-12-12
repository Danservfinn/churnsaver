import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { securityMonitor, SecurityEvent } from '@/lib/security-monitoring';
import { logger } from '@/lib/logger';

function verifyAdminToken(request: NextRequest): boolean {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const providedToken = request.headers.get('x-admin-token');

  if (!adminToken || adminToken.length < 32) {
    return false;
  }

  if (!providedToken) {
    return false;
  }

  try {
    const adminTokenBuffer = Buffer.from(adminToken, 'utf8');
    const providedTokenBuffer = Buffer.from(providedToken, 'utf8');
    
    if (adminTokenBuffer.length !== providedTokenBuffer.length) {
      return false;
    }

    return timingSafeEqual(adminTokenBuffer, providedTokenBuffer);
  } catch {
    return false;
  }
}

function requireAdmin(request: NextRequest): NextResponse | null {
  if (!verifyAdminToken(request)) {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    logger.warn('Unauthorized attempt to access security metrics endpoint', {
      ip: clientIp,
      hasToken: !!request.headers.get('x-admin-token')
    });

    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Require admin authentication for this sensitive endpoint
    const adminCheck = requireAdmin(request);
    if (adminCheck) return adminCheck;

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
    const adminCheck = requireAdmin(request);
    if (adminCheck) return adminCheck;

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
      userId: undefined,
      companyId: undefined,
      endpoint: '/api/security/metrics',
      metadata: {
        ...metadata,
        reportedBy: 'admin_api',
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