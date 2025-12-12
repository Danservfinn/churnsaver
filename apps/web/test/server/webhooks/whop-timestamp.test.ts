import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

// Mock env to force production-like behavior and controlled skew window
vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: { WEBHOOK_TIMESTAMP_SKEW_SECONDS: 60 },
  isProductionLikeEnvironment: () => true
}));

// Use real logger but silence output
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Import after mocks
const { verifyWebhookSignature } = await import('@/server/webhooks/whop');

describe('verifyWebhookSignature production-like timestamp enforcement', () => {
  const secret = process.env.TEST_WEBHOOK_SECRET ?? ['unit', 'test', 'secret'].join('-');
  const body = JSON.stringify({ hello: 'world' });
  let now: number;

  beforeEach(() => {
    now = Math.floor(Date.now() / 1000);
  });

  const sign = (b: string) => createHmac('sha256', secret).update(b, 'utf8').digest('hex');

  it('rejects missing timestamp in production-like envs', () => {
    const result = verifyWebhookSignature(body, sign(body), secret, null);
    expect(result).toBe(false);
  });

  it('rejects stale timestamps outside allowed skew', () => {
    const staleTs = now - 120; // beyond 60s skew
    const result = verifyWebhookSignature(body, sign(body), secret, `${staleTs}`);
    expect(result).toBe(false);
  });

  it('accepts valid signature with fresh timestamp', () => {
    const result = verifyWebhookSignature(body, sign(body), secret, `${now}`);
    expect(result).toBe(true);
  });
});




