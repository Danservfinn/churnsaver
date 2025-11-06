// k6 scalability test - test horizontal scaling capabilities
import http from 'k6/http';
import { check, sleep } from 'k6';
import { generateWebhookSignature, createWebhookPayload } from './helpers/signature-generator.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.WHOP_WEBHOOK_SECRET || 'test_webhook_secret';

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Start with baseline
    { duration: '2m', target: 100 },   // Scale up 2x
    { duration: '2m', target: 200 },   // Scale up 4x
    { duration: '2m', target: 400 },   // Scale up 8x
    { duration: '2m', target: 200 },   // Scale down to 4x
    { duration: '2m', target: 100 },   // Scale down to 2x
    { duration: '2m', target: 50 },    // Return to baseline
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // Response times should remain consistent as we scale
    http_req_failed: ['rate<0.05'],    // Error rate should remain low
    // Response times should not degrade significantly as load increases
    'http_req_duration{stage:scale_up}': ['p(95)<600'],
    'http_req_duration{stage:scale_down}': ['p(95)<500'],
  },
};

export default function () {
  const eventId = `evt_scale_${__VU}_${__ITER}_${Date.now()}`;
  const membershipId = `mem_scale_${__VU}_${__ITER}`;
  const userId = `user_scale_${__VU}_${__ITER}`;

  const payload = createWebhookPayload('payment_failed', eventId, membershipId, userId);
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, WEBHOOK_SECRET);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Determine current stage for tagging
  const currentVUs = __ENV.K6_VUS || 50;
  const stage = currentVUs >= 300 ? 'scale_up' : currentVUs <= 100 ? 'scale_down' : 'baseline';

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
      tags: { stage },
    }
  );

  check(response, {
    'scalability test status is 200': (r) => r.status === 200,
    'scalability test response time consistent': (r) => r.timings.duration < 500,
  });

  sleep(1);
}

