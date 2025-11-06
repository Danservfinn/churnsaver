// Webhook payload generators for testing
// Provides utilities for creating test webhook payloads

import crypto from 'crypto';

export interface WebhookPayload {
  id: string;
  type: string;
  data: any;
  created_at?: string;
}

/**
 * Generate a webhook signature for testing
 */
export function generateWebhookSignature(
  payload: string | object,
  secret: string = 'test_webhook_secret'
): string {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString, 'utf8')
    .digest('hex');
  return `sha256=${signature}`;
}

/**
 * Create a payment_failed webhook payload
 */
export function createPaymentFailedWebhook(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  const timestamp = Date.now();
  return {
    id: `evt_${timestamp}`,
    type: 'payment_failed',
    data: {
      membership_id: `mem_${timestamp}`,
      user_id: `user_${timestamp}`,
      reason: 'card_declined',
      amount: 2999,
      currency: 'usd',
      membership: {
        id: `mem_${timestamp}`,
        user_id: `user_${timestamp}`,
      },
      payment: {
        failure_reason: 'card_declined',
        amount: 2999,
        currency: 'usd',
      },
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a payment_succeeded webhook payload
 */
export function createPaymentSucceededWebhook(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  const timestamp = Date.now();
  return {
    id: `evt_${timestamp}`,
    type: 'payment_succeeded',
    data: {
      membership_id: `mem_${timestamp}`,
      user_id: `user_${timestamp}`,
      amount: 2999,
      currency: 'usd',
      payment: {
        amount: 2999,
        currency: 'usd',
      },
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a membership_went_valid webhook payload
 */
export function createMembershipValidWebhook(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  const timestamp = Date.now();
  return {
    id: `evt_${timestamp}`,
    type: 'membership_went_valid',
    data: {
      membership_id: `mem_${timestamp}`,
      user_id: `user_${timestamp}`,
      membership: {
        id: `mem_${timestamp}`,
        user_id: `user_${timestamp}`,
      },
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a membership_went_invalid webhook payload
 */
export function createMembershipInvalidWebhook(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  const timestamp = Date.now();
  return {
    id: `evt_${timestamp}`,
    type: 'membership_went_invalid',
    data: {
      membership_id: `mem_${timestamp}`,
      user_id: `user_${timestamp}`,
      membership: {
        id: `mem_${timestamp}`,
        user_id: `user_${timestamp}`,
      },
    },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a signed webhook request for testing
 */
export function createSignedWebhookRequest(
  payload: WebhookPayload,
  secret: string = 'test_webhook_secret'
): {
  body: string;
  signature: string;
  headers: Record<string, string>;
} {
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, secret);

  return {
    body,
    signature,
    headers: {
      'Content-Type': 'application/json',
      'x-whop-signature': signature,
    },
  };
}

