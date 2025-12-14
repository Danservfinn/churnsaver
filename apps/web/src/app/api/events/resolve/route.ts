import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS, sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { assertCompanyContext } from '@/server/services/shared/jobHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  await initDbWithRLS();

  const adminToken = process.env.ADMIN_API_TOKEN;
  const providedToken = request.headers.get('x-admin-token');
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // Require strong token and exact match
  if (!adminToken || adminToken.length < 32) {
    logger.error('Admin resolve endpoint misconfigured (token missing/weak)', {
      hasTokenConfigured: !!adminToken,
      tokenLength: adminToken?.length,
      ip: clientIp
    });
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // Optional IP allowlist: comma-separated (standardize to ADMIN_IP_ALLOWLIST)
  const allowedIps = (process.env.ADMIN_IP_ALLOWLIST || process.env.ADMIN_ALLOWED_IPS)?.split(',').map((ip) => ip.trim()).filter(Boolean) || [];
  const ipAllowed = allowedIps.length === 0 || allowedIps.includes(clientIp);

  const tokensMatch = (() => {
    if (!providedToken) return false;
    const providedBuffer = Buffer.from(providedToken, 'utf8');
    const adminBuffer = Buffer.from(adminToken, 'utf8');
    if (providedBuffer.length !== adminBuffer.length) return false;
    return timingSafeEqual(providedBuffer, adminBuffer);
  })();

  if (!tokensMatch || !ipAllowed) {
    logger.warn('Unauthorized attempt to call admin resolve endpoint', {
      hasTokenConfigured: true,
      tokenLength: adminToken.length,
      ip: clientIp,
      ipAllowed,
      allowedIpsCount: allowedIps.length
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

  const companyContext = await assertCompanyContext(companyId);
  if (!companyContext.isValid) {
    return NextResponse.json({ error: companyContext.error || 'Invalid company' }, { status: 400 });
  }

  try {
    const result = await sqlWithRLS.execute(
      `UPDATE events
       SET company_id = $2,
           company_resolution_status = 'resolved',
           processed = false,
           error = NULL
       WHERE whop_event_id = $1
         AND company_id = $2`,
      [eventId, companyId],
      { companyId, enforceCompanyContext: true }
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

