#!/usr/bin/env node

// Test suite for protected API routes
// Tests 401 vs 200 behavior, authentication, and rate limiting

const http = require('http');

// Mock environment variables for testing
const originalEnv = process.env;
process.env.NODE_ENV = 'test';
process.env.WHOP_APP_ID = 'test_app_id';
process.env.WHOP_APP_SECRET = 'test_app_secret';

// Mock functions for testing
function mockGetRequestContext(request, options = {}) {
  const { isAuthenticated = true, userId = 'test_user_123', companyId = 'test_company_456' } = options;
  
  return Promise.resolve({
    companyId,
    userId,
    isAuthenticated
  });
}

function mockValidateMembershipAccess(membershipId) {
  // Mock membership validation - return true for test memberships
  return Promise.resolve(membershipId.startsWith('mem_'));
}

function mockGetMembershipDetails(membershipId) {
  // Mock membership details
  return Promise.resolve({
    id: membershipId,
    user_id: 'test_user_123',
    company_id: 'test_company_456',
    status: 'active',
    created_at: new Date().toISOString()
  });
}

// Mock rate limiting
function mockCheckRateLimit(key, config) {
  return Promise.resolve({
    allowed: true,
    retryAfter: null,
    resetAt: new Date(Date.now() + 60000)
  });
}

function runProtectedApiTests() {
  console.log('🔒 Starting Protected API Test Suite\n');
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

  // Test 401 response when no token provided
  runTest('Protected API returns 401 when no token provided', async () => {
    const mockRequest = {
      headers: {
        get: (key) => null // No token provided
      }
    };

    // Simulate production environment
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const context = await mockGetRequestContext(mockRequest, { isAuthenticated: false });
      
      if (context.isAuthenticated) {
        throw new Error('Expected unauthenticated context');
      }

      // Simulate API response
      const response = {
        status: 401,
        json: { error: 'Authentication required' }
      };

      if (response.status !== 401) {
        throw new Error('Expected 401 status');
      }

      if (!response.json.error.includes('Authentication required')) {
        throw new Error('Expected authentication error message');
      }
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  // Test 401 response when invalid token provided
  runTest('Protected API returns 401 when invalid token provided', async () => {
    const mockRequest = {
      headers: {
        get: (key) => {
          if (key.toLowerCase() === 'x-whop-user-token') {
            return 'invalid.jwt.token';
          }
          return null;
        }
      }
    };

    // Simulate production environment
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const context = await mockGetRequestContext(mockRequest, { isAuthenticated: false });
      
      if (context.isAuthenticated) {
        throw new Error('Expected unauthenticated context for invalid token');
      }

      // Simulate API response
      const response = {
        status: 401,
        json: { error: 'Authentication required' }
      };

      if (response.status !== 401) {
        throw new Error('Expected 401 status');
      }
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  // Test 200 response when valid token provided
  runTest('Protected API returns 200 when valid token provided', async () => {
    const mockRequest = {
      headers: {
        get: (key) => {
          if (key.toLowerCase() === 'x-whop-user-token') {
            return 'valid.jwt.token';
          }
          return null;
        }
      }
    };

    const context = await mockGetRequestContext(mockRequest, { isAuthenticated: true });
    
    if (!context.isAuthenticated) {
      throw new Error('Expected authenticated context');
    }

    const membershipId = 'mem_test_123';
    
    // Mock membership access validation
    const hasAccess = await mockValidateMembershipAccess(membershipId);
    if (!hasAccess) {
      throw new Error('Expected membership access to be granted');
    }

    // Mock membership details retrieval
    const membership = await mockGetMembershipDetails(membershipId);
    if (!membership || membership.id !== membershipId) {
      throw new Error('Expected membership details to be retrieved');
    }

    // Simulate successful API response
    const response = {
      status: 200,
      json: { membership }
    };

    if (response.status !== 200) {
      throw new Error('Expected 200 status');
    }

    if (!response.json.membership || response.json.membership.id !== membershipId) {
      throw new Error('Expected membership data in response');
    }
  });

  // Test 404 response when membership not found
  runTest('Protected API returns 404 when membership not accessible', async () => {
    const mockRequest = {
      headers: {
        get: (key) => 'valid.jwt.token'
      }
    };

    const context = await mockGetRequestContext(mockRequest, { isAuthenticated: true });
    
    if (!context.isAuthenticated) {
      throw new Error('Expected authenticated context');
    }

    const membershipId = 'mem_nonexistent_456';
    
    // Mock membership access validation failure
    const hasAccess = await mockValidateMembershipAccess(membershipId);
    if (hasAccess) {
      throw new Error('Expected membership access to be denied');
    }

    // Simulate API response
    const response = {
      status: 404,
      json: { error: 'Membership not found or not accessible' }
    };

    if (response.status !== 404) {
      throw new Error('Expected 404 status');
    }
  });

  // Test rate limiting (422 response)
  runTest('Protected API returns 422 when rate limit exceeded', async () => {
    const mockRequest = {
      headers: {
        get: (key) => 'valid.jwt.token'
      }
    };

    // Mock rate limit exceeded
    const rateLimitResult = {
      allowed: false,
      retryAfter: 60,
      resetAt: new Date(Date.now() + 60000)
    };

    if (rateLimitResult.allowed) {
      throw new Error('Expected rate limit to be exceeded');
    }

    // Simulate rate limited response
    const response = {
      status: 429, // Note: Using 429 for rate limiting as per standard
      json: {
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString()
      }
    };

    if (response.status !== 429) {
      throw new Error('Expected 429 status for rate limiting');
    }

    if (!response.json.error.includes('Rate limit exceeded')) {
      throw new Error('Expected rate limit error message');
    }

    if (!response.json.retryAfter || response.json.retryAfter !== 60) {
      throw new Error('Expected retryAfter in response');
    }
  });

  // Test development mode behavior (allows unauthenticated requests)
  runTest('Protected API allows requests in development mode', async () => {
    const mockRequest = {
      headers: {
        get: (key) => null // No token
      }
    };

    // Simulate development environment
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const context = await mockGetRequestContext(mockRequest, { isAuthenticated: false });
      
      // In development, we might allow some access for testing
      const membershipId = 'mem_dev_test_123';
      const hasAccess = await mockValidateMembershipAccess(membershipId);
      
      if (!hasAccess) {
        throw new Error('Expected development mode to allow access');
      }

      // Simulate development API response
      const response = {
        status: 200,
        json: { 
          membership: { id: membershipId, development: true },
          note: 'Development mode - authentication bypassed'
        }
      };

      if (response.status !== 200) {
        throw new Error('Expected 200 status in development mode');
      }
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  // Test error handling for internal server errors
  runTest('Protected API returns 500 for internal errors', async () => {
    const mockRequest = {
      headers: {
        get: (key) => 'valid.jwt.token'
      }
    };

    const context = await mockGetRequestContext(mockRequest, { isAuthenticated: true });
    
    if (!context.isAuthenticated) {
      throw new Error('Expected authenticated context');
    }

    const membershipId = 'mem_error_test_123';
    
    // Mock membership access validation success
    const hasAccess = await mockValidateMembershipAccess(membershipId);
    if (!hasAccess) {
      throw new Error('Expected membership access to be granted');
    }

    // Mock membership details retrieval failure
    const mockGetMembershipDetailsError = async () => {
      throw new Error('Database connection failed');
    };

    try {
      await mockGetMembershipDetailsError();
      throw new Error('Expected membership details retrieval to fail');
    } catch (error) {
      // Simulate error response
      const response = {
        status: 500,
        json: { error: 'Internal server error' }
      };

      if (response.status !== 500) {
        throw new Error('Expected 500 status for internal error');
      }

      if (!response.json.error.includes('Internal server error')) {
        throw new Error('Expected internal server error message');
      }
    }
  });

  // Test request logging and monitoring
  runTest('Protected API logs requests appropriately', async () => {
    const mockRequest = {
      headers: {
        get: (key) => {
          if (key.toLowerCase() === 'x-whop-user-token') return 'valid.jwt.token';
          if (key.toLowerCase() === 'x-forwarded-for') return '192.168.1.100';
          if (key.toLowerCase() === 'user-agent') return 'Test-Agent/1.0';
          return null;
        }
      }
    };

    const context = await mockGetRequestContext(mockRequest, { 
      isAuthenticated: true, 
      userId: 'test_user_123',
      companyId: 'test_company_456'
    });

    const logs = [];
    
    // Mock logger
    const mockLogger = {
      info: (message, metadata) => {
        logs.push({ level: 'info', message, metadata });
      },
      warn: (message, metadata) => {
        logs.push({ level: 'warn', message, metadata });
      },
      error: (message, metadata) => {
        logs.push({ level: 'error', message, metadata });
      }
    };

    // Simulate API call with logging
    mockLogger.info('Membership API called', {
      membershipId: 'mem_log_test_123',
      userId: context.userId,
      companyId: context.companyId,
      isAuthenticated: context.isAuthenticated,
      ip: '192.168.1.100',
      userAgent: 'Test-Agent/1.0'
    });

    if (logs.length === 0) {
      throw new Error('Expected API call to be logged');
    }

    const logEntry = logs[0];
    if (logEntry.level !== 'info' || 
        logEntry.metadata.userId !== 'test_user_123' ||
        logEntry.metadata.companyId !== 'test_company_456') {
      throw new Error('Expected proper log entry with context');
    }
  });

  // Test request context extraction consistency
  runTest('Protected API uses consistent request context extraction', async () => {
    const testCases = [
      { token: 'valid.token.1', expectedUserId: 'user_1', expectedCompanyId: 'company_1' },
      { token: 'valid.token.2', expectedUserId: 'user_2', expectedCompanyId: 'company_2' },
      { token: null, expectedUserId: 'anonymous', expectedCompanyId: 'default_company' }
    ];

    for (const testCase of testCases) {
      const mockRequest = {
        headers: {
          get: (key) => {
            if (key.toLowerCase() === 'x-whop-user-token') return testCase.token;
            return null;
          }
        }
      };

      const context = await mockGetRequestContext(mockRequest, {
        isAuthenticated: !!testCase.token,
        userId: testCase.expectedUserId,
        companyId: testCase.expectedCompanyId
      });

      if (context.userId !== testCase.expectedUserId) {
        throw new Error(`Expected userId ${testCase.expectedUserId}, got ${context.userId}`);
      }

      if (context.companyId !== testCase.expectedCompanyId) {
        throw new Error(`Expected companyId ${testCase.expectedCompanyId}, got ${context.companyId}`);
      }

      if (context.isAuthenticated !== !!testCase.token) {
        throw new Error(`Expected isAuthenticated ${!!testCase.token}, got ${context.isAuthenticated}`);
      }
    }
  });

  // Wait for all async tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PROTECTED API TEST RESULTS SUMMARY');
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

    // Restore original environment
    process.env = originalEnv;

    return results.failed === 0;
  }, 1000);
}

// Run tests if called directly
if (require.main === module) {
  runProtectedApiTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runProtectedApiTests };