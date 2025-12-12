import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'crypto';

import { verifyWebhookSignature } from '@/server/webhooks/whop';
import { validateTimestamp } from '@/lib/whop/webhookValidator';

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    ...actual,
    additionalEnv: {
      ...actual.additionalEnv,
      WEBHOOK_TIMESTAMP_SKEW_SECONDS: 60
    },
    isProductionLikeEnvironment: vi.fn()
  };
});

import { additionalEnv, isProductionLikeEnvironment } from '@/lib/env';

const mockIsProductionLikeEnvironment = isProductionLikeEnvironment as vi.MockedFunction<
  typeof isProductionLikeEnvironment
>;

describe('Webhook timestamp enforcement', () => {
  const secret = process.env.TEST_WEBHOOK_SECRET ?? 'test_webhook_secret';
  const body = JSON.stringify({ hello: 'world' });
  const signature = 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const skew = additionalEnv.WEBHOOK_TIMESTAMP_SKEW_SECONDS;

  beforeEach(() => {
    mockIsProductionLikeEnvironment.mockReset();
  });

  describe('production-like environment (whop handler)', () => {
    beforeEach(() => {
      mockIsProductionLikeEnvironment.mockReturnValue(true);
    });

    it('rejects missing timestamp header', () => {
      const result = verifyWebhookSignature(body, signature, secret);
      expect(result).toBe(false);
    });

    it('rejects timestamp too old', () => {
      const pastTs = Math.floor(Date.now() / 1000) - (skew + 10);
      const result = verifyWebhookSignature(body, signature, secret, pastTs.toString());
      expect(result).toBe(false);
    });

    it('rejects timestamp too far in future', () => {
      const futureTs = Math.floor(Date.now() / 1000) + (skew + 10);
      const result = verifyWebhookSignature(body, signature, secret, futureTs.toString());
      expect(result).toBe(false);
    });

    it('accepts timestamp within skew window', () => {
      const ts = Math.floor(Date.now() / 1000);
      const result = verifyWebhookSignature(body, signature, secret, ts.toString());
      expect(result).toBe(true);
    });

    it('accepts timestamp exactly at boundary', () => {
      const boundaryTs = Math.floor(Date.now() / 1000) - skew;
      const result = verifyWebhookSignature(body, signature, secret, boundaryTs.toString());
      expect(result).toBe(true);
    });
  });

  describe('local/dev environment (whop handler)', () => {
    beforeEach(() => {
      mockIsProductionLikeEnvironment.mockReturnValue(false);
    });

    it('allows missing timestamp header', () => {
      const result = verifyWebhookSignature(body, signature, secret);
      expect(result).toBe(true);
    });

    it('still rejects timestamp outside skew when provided', () => {
      const pastTs = Math.floor(Date.now() / 1000) - (skew + 20);
      const result = verifyWebhookSignature(body, signature, secret, pastTs.toString());
      expect(result).toBe(false);
    });

    it('accepts valid timestamp when provided', () => {
      const ts = Math.floor(Date.now() / 1000);
      const result = verifyWebhookSignature(body, signature, secret, ts.toString());
      expect(result).toBe(true);
    });
  });

  describe('shared validator validateTimestamp', () => {
    it('requires timestamp in production-like env', () => {
      mockIsProductionLikeEnvironment.mockReturnValue(true);
      const result = validateTimestamp(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('production-like environment');
    });

    it('allows missing timestamp in dev/test env', () => {
      mockIsProductionLikeEnvironment.mockReturnValue(false);
      const result = validateTimestamp(null);
      expect(result.valid).toBe(true);
    });
  });
});

