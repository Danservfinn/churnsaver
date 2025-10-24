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

  // Test required claims validation
  runTest('verifyWhopTokenSDK rejects JWT missing required app_id claim', async () => {
    const payloadWithoutAppId = { ...validPayload };
    delete payloadWithoutAppId.app_id;
    const tokenWithoutAppId = createTestJWT(payloadWithoutAppId);
    const result = await verifyWhopTokenSDK(tokenWithoutAppId);
    if (result) {
      throw new Error('Expected null for JWT missing app_id claim');
    }
  });

  runTest('verifyWhopTokenSDK rejects JWT missing required user_id claim', async () => {
    const payloadWithoutUserId = { ...validPayload };
    delete payloadWithoutUserId.user_id;
    const tokenWithoutUserId = createTestJWT(payloadWithoutUserId);
    const result = await verifyWhopTokenSDK(tokenWithoutUserId);
    if (result) {
      throw new Error('Expected null for JWT missing user_id claim');
    }
  });

  runTest('verifyWhopTokenSDK validates app_id matches expected value', async () => {
    const payloadWithWrongAppId = { ...validPayload, app_id: 'wrong_app_id' };
    const tokenWithWrongAppId = createTestJWT(payloadWithWrongAppId);
    const result = await verifyWhopTokenSDK(tokenWithWrongAppId);
    if (result) {
      throw new Error('Expected null for JWT with wrong app_id');
    }
  });

  runTest('verifyWhopTokenSDK validates user_id format', async () => {
    const payloadWithEmptyUserId = { ...validPayload, user_id: '' };
    const tokenWithEmptyUserId = createTestJWT(payloadWithEmptyUserId);
    const result = await verifyWhopTokenSDK(tokenWithEmptyUserId);
    if (result) {
      throw new Error('Expected null for JWT with empty user_id');
    }
  });

  runTest('verifyWhopTokenSDK validates company_id format when present', async () => {
    const payloadWithEmptyCompanyId = { ...validPayload, company_id: '' };
    const tokenWithEmptyCompanyId = createTestJWT(payloadWithEmptyCompanyId);
    const result = await verifyWhopTokenSDK(tokenWithEmptyCompanyId);
    if (result) {
      throw new Error('Expected null for JWT with empty company_id');
    }
  });

  // Test expiration and timing validation
  runTest('verifyWhopTokenSDK rejects JWT with missing exp claim', async () => {
    const payloadWithoutExp = { ...validPayload };
    delete payloadWithoutExp.exp;
    const tokenWithoutExp = createTestJWT(payloadWithoutExp);
    const result = await verifyWhopTokenSDK(tokenWithoutExp);
    if (result) {
      throw new Error('Expected null for JWT missing exp claim');
    }
  });

  runTest('verifyWhopTokenSDK rejects JWT with iat in future', async () => {
    const futureIat = Math.floor(Date.now() / 1000) + 400; // 400 seconds in future
    const payloadWithFutureIat = { ...validPayload, iat: futureIat };
    const tokenWithFutureIat = createTestJWT(payloadWithFutureIat);
    const result = await verifyWhopTokenSDK(tokenWithFutureIat);
    if (result) {
      throw new Error('Expected null for JWT with iat in future');
    }
  });

  runTest('verifyWhopTokenSDK accepts JWT with iat within skew tolerance', async () => {
    const acceptableFutureIat = Math.floor(Date.now() / 1000) + 200; // 200 seconds in future (within 300s tolerance)
    const payloadWithAcceptableIat = { ...validPayload, iat: acceptableFutureIat };
    const tokenWithAcceptableIat = createTestJWT(payloadWithAcceptableIat);
    const result = await verifyWhopTokenSDK(tokenWithAcceptableIat);
    if (!result) {
      throw new Error('Expected valid result for JWT with iat within skew tolerance');
    }
  });

  // Test algorithm validation
  runTest('verifyWhopTokenSDK rejects JWT with wrong algorithm', async () => {
    // Create JWT with HS512 instead of HS256
    const headerHS512 = { alg: 'HS512', typ: 'JWT' };
    const encodedHeaderHS512 = Buffer.from(JSON.stringify(headerHS512)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(validPayload)).toString('base64url');
    const signatureHS512 = crypto.createHmac('sha512', process.env.WHOP_APP_SECRET)
      .update(`${encodedHeaderHS512}.${encodedPayload}`)
      .digest('base64url');
    const tokenHS512 = `${encodedHeaderHS512}.${encodedPayload}.${signatureHS512}`;

    const result = await verifyWhopTokenSDK(tokenHS512);
    if (result) {
      throw new Error('Expected null for JWT with wrong algorithm');
    }
  });

  // Test company_id resolution logic
  runTest('verifyWhopTokenSDK uses company_id when present', async () => {
    const payloadWithCompanyId = { ...validPayload, company_id: 'custom_company_id' };
    const tokenWithCompanyId = createTestJWT(payloadWithCompanyId);
    const result = await verifyWhopTokenSDK(tokenWithCompanyId);
    if (!result || result.companyId !== 'custom_company_id') {
      throw new Error('Expected companyId to be custom_company_id when present in token');
    }
  });

  runTest('verifyWhopTokenSDK falls back to app_id when company_id missing', async () => {
    const payloadWithoutCompanyId = { ...validPayload };
    delete payloadWithoutCompanyId.company_id;
    const tokenWithoutCompanyId = createTestJWT(payloadWithoutCompanyId);
    const result = await verifyWhopTokenSDK(tokenWithoutCompanyId);
    if (!result || result.companyId !== process.env.WHOP_APP_ID) {
      throw new Error('Expected companyId to fall back to app_id when company_id missing');
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

  // Legacy fallback tests
  runTest('verifyWhopTokenHybrid prefers SDK when both methods would work', async () => {
    const result = await verifyWhopTokenHybrid(validToken);
    if (!result || !result.isAuthenticated) {
      throw new Error('Expected SDK method to succeed');
    }
  });

  runTest('verifyWhopTokenHybrid falls back to legacy when SDK fails', async () => {
    // Create a token that fails SDK validation but passes legacy
    const legacyOnlyPayload = { ...validPayload };
    delete legacyOnlyPayload.iss; // Remove JWT-specific claim
    delete legacyOnlyPayload.aud; // Remove JWT-specific claim
    const legacyToken = createTestJWT(legacyOnlyPayload);

    const result = await verifyWhopTokenHybrid(legacyToken);
    if (!result || !result.isAuthenticated) {
      throw new Error('Expected fallback to legacy verification');
    }
  });

  runTest('verifyWhopTokenHybrid returns null when both methods fail', async () => {
    const result = await verifyWhopTokenHybrid('completely.invalid.token');
    if (result) {
      throw new Error('Expected null when both verification methods fail');
    }
  });

  // Test error handling and security logging
  runTest('verifyWhopTokenSDK handles malformed JWT headers gracefully', async () => {
    const malformedHeaderToken = `invalid.header.${validToken.split('.')[2]}`;
    const result = await verifyWhopTokenSDK(malformedHeaderToken);
    if (result) {
      throw new Error('Expected null for malformed JWT header');
    }
  });

  runTest('verifyWhopTokenSDK handles tokens with excessive length', async () => {
    const longToken = 'a'.repeat(10000) + '.' + 'b'.repeat(10000) + '.' + 'c'.repeat(10000);
    const result = await verifyWhopTokenSDK(longToken);
    if (result) {
      throw new Error('Expected null for excessively long token');
    }
  });

  // Test timing and performance
  runTest('verifyWhopTokenSDK processes tokens within reasonable time', async () => {
    const startTime = Date.now();
    const result = await verifyWhopTokenSDK(validToken);
    const duration = Date.now() - startTime;
    if (!result) {
      throw new Error('Expected valid token verification');
    }
    if (duration > 1000) { // Should complete within 1 second
      throw new Error(`Token verification took too long: ${duration}ms`);
    }
  });

  // Test multi-tenant company resolution
  runTest('verifyWhopTokenSDK handles multi-tenant company resolution', async () => {
    // Test with different company_id values
    const testCases = [
      { company_id: 'company_a', expected: 'company_a' },
      { company_id: 'company_b', expected: 'company_b' },
      { company_id: undefined, expected: process.env.WHOP_APP_ID }
    ];

    for (const testCase of testCases) {
      const payload = { ...validPayload, company_id: testCase.company_id };
      const token = createTestJWT(payload);
      const result = await verifyWhopTokenSDK(token);
      if (!result || result.companyId !== testCase.expected) {
        throw new Error(`Expected companyId ${testCase.expected}, got ${result?.companyId}`);
      }
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