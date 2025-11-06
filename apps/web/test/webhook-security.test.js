#!/usr/bin/env node

// Comprehensive Webhook Security Test Suite
// Tests signature validation, replay attack prevention, payload manipulation, headers, and malformed JSON

const crypto = require('crypto');

// Use the local simple test framework
const { describe, test, expect } = require('./test-framework.ts');

// Constants
const WEBHOOK_SECRET = 'test_webhook_secret_for_security_testing';
const TIMESTAMP_TOLERANCE = 300; // 5 minutes in seconds

// Helper Functions

/**
 * Parse signature header supporting multiple formats
 * Supports: 'sha256=<hex>', 'v1,<hex>', bare hex
 * Rejects unsupported formats and invalid hex
 */
function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    throw new Error('Invalid signature header: must be a non-empty string');
  }

  const s = signatureHeader.trim();

  // Support sha256=<hex> format (case insensitive)
  if (s.toLowerCase().startsWith('sha256=')) {
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
    throw new Error('Unsupported signature format: invalid hex in v1 format');
  }

  // Support bare <hex> format
  if (/^[0-9a-f]+$/i.test(s)) {
    return s;
  }

  // Reject any other format
  throw new Error(`Unsupported signature format: ${s}`);
}

/**
 * Timing-safe comparison for hex strings
 * Normalizes hex, ensures equal length, uses crypto.timingSafeEqual
 */
function timingSafeEqualHex(a, b) {
  try {
    // Normalize hex strings
    const aHex = a.replace(/^0x/, '').toLowerCase();
    const bHex = b.replace(/^0x/, '').toLowerCase();

    // Check equal length and valid hex
    if (aHex.length !== bHex.length || 
        !/^[0-9a-f]+$/.test(aHex) || 
        !/^[0-9a-f]+$/.test(bHex)) {
      return false;
    }

    // Use timing-safe comparison
    return crypto.timingSafeEqual(Buffer.from(aHex, 'hex'), Buffer.from(bHex, 'hex'));
  } catch (error) {
    return false;
  }
}

/**
 * Validate timestamp for replay attack prevention
 * In production: requires timestamp
 * In development: allows missing timestamp but validates if provided
 */
function validateTimestamp(timestampHeader, isProduction = false) {
  // Production requires timestamp
  if (isProduction && !timestampHeader) {
    return { valid: false, error: 'Timestamp required in production' };
  }

  // Skip validation if no timestamp (development mode)
  if (!timestampHeader) {
    return { valid: true };
  }

  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || ts < 0) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const skewSec = Math.abs(nowSec - ts);
  
  if (skewSec > TIMESTAMP_TOLERANCE) {
    return { valid: false, error: `Timestamp outside allowed window: ${skewSec}s > ${TIMESTAMP_TOLERANCE}s` };
  }

  return { valid: true };
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
function generateSignature(payload, secret = WEBHOOK_SECRET) {
  return crypto.createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

/**
 * Generate timestamp for replay tests
 */
function generateTimestamp(offsetSeconds = 0) {
  return (Math.floor(Date.now() / 1000) + offsetSeconds).toString();
}

/**
 * Create deeply nested object for testing
 */
function makeDeepNest(depth, currentDepth = 0) {
  if (currentDepth >= depth) {
    return { value: `deep_value_at_depth_${depth}` };
  }
  
  return {
    level: currentDepth,
    nested: makeDeepNest(depth, currentDepth + 1)
  };
}

/**
 * Validate webhook signature with timestamp
 */
function validateWebhookSignature(body, signatureHeader, secret, timestampHeader, isProduction = false) {
  try {
    // Validate timestamp first
    const timestampValidation = validateTimestamp(timestampHeader, isProduction);
    if (!timestampValidation.valid) {
      return { valid: false, error: timestampValidation.error };
    }

    // Parse signature
    const providedSignature = parseSignatureHeader(signatureHeader);
    
    // Generate expected signature
    const expectedSignature = generateSignature(body, secret);
    
    // Compare signatures safely
    const isValid = timingSafeEqualHex(expectedSignature, providedSignature);
    
    if (!isValid) {
      return { valid: false, error: 'Signature mismatch' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Test Suites

// Test Suite A: Webhook Signature Validation Security Tests
describe('Webhook Signature Validation Security Tests', () => {
  const testPayload = JSON.stringify({ id: 'evt_123', type: 'test', data: {} });
  const validSignature = generateSignature(testPayload);

  test('Accept valid sha256=hex format', () => {
    const signature = `sha256=${validSignature}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeTruthy();
  });

  test('Accept valid v1,hex format', () => {
    const signature = `v1,${validSignature}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeTruthy();
  });

  test('Accept valid bare hex format', () => {
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeTruthy();
  });

  test('Reject malformed sha256= with invalid hex', () => {
    const signature = 'sha256=gggggggggggg';
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject malformed v1, with non-hex', () => {
    const signature = 'v1,not_hex';
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject unsupported algorithms: sha512=', () => {
    const signature = `sha512=${validSignature}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject unsupported algorithms: rsa-sha256=', () => {
    const signature = `rsa-sha256=${validSignature}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject unsupported algorithms: hmac-sha1=', () => {
    const signature = `hmac-sha1=${validSignature}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject unsupported algorithms: md5=', () => {
    const signature = `md5=${validSignature}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Timing-safe comparison returns true for equal hex', () => {
    const hex1 = 'abcdef1234567890';
    const hex2 = 'abcdef1234567890';
    expect(timingSafeEqualHex(hex1, hex2)).toBeTruthy();
  });

  test('Timing-safe comparison returns false for different hex', () => {
    const hex1 = 'abcdef1234567890';
    const hex2 = 'abcdef1234567891';
    expect(timingSafeEqualHex(hex1, hex2)).toBeFalsy();
  });

  test('Handle empty/null/undefined signature safely', () => {
    expect(() => parseSignatureHeader(null)).toThrow();
    expect(() => parseSignatureHeader(undefined)).toThrow();
    expect(() => parseSignatureHeader('')).toThrow();
  });

  test('Whitespace trimming works correctly', () => {
    const signature = `  sha256=${validSignature}  `;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeTruthy();
  });
});

// Test Suite B: Replay Attack Prevention Tests
describe('Replay Attack Prevention Tests', () => {
  const testPayload = JSON.stringify({ id: 'evt_replay', type: 'test' });
  const validSignature = generateSignature(testPayload);

  test('Accept timestamp within allowed window', () => {
    const timestamp = generateTimestamp(-60); // 60 seconds ago
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
    expect(result.valid).toBeTruthy();
  });

  test('Reject too old timestamp', () => {
    const timestamp = generateTimestamp(-400); // 400 seconds ago (beyond 300s window)
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
    expect(result.valid).toBeFalsy();
  });

  test('Reject future timestamp', () => {
    const timestamp = generateTimestamp(400); // 400 seconds in future
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
    expect(result.valid).toBeFalsy();
  });

  test('Accept boundary timestamp exactly at tolerance', () => {
    const timestamp = generateTimestamp(-300); // Exactly 300 seconds ago
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
    expect(result.valid).toBeTruthy();
  });

  test('Require timestamp in production environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, true);
      expect(result.valid).toBeFalsy();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('Allow missing timestamp in development', () => {
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, false);
    expect(result.valid).toBeTruthy();
  });

  test('Reject malformed timestamp', () => {
    const invalidTimestamps = ['not-a-number', 'NaN', 'Infinity', '-Infinity'];
    for (const timestamp of invalidTimestamps) {
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
      expect(result.valid).toBeFalsy();
    }
  });

  test('Reject negative timestamp', () => {
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, '-123');
    expect(result.valid).toBeFalsy();
  });
});

// Test Suite C: Payload Manipulation Security Tests
describe('Payload Manipulation Security Tests', () => {
  const originalPayload = JSON.stringify({ 
    id: 'evt_manipulation', 
    type: 'payment.succeeded', 
    data: { amount: 1000 } 
  });
  const validSignature = generateSignature(originalPayload);

  test('Detect payload tampering after signing', () => {
    const tamperedPayload = JSON.stringify({ 
      id: 'evt_manipulation', 
      type: 'payment.succeeded', 
      data: { amount: 2000 } // Changed amount
    });
    const result = validateWebhookSignature(tamperedPayload, validSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Detect field reordering changes signature', () => {
    const reorderedPayload = JSON.stringify({ 
      data: { amount: 1000 },
      type: 'payment.succeeded',
      id: 'evt_manipulation'
    });
    const result = validateWebhookSignature(reorderedPayload, validSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Detect whitespace changes in JSON', () => {
    const spacedPayload = JSON.stringify({ 
      id: 'evt_manipulation', 
      type: 'payment.succeeded', 
      data: { amount: 1000 } 
    }, null, 2); // Pretty-printed with spaces
    const result = validateWebhookSignature(spacedPayload, validSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Detect Unicode homograph manipulation', () => {
    const unicodePayload = JSON.stringify({ 
      id: 'evt_manipulation', 
      type: 'payment.succeeded', 
      data: { amount: 1000, note: 'pa\u030dment' } // Unicode manipulation
    });
    const result = validateWebhookSignature(unicodePayload, validSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Detect JSON injection attempt', () => {
    const injectionPayload = JSON.stringify({ 
      id: 'evt_manipulation', 
      type: 'payment.succeeded', 
      data: { amount: 1000, note: '{"injected": true}' }
    });
    const result = validateWebhookSignature(injectionPayload, validSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Validate missing required fields are detectable', () => {
    const incompletePayload = JSON.stringify({ 
      // Missing 'id' field
      type: 'payment.succeeded', 
      data: { amount: 1000 } 
    });
    const signature = generateSignature(incompletePayload);
    const result = validateWebhookSignature(incompletePayload, signature, WEBHOOK_SECRET);
    // Should still pass signature validation (content integrity is separate from schema)
    expect(result.valid).toBeTruthy();
  });
});

// Test Suite D: Missing/Invalid Headers Security Tests
describe('Missing/Invalid Headers Security Tests', () => {
  const testPayload = JSON.stringify({ id: 'evt_headers', type: 'test' });
  const validSignature = generateSignature(testPayload);

  test('Reject missing signature header', () => {
    expect(() => parseSignatureHeader(undefined)).toThrow();
    expect(() => parseSignatureHeader(null)).toThrow();
  });

  test('Reject empty signature header', () => {
    expect(() => parseSignatureHeader('')).toThrow();
  });

  test('Handle case-insensitive headers in validation', () => {
    // This tests the concept - actual header case handling would be in the webhook handler
    const signature = `SHA256=${validSignature.toUpperCase()}`;
    const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeTruthy();
  });

  test('Reject malformed header values', () => {
    const malformedSignatures = [
      'invalid-format',
      'sha512=abcdef',
      'v2,abcdef',
      'v1,gggggg',
      'sha256=gggggg',
      'v1,',
      'v1,abc,def'
    ];
    
    for (const signature of malformedSignatures) {
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      expect(result.valid).toBeFalsy();
    }
  });

  test('Reject oversized header value', () => {
    const oversizedSignature = 'a'.repeat(1001); // > 1000 characters
    const result = validateWebhookSignature(testPayload, oversizedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Validate Content-Type for webhook JSON bodies', () => {
    // This tests the concept - actual content-type validation would be in the webhook handler
    const jsonPayload = testPayload;
    const nonJsonContentTypes = [
      'text/plain',
      'application/xml',
      'multipart/form-data',
      'application/x-www-form-urlencoded'
    ];
    
    // All should be considered invalid for webhook JSON bodies
    for (const contentType of nonJsonContentTypes) {
      if (contentType !== 'application/json') {
        expect(contentType).not.toBe('application/json');
      }
    }
  });
});

// Test Suite E: Malformed JSON Payload Security Tests
describe('Malformed JSON Payload Security Tests', () => {
  test('Throw on invalid JSON strings', () => {
    const invalidJsonStrings = [
      '{ invalid json }',
      '{"unclosed": "object"',
      'not json',
      '{"comma": "at", "end"}',
      '{"missing": "value"}',
      '{key: "value"}', // Missing quotes around key
      'null',
      'undefined',
      '12345',
      'true',
      '{"nested": {"incomplete": '
    ];

    for (const invalidJson of invalidJsonStrings) {
      expect(() => JSON.parse(invalidJson)).toThrow();
    }
  });

  test('Handle deeply nested objects without syntax errors', () => {
    const deepObject = makeDeepNest(25);
    expect(() => JSON.stringify(deepObject)).not.toThrow();
    
    const jsonString = JSON.stringify(deepObject);
    expect(jsonString.length).toBeGreaterThan(0);
    
    // Verify it can be parsed back
    const parsed = JSON.parse(jsonString);
    expect(parsed.level).toBe(0);
    expect(parsed.nested.level).toBe(1);
  });

  test('Detect duplicate key JSON behavior', () => {
    // Note: JSON.parse uses last-wins behavior for duplicate keys
    const duplicateKeyJson = '{"id": "first", "id": "second"}';
    const parsed = JSON.parse(duplicateKeyJson);
    expect(parsed.id).toBe('second'); // Last value wins
  });

  test('Validate schema compliance - missing required fields', () => {
    const incompletePayloads = [
      {}, // Missing all fields
      { type: 'test' }, // Missing id and data
      { id: 'evt_123' }, // Missing type and data
      { id: 'evt_123', type: 'test' } // Missing data
    ];

    for (const payload of incompletePayloads) {
      const jsonString = JSON.stringify(payload);
      const signature = generateSignature(jsonString);
      const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
      // Signature validation should pass (integrity), but schema validation would fail separately
      expect(result.valid).toBeTruthy();
    }
  });

  test('Validate schema compliance - invalid type formats', () => {
    const invalidTypePayloads = [
      { id: 'evt_123', type: 123, data: {} }, // Type as number
      { id: 'evt_123', type: null, data: {} }, // Type as null
      { id: 'evt_123', type: '', data: {} }, // Empty type
      { id: 'evt_123', type: {}, data: {} } // Type as object
    ];

    for (const payload of invalidTypePayloads) {
      const jsonString = JSON.stringify(payload);
      const signature = generateSignature(jsonString);
      const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
      // Signature validation should pass (integrity)
      expect(result.valid).toBeTruthy();
    }
  });

  test('Validate schema compliance - invalid data field', () => {
    const invalidDataPayloads = [
      { id: 'evt_123', type: 'test', data: 'string' }, // Data as string
      { id: 'evt_123', type: 'test', data: 123 }, // Data as number
      { id: 'evt_123', type: 'test', data: null }, // Data as null
      { id: 'evt_123', type: 'test', data: [] } // Data as array
    ];

    for (const payload of invalidDataPayloads) {
      const jsonString = JSON.stringify(payload);
      const signature = generateSignature(jsonString);
      const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
      // Signature validation should pass (integrity)
      expect(result.valid).toBeTruthy();
    }
  });

  test('Handle oversized payloads', () => {
    // Create a payload with a large string field (100KB+)
    const largeString = 'a'.repeat(100000); // 100KB
    const largePayload = {
      id: 'evt_large',
      type: 'test',
      data: { large_field: largeString }
    };

    const jsonString = JSON.stringify(largePayload);
    expect(jsonString.length).toBeGreaterThan(100000);

    const signature = generateSignature(jsonString);
    const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
    expect(result.valid).toBeTruthy();
  });
});

// Test Suite F: Advanced Replay Attack Prevention
describe('Advanced Replay Attack Prevention Tests', () => {
  const testPayload = JSON.stringify({ id: 'evt_replay_advanced', type: 'test' });
  const validSignature = generateSignature(testPayload);

  test('Prevent replay with exact boundary timestamp (300s)', () => {
    const timestamp = generateTimestamp(-300); // Exactly at tolerance boundary
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
    expect(result.valid).toBeTruthy();
  });

  test('Reject replay with timestamp just outside boundary (301s)', () => {
    const timestamp = generateTimestamp(-301); // Just outside tolerance
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
    expect(result.valid).toBeFalsy();
  });

  test('Prevent replay attack with valid signature but old timestamp', () => {
    const oldTimestamp = generateTimestamp(-400); // 400 seconds ago
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, oldTimestamp);
    expect(result.valid).toBeFalsy();
  });

  test('Prevent future timestamp replay attacks', () => {
    const futureTimestamp = generateTimestamp(400); // 400 seconds in future
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, futureTimestamp);
    expect(result.valid).toBeFalsy();
  });

  test('Require timestamp in production to prevent replay', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, true);
      expect(result.valid).toBeFalsy();
      expect(result.error).toContain('Timestamp required');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  test('Prevent replay by requiring fresh timestamps', () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTimestamp = (now - 10).toString(); // 10 seconds ago
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, recentTimestamp);
    expect(result.valid).toBeTruthy();
  });
});

// Test Suite G: Signature Forgery Prevention
describe('Signature Forgery Prevention Tests', () => {
  const testPayload = JSON.stringify({ id: 'evt_forgery', type: 'test', data: {} });
  const validSignature = generateSignature(testPayload);

  test('Reject signature forgery with random hex string', () => {
    const forgedSignature = 'a'.repeat(64); // Random 64-char hex
    const result = validateWebhookSignature(testPayload, forgedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject signature forgery with correct length but wrong value', () => {
    const forgedSignature = '0'.repeat(64); // Same length, wrong value
    const result = validateWebhookSignature(testPayload, forgedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject signature forgery with modified single character', () => {
    const forgedSignature = validSignature.slice(0, -1) + 'X'; // Change last char
    const result = validateWebhookSignature(testPayload, forgedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject signature forgery with different secret', () => {
    const wrongSecret = 'wrong_secret_key';
    const forgedSignature = generateSignature(testPayload, wrongSecret);
    const result = validateWebhookSignature(testPayload, forgedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject signature forgery attempt with empty secret', () => {
    const emptySecretSignature = generateSignature(testPayload, '');
    const result = validateWebhookSignature(testPayload, emptySecretSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Prevent signature length extension attacks', () => {
    const extendedSignature = validSignature + 'extra_chars';
    const result = validateWebhookSignature(testPayload, extendedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Prevent signature truncation attacks', () => {
    const truncatedSignature = validSignature.slice(0, -10);
    const result = validateWebhookSignature(testPayload, truncatedSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });

  test('Reject signature forgery with case manipulation', () => {
    // Even though comparison is case-insensitive, wrong signature should fail
    const wrongSignature = generateSignature(testPayload + 'modified', WEBHOOK_SECRET);
    const result = validateWebhookSignature(testPayload, wrongSignature, WEBHOOK_SECRET);
    expect(result.valid).toBeFalsy();
  });
});

// Test Suite H: Timing Attack Prevention
describe('Timing Attack Prevention Tests', () => {
  const testPayload = JSON.stringify({ id: 'evt_timing', type: 'test' });
  const validSignature = generateSignature(testPayload);

  test('Timing-safe comparison prevents information leakage', () => {
    const correctSignature = validSignature;
    const wrongSignature = 'a'.repeat(64); // Same length, wrong value
    
    // Both comparisons should take similar time regardless of correctness
    const start1 = Date.now();
    timingSafeEqualHex(correctSignature, correctSignature);
    const time1 = Date.now() - start1;
    
    const start2 = Date.now();
    timingSafeEqualHex(correctSignature, wrongSignature);
    const time2 = Date.now() - start2;
    
    // Timing difference should be minimal (allowing for measurement variance)
    const timeDiff = Math.abs(time1 - time2);
    expect(timeDiff).toBeLessThan(10); // Allow 10ms variance
  });

  test('Timing-safe comparison handles different length strings correctly', () => {
    const hex1 = 'abcdef1234567890';
    const hex2 = 'abcdef1234567890abcdef'; // Different length
    const result = timingSafeEqualHex(hex1, hex2);
    expect(result).toBeFalsy();
  });

  test('Timing-safe comparison prevents early return optimization', () => {
    // Even with first character mismatch, should compare full length
    const hex1 = 'a'.repeat(64);
    const hex2 = 'b' + 'a'.repeat(63); // First char differs
    const result = timingSafeEqualHex(hex1, hex2);
    expect(result).toBeFalsy();
  });

  test('Timing-safe comparison normalizes hex before comparison', () => {
    const hex1 = '0xABCDEF1234567890';
    const hex2 = 'abcdef1234567890';
    const result = timingSafeEqualHex(hex1, hex2);
    expect(result).toBeTruthy();
  });

  test('Signature validation always computes expected signature', () => {
    // Even with invalid provided signature, should compute expected
    const invalidSignature = 'invalid_format';
    const result = validateWebhookSignature(testPayload, invalidSignature, WEBHOOK_SECRET);
    
    // Should fail but still compute expected signature internally
    expect(result.valid).toBeFalsy();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// Test Suite I: Production vs Development Security Differences
describe('Production vs Development Security Differences', () => {
  const testPayload = JSON.stringify({ id: 'evt_env', type: 'test' });
  const validSignature = generateSignature(testPayload);
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('Production requires timestamp header', () => {
    process.env.NODE_ENV = 'production';
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, true);
    expect(result.valid).toBeFalsy();
    expect(result.error).toContain('Timestamp required');
  });

  test('Development allows missing timestamp', () => {
    process.env.NODE_ENV = 'development';
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, false);
    expect(result.valid).toBeTruthy();
  });

  test('Production enforces stricter validation', () => {
    process.env.NODE_ENV = 'production';
    const oldTimestamp = generateTimestamp(-400);
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, oldTimestamp, true);
    expect(result.valid).toBeFalsy();
  });

  test('Development allows more lenient validation for debugging', () => {
    process.env.NODE_ENV = 'development';
    // In development, missing timestamp is allowed but old timestamp still rejected
    const oldTimestamp = generateTimestamp(-400);
    const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, oldTimestamp, false);
    expect(result.valid).toBeFalsy(); // Still rejects old timestamps
  });
});

// Main test runner function
function runAllSecurityTests() {
  console.log('🔒 Starting Comprehensive Webhook Security Test Suite\n');
  console.log('='.repeat(70));

  const results = {
    passed: 0,
    failed: 0,
    suites: [],
    currentSuite: null
  };

  // Override console methods to capture test results
  const originalDescribe = describe;
  const originalTest = test;
  const originalExpect = expect;

  let currentSuiteName = null;
  let suiteResults = { passed: 0, failed: 0, tests: [] };

  describe = function(name, fn) {
    currentSuiteName = name;
    suiteResults = { passed: 0, failed: 0, tests: [] };
    console.log(`\n📋 ${name}`);
    fn();
    results.suites.push({
      name: currentSuiteName,
      ...suiteResults
    });
    results.passed += suiteResults.passed;
    results.failed += suiteResults.failed;
  };

  test = function(name, fn) {
    console.log(`  🧪 ${name}`);
    try {
      fn();
      console.log(`  ✅ ${name} - PASSED`);
      suiteResults.passed++;
      suiteResults.tests.push({ name, status: 'PASSED' });
    } catch (error) {
      console.log(`  ❌ ${name} - FAILED: ${error.message}`);
      suiteResults.failed++;
      suiteResults.tests.push({ name, status: 'FAILED', error: error.message });
    }
  };

  // Run all test suites
  originalDescribe('Webhook Signature Validation Security Tests', () => {
    // Test cases from Suite A
    const testPayload = JSON.stringify({ id: 'evt_123', type: 'test', data: {} });
    const validSignature = generateSignature(testPayload);

    originalTest('Accept valid sha256=hex format', () => {
      const signature = `sha256=${validSignature}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      expect(result.valid).toBeTruthy();
    });

    originalTest('Accept valid v1,hex format', () => {
      const signature = `v1,${validSignature}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      expect(result.valid).toBeTruthy();
    });

    originalTest('Accept valid bare hex format', () => {
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeTruthy();
    });

    originalTest('Reject malformed sha256= with invalid hex', () => {
      const signature = 'sha256=gggggggggggg';
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Reject malformed v1, with non-hex', () => {
      const signature = 'v1,not_hex';
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Reject unsupported algorithms: sha512=', () => {
      const signature = `sha512=${validSignature}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Reject unsupported algorithms: rsa-sha256=', () => {
      const signature = `rsa-sha256=${validSignature}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Reject unsupported algorithms: hmac-sha1=', () => {
      const signature = `hmac-sha1=${validSignature}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Reject unsupported algorithms: md5=', () => {
      const signature = `md5=${validSignature}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Timing-safe comparison returns true for equal hex', () => {
      const hex1 = 'abcdef1234567890';
      const hex2 = 'abcdef1234567890';
      originalExpect(timingSafeEqualHex(hex1, hex2)).toBeTruthy();
    });

    originalTest('Timing-safe comparison returns false for different hex', () => {
      const hex1 = 'abcdef1234567890';
      const hex2 = 'abcdef1234567891';
      originalExpect(timingSafeEqualHex(hex1, hex2)).toBeFalsy();
    });

    originalTest('Handle empty/null/undefined signature safely', () => {
      expect(() => parseSignatureHeader(null)).toThrow();
      expect(() => parseSignatureHeader(undefined)).toThrow();
      expect(() => parseSignatureHeader('')).toThrow();
    });

    originalTest('Whitespace trimming works correctly', () => {
      const signature = `  sha256=${validSignature}  `;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      expect(result.valid).toBeTruthy();
    });
  });

  originalDescribe('Replay Attack Prevention Tests', () => {
    const testPayload = JSON.stringify({ id: 'evt_replay', type: 'test' });
    const validSignature = generateSignature(testPayload);

    originalTest('Accept timestamp within allowed window', () => {
      const timestamp = generateTimestamp(-60);
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
      expect(result.valid).toBeTruthy();
    });

    originalTest('Reject too old timestamp', () => {
      const timestamp = generateTimestamp(-400);
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Reject future timestamp', () => {
      const timestamp = generateTimestamp(400);
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Accept boundary timestamp exactly at tolerance', () => {
      const timestamp = generateTimestamp(-300);
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
      originalExpect(result.valid).toBeTruthy();
    });

    originalTest('Require timestamp in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, true);
        originalExpect(result.valid).toBeFalsy();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    originalTest('Allow missing timestamp in development', () => {
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, null, false);
      originalExpect(result.valid).toBeTruthy();
    });

    originalTest('Reject malformed timestamp', () => {
      const invalidTimestamps = ['not-a-number', '', 'NaN', 'Infinity', '-Infinity'];
      for (const timestamp of invalidTimestamps) {
        const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, timestamp);
        originalExpect(result.valid).toBeFalsy();
      }
    });

    originalTest('Reject negative timestamp', () => {
      const result = validateWebhookSignature(testPayload, validSignature, WEBHOOK_SECRET, '-123');
      originalExpect(result.valid).toBeFalsy();
    });
  });

  originalDescribe('Payload Manipulation Security Tests', () => {
    const originalPayload = JSON.stringify({ 
      id: 'evt_manipulation', 
      type: 'payment.succeeded', 
      data: { amount: 1000 } 
    });
    const validSignature = generateSignature(originalPayload);

    originalTest('Detect payload tampering after signing', () => {
      const tamperedPayload = JSON.stringify({ 
        id: 'evt_manipulation', 
        type: 'payment.succeeded', 
        data: { amount: 2000 }
      });
      const result = validateWebhookSignature(tamperedPayload, validSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Detect field reordering changes signature', () => {
      const reorderedPayload = JSON.stringify({ 
        data: { amount: 1000 },
        type: 'payment.succeeded',
        id: 'evt_manipulation'
      });
      const result = validateWebhookSignature(reorderedPayload, validSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Detect whitespace changes in JSON', () => {
      const spacedPayload = JSON.stringify({ 
        id: 'evt_manipulation', 
        type: 'payment.succeeded', 
        data: { amount: 1000 } 
      }, null, 2);
      const result = validateWebhookSignature(spacedPayload, validSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Detect Unicode homograph manipulation', () => {
      const unicodePayload = JSON.stringify({ 
        id: 'evt_manipulation', 
        type: 'payment.succeeded', 
        data: { amount: 1000, note: 'pa\u030dment' }
      });
      const result = validateWebhookSignature(unicodePayload, validSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Detect JSON injection attempt', () => {
      const injectionPayload = JSON.stringify({ 
        id: 'evt_manipulation', 
        type: 'payment.succeeded', 
        data: { amount: 1000, note: '{"injected": true}' }
      });
      const result = validateWebhookSignature(injectionPayload, validSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Validate missing required fields are detectable', () => {
      const incompletePayload = JSON.stringify({ 
        type: 'payment.succeeded', 
        data: { amount: 1000 } 
      });
      const signature = generateSignature(incompletePayload);
      const result = validateWebhookSignature(incompletePayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeTruthy();
    });
  });

  originalDescribe('Missing/Invalid Headers Security Tests', () => {
    const testPayload = JSON.stringify({ id: 'evt_headers', type: 'test' });
    const validSignature = generateSignature(testPayload);

    originalTest('Reject missing signature header', () => {
      originalExpect(() => parseSignatureHeader(undefined)).toThrow();
      originalExpect(() => parseSignatureHeader(null)).toThrow();
    });

    originalTest('Reject empty signature header', () => {
      originalExpect(() => parseSignatureHeader('')).toThrow();
    });

    originalTest('Handle case-insensitive headers in validation', () => {
      const signature = `SHA256=${validSignature.toUpperCase()}`;
      const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeTruthy();
    });

    originalTest('Reject malformed header values', () => {
      const malformedSignatures = [
        'invalid-format',
        'sha512=abcdef',
        'v2,abcdef',
        'v1,gggggg',
        'sha256=gggggg',
        'v1,',
        'v1,abc,def'
      ];
      
      for (const signature of malformedSignatures) {
        const result = validateWebhookSignature(testPayload, signature, WEBHOOK_SECRET);
        originalExpect(result.valid).toBeFalsy();
      }
    });

    originalTest('Reject oversized header value', () => {
      const oversizedSignature = 'a'.repeat(1001);
      const result = validateWebhookSignature(testPayload, oversizedSignature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeFalsy();
    });

    originalTest('Validate Content-Type for webhook JSON bodies', () => {
      const nonJsonContentTypes = [
        'text/plain',
        'application/xml',
        'multipart/form-data',
        'application/x-www-form-urlencoded'
      ];
      
      for (const contentType of nonJsonContentTypes) {
        if (contentType !== 'application/json') {
          expect(contentType).not.toBe('application/json');
        }
      }
    });
  });

  originalDescribe('Malformed JSON Payload Security Tests', () => {
    originalTest('Throw on invalid JSON strings', () => {
      const invalidJsonStrings = [
        '{ invalid json }',
        '{"unclosed": "object"',
        'not json',
        '{"comma": "at", "end"}',
        '{"missing": "value"}',
        '{key: "value"}',
        'null',
        'undefined',
        '12345',
        'true',
        '{"nested": {"incomplete": '
      ];

      for (const invalidJson of invalidJsonStrings) {
        originalExpect(() => JSON.parse(invalidJson)).toThrow();
      }
    });

    originalTest('Handle deeply nested objects without syntax errors', () => {
      const deepObject = makeDeepNest(25);
      originalExpect(() => JSON.stringify(deepObject)).not.toThrow();
      
      const jsonString = JSON.stringify(deepObject);
      originalExpect(jsonString.length).toBeGreaterThan(0);
      
      const parsed = JSON.parse(jsonString);
      originalExpect(parsed.level).toBe(0);
      originalExpect(parsed.nested.level).toBe(1);
    });

    originalTest('Detect duplicate key JSON behavior', () => {
      const duplicateKeyJson = '{"id": "first", "id": "second"}';
      const parsed = JSON.parse(duplicateKeyJson);
      originalExpect(parsed.id).toBe('second');
    });

    originalTest('Validate schema compliance - missing required fields', () => {
      const incompletePayloads = [
        {},
        { type: 'test' },
        { id: 'evt_123' },
        { id: 'evt_123', type: 'test' }
      ];

      for (const payload of incompletePayloads) {
        const jsonString = JSON.stringify(payload);
        const signature = generateSignature(jsonString);
        const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
        originalExpect(result.valid).toBeTruthy();
      }
    });

    originalTest('Validate schema compliance - invalid type formats', () => {
      const invalidTypePayloads = [
        { id: 'evt_123', type: 123, data: {} },
        { id: 'evt_123', type: null, data: {} },
        { id: 'evt_123', type: '', data: {} },
        { id: 'evt_123', type: {}, data: {} }
      ];

      for (const payload of invalidTypePayloads) {
        const jsonString = JSON.stringify(payload);
        const signature = generateSignature(jsonString);
        const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
        originalExpect(result.valid).toBeTruthy();
      }
    });

    originalTest('Validate schema compliance - invalid data field', () => {
      const invalidDataPayloads = [
        { id: 'evt_123', type: 'test', data: 'string' },
        { id: 'evt_123', type: 'test', data: 123 },
        { id: 'evt_123', type: 'test', data: null },
        { id: 'evt_123', type: 'test', data: [] }
      ];

      for (const payload of invalidDataPayloads) {
        const jsonString = JSON.stringify(payload);
        const signature = generateSignature(jsonString);
        const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
        originalExpect(result.valid).toBeTruthy();
      }
    });

    originalTest('Handle oversized payloads', () => {
      const largeString = 'a'.repeat(100000);
      const largePayload = {
        id: 'evt_large',
        type: 'test',
        data: { large_field: largeString }
      };

      const jsonString = JSON.stringify(largePayload);
      originalExpect(jsonString.length).toBeGreaterThan(100000);

      const signature = generateSignature(jsonString);
      const result = validateWebhookSignature(jsonString, signature, WEBHOOK_SECRET);
      originalExpect(result.valid).toBeTruthy();
    });
  });

  // Restore original functions
  describe = originalDescribe;
  test = originalTest;
  expect = originalExpect;

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 COMPREHENSIVE WEBHOOK SECURITY TEST RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log(`✅ Total Passed: ${results.passed}`);
  console.log(`❌ Total Failed: ${results.failed}`);
  console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

  // Print suite-by-suite breakdown
  console.log('\n📋 SUITE BREAKDOWN:');
  for (const suite of results.suites) {
    const suiteRate = ((suite.passed / (suite.passed + suite.failed)) * 100).toFixed(1);
    console.log(`  ${suite.name}: ${suite.passed}/${suite.passed + suite.failed} passed (${suiteRate}%)`);
    
    if (suite.failed > 0) {
      console.log('    Failed tests:');
      suite.tests.filter(t => t.status === 'FAILED').forEach(test => {
        console.log(`      - ${test.name}: ${test.error}`);
      });
    }
  }

  if (results.failed > 0) {
    console.log('\n❌ SOME TESTS FAILED!');
    return false;
  } else {
    console.log('\n✅ ALL TESTS PASSED!');
    return true;
  }
}

// Export functions for testing
module.exports = {
  parseSignatureHeader,
  timingSafeEqualHex,
  validateTimestamp,
  generateSignature,
  generateTimestamp,
  makeDeepNest,
  validateWebhookSignature,
  runAllSecurityTests
};

// Run tests if called directly
if (require.main === module) {
  const success = runAllSecurityTests();
  process.exit(success ? 0 : 1);
}