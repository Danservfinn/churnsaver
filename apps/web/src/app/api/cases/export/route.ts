// CSV Export API
// GET /api/cases/export?status=open&startDate=2024-01-01&endDate=2024-12-31

import { NextRequest, NextResponse } from 'next/server';
import { sql, initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestContextSDK } from '@/lib/auth/whop-sdk';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDb();

    // Get company context from request
    const context = await getRequestContextSDK(request);
    const companyId = context.companyId;

    // Enforce authentication in production for creator-facing endpoints
    if (process.env.NODE_ENV === 'production' && !context.isAuthenticated) {
      logger.warn('Unauthorized request to cases export - missing valid auth token');
      return errors.unauthorized('Authentication required');
    }

    // Apply rate limiting for creator-facing case actions (30/min per company)
    const rateLimitResult = await checkRateLimit(
      `case_action:export_${companyId}`,
      RATE_LIMIT_CONFIGS.caseActions
    );

    if (!rateLimitResult.allowed) {
      return errors.unprocessableEntity('Rate limit exceeded', {
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
      });
    }

    const { searchParams } = new URL(request.url);

    // Parse filters (same as cases API)
    const status = searchParams.get('status'); // 'open', 'recovered', 'closed_no_recovery'
    const startDate = searchParams.get('startDate'); // ISO date string
    const endDate = searchParams.get('endDate'); // ISO date string

    // Build WHERE clause conditions (always include company_id)
    const conditions: string[] = [];
    const params: (string | Date)[] = [];
    let paramIndex = 1;

    // Always filter by company
    conditions.push(`company_id = $${paramIndex}`);
    params.push(companyId);
    paramIndex++;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`first_failure_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`first_failure_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    logger.info('Exporting cases to CSV', {
      filters: { status, startDate, endDate }
    });

    // Get all cases (no pagination for CSV export)
    interface RecoveryCaseRow {
      id: string;
      membership_id: string;
      user_id: string;
      company_id: string;
      status: string;
      attempts: number;
      incentive_days: number;
      recovered_amount_cents: number;
      failure_reason: string | null;
      first_failure_at: Date | string;
      last_nudge_at: Date | string | null;
      created_at: Date | string;
    }

    const cases = await sql.select<RecoveryCaseRow>(
      `SELECT
        id, membership_id, user_id, company_id, status, attempts,
        incentive_days, recovered_amount_cents, failure_reason,
        first_failure_at, last_nudge_at, created_at
       FROM recovery_cases
       ${whereClause}
       ORDER BY first_failure_at DESC`,
      params
    );

    logger.info('Cases exported for CSV', {
      totalCases: cases.length,
      filters: { status, startDate, endDate },
      processingTimeMs: Date.now() - startTime
    });

    // Generate CSV content
    const csvHeaders = [
      'Case ID',
      'Membership ID',
      'User ID',
      'Company ID',
      'Status',
      'Attempts',
      'Incentive Days',
      'Recovered Amount ($)',
      'Failure Reason',
      'First Failure At',
      'Last Nudge At',
      'Created At'
    ];

    const csvRows = cases.map(case_ => [
      case_.id,
      case_.membership_id,
      case_.user_id,
      case_.company_id,
      case_.status,
      case_.attempts.toString(), // Ensure string for Excel compatibility
      case_.incentive_days.toString(), // Ensure string for Excel compatibility
      case_.recovered_amount_cents ? (case_.recovered_amount_cents / 100).toFixed(2) : '0.00',
      case_.failure_reason || '',
      case_.first_failure_at ? new Date(case_.first_failure_at).toISOString() : '',
      case_.last_nudge_at ? new Date(case_.last_nudge_at).toISOString() : '',
      case_.created_at ? new Date(case_.created_at).toISOString() : ''
    ]);

    // Escape CSV values that contain commas, quotes, or newlines
    const escapeCsvValue = (value: string | number | null) => {
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(escapeCsvValue).join(','))
    ].join('\n');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const filename = `recovery_cases_${timestamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    logger.error('Failed to export cases to CSV', {
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime
    });

    return errors.internalServerError('Failed to export cases');
  }
}
