import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { securityMonitor } from '@/lib/security-monitoring';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';

export async function POST(
   request: NextRequest,
   { params }: { params: Promise<{ alertId: string }> }
 ): Promise<NextResponse> {
   // Extract dynamic parameters first to ensure availability throughout function scope
   const { alertId } = await params;
   
   try {
     // Authenticate request
     const context = await getRequestContextSDK(request);

    // Require authentication for alert resolution
    if (!context.isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check role-based access (admin/manager only)
    const userRole = context.role || 'user';
    if (!['admin', 'manager'].includes(userRole)) {
      logger.warn('Unauthorized attempt to resolve security alert', {
        userId: context.userId,
        role: userRole,
        alertId,
        endpoint: `/api/dashboard/security/alerts/${alertId}/resolve`
      });
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Apply rate limiting for alert resolution actions
    const rateLimitResult = await checkRateLimit(
      `alert_resolve:${context.userId}`,
      RATE_LIMIT_CONFIGS.alertActions
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    // Validate alertId format
    if (!alertId || typeof alertId !== 'string' || alertId.length === 0) {
      return NextResponse.json(
        { error: 'Invalid alert ID' },
        { status: 400 }
      );
    }

    // Attempt to resolve the alert
    await securityMonitor.resolveAlert(alertId, context.userId);

    // Audit log the resolution
    logger.security('Security alert resolved via dashboard', {
      category: 'security_management',
      severity: 'info',
      operation: 'alert_resolved',
      userId: context.userId,
      userRole,
      alertId,
      resolvedBy: context.userId,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Alert resolved successfully',
      data: {
        alertId,
        resolvedBy: context.userId,
        resolvedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Security alert resolution error', {
      error: error instanceof Error ? error.message : String(error),
      alertId,
      endpoint: `/api/dashboard/security/alerts/${alertId}/resolve`
    });

    // Check if it's a "not found" error
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: 'Alert not found or already resolved' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to resolve alert' },
      { status: 500 }
    );
  }
}