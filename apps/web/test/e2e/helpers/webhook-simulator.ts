// Helper for simulating webhooks in E2E tests
import crypto from 'crypto';

export interface WebhookPayload {
  id: string;
  type: string;
  data: any;
  created_at?: string;
}

/**
 * Generate webhook signature for testing
 */
export function generateWebhookSignature(
  payload: string | object,
  secret: string = process.env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret'
): string {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadString, 'utf8')
    .digest('hex');
  return `sha256=${signature}`;
}

/**
 * Simulate a webhook by making a POST request to the webhook endpoint
 */
export async function simulateWebhook(
  eventType: string,
  data: any,
  options: {
    baseURL?: string;
    secret?: string;
    eventId?: string;
  } = {}
): Promise<Response> {
  const baseURL = options.baseURL || 'http://localhost:3000';
  const secret = options.secret || process.env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret';
  const eventId = options.eventId || `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const payload: WebhookPayload = {
    id: eventId,
    type: eventType,
    data,
    created_at: new Date().toISOString(),
  };

  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, secret);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const response = await fetch(`${baseURL}/api/webhooks/whop`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-whop-signature': signature,
      'x-whop-timestamp': timestamp,
      'x-whop-event': eventType,
    },
    body,
  });

  return response;
}

/**
 * Create a payment_failed webhook payload
 */
export function createPaymentFailedWebhook(data: {
  membership_id: string;
  user_id: string;
  failure_reason?: string;
}): WebhookPayload {
  return {
    id: `evt_${Date.now()}`,
    type: 'payment_failed',
    data: {
      membership_id: data.membership_id,
      user_id: data.user_id,
      failure_reason: data.failure_reason || 'card_declined',
      membership: {
        id: data.membership_id,
        user_id: data.user_id,
      },
      payment: {
        failure_reason: data.failure_reason || 'card_declined',
      },
    },
    created_at: new Date().toISOString(),
  };
}

/**
 * Create a payment_succeeded webhook payload
 */
export function createPaymentSucceededWebhook(data: {
  membership_id: string;
  user_id: string;
  amount?: number;
}): WebhookPayload {
  return {
    id: `evt_${Date.now()}`,
    type: 'payment_succeeded',
    data: {
      membership_id: data.membership_id,
      user_id: data.user_id,
      amount: data.amount || 2999,
      currency: 'usd',
      membership: {
        id: data.membership_id,
        user_id: data.user_id,
      },
      payment: {
        amount: data.amount || 2999,
        currency: 'usd',
      },
    },
    created_at: new Date().toISOString(),
  };
}

