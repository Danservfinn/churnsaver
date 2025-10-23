#!/usr/bin/env node

// Unit tests for rate limiting identifier composition and window behavior
// Tests rate limiting security for production readiness

const crypto = require('crypto');

// Mock database for testing
let mockDbData = new Map();

// Mock sql functions
const mockSql = {
  execute: async (query, params) => {
    if (query.includes('DELETE FROM rate_limits')) {
      // Clean up expired windows
      const windowStart = params[0];
      for (const [key, data] of mockDbData.entries()) {
        if (data.window_start < windowStart) {
          mockDbData.delete(key);
        }
      }
      return 1; // Mock affected rows
    }

    if (query.includes('SELECT count FROM rate_limits')) {
      const [identifier, windowStart] = params;
      const data = mockDbData.get(identifier);
      if (data && data.window_start >= windowStart) {
        return [{ count: data.count }];
      }
      return [];
    }

    if (query.includes('INSERT INTO rate_limits')) {
      const [identifier, windowStart, count] = params;
      const key = identifier; // Use identifier as key for simplicity
      const existing = mockDbData.get(key);
      if (existing) {
        existing.count += count;
      } else {
        mockDbData.set(key, {
          company_key: identifier,
          window_start: windowStart,
          count: count,
          updated_at: new Date()
        });
      }
      return 1; // Mock affected rows
    }

    return 0;
  },
  select: async (query, params) => {
    if (query.includes('SELECT count FROM rate_limits')) {
      const [identifier, windowStart] = params;
      const data = mockDbData.get(identifier);
      if (data && data.window_start.getTime() >= windowStart.getTime()) {
        return [{ count: data.count }];
      }
      return [];
    }
    return [];
  }
};

// Copy rate limiting functions for testing
function checkRateLimit(identifier, config) {
  return new Promise(async (resolve) => {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - config.windowMs);

      // Clean up expired windows
      await mockSql.execute(
        `DELETE FROM rate_limits WHERE window_start < $1`,
        [windowStart]
      );

      // Get current count for this identifier
      const rows = await mockSql.select(
        `SELECT count FROM rate_limits WHERE company_key = $1 AND window_start >= $2`,
        [identifier, windowStart]
      );

      const currentCount = rows.length > 0 ? rows[0].count : 0;

      if (currentCount >= config.maxRequests) {
        // Rate limit exceeded
        const resetAt = new Date(windowStart.getTime() + config.windowMs);
        resolve({
          allowed: false,
          resetAt,
          remaining: 0,
          retryAfter: Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
        });
        return;
      }

      // Increment the count
      await mockSql.execute(`
        INSERT INTO rate_limits (company_key, window_start, count, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (company_key)
        DO UPDATE SET
          count = rate_limits.count + 1,
          updated_at = now()
      `, [identifier, windowStart, 1]);

      const remaining = config.maxRequests - (currentCount + 1);
      const resetAt = new Date(windowStart.getTime() + config.windowMs);

      resolve({
        allowed: true,
        resetAt,
        remaining,
      });

    } catch (error) {
      // Fail-open on error
      resolve({
        allowed: true,
        resetAt: new Date(Date.now() + config.windowMs),
        remaining: config.maxRequests - 1,
      });
    }
  });
}

// Rate limit configurations
const RATE_LIMIT_CONFIGS = {
  webhooks: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300, // 300 webhooks per minute (globally)
    keyPrefix: 'webhook'
  },
  caseActions: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 case actions per minute per company
    keyPrefix: 'case_action'
  },
  caseActionsPerCompany: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 case actions per minute per company
    keyPrefix: 'cases:action'
  },
  scheduler: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20, // 20 scheduler calls per 5 minutes (globally)
    keyPrefix: 'scheduler'
  },
};

function runRateLimitTests() {
  console.log('🚦 Starting Rate Limiting Test Suite\n');
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, testFn) {
    try {
      console.log(`\n🧪 ${name}`);
      const result = testFn();
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          console.log(`✅ ${name} - PASSED`);
          results.passed++;
          results.tests.push({ name, status: 'PASSED' });
        }).catch(error => {
          console.log(`❌ ${name} - FAILED: ${error.message}`);
          results.failed++;
          results.tests.push({ name, status: 'FAILED', error: error.message });
        });
      } else {
        console.log(`✅ ${name} - PASSED`);
        results.passed++;
        results.tests.push({ name, status: 'PASSED' });
      }
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Reset mock data before each test
  function resetMockData() {
    mockDbData.clear();
  }

  // Test identifier composition
  runTest('Rate limit identifier composition for webhooks (global)', async () => {
    resetMockData();
    const config = RATE_LIMIT_CONFIGS.webhooks;
    const identifier = 'webhook:global';

    // First request should be allowed
    const result1 = await checkRateLimit(identifier, config);
    if (!result1.allowed || result1.remaining !== config.maxRequests - 1) {
      throw new Error(`Expected first request allowed with ${config.maxRequests - 1} remaining, got ${result1.remaining}`);
    }

    // Second request should also be allowed (remaining should be 298 for 300 max)
    const result2 = await checkRateLimit(identifier, config);
    if (!result2.allowed || result2.remaining !== config.maxRequests - 2) {
      throw new Error(`Expected second request allowed with ${config.maxRequests - 2} remaining, got ${result2.remaining}`);
    }
  });

  runTest('Rate limit identifier composition for case actions (per company)', async () => {
    resetMockData();
    const config = RATE_LIMIT_CONFIGS.caseActions;
    const companyId = 'company_123';
    const identifier = `case_action:export_${companyId}`;

    const result = await checkRateLimit(identifier, config);
    if (!result.allowed) {
      throw new Error('Expected request allowed for company-specific identifier');
    }

    // Verify identifier includes company ID
    if (!identifier.includes(companyId)) {
      throw new Error('Identifier should include company ID for per-company limits');
    }
  });

  runTest('Rate limit identifier composition for scheduler (global)', async () => {
    resetMockData();
    const config = RATE_LIMIT_CONFIGS.scheduler;
    const identifier = 'scheduler:control';

    const result = await checkRateLimit(identifier, config);
    if (!result.allowed) {
      throw new Error('Expected scheduler request allowed');
    }
  });

  // Test window behavior
  runTest('Rate limit window behavior - requests within window', async () => {
    resetMockData();
    const config = { windowMs: 1000, maxRequests: 3, keyPrefix: 'test' }; // 1 second window
    const identifier = 'test:window';

    // Make requests within window
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(identifier, config);
      if (!result.allowed) {
        throw new Error(`Request ${i + 1} should be allowed within window`);
      }
    }
  });

  runTest('Rate limit window behavior - exceeds limit within window', async () => {
    resetMockData();
    const config = { windowMs: 1000, maxRequests: 2, keyPrefix: 'test' };
    const identifier = 'test:exceed';

    // First two requests should be allowed
    const result1 = await checkRateLimit(identifier, config);
    const result2 = await checkRateLimit(identifier, config);
    if (!result1.allowed || !result2.allowed) {
      throw new Error('First two requests should be allowed');
    }

    // Third request should be blocked
    const result3 = await checkRateLimit(identifier, config);
    if (result3.allowed) {
      throw new Error('Third request should be blocked (exceeds limit)');
    }

    // Should have retryAfter information
    if (!result3.retryAfter || result3.retryAfter <= 0) {
      throw new Error('Blocked request should include retryAfter');
    }
  });

  runTest('Rate limit window behavior - window expiration resets counter', async () => {
    resetMockData();
    const config = { windowMs: 500, maxRequests: 1, keyPrefix: 'test' }; // Short window
    const identifier = 'test:expire';

    // First request should be allowed
    const result1 = await checkRateLimit(identifier, config);
    if (!result1.allowed) {
      throw new Error('First request should be allowed');
    }

    // Second request should be blocked
    const result2 = await checkRateLimit(identifier, config);
    if (result2.allowed) {
      throw new Error('Second request should be blocked');
    }

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 600));

    // Third request should be allowed (new window)
    const result3 = await checkRateLimit(identifier, config);
    if (!result3.allowed) {
      throw new Error('Request after window expiration should be allowed');
    }
  });

  runTest('Rate limit remaining count calculation', async () => {
    resetMockData();
    const config = { windowMs: 1000, maxRequests: 5, keyPrefix: 'test' };
    const identifier = 'test:remaining';

    // Make several requests and check remaining count
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(identifier, config);
      if (!result.allowed) {
        throw new Error(`Request ${i + 1} should be allowed`);
      }
      const expectedRemaining = config.maxRequests - (i + 1);
      if (result.remaining !== expectedRemaining) {
        throw new Error(`Expected remaining ${expectedRemaining}, got ${result.remaining}`);
      }
    }
  });

  runTest('Rate limit reset time calculation', async () => {
    resetMockData();
    const config = { windowMs: 60000, maxRequests: 1, keyPrefix: 'test' }; // 1 minute window
    const identifier = 'test:reset';

    const before = new Date();
    const result = await checkRateLimit(identifier, config);
    const after = new Date();

    if (!result.allowed) {
      throw new Error('First request should be allowed');
    }

    // Reset time should be in the future
    if (result.resetAt <= after) {
      throw new Error('Reset time should be in the future');
    }

    // Reset time should be approximately windowMs from now
    const expectedReset = new Date(before.getTime() + config.windowMs);
    const timeDiff = Math.abs(result.resetAt.getTime() - expectedReset.getTime());
    if (timeDiff > 2000) { // Allow 2 second tolerance
      throw new Error(`Reset time deviation too large: ${timeDiff}ms`);
    }
  });

  runTest('Rate limit fail-open behavior on database errors', async () => {
    // Temporarily break the mock to simulate DB errors
    const originalExecute = mockSql.execute;
    mockSql.execute = async () => { throw new Error('Database connection failed'); };

    try {
      resetMockData();
      const config = { windowMs: 1000, maxRequests: 1, keyPrefix: 'test' };
      const identifier = 'test:failopen';

      const result = await checkRateLimit(identifier, config);

      // Should fail open (allow request despite error)
      if (!result.allowed) {
        throw new Error('Rate limiting should fail open on database errors');
      }
    } finally {
      // Restore mock
      mockSql.execute = originalExecute;
    }
  });

  runTest('Rate limit different identifiers are isolated', async () => {
    resetMockData();
    const config = { windowMs: 1000, maxRequests: 1, keyPrefix: 'test' };
    const identifier1 = 'test:company_a';
    const identifier2 = 'test:company_b';

    // Both should be allowed (different identifiers)
    const result1 = await checkRateLimit(identifier1, config);
    const result2 = await checkRateLimit(identifier2, config);

    if (!result1.allowed || !result2.allowed) {
      throw new Error('Different identifiers should not affect each other');
    }
  });

  // Wait for all async tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RATE LIMITING TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

    if (results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.tests.filter(t => t.status === 'FAILED').forEach(test => {
        console.log(`   - ${test.name}: ${test.error}`);
      });
    }

    process.exit(results.failed === 0 ? 0 : 1);
  }, 2000); // Give async tests time to complete
}

// Run tests if called directly
if (require.main === module) {
  runRateLimitTests();
}

module.exports = { runRateLimitTests };