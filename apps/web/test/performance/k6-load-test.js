// k6 load test for webhook endpoint
// Target: 1000 req/min capacity
import http from 'k6/http';
import { check, sleep } from 'k6';
import { generateWebhookSignature, createWebhookPayload } from './helpers/signature-generator.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.WHOP_WEBHOOK_SECRET || 'test_webhook_secret';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 users over 1 minute
    { duration: '2m', target: 100 },  // Stay at 100 users for 2 minutes (~1000 req/min)
    { duration: '1m', target: 200 },  // Ramp up to 200 users
    { duration: '2m', target: 200 },  // Stay at 200 users (~2000 req/min)
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    http_req_failed: ['rate<0.1'],                    // Error rate under 10%
    http_reqs: ['rate>16'],                          // At least 16 req/s (960 req/min) to meet 1000 req/min target
  },
};

export default function () {
  // Generate unique event ID and membership ID for each request
  const eventId = `evt_load_${__VU}_${__ITER}_${Date.now()}`;
  const membershipId = `mem_load_${__VU}_${__ITER}`;
  const userId = `user_load_${__VU}_${__ITER}`;

  // Create webhook payload
  const payload = createWebhookPayload('payment_failed', eventId, membershipId, userId);
  const body = JSON.stringify(payload);
  const signature = generateWebhookSignature(body, WEBHOOK_SECRET);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Make webhook request
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
    }
  );

  // Validate response
  check(response, {
    'webhook status is 200': (r) => r.status === 200,
    'webhook response time < 200ms': (r) => r.timings.duration < 200,
    'webhook has valid JSON': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  sleep(1); // 1 second between requests per virtual user
}

