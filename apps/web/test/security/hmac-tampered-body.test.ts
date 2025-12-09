import { describe, it, expect } from 'vitest';
import { validateWebhookSignature } from '@/lib/whop/webhookValidator';
import { createHmac, randomBytes } from 'crypto';

describe('Webhook HMAC validation rejects tampered payloads', () => {
  it('fails when the body is modified but signature is for the original payload', () => {
    const secret = randomBytes(32).toString('hex');

    const payloadA = JSON.stringify({ type: 'payment.failed', data: { id: 'one' } });
    const payloadB = JSON.stringify({ type: 'payment.failed', data: { id: 'two' } });

    // Sign payload A
    const signatureForA = createHmac('sha256', secret).update(payloadA, 'utf8').digest('hex');

    // Validate payload B with signature for payload A (should fail)
    const result = validateWebhookSignature(payloadB, signatureForA, secret);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Signature verification failed');
  });
});

