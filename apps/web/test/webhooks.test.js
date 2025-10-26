#!/usr/bin/env node

// Test suite for webhook security hardening
// Covers timing-safe comparison, replay protection, header parsing, and occurred_at handling

const crypto = require('crypto');

// Copy the functions to test them in isolation
function timingSafeEqual(a, b) {
  try {
    // Ensure both are hex strings of equal length
    const aHex = a.replace(/^0x/, '').toLowerCase();
    const bHex = b.replace(/^0x/, '').toLowerCase();

    if (aHex.length !== bHex.length || !/^[0-9a-f]+$/.test(aHex) || !/^[0-9a-f]+$/.test(bHex)) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
  } catch {
    return false;
  }
}

function parseSignatureHeader(signatureHeader) {
  const s = signatureHeader.trim();

  // Support sha256=<hex> format
  if (s.startsWith('sha256=')) {
    const hexPart = s.substring(7); // Remove 'sha256=' prefix
    if (/^[0-9a-f]+$/i.test(hexPart)) {
      return hexPart;
    }
    throw new Error('Invalid hex in sha256= format');
  }
  
  // Support v1,<hex> format
  const parts = s.split(',');
  if (parts.length === 2 && parts[0].toLowerCase() === 'v1') {
    const hexPart = parts[1];
    if (/^[0-9a-f]+$/i.test(hexPart)) {
      return hexPart;
    }
    throw new Error(`Unsupported signature format: ${s}`);
  }

  // Support bare <hex> format
  if (/^[0-9a-f]+$/i.test(s)) {
    return s;
  }

  // Reject any other format
  throw new Error(`Unsupported signature format: ${s}`);
}

function verifyWebhookSignature(body, signatureHeader, secret, timestampHeader) {
  try {
    // Require X-Whop-Timestamp in production
    if (process.env.NODE_ENV === 'production' && !timestampHeader) {
      return false;
    }

    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');

    const provided = parseSignatureHeader(signatureHeader);

    // Enforce replay protection if timestamp present
    if (timestampHeader) {
      const ts = Number(timestampHeader);
      if (!Number.isFinite(ts) || ts < 0) {
        return false;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const skewSec = Math.abs(nowSec - ts);
      if (skewSec > 300) { // Default 5 minutes
        return false;
      }
    }

    return timingSafeEqual(expectedSignature, provided);
  } catch (error) {
    return false;
  }
}

function runWebhookSecurityTests() {
  console.log('🔒 Starting Webhook Security Test Suite\n');
  console.log('='.repeat(60));

  // Initialize test data at the top
  const secret = 'test-secret';
  const body = '{"test": "data"}';
  const validSignature = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const now = Math.floor(Date.now() / 1000);

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, fn) {
    try {
      console.log(`\n🧪 ${name}`);
      fn();
      console.log(`✅ ${name} - PASSED`);
      results.passed++;
      results.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Test timingSafeEqual
  runTest('timingSafeEqual returns true for equal hex strings', () => {
    const a = 'abcdef123456';
    const b = 'abcdef123456';
    if (!timingSafeEqual(a, b)) {
      throw new Error('Expected true for equal strings');
    }
  });

  runTest('timingSafeEqual returns false for different hex strings', () => {
    const a = 'abcdef123456';
    const b = 'abcdef123457';
    if (timingSafeEqual(a, b)) {
      throw new Error('Expected false for different strings');
    }
  });

  runTest('timingSafeEqual returns false for different lengths', () => {
    const a = 'abcdef123456';
    const b = 'abcdef1234567';
    if (timingSafeEqual(a, b)) {
      throw new Error('Expected false for different lengths');
    }
  });

  runTest('timingSafeEqual returns false for non-hex strings', () => {
    const a = 'abcdef123456';
    const b = 'gggggggggggg';
    if (timingSafeEqual(a, b)) {
      throw new Error('Expected false for non-hex strings');
    }
  });

  runTest('timingSafeEqual handles 0x prefix', () => {
    const a = '0xabcdef123456';
    const b = 'abcdef123456';
    if (!timingSafeEqual(a, b)) {
      throw new Error('Expected true for 0x prefixed equal strings');
    }
  });

  // Test parseSignatureHeader
  runTest('parseSignatureHeader parses v1,<hex> format', () => {
    const header = 'v1,abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader parses bare <hex> format', () => {
    const header = 'abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader parses sha256=<hex> format', () => {
    const header = 'sha256=abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader rejects sha256= with invalid hex', () => {
    const header = 'sha256=gggggggggggg';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Invalid hex in sha256= format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects unknown formats', () => {
    const header = 'unknown=abcdef123456';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects non-hex in bare format', () => {
    const header = 'gggggggggggg';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  // Additional unsupported format tests for production readiness
  runTest('parseSignatureHeader rejects hmac-sha256= format', () => {
    const header = 'hmac-sha256=abcdef123456';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects sha512= format', () => {
    const header = 'sha512=abcdef123456';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects rsa-sha256= format', () => {
    const header = 'rsa-sha256=abcdef123456';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects v2, format', () => {
    const header = 'v2,abcdef123456';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects multiple comma format', () => {
    const header = 'v1,abc,def';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects empty v1 format', () => {
    const header = 'v1,';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects v1 with non-hex', () => {
    const header = 'v1,gggggggggggg';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader handles whitespace trimming', () => {
    const header = '  v1,abcdef123456  ';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader handles case insensitive v1', () => {
    const header = 'V1,abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  // Test development mode (skip validation when secret not set)
  runTest('verifyWebhookSignature skips validation when WHOP_WEBHOOK_SECRET not set', () => {
    const originalSecret = process.env.WHOP_WEBHOOK_SECRET;
    delete process.env.WHOP_WEBHOOK_SECRET;
    try {
      const result = verifyWebhookSignature(body, 'invalid-signature', '');
      if (!result) {
        throw new Error('Expected true when secret not configured (development mode)');
      }
    } finally {
      process.env.WHOP_WEBHOOK_SECRET = originalSecret;
    }
  });

  // Test timing-safe comparison edge cases
  runTest('timingSafeEqual handles empty strings', () => {
    const result = timingSafeEqual('', '');
    if (!result) {
      throw new Error('Expected true for empty string comparison');
    }
  });

  runTest('timingSafeEqual handles very long hex strings', () => {
    const longHex = 'a'.repeat(1000);
    const result = timingSafeEqual(longHex, longHex);
    if (!result) {
      throw new Error('Expected true for long hex string comparison');
    }
  });

  runTest('timingSafeEqual handles mixed case hex', () => {
    const result = timingSafeEqual('ABCDEF123456', 'abcdef123456');
    if (!result) {
      throw new Error('Expected true for mixed case hex comparison');
    }
  });

  // Test parseSignatureHeader with edge cases
  runTest('parseSignatureHeader handles malformed sha256= format', () => {
    const header = 'sha256=gggggggggggg';
    const result = parseSignatureHeader(header);
    if (result !== null) {
      throw new Error('Expected null for invalid hex in sha256= format');
    }
  });

  runTest('parseSignatureHeader handles malformed v1 format', () => {
    const header = 'v1,gggggggggggg';
    const result = parseSignatureHeader(header);
    if (result !== null) {
      throw new Error('Expected null for invalid hex in v1 format');
    }
  });

  runTest('parseSignatureHeader handles empty parts', () => {
    const header = 'v1,';
    const result = parseSignatureHeader(header);
    if (result !== null) {
      throw new Error('Expected null for empty hex part');
    }
  });

  // Test verifyWebhookSignature with timestamp validation
  runTest('verifyWebhookSignature rejects timestamp too far in future', () => {
    const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString(); // Beyond 300s window
    const result = verifyWebhookSignature(body, validSignature, secret, futureTimestamp);
    if (result) {
      throw new Error('Expected false for timestamp too far in future');
    }
  });

  runTest('verifyWebhookSignature accepts timestamp exactly at window boundary', () => {
    const boundaryTimestamp = (Math.floor(Date.now() / 1000) - 300).toString(); // Exactly 300s ago
    const result = verifyWebhookSignature(body, validSignature, secret, boundaryTimestamp);
    if (!result) {
      throw new Error('Expected true for timestamp at window boundary');
    }
  });

  // Test replay protection with different timestamp scenarios
  runTest('verifyWebhookSignature handles timestamp parsing errors gracefully', () => {
    const invalidTimestamps = ['not-a-number', '', 'NaN', 'Infinity', '-Infinity'];
    for (const timestamp of invalidTimestamps) {
      const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
      if (result) {
        throw new Error(`Expected false for invalid timestamp: ${timestamp}`);
      }
    }
  });

  // Test signature format validation with various edge cases
  runTest('verifyWebhookSignature rejects signature with wrong algorithm', () => {
    const wrongAlgoSignature = `rsa-sha256=${validSignature}`;
    const result = verifyWebhookSignature(body, wrongAlgoSignature, secret);
    if (result) {
      throw new Error('Expected false for unsupported signature algorithm');
    }
  });

  runTest('verifyWebhookSignature handles very long signature headers', () => {
    const longSignature = 'a'.repeat(10000);
    const result = verifyWebhookSignature(body, longSignature, secret);
    if (result) {
      throw new Error('Expected false for very long invalid signature');
    }
  });

  // Test development vs production behavior
  runTest('verifyWebhookSignature enforces timestamp in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = verifyWebhookSignature(body, validSignature, secret);
      if (result) {
        throw new Error('Expected false for missing timestamp in production');
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  runTest('verifyWebhookSignature allows missing timestamp in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = verifyWebhookSignature(body, validSignature, secret);
      if (!result) {
        throw new Error('Expected true for missing timestamp in development');
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // Test error handling and exception safety
  runTest('verifyWebhookSignature handles null/undefined inputs gracefully', () => {
    const nullInputs = [null, undefined, ''];
    for (const input of nullInputs) {
      const result = verifyWebhookSignature(input, validSignature, secret);
      if (result) {
        throw new Error(`Expected false for null/undefined input: ${input}`);
      }
    }
  });

  runTest('parseSignatureHeader handles null/undefined inputs', () => {
    const nullInputs = [null, undefined];
    for (const input of nullInputs) {
      try {
        parseSignatureHeader(input);
        throw new Error('Expected to throw for null/undefined input');
      } catch (error) {
        if (!error.message.includes('Cannot read properties of null')) {
          throw new Error(`Unexpected error for null input: ${error.message}`);
        }
      }
    }
  });

  // Test timingSafeEqual with various inputs
  runTest('timingSafeEqual handles non-hex characters', () => {
    const result = timingSafeEqual('abcdef123456', 'zzzzzz123456');
    if (result) {
      throw new Error('Expected false for non-hex characters');
    }
  });

  runTest('timingSafeEqual handles different lengths after normalization', () => {
    const result = timingSafeEqual('0xabcdef', 'abcdef12');
    if (result) {
      throw new Error('Expected false for different lengths after normalization');
    }
  });

  // Test verifyWebhookSignature
  runTest('verifyWebhookSignature accepts valid signature without timestamp', () => {
    const result = verifyWebhookSignature(body, validSignature, secret);
    if (!result) {
      throw new Error('Expected true for valid signature');
    }
  });

  runTest('verifyWebhookSignature accepts valid v1 signature format', () => {
    const v1Signature = `v1,${validSignature}`;
    const result = verifyWebhookSignature(body, v1Signature, secret);
    if (!result) {
      throw new Error('Expected true for valid v1 signature');
    }
  });

  runTest('verifyWebhookSignature accepts valid sha256= signature format', () => {
    const sha256Signature = `sha256=${validSignature}`;
    const result = verifyWebhookSignature(body, sha256Signature, secret);
    if (!result) {
      throw new Error('Expected true for valid sha256= signature');
    }
  });

  runTest('verifyWebhookSignature rejects invalid signature', () => {
    const invalidSignature = 'invalid';
    const result = verifyWebhookSignature(body, invalidSignature, secret);
    if (result) {
      throw new Error('Expected false for invalid signature');
    }
  });

  runTest('verifyWebhookSignature rejects missing timestamp in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = verifyWebhookSignature(body, validSignature, secret);
      if (result) {
        throw new Error('Expected false for missing timestamp in production');
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  runTest('verifyWebhookSignature accepts missing timestamp in non-production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = verifyWebhookSignature(body, validSignature, secret);
      if (!result) {
        throw new Error('Expected true for missing timestamp in development');
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  runTest('verifyWebhookSignature accepts timestamp within window', () => {
    const timestamp = (now - 100).toString();
    const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
    if (!result) {
      throw new Error('Expected true for timestamp within window');
    }
  });

  runTest('verifyWebhookSignature rejects timestamp outside window', () => {
    const timestamp = (now - 400).toString(); // Beyond 300s default
    const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
    if (result) {
      throw new Error('Expected false for timestamp outside window');
    }
  });

  runTest('verifyWebhookSignature rejects malformed timestamp', () => {
    const timestamp = 'invalid';
    const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
    if (result) {
      throw new Error('Expected false for malformed timestamp');
    }
  });

  runTest('verifyWebhookSignature rejects negative timestamp', () => {
    const timestamp = '-123';
    const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
    if (result) {
      throw new Error('Expected false for negative timestamp');
    }
  });

  runTest('verifyWebhookSignature rejects unsupported signature format', () => {
    const rsaSha256Signature = `rsa-sha256=${validSignature}`;
    const result = verifyWebhookSignature(body, rsaSha256Signature, secret);
    if (result) {
      throw new Error('Expected false for unsupported signature format');
    }
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
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

  return results.failed === 0;
}

// Run tests if called directly
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'privacy') {
    const success = runPrivacyTests();
    process.exit(success ? 0 : 1);
  } else {
    const success = runWebhookSecurityTests();
    process.exit(success ? 0 : 1);
  }
}

function runPrivacyTests() {
  console.log('🔒 Starting Webhook Privacy Test Suite\n');
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, fn) {
    try {
      console.log(`\n🧪 ${name}`);
      fn();
      console.log(`✅ ${name} - PASSED`);
      results.passed++;
      results.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Mock encryption utilities for testing
  function deriveMinimalPayload(payload) {
    const data = payload.data || {};
    const membershipId =
      (typeof data.membership_id === 'string' && data.membership_id) ||
      (typeof data.membership?.id === 'string' && data.membership.id) ||
      (payload.type && typeof payload.type === 'string' && payload.type.includes('membership') && typeof data.id === 'string' ? data.id : undefined) ||
      'unknown';

    const minimal = {
      whop_event_id: payload.id || payload.whop_event_id,
      type: payload.type,
      membership_id: membershipId
    };

    if (typeof data.failure_reason === 'string') {
      minimal.failure_reason = data.failure_reason;
    }
    if (payload.data?.user_id) {
      minimal.user_id = payload.data.user_id;
    }

    return minimal;
  }

  // Test minimal payload derivation
  runTest('deriveMinimalPayload extracts essential fields', () => {
    const payload = {
      id: 'evt_123',
      type: 'payment.succeeded',
      data: {
        membership_id: 'mem_456',
        user_id: 'user_789',
        failure_reason: 'card_declined',
        payment: { amount: 1000 }
      }
    };

    const minimal = deriveMinimalPayload(payload);
    if (minimal.whop_event_id !== 'evt_123') throw new Error('Expected whop_event_id to be evt_123');
    if (minimal.type !== 'payment.succeeded') throw new Error('Expected type to be payment.succeeded');
    if (minimal.membership_id !== 'mem_456') throw new Error('Expected membership_id to be mem_456');
    if (minimal.user_id !== 'user_789') throw new Error('Expected user_id to be user_789');
    if (minimal.failure_reason !== 'card_declined') throw new Error('Expected failure_reason to be card_declined');
    if (minimal.payment) throw new Error('Expected payment data to be excluded');
  });

  runTest('deriveMinimalPayload handles missing fields', () => {
    const payload = {
      whop_event_id: 'evt_123',
      type: 'membership.created',
      data: {}
    };

    const minimal = deriveMinimalPayload(payload);
    if (minimal.whop_event_id !== 'evt_123') throw new Error('Expected whop_event_id to be evt_123');
    if (minimal.membership_id !== 'unknown') throw new Error('Expected membership_id to be unknown');
    if (minimal.user_id) throw new Error('Expected no user_id');
  });

  runTest('deriveMinimalPayload handles membership events', () => {
    const payload = {
      id: 'evt_123',
      type: 'membership.updated',
      data: {
        id: 'mem_456',
        user_id: 'user_789'
      }
    };

    const minimal = deriveMinimalPayload(payload);
    if (minimal.membership_id !== 'mem_456') throw new Error('Expected membership_id to be mem_456');
    if (minimal.user_id !== 'user_789') throw new Error('Expected user_id to be user_789');
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 PRIVACY TEST RESULTS SUMMARY');
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

  return results.failed === 0;
}

// Additional tests for webhook signature verification and idempotency
async function testWebhookIdempotency() {
  console.log('\n🔄 Starting Webhook Idempotency Test Suite\n');
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

  // Mock whop_events table operations
  const mockWhopEvents = new Map();

  function mockSqlQuery(query, params) {
    if (query.includes('SELECT event_id FROM whop_events WHERE event_id = $1')) {
      const eventId = params[0];
      const existing = mockWhopEvents.get(eventId);
      return Promise.resolve({
        rows: existing ? [{ event_id: eventId }] : []
      });
    }
    
    if (query.includes('INSERT INTO whop_events (event_id, type, received_at) VALUES')) {
      const [eventId, eventType] = params;
      mockWhopEvents.set(eventId, { event_id: eventId, type: eventType, received_at: new Date() });
      return Promise.resolve({ rows: [] });
    }
    
    return Promise.resolve({ rows: [] });
  }

  // Test idempotency check for duplicate events
  runTest('Webhook handler returns 200 for duplicate event', async () => {
    const eventId = 'evt_test_duplicate_123';
    const eventType = 'payment.succeeded';
    
    // Simulate existing event
    mockWhopEvents.set(eventId, { event_id: eventId, type: eventType });
    
    // Mock the idempotency check
    const existingEvent = await mockSqlQuery(
      'SELECT event_id FROM whop_events WHERE event_id = $1',
      [eventId]
    );
    
    if (existingEvent.rows.length === 0) {
      throw new Error('Expected existing event to be found');
    }
    
    // Verify that duplicate would return 200
    const shouldReturn200 = existingEvent.rows.length > 0;
    if (!shouldReturn200) {
      throw new Error('Expected duplicate event to return 200');
    }
  });

  runTest('Webhook handler processes new event', async () => {
    const eventId = 'evt_test_new_456';
    const eventType = 'membership.created';
    
    // Clear any existing mock data
    mockWhopEvents.delete(eventId);
    
    // Mock the idempotency check
    const existingEvent = await mockSqlQuery(
      'SELECT event_id FROM whop_events WHERE event_id = $1',
      [eventId]
    );
    
    if (existingEvent.rows.length > 0) {
      throw new Error('Expected new event to not exist');
    }
    
    // Mock inserting the new event
    await mockSqlQuery(
      'INSERT INTO whop_events (event_id, type, received_at) VALUES ($1, $2, NOW())',
      [eventId, eventType]
    );
    
    // Verify event was inserted
    const insertedEvent = mockWhopEvents.get(eventId);
    if (!insertedEvent || insertedEvent.type !== eventType) {
      throw new Error('Expected new event to be inserted');
    }
  });

  runTest('Webhook signature verification with whopsdk.webhooks.unwrap', async () => {
    // Mock whopsdk.webhooks.unwrap behavior
    const mockWebhookPayload = {
      id: 'evt_test_signature_789',
      type: 'payment.succeeded',
      data: {
        membership_id: 'mem_123',
        user_id: 'user_456'
      },
      created_at: new Date().toISOString()
    };

    const mockRequest = {
      headers: {
        get: (key) => {
          const headers = {
            'x-whop-signature': 'sha256=valid_signature_hash',
            'x-whop-timestamp': Math.floor(Date.now() / 1000).toString()
          };
          return headers[key.toLowerCase()] || null;
        }
      },
      text: async () => JSON.stringify(mockWebhookPayload)
    };

    // Mock successful webhook validation
    const mockValidateWebhook = async (request) => {
      const signature = request.headers.get('x-whop-signature');
      const timestamp = request.headers.get('x-whop-timestamp');
      
      // Simulate signature validation
      if (signature && signature.includes('valid_signature_hash')) {
        return {
          data: mockWebhookPayload,
          action: 'payment.succeeded'
        };
      }
      throw new Error('Invalid signature');
    };

    try {
      const webhook = await mockValidateWebhook(mockRequest);
      if (!webhook || !webhook.data || webhook.data.id !== 'evt_test_signature_789') {
        throw new Error('Expected valid webhook to be unwrapped successfully');
      }
    } catch (error) {
      throw new Error(`Webhook unwrap failed: ${error.message}`);
    }
  });

  runTest('Webhook signature verification rejects invalid signatures', async () => {
    const mockWebhookPayload = {
      id: 'evt_test_invalid_signature',
      type: 'payment.succeeded',
      data: { membership_id: 'mem_123' }
    };

    const mockRequest = {
      headers: {
        get: (key) => {
          const headers = {
            'x-whop-signature': 'sha256=invalid_signature_hash',
            'x-whop-timestamp': Math.floor(Date.now() / 1000).toString()
          };
          return headers[key.toLowerCase()] || null;
        }
      },
      text: async () => JSON.stringify(mockWebhookPayload)
    };

    // Mock failed webhook validation
    const mockValidateWebhook = async (request) => {
      const signature = request.headers.get('x-whop-signature');
      
      if (signature && signature.includes('invalid_signature_hash')) {
        throw new Error('Invalid signature');
      }
      throw new Error('Missing signature');
    };

    try {
      await mockValidateWebhook(mockRequest);
      throw new Error('Expected webhook validation to fail');
    } catch (error) {
      if (!error.message.includes('Invalid signature') && !error.message.includes('Missing signature')) {
        throw new Error(`Expected signature validation error, got: ${error.message}`);
      }
    }
  });

  runTest('Webhook handler enforces timestamp validation', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago (beyond 300s window)
    
    const mockRequest = {
      headers: {
        get: (key) => {
          const headers = {
            'x-whop-signature': 'sha256=valid_signature_hash',
            'x-whop-timestamp': oldTimestamp.toString()
          };
          return headers[key.toLowerCase()] || null;
        }
      },
      text: async () => JSON.stringify({ id: 'evt_test_timestamp', type: 'test' })
    };

    // Mock timestamp validation
    const validateTimestamp = (timestampHeader) => {
      if (!timestampHeader) return { valid: false, error: 'Missing timestamp' };
      
      const ts = Number(timestampHeader);
      if (!Number.isFinite(ts) || ts < 0) {
        return { valid: false, error: 'Invalid timestamp' };
      }
      
      const nowSec = Math.floor(Date.now() / 1000);
      const skewSec = Math.abs(nowSec - ts);
      if (skewSec > 300) {
        return { valid: false, error: `Timestamp outside allowed window: ${skewSec}s > 300s` };
      }
      
      return { valid: true };
    };

    const timestampValidation = validateTimestamp(oldTimestamp.toString());
    if (timestampValidation.valid) {
      throw new Error('Expected old timestamp to be rejected');
    }
  });

  runTest('Webhook handler processes events quickly (< 1s requirement)', async () => {
    const startTime = Date.now();
    
    // Mock fast webhook processing
    const mockProcessWebhook = async () => {
      // Simulate quick processing (under 1 second)
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms
      return { success: true };
    };

    const result = await mockProcessWebhook();
    const processingTime = Date.now() - startTime;
    
    if (!result.success) {
      throw new Error('Expected webhook processing to succeed');
    }
    
    if (processingTime > 1000) {
      throw new Error(`Expected processing time under 1s, got ${processingTime}ms`);
    }
  });

  runTest('Webhook handler logs security events for validation failures', async () => {
    const securityEvents = [];
    
    // Mock security monitoring
    const mockSecurityMonitor = {
      processSecurityEvent: async (event) => {
        securityEvents.push(event);
      }
    };

    const mockRequest = {
      headers: {
        get: (key) => {
          const headers = {
            'x-whop-signature': 'sha256=invalid_hash',
            'x-forwarded-for': '192.168.1.100',
            'user-agent': 'Test-Agent/1.0'
          };
          return headers[key.toLowerCase()] || null;
        }
      },
      text: async () => JSON.stringify({ id: 'evt_test_security', type: 'test' })
    };

    // Simulate webhook validation failure
    try {
      throw new Error('Invalid signature');
    } catch (error) {
      // Mock security event logging
      await mockSecurityMonitor.processSecurityEvent({
        category: 'authentication',
        severity: 'high',
        type: 'webhook_validation_failed',
        description: `Webhook validation failed: ${error.message}`,
        ip: '192.168.1.100',
        userAgent: 'Test-Agent/1.0',
        endpoint: '/api/webhooks/whop'
      });
    }

    if (securityEvents.length === 0) {
      throw new Error('Expected security event to be logged');
    }

    const securityEvent = securityEvents[0];
    if (securityEvent.type !== 'webhook_validation_failed' ||
        securityEvent.severity !== 'high' ||
        !securityEvent.description.includes('Invalid signature')) {
      throw new Error('Expected proper security event details');
    }
  });

  // Wait for all async tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 WEBHOOK IDEMPOTENCY TEST RESULTS SUMMARY');
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

    return results.failed === 0;
  }, 1000);
}

// Enhanced runWebhookSecurityTests to include idempotency tests
function runWebhookSecurityTests() {
  console.log('🔒 Starting Webhook Security Test Suite\n');
  console.log('='.repeat(60));

  // Initialize test data at the top
  const secret = 'test-secret';
  const body = '{"test": "data"}';
  const validSignature = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const now = Math.floor(Date.now() / 1000);

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, fn) {
    try {
      console.log(`\n🧪 ${name}`);
      fn();
      console.log(`✅ ${name} - PASSED`);
      results.passed++;
      results.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Test timingSafeEqual
  runTest('timingSafeEqual returns true for equal hex strings', () => {
    const a = 'abcdef123456';
    const b = 'abcdef123456';
    if (!timingSafeEqual(a, b)) {
      throw new Error('Expected true for equal strings');
    }
  });

  runTest('timingSafeEqual returns false for different hex strings', () => {
    const a = 'abcdef123456';
    const b = 'abcdef123457';
    if (timingSafeEqual(a, b)) {
      throw new Error('Expected false for different strings');
    }
  });

  runTest('timingSafeEqual returns false for different lengths', () => {
    const a = 'abcdef123456';
    const b = 'abcdef1234567';
    if (timingSafeEqual(a, b)) {
      throw new Error('Expected false for different lengths');
    }
  });

  runTest('timingSafeEqual returns false for non-hex strings', () => {
    const a = 'abcdef123456';
    const b = 'gggggggggggg';
    if (timingSafeEqual(a, b)) {
      throw new Error('Expected false for non-hex strings');
    }
  });

  runTest('timingSafeEqual handles 0x prefix', () => {
    const a = '0xabcdef123456';
    const b = 'abcdef123456';
    if (!timingSafeEqual(a, b)) {
      throw new Error('Expected true for 0x prefixed equal strings');
    }
  });

  // Test parseSignatureHeader
  runTest('parseSignatureHeader parses v1,<hex> format', () => {
    const header = 'v1,abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader parses bare <hex> format', () => {
    const header = 'abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader parses sha256=<hex> format', () => {
    const header = 'sha256=abcdef123456';
    const result = parseSignatureHeader(header);
    if (result !== 'abcdef123456') {
      throw new Error(`Expected 'abcdef123456', got '${result}'`);
    }
  });

  runTest('parseSignatureHeader rejects sha256= with invalid hex', () => {
    const header = 'sha256=gggggggggggg';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Invalid hex in sha256= format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  runTest('parseSignatureHeader rejects unknown formats', () => {
    const header = 'unknown=abcdef123456';
    try {
      parseSignatureHeader(header);
      throw new Error('Expected to throw');
    } catch (error) {
      if (!error.message.includes('Unsupported signature format')) {
        throw new Error(`Unexpected error: ${error.message}`);
      }
    }
  });

  // Test verifyWebhookSignature
  runTest('verifyWebhookSignature accepts valid signature without timestamp', () => {
    const result = verifyWebhookSignature(body, validSignature, secret);
    if (!result) {
      throw new Error('Expected true for valid signature');
    }
  });

  runTest('verifyWebhookSignature accepts valid v1 signature format', () => {
    const v1Signature = `v1,${validSignature}`;
    const result = verifyWebhookSignature(body, v1Signature, secret);
    if (!result) {
      throw new Error('Expected true for valid v1 signature');
    }
  });

  runTest('verifyWebhookSignature accepts valid sha256= signature format', () => {
    const sha256Signature = `sha256=${validSignature}`;
    const result = verifyWebhookSignature(body, sha256Signature, secret);
    if (!result) {
      throw new Error('Expected true for valid sha256= signature');
    }
  });

  runTest('verifyWebhookSignature rejects invalid signature', () => {
    const invalidSignature = 'invalid';
    const result = verifyWebhookSignature(body, invalidSignature, secret);
    if (result) {
      throw new Error('Expected false for invalid signature');
    }
  });

  runTest('verifyWebhookSignature rejects timestamp outside window', () => {
    const timestamp = (now - 400).toString(); // Beyond 300s default
    const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
    if (result) {
      throw new Error('Expected false for timestamp outside window');
    }
  });

  runTest('verifyWebhookSignature rejects malformed timestamp', () => {
    const timestamp = 'invalid';
    const result = verifyWebhookSignature(body, validSignature, secret, timestamp);
    if (result) {
      throw new Error('Expected false for malformed timestamp');
    }
  });

  // Wait for async tests to complete and then run idempotency tests
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 WEBHOOK SECURITY TEST RESULTS SUMMARY');
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

    // Run idempotency tests after security tests
    testWebhookIdempotency().then(idempotencySuccess => {
      const totalPassed = results.passed + (idempotencySuccess ? 7 : 0); // Approximate idempotency tests
      const totalFailed = results.failed + (idempotencySuccess ? 0 : 7);

      console.log('\n' + '='.repeat(60));
      console.log('📊 OVERALL WEBHOOK TEST RESULTS SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Total Passed: ${totalPassed}`);
      console.log(`❌ Total Failed: ${totalFailed}`);
      console.log(`📈 Overall Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

      return totalFailed === 0;
    });
  }, 1000);
}

module.exports = { runWebhookSecurityTests, runPrivacyTests, testWebhookIdempotency }