import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { decodeRecoveryToken, getRecoveryLinkSendByToken, recordClickEvent } from '@/server/services/recoveryLinks';
import { env } from '@/lib/env';

/**
 * Privacy-preserving IP hash: HMAC-SHA256(salt, ip) truncated to 16 bytes hex.
 * Falls back to null if salt is missing or IP is absent.
 */
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!salt) {
    logger.warn('ENCRYPTION_KEY not configured; skipping IP hash for recovery click');
    return null;
  }
  const hmac = crypto.createHmac('sha256', salt).update(ip).digest('hex');
  return hmac.slice(0, 32); // 16 bytes hex to reduce re-identification risk
}

function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const lowered = userAgent.toLowerCase();
  return lowered.includes('bot') || lowered.includes('crawler') || lowered.includes('spider') || lowered.includes('preview');
}

function isPrefetch(request: NextRequest): boolean {
  const purpose = request.headers.get('purpose') || request.headers.get('x-moz') || '';
  const secFetchPurpose = request.headers.get('sec-fetch-purpose') || '';
  const secFetchMode = request.headers.get('sec-fetch-mode') || '';

  const normalizedPurpose = purpose.toLowerCase();
  const normalizedSecFetchPurpose = secFetchPurpose.toLowerCase();
  const normalizedMode = secFetchMode.toLowerCase();

  // Treat explicit prefetch hints as bots; normal navigations should pass through.
  return (
    normalizedPurpose === 'prefetch' ||
    normalizedSecFetchPurpose === 'prefetch' ||
    normalizedMode === 'prefetch'
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const token = params.token;

  if (!token) {
    return NextResponse.json({ error: 'missing token' }, { status: 400 });
  }

  const payload = decodeRecoveryToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'invalid or expired token' }, { status: 400 });
  }

  const linkSend = await getRecoveryLinkSendByToken(token, payload.companyId);

  if (!linkSend) {
    return NextResponse.json({ error: 'link not found' }, { status: 404 });
  }

  const expiresAt = new Date(linkSend.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    return NextResponse.json({ error: 'link expired' }, { status: 410 });
  }

  const userAgent = request.headers.get('user-agent');
  const ipHeader = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   request.headers.get('x-real-ip')?.split(',')[0]?.trim() ||
                   null;
  const ip = (request as any).ip ?? ipHeader;
  const ipHash = hashIp(ip);
  const botSuspected = isBotUserAgent(userAgent) || isPrefetch(request);

  await recordClickEvent(linkSend.id, linkSend.case_id, linkSend.company_id, {
    userAgent: userAgent || null,
    ipHash,
    isBotSuspected: botSuspected,
  }).catch((error) => {
    logger.error('Failed to record recovery click', {
      error,
      linkSendId: linkSend.id,
      caseId: linkSend.case_id,
    });
  });

  logger.info('Recorded recovery link click', {
    linkSendId: linkSend.id,
    caseId: linkSend.case_id,
    membershipId: linkSend.membership_id,
    companyId: linkSend.company_id,
    botSuspected,
  });

  return NextResponse.redirect(linkSend.whop_manage_url, { status: 302 });
}

// Export helpers for testing
export { hashIp, isBotUserAgent, isPrefetch };

