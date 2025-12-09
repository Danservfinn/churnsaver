import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS, sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  await initDbWithRLS();

  const adminToken = process.env.ADMIN_API_TOKEN;
  const providedToken = request.headers.get('x-admin-token');

  if (!adminToken || adminToken.length < 16 || providedToken !== adminToken) {
    logger.error('Unauthorized attempt to call admin resolve endpoint', {
      hasTokenConfigured: !!adminToken,
      tokenLength: adminToken?.length,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { eventId, companyId } = body || {};

  if (!eventId || !companyId) {
    return NextResponse.json({ error: 'eventId and companyId are required' }, { status: 400 });
  }

  try {
    const result = await sqlWithRLS.execute(
      `UPDATE events
       SET company_id = $2,
           company_resolution_status = 'resolved',
           processed = false,
           error = NULL
       WHERE whop_event_id = $1`,
      [eventId, companyId],
      { skipRLS: true, enforceCompanyContext: false }
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    logger.info('Resolved pending webhook event company context', {
      eventId,
      companyId,
      updatedRows: result.rowCount
    });

    return NextResponse.json({ updated: result.rowCount });
  } catch (error) {
    logger.error('Failed to resolve pending webhook event', {
      eventId,
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'Failed to resolve event' }, { status: 500 });
  }
}

