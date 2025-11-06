// k6 endurance test - test system stability over extended periods
import http from 'k6/http';
import { check, sleep } from 'k6';
import { generateWebhookSignature, createWebhookPayload } from './helpers/signature-generator.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.WHOP_WEBHOOK_SECRET || 'test_webhook_secret';

export const options = {
  stages: [
    { duration: '5m', target: 20 },   // Steady load for 5 minutes
    { duration: '10m', target: 20 },  // Continue for 10 minutes
    { duration: '5m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // Response times should remain stable
    http_req_failed: ['rate<0.01'],    // Very low error rate over time
    // Check for memory leaks by monitoring response times over time
    'http_req_duration{type:webhook}': ['avg<300'], // Average should remain stable
  },
};

export default function () {
  const eventId = `evt_endurance_${__VU}_${__ITER}_${Date.now()}`;
  const membershipId = `mem_endurance_${__VU}_${__ITER}`;
  const userId = `user_endurance_${__VU}_${__ITER}`;

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
      tags: { type: 'webhook' },
    }
  );

  check(response, {
    'endurance test status is 200': (r) => r.status === 200,
    'endurance test response time stable': (r) => r.timings.duration < 500,
  });

  sleep(3); // 3 seconds between requests - steady, sustainable load
}

