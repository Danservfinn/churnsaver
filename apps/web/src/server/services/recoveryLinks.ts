import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { sqlWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';

type RecoveryChannel = 'push' | 'dm' | 'email';

interface TokenPayload {
  caseId: string;
  companyId: string;
  membershipId: string;
  channel: RecoveryChannel;
  expiresAt: string; // ISO string
  linkSendId: string;
}

export interface CreateRecoveryLinkArgs {
  caseId: string;
  companyId: string;
  membershipId: string;
  userId: string;
  channel: RecoveryChannel;
  whopManageUrl: string;
  attributionWindowDays?: number;
  messageId?: string;
}

export interface RecoveryLink {
  token: string;
  trackingUrl: string;
  linkSendId: string;
  expiresAt: string;
}

export interface RecoveryLinkSendRecord {
  id: string;
  case_id: string;
  company_id: string;
  membership_id: string;
  user_id: string;
  whop_manage_url: string;
  expires_at: string;
}

const HMAC_ALGO = 'sha256';

function getSecret(): string {
  const secret = env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  return secret;
}

function signPayload(payload: TokenPayload): string {
  const secret = getSecret();
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac(HMAC_ALGO, secret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${hmac}`;
}

function verifyToken(token: string): TokenPayload | null {
  const secret = getSecret();
  const [payloadBase64, signature] = token.split('.');
  if (!payloadBase64 || !signature) return null;

  const expected = crypto.createHmac(HMAC_ALGO, secret).update(payloadBase64).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());
    return parsed;
  } catch (error) {
    logger.error('Failed to parse recovery link payload', { error });
    return null;
  }
}

export function decodeRecoveryToken(token: string): TokenPayload | null {
  const payload = verifyToken(token);
  if (!payload) return null;

  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    return null;
  }

  return payload;
}

export async function createRecoveryLink(args: CreateRecoveryLinkArgs): Promise<RecoveryLink> {
  const {
    caseId,
    companyId,
    membershipId,
    userId,
    channel,
    whopManageUrl,
    attributionWindowDays = 7,
    messageId,
  } = args;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + attributionWindowDays);

  const linkSendId = randomUUID();

  const payload: TokenPayload = {
    caseId,
    companyId,
    membershipId,
    channel,
    expiresAt: expiresAt.toISOString(),
    linkSendId,
  };

  const token = signPayload(payload);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const trackingUrl = `${appUrl.replace(/\/$/, '')}/api/r/${token}`;

  await sqlWithRLS.execute(
    `INSERT INTO recovery_link_sends (
      id, case_id, company_id, membership_id, user_id, channel, token, whop_manage_url, message_id, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      linkSendId,
      caseId,
      companyId,
      membershipId,
      userId,
      channel,
      token,
      whopManageUrl,
      messageId || null,
      expiresAt.toISOString(),
    ],
    { companyId }
  );

  logger.info('Created recovery tracking link', {
    linkSendId,
    caseId,
    membershipId,
    companyId,
    channel,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    token,
    trackingUrl,
    linkSendId,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getRecoveryLinkSendByToken(
  token: string,
  companyId: string
): Promise<RecoveryLinkSendRecord | null> {
  const result = await sqlWithRLS.select<RecoveryLinkSendRecord>(
    `SELECT id, case_id, company_id, membership_id, user_id, whop_manage_url, expires_at
     FROM recovery_link_sends
     WHERE token = $1`,
    [token],
    { companyId }
  );

  return result[0] ?? null;
}

export async function recordClickEvent(
  linkSendId: string,
  caseId: string,
  companyId: string,
  metadata: { userAgent: string | null; ipHash: string | null; isBotSuspected: boolean }
): Promise<void> {
  await sqlWithRLS.execute(
    `INSERT INTO recovery_click_events (
        link_send_id, case_id, company_id, clicked_at, user_agent, ip_hash, is_bot_suspected
      ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
    [
      linkSendId,
      caseId,
      companyId,
      metadata.userAgent || null,
      metadata.ipHash,
      metadata.isBotSuspected,
    ],
    { companyId }
  );
}

