#!/usr/bin/env tsx
/**
 * Test script to verify webhook rate limiting fix
 * This script tests the webhook endpoint and checks rate limit behavior
 */

import crypto from 'node:crypto';
import https from 'node:https';
import { sql } from '@/lib/db';

const WEBHOOK_URL = process.env.WEBHOOK_TEST_URL || 'http://localhost:3000/api/webhooks/whop';
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || '';

// Test payload for payment_failed event
const createTestPayload = (companyId?: string) => ({
  id: `evt_test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  type: 'payment_failed',
  data: {
    membership: {
      id: 'membership_test_123',
      user_id: 'user_test_123',
      company_id: companyId || process.env.NEXT_PUBLIC_WHOP_COMPANY_ID || 'test_company_id'
    },
    payment: {
      id: 'payment_test_123',
      failure_reason: 'insufficient_funds',
      amount: 2999,
      currency: 'usd'
    }
  },
  created_at: new Date().toISOString()
});

// Generate HMAC signature
function generateSignature(payload: any, secret: string): string {
  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return hmac.digest('hex');
}

// Send webhook request
async function sendWebhookRequest(payload: any, options: { skipSignature?: boolean } = {}): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = options.skipSignature ? 'test_signature' : generateSignature(payload, WEBHOOK_SECRET);

    const url = new URL(WEBHOOK_URL);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : require('http');

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Whop-Signature': `sha256=${signature}`,
        'X-Whop-Timestamp': timestamp.toString(),
        'Content-Length': Buffer.byteLength(payloadString),
        'User-Agent': 'Whop-Webhook-Test/1.0'
      }
    };

    const req = httpModule.request(requestOptions, (res: any) => {
      let data = '';
      
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      
      res.on('end', () => {
        const headers: Record<string, string> = {};
        Object.keys(res.headers).forEach(key => {
          headers[key] = String(res.headers[key]);
        });

        resolve({
          statusCode: res.statusCode || 0,
          headers,
          body: data
        });
      });
    });

    req.on('error', (error: Error) => {
      reject(error);
    });

    req.write(payloadString);
    req.end();
  });
}

// Check rate limits in database
async function checkRateLimits(identifier: string) {
  try {
    const rows = await sql.select<{
      company_key: string;
      window_bucket_start: Date;
      count: number;
      updated_at: Date;
    }>(
      `SELECT company_key, window_bucket_start, count, updated_at 
       FROM rate_limits 
       WHERE company_key = $1 
       ORDER BY window_bucket_start DESC 
       LIMIT 5`,
      [identifier]
    );

    return rows;
  } catch (error) {
    console.error('Error checking rate limits:', error);
    return [];
  }
}

// Main test function
async function runTests() {
  console.log('🧪 Webhook Rate Limit Test Suite\n');
  console.log('Configuration:');
  console.log(`  Webhook URL: ${WEBHOOK_URL}`);
  console.log(`  Webhook Secret: ${WEBHOOK_SECRET ? '[SET]' : '[NOT SET]'}`);
  console.log('');

  if (!WEBHOOK_SECRET) {
    console.error('❌ WHOP_WEBHOOK_SECRET not set. Please set it in your environment.');
    process.exit(1);
  }

  // Test 1: Single webhook request
  console.log('📋 Test 1: Single webhook request');
  console.log('─'.repeat(50));
  try {
    const payload1 = createTestPayload('biz_test123');
    const response1 = await sendWebhookRequest(payload1);
    
    console.log(`Status: ${response1.statusCode}`);
    console.log(`Response: ${response1.body.substring(0, 200)}`);
    
    if (response1.statusCode === 200) {
      console.log('✅ Webhook accepted');
    } else if (response1.statusCode === 429) {
      const errorData = JSON.parse(response1.body);
      console.log(`⚠️  Rate limited: ${errorData.error}`);
      console.log(`   CompanyId: ${errorData.companyId}`);
      console.log(`   Retry after: ${errorData.retryAfter}s`);
    } else {
      console.log(`❌ Unexpected status: ${response1.statusCode}`);
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
  console.log('');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Check rate limits for company
  console.log('📋 Test 2: Check rate limits for company');
  console.log('─'.repeat(50));
  const companyRateLimits = await checkRateLimits('webhook:company:biz_test123');
  if (companyRateLimits.length > 0) {
    console.log('Found rate limit entries:');
    companyRateLimits.forEach(limit => {
      console.log(`  Key: ${limit.company_key}`);
      console.log(`  Count: ${limit.count}`);
      console.log(`  Window: ${limit.window_bucket_start.toISOString()}`);
      console.log(`  Updated: ${limit.updated_at.toISOString()}`);
      console.log('');
    });
  } else {
    console.log('No rate limit entries found for company');
  }
  console.log('');

  // Test 3: Multiple rapid requests (should hit rate limit)
  console.log('📋 Test 3: Multiple rapid requests (testing rate limit)');
  console.log('─'.repeat(50));
  const results: Array<{ request: number; status: number; companyId?: string }> = [];
  
  for (let i = 1; i <= 3; i++) {
    try {
      const payload = createTestPayload('biz_test123');
      const response = await sendWebhookRequest(payload);
      results.push({
        request: i,
        status: response.statusCode,
        companyId: response.statusCode === 429 ? JSON.parse(response.body).companyId : undefined
      });
      
      if (response.statusCode === 429) {
        const errorData = JSON.parse(response.body);
        console.log(`Request ${i}: Rate limited (${errorData.companyId})`);
      } else {
        console.log(`Request ${i}: Accepted (${response.statusCode})`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Request ${i}: Error -`, error instanceof Error ? error.message : String(error));
    }
  }
  
  const rateLimitedCount = results.filter(r => r.status === 429).length;
  console.log(`\nSummary: ${rateLimitedCount}/${results.length} requests were rate limited`);
  console.log('');

  // Test 4: Check IP-based rate limits (when companyId is missing)
  console.log('📋 Test 4: Check IP-based rate limits');
  console.log('─'.repeat(50));
  const ipRateLimits = await checkRateLimits('webhook:ip:unknown');
  if (ipRateLimits.length > 0) {
    console.log('Found IP-based rate limit entries:');
    ipRateLimits.forEach(limit => {
      console.log(`  Key: ${limit.company_key}`);
      console.log(`  Count: ${limit.count}`);
      console.log(`  Window: ${limit.window_bucket_start.toISOString()}`);
    });
  } else {
    console.log('No IP-based rate limit entries found');
  }
  console.log('');

  console.log('✅ Test suite completed');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

