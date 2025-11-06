// k6 load test for database query performance
// Target: <1s p95 query time
// Note: This tests database performance indirectly through API endpoints
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.TEST_AUTH_TOKEN || 'test_auth_token';
const COMPANY_ID = __ENV.TEST_COMPANY_ID || 'test_company_id';

export const options = {
  stages: [
    { duration: '1m', target: 30 },   // Ramp up to 30 concurrent users
    { duration: '3m', target: 30 },   // Stay at 30 users
    { duration: '1m', target: 60 },   // Ramp up to 60 users
    { duration: '3m', target: 60 },   // Stay at 60 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'], // 95% under 1s, 99% under 2s
    http_req_failed: ['rate<0.05'],                   // Error rate under 5%
  },
};

export default function () {
  // Test cases endpoint with filters (tests database queries)
  const casesResponse = http.get(
    `${BASE_URL}/api/dashboard/cases?page=1&limit=50&status=open`,
    {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'x-company-id': COMPANY_ID,
        'x-user-id': `user_${__VU}`,
      },
    }
  );

  check(casesResponse, {
    'database query status is 200': (r) => r.status === 200,
    'database query time < 1s': (r) => r.timings.duration < 1000,
    'database query returns data': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.cases !== undefined;
      } catch {
        return false;
      }
    },
  });

  // Test KPIs endpoint (tests aggregate queries)
  const kpisResponse = http.get(
    `${BASE_URL}/api/dashboard/kpis?window=30`,
    {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'x-company-id': COMPANY_ID,
        'x-user-id': `user_${__VU}`,
      },
    }
  );

  check(kpisResponse, {
    'aggregate query status is 200': (r) => r.status === 200,
    'aggregate query time < 1s': (r) => r.timings.duration < 1000,
    'aggregate query returns KPIs': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.activeCases !== undefined && data.recoveries !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(3); // 3 seconds between iterations
}

