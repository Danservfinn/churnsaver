// Helper for generating webhook signatures in k6 load tests
import crypto from 'k6/crypto';

/**
 * Generate webhook signature for k6 load tests
 */
export function generateWebhookSignature(payload, secret) {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto.hmac('sha256', secret, payloadString, 'hex');
  return `sha256=${signature}`;
}

/**
 * Create a test webhook payload
 */
export function createWebhookPayload(eventType, eventId, membershipId, userId) {
  return {
    id: eventId,
    type: eventType,
    data: {
      membership_id: membershipId,
      user_id: userId,
      failure_reason: 'card_declined',
      membership: {
        id: membershipId,
        user_id: userId,
      },
    },
    created_at: new Date().toISOString(),
  };
}

