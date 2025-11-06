// k6 load test for API endpoints
// Target: <500ms p95 response time
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.TEST_AUTH_TOKEN || 'test_auth_token';
const COMPANY_ID = __ENV.TEST_COMPANY_ID || 'test_company_id';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50 users
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '3m', target: 100 }, // Stay at 100 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    http_req_failed: ['rate<0.05'],                  // Error rate under 5%
  },
};

export default function () {
  // Test dashboard cases endpoint
  const casesResponse = http.get(
    `${BASE_URL}/api/dashboard/cases?page=1&limit=10`,
    {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'x-company-id': COMPANY_ID,
        'x-user-id': `user_${__VU}`,
      },
    }
  );

  check(casesResponse, {
    'cases API status is 200': (r) => r.status === 200,
    'cases API response time < 500ms': (r) => r.timings.duration < 500,
    'cases API returns valid JSON': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.cases !== undefined;
      } catch {
        return false;
      }
    },
  });

  // Test dashboard KPIs endpoint
  const kpisResponse = http.get(
    `${BASE_URL}/api/dashboard/kpis?window=14`,
    {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'x-company-id': COMPANY_ID,
        'x-user-id': `user_${__VU}`,
      },
    }
  );

  check(kpisResponse, {
    'KPIs API status is 200': (r) => r.status === 200,
    'KPIs API response time < 500ms': (r) => r.timings.duration < 500,
    'KPIs API returns valid JSON': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.activeCases !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(2); // 2 seconds between iterations
}

