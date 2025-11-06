// k6 stress test - test system behavior under extreme load
import http from 'k6/http';
import { check, sleep } from 'k6';
import { generateWebhookSignature, createWebhookPayload } from './helpers/signature-generator.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.WHOP_WEBHOOK_SECRET || 'test_webhook_secret';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up quickly
    { duration: '1m', target: 100 },   // Increase load
    { duration: '1m', target: 200 },    // Stress level 1
    { duration: '1m', target: 500 },   // Stress level 2
    { duration: '1m', target: 1000 },   // Extreme stress
    { duration: '2m', target: 1000 },  // Maintain extreme load
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // Even under stress, 95% should be under 2s
    http_req_failed: ['rate<0.20'],     // Allow up to 20% errors under extreme stress
  },
};

export default function () {
  const eventId = `evt_stress_${__VU}_${__ITER}_${Date.now()}`;
  const membershipId = `mem_stress_${__VU}_${__ITER}`;
  const userId = `user_stress_${__VU}_${__ITER}`;

  const payload = createWebhookPayload('payment_failed', eventId, membershipId, userId);
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, WEBHOOK_SECRET);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const response = http.post(
    `${BASE_URL}/api/webhooks/whop`,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        'x-whop-signature': signature,
        'x-whop-timestamp': timestamp,
        'x-whop-event': 'payment_failed',
      },
      timeout: '5s',
    }
  );

  // Under stress, we expect some failures but want to verify graceful degradation
  check(response, {
    'response received': (r) => r.status !== 0,
    'not timeout': (r) => r.status !== 0 && r.timings.duration < 5000,
  });

  // Note: Under extreme stress, 429 (rate limit) and 503 (service unavailable) are acceptable
  if (response.status === 429 || response.status === 503) {
    // System is gracefully degrading
    sleep(2); // Back off
  } else {
    sleep(0.5);
  }
}

