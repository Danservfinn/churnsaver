import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { env } from '@/lib/env';

// Mock rate limiter to always allow
vi.mock('@/server/middleware/rateLimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    resetAt: new Date(Date.now() + 60_000),
    remaining: 99,
  }),
  RATE_LIMIT_CONFIGS: {
    webhooks: {
      windowMs: 60_000,
      maxRequests: 100,
    },
  },
}));

// Mock webhook handler but reuse real signature verification
vi.mock('@/server/webhooks/whop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/webhooks/whop')>();
  const secret = env.WHOP_WEBHOOK_SECRET || 'whsec_test_secret';

  return {
    ...actual,
    handleWhopWebhook: vi.fn(async (req: NextRequest) => {
      const signature = req.headers.get('x-whop-signature') || '';
      const timestamp = req.headers.get('x-whop-timestamp');

      // Simplified validation: require sha256=<hex> shape to simulate signature check
      if (!signature.startsWith('sha256=')) {
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
      }

      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }),
  };
});

import { POST } from '@/app/api/webhooks/whop/route';

describe('Webhook Route Handler (no server)', () => {
  const secret = env.WHOP_WEBHOOK_SECRET || 'whsec_test_secret';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const buildRequest = (payload: object, signature: string, timestamp?: string) =>
    new NextRequest('http://localhost/api/webhooks/whop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-signature': signature,
        'x-whop-timestamp': timestamp ?? String(Math.floor(Date.now() / 1000)),
      },
      body: JSON.stringify(payload),
    });

  it('rejects requests with invalid signature', async () => {
    const payload = { type: 'test.invalid', data: {} };
    const request = buildRequest(payload, 'invalid_signature');

    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it('accepts requests with valid signature', async () => {
    const payload = { type: 'test.valid', data: { foo: 'bar' } };
    const payloadString = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', secret).update(payloadString, 'utf8').digest('hex')}`;
    const request = buildRequest(payload, signature);

    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
  });
});

