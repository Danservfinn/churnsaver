import { NextRequest, NextResponse } from 'next/server';
import { getSlowQueryStats } from '@/lib/queryMonitor';
import { logger } from '@/lib/logger';
import { timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyAdminToken(request: NextRequest): boolean {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const providedToken = request.headers.get('x-admin-token');

  if (!adminToken || adminToken.length < 32) {
    logger.error('Monitoring endpoint misconfigured (admin token missing/weak)', {
      hasTokenConfigured: !!adminToken,
      tokenLength: adminToken?.length
    });
    return false;
  }

  if (!providedToken) {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const adminTokenBuffer = Buffer.from(adminToken, 'utf8');
    const providedTokenBuffer = Buffer.from(providedToken, 'utf8');
    
    // Compare lengths first to avoid timing leaks
    if (adminTokenBuffer.length !== providedTokenBuffer.length) {
      return false;
    }

    return timingSafeEqual(adminTokenBuffer, providedTokenBuffer);
  } catch {
    return false;
  }
}

function ipAllowed(request: NextRequest): boolean {
  const allowlist = process.env.ADMIN_IP_ALLOWLIST;
  if (!allowlist) return true;
  const ips = allowlist.split(',').map((ip) => ip.trim()).filter(Boolean);
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '';
  if (!clientIp) return false;
  return ips.includes(clientIp);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Require admin authentication for this sensitive endpoint
  if (!verifyAdminToken(request) || !ipAllowed(request)) {
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    
    logger.warn('Unauthorized attempt to access monitoring queries endpoint', {
      ip: clientIp,
      hasToken: !!request.headers.get('x-admin-token')
    });
    
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const hours = Number(searchParams.get('hours') || '24');

  try {
    const stats = await getSlowQueryStats(Number.isFinite(hours) ? hours : 24);
    return NextResponse.json({ stats });
  } catch (error) {
    logger.error('Failed to get slow query stats', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load query stats' },
      { status: 500 }
    );
  }
}

