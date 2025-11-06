import { NextRequest, NextResponse } from 'next/server';
import { getRequestContextSDK } from '@/lib/whop-sdk';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';

interface SecurityEventRecord {
  id: string;
  category: string;
  severity: string;
  type: string;
  description: string;
  ip: string | null;
  user_agent: string | null;
  user_id: string | null;
  endpoint: string | null;
  created_at: Date;
  metadata?: Record<string, any>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate request
    const context = await getRequestContextSDK(request);

    // Require authentication for security events
    if (!context.isAuthenticated) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check role-based access (admin/manager only)
    const userRole = context.role || 'user';
    if (!['admin', 'manager'].includes(userRole)) {
      logger.warn('Unauthorized access to security events', {
        userId: context.userId,
        role: userRole,
        endpoint: '/api/dashboard/security/events'
      });
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Apply rate limiting for security events access
    const rateLimitResult = await checkRateLimit(
      `security_events:${context.userId}`,
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;

    const category = searchParams.get('category') || null;
    const severity = searchParams.get('severity') || null;
    const type = searchParams.get('type') || null;
    const ip = searchParams.get('ip') || null;
    const userId = searchParams.get('userId') || null;
    const timeRange = searchParams.get('timeRange') || '24h';
    const search = searchParams.get('search') || null;

    // Build time range filter
    let timeFilter = '';
    switch (timeRange) {
      case '1h':
        timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
        break;
      case '7d':
        timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
        break;
      default:
        timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    }

    // Build WHERE clause
    const whereConditions = [timeFilter];
    const queryParams: any[] = [];

    if (category) {
      whereConditions.push(`category = $${queryParams.length + 1}`);
      queryParams.push(category);
    }

    if (severity) {
      whereConditions.push(`severity = $${queryParams.length + 1}`);
      queryParams.push(severity);
    }

    if (type) {
      whereConditions.push(`type = $${queryParams.length + 1}`);
      queryParams.push(type);
    }

    if (ip) {
      whereConditions.push(`ip = $${queryParams.length + 1}`);
      queryParams.push(ip);
    }

    if (userId) {
      whereConditions.push(`user_id = $${queryParams.length + 1}`);
      queryParams.push(userId);
    }

    if (search) {
      whereConditions.push(`(description ILIKE $${queryParams.length + 1} OR type ILIKE $${queryParams.length + 2})`);
      queryParams.push(`%${search}%`);
      queryParams.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM security_events ${whereClause}`;
    const countResult = await sql.select<{ total: string }>(countQuery, queryParams);
    const total = parseInt(countResult[0]?.total || '0');
    const totalPages = Math.ceil(total / limit);

    // Get events with pagination
    const eventsQuery = `
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
        created_at,
        metadata
      FROM security_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const eventsResult = await sql.select<SecurityEventRecord>(
      eventsQuery,
      [...queryParams, limit, offset]
    );

    // Transform events for response
    const events = eventsResult.map(event => ({
      id: event.id,
      timestamp: event.created_at.toISOString(),
      category: event.category,
      severity: event.severity,
      type: event.type,
      description: event.description,
      ip: event.ip,
      userAgent: event.user_agent,
      userId: event.user_id,
      endpoint: event.endpoint,
      metadata: event.metadata
    }));

    // Audit log access
    logger.security('Security events accessed', {
      category: 'security_management',
      severity: 'info',
      operation: 'events_access',
      userId: context.userId,
      userRole,
      filters: {
        category,
        severity,
        type,
        ip,
        userId,
        timeRange,
        search,
        page,
        limit
      },
      resultCount: events.length,
      totalCount: total
    });

    return NextResponse.json({
      success: true,
      data: {
        events,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters: {
          category,
          severity,
          type,
          ip,
          userId,
          timeRange,
          search
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Security events API error', {
      error: error instanceof Error ? error.message : String(error),
      endpoint: '/api/dashboard/security/events'
    });

    return NextResponse.json(
      { error: 'Failed to retrieve security events' },
      { status: 500 }
    );
  }
}