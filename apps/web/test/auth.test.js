#!/usr/bin/env node

// Unit tests for JWT verification (issuer, audience, exp) and failure paths
// Tests authentication security for production readiness

const crypto = require('crypto');
const { jwtVerify } = require('jose');

// Mock environment variables for testing
const originalEnv = process.env;
process.env.WHOP_APP_ID = 'test_app_id';
process.env.WHOP_APP_SECRET = 'test_app_secret';

// Import functions to test (copy them here for isolation)
function verifyWhopTokenSDK(token) {
  try {
    if (!token) {
      return null;
    }

    // Basic JWT format validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Create symmetric key for token verification
    const symmetricKey = new TextEncoder().encode(process.env.WHOP_APP_SECRET);

    // Verify JWT using jose library with symmetric key
    const verifyResult = jwtVerify(token, symmetricKey, {
      issuer: process.env.WHOP_APP_ID, // Expected issuer
      audience: process.env.WHOP_APP_ID, // Expected audience
    });

    return verifyResult.then(result => {
      const payload = result.payload;

      // Additional validation
      if (!payload.user_id) {
        return null;
      }

      // For multi-tenant: use company_id if present, otherwise fall back to app_id
      const companyId = payload.company_id || payload.app_id || process.env.WHOP_APP_ID;

      return {
        companyId,
        userId: payload.user_id,
        isAuthenticated: true,
        tokenPayload: payload,
      };
    }).catch(() => null);
  } catch (error) {
    return null;
  }
}

function verifyWhopTokenLegacy(token) {
  try {
    // Whop tokens are typically JWT-like with HMAC signature
    if (!token) {
      return null;
    }

    // Basic format check (should be JWT-like)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Legacy implementation with manual HMAC verification
    const { createHmac } = require('crypto');
    const [header, payload, signature] = parts;

    // Verify signature
    const expectedSignature = createHmac('sha256', process.env.WHOP_APP_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return null;
    }

    // Decode payload (base64url to JSON)
    const decodedPayload = Buffer.from(payload, 'base64url').toString('utf-8');
    const tokenData = JSON.parse(decodedPayload);

    // Check expiration
    if (tokenData.exp && tokenData.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (!tokenData.user_id) {
      return null;
    }

    // For multi-tenant: use company_id if present, otherwise fall back to app_id
    const companyId = tokenData.company_id || tokenData.app_id || process.env.WHOP_APP_ID;

    return {
      companyId,
      userId: tokenData.user_id,
      isAuthenticated: true,
      tokenPayload: tokenData,
    };

  } catch (error) {
    return null;
  }
}

async function verifyWhopTokenHybrid(token) {
  // Try SDK verification first (proper JWT)
  const sdkResult = await verifyWhopTokenSDK(token);
  if (sdkResult) {
    return sdkResult;
  }

  // Fallback to legacy verification
  const legacyResult = verifyWhopTokenLegacy(token);
  if (legacyResult) {
    return legacyResult;
  }

  return null;
}

// Helper function to create test JWTs
function createTestJWT(payload, secret = process.env.WHOP_APP_SECRET) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto.createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function runAuthTests() {
  console.log('🔐 Starting JWT Authentication Test Suite\n');
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
        // Handle async tests
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

  // Test data
  const validPayload = {
    app_id: process.env.WHOP_APP_ID,
    user_id: 'test_user_123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iss: process.env.WHOP_APP_ID,
    aud: process.env.WHOP_APP_ID
  };

  const validToken = createTestJWT(validPayload);

  // SDK Verification Tests
  runTest('verifyWhopTokenSDK accepts valid JWT with correct issuer/audience', async () => {
    const result = await verifyWhopTokenSDK(validToken);
    if (!result || !result.isAuthenticated || result.userId !== 'test_user_123') {
      throw new Error('Expected valid authentication result');
    }
  });

  runTest('verifyWhopTokenSDK rejects JWT with wrong issuer', async () => {
    const wrongIssuerPayload = { ...validPayload, iss: 'wrong_issuer' };
    const wrongToken = createTestJWT(wrongIssuerPayload);
    const result = await verifyWhopTokenSDK(wrongToken);
    if (result) {
      throw new Error('Expected null for wrong issuer');
    }
  });

  runTest('verifyWhopTokenSDK rejects JWT with wrong audience', async () => {
    const wrongAudiencePayload = { ...validPayload, aud: 'wrong_audience' };
    const wrongToken = createTestJWT(wrongAudiencePayload);
    const result = await verifyWhopTokenSDK(wrongToken);
    if (result) {
      throw new Error('Expected null for wrong audience');
    }
  });

  runTest('verifyWhopTokenSDK rejects expired JWT', async () => {
    const expiredPayload = { ...validPayload, exp: Math.floor(Date.now() / 1000) - 3600 };
    const expiredToken = createTestJWT(expiredPayload);
    const result = await verifyWhopTokenSDK(expiredToken);
    if (result) {
      throw new Error('Expected null for expired token');
    }
  });

  runTest('verifyWhopTokenSDK rejects JWT without user_id', async () => {
    const noUserPayload = { ...validPayload };
    delete noUserPayload.user_id;
    const noUserToken = createTestJWT(noUserPayload);
    const result = await verifyWhopTokenSDK(noUserToken);
    if (result) {
      throw new Error('Expected null for token without user_id');
    }
  });

  runTest('verifyWhopTokenSDK rejects malformed JWT (not 3 parts)', async () => {
    const result = await verifyWhopTokenSDK('invalid.jwt');
    if (result) {
      throw new Error('Expected null for malformed JWT');
    }
  });

  runTest('verifyWhopTokenSDK rejects empty token', async () => {
    const result = await verifyWhopTokenSDK('');
    if (result) {
      throw new Error('Expected null for empty token');
    }
  });

  runTest('verifyWhopTokenSDK rejects null token', async () => {
    const result = await verifyWhopTokenSDK(null);
    if (result) {
      throw new Error('Expected null for null token');
    }
  });

  // Legacy Verification Tests
  runTest('verifyWhopTokenLegacy accepts valid JWT', () => {
    const result = verifyWhopTokenLegacy(validToken);
    if (!result || !result.isAuthenticated || result.userId !== 'test_user_123') {
      throw new Error('Expected valid authentication result');
    }
  });

  runTest('verifyWhopTokenLegacy rejects expired JWT', () => {
    const expiredPayload = { ...validPayload, exp: Math.floor(Date.now() / 1000) - 3600 };
    const expiredToken = createTestJWT(expiredPayload);
    const result = verifyWhopTokenLegacy(expiredToken);
    if (result) {
      throw new Error('Expected null for expired token');
    }
  });

  runTest('verifyWhopTokenLegacy rejects JWT with wrong signature', () => {
    const wrongSecretToken = createTestJWT(validPayload, 'wrong_secret');
    const result = verifyWhopTokenLegacy(wrongSecretToken);
    if (result) {
      throw new Error('Expected null for wrong signature');
    }
  });

  runTest('verifyWhopTokenLegacy rejects JWT without user_id', () => {
    const noUserPayload = { ...validPayload };
    delete noUserPayload.user_id;
    const noUserToken = createTestJWT(noUserPayload);
    const result = verifyWhopTokenLegacy(noUserToken);
    if (result) {
      throw new Error('Expected null for token without user_id');
    }
  });

  runTest('verifyWhopTokenLegacy rejects malformed JWT', () => {
    const result = verifyWhopTokenLegacy('invalid.jwt');
    if (result) {
      throw new Error('Expected null for malformed JWT');
    }
  });

  // Hybrid Verification Tests
  runTest('verifyWhopTokenHybrid prefers SDK verification when valid', async () => {
    const result = await verifyWhopTokenHybrid(validToken);
    if (!result || !result.isAuthenticated || result.userId !== 'test_user_123') {
      throw new Error('Expected valid authentication result');
    }
  });

  runTest('verifyWhopTokenHybrid falls back to legacy when SDK fails', async () => {
    // Create a token that would fail SDK but pass legacy
    const legacyOnlyPayload = { ...validPayload };
    // Remove JWT-specific fields that SDK expects
    delete legacyOnlyPayload.iss;
    delete legacyOnlyPayload.aud;
    const legacyToken = createTestJWT(legacyOnlyPayload);

    const result = await verifyWhopTokenHybrid(legacyToken);
    if (!result || !result.isAuthenticated) {
      throw new Error('Expected fallback to legacy verification');
    }
  });

  runTest('verifyWhopTokenHybrid rejects when both methods fail', async () => {
    const result = await verifyWhopTokenHybrid('completely.invalid.token');
    if (result) {
      throw new Error('Expected null when both verification methods fail');
    }
  });

  // Wait for all async tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUTHENTICATION TEST RESULTS SUMMARY');
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

    process.exit(results.failed === 0 ? 0 : 1);
  }, 1000); // Give async tests time to complete
}

// Run tests if called directly
if (require.main === module) {
  runAuthTests();
}

module.exports = { runAuthTests };