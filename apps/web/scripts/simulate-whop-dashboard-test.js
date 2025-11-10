#!/usr/bin/env node
/**
 * Simulate Whop Dashboard Webhook Test
 * This script simulates exactly what the Whop dashboard sends when testing a webhook
 */

const crypto = require('node:crypto');
const https = require('node:https');
const http = require('node:http');

// Configuration - matches what Whop dashboard would send
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/whop';
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || '';

// Realistic Whop dashboard test payload structure
const createWhopDashboardPayload = (companyId) => ({
  id: `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  type: 'payment_failed',
  data: {
    payment: {
      id: `pay_${Date.now()}`,
      amount_cents: 2999,
      currency: 'USD',
      status: 'failed',
      failure_reason: 'insufficient_funds'
    },
    membership: {
      id: `mem_${Date.now()}`,
      user_id: `usr_${Date.now()}`,
      company_id: companyId || 'biz_hqNeRcxEMkuyOL', // Default from env.example
      status: 'active'
    },
    user: {
      id: `usr_${Date.now()}`,
      email: 'test@example.com',
      username: 'testuser'
    }
  },
  created_at: new Date().toISOString()
});

// Generate HMAC signature (Whop format)
function generateSignature(payload, secret) {
  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return hmac.digest('hex');
}

// Send webhook request
function sendWebhookRequest(payload) {
  return new Promise((resolve, reject) => {
    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateSignature(payload, WEBHOOK_SECRET);

    const url = new URL(WEBHOOK_URL);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Whop-Signature': `sha256=${signature}`,
        'X-Whop-Timestamp': timestamp.toString(),
        'X-Whop-Event-Type': payload.type,
        'Content-Length': Buffer.byteLength(payloadString),
        'User-Agent': 'Whop-Webhook/1.0'
      }
    };

    console.log('📤 Sending webhook request...');
    console.log(`   URL: ${WEBHOOK_URL}`);
    console.log(`   Type: ${payload.type}`);
    console.log(`   Company ID in payload: ${payload.data.membership.company_id}`);
    console.log('');

    const req = httpModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(payloadString);
    req.end();
  });
}

// Main test function
async function runTest() {
  console.log('🧪 Simulating Whop Dashboard Webhook Test\n');
  console.log('═'.repeat(60));
  
  if (!WEBHOOK_SECRET) {
    console.error('❌ ERROR: WHOP_WEBHOOK_SECRET not set!');
    console.error('   Please set it: export WHOP_WEBHOOK_SECRET=your_secret');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Webhook URL: ${WEBHOOK_URL}`);
  console.log(`  Webhook Secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);
  console.log('');

  // Test 1: Webhook with company_id in membership
  console.log('Test 1: Payment Failed Webhook (with company_id)');
  console.log('─'.repeat(60));
  
  try {
    const payload1 = createWhopDashboardPayload('biz_test123');
    const response1 = await sendWebhookRequest(payload1);
    
    console.log(`Response Status: ${response1.statusCode}`);
    console.log(`Response Body: ${response1.body}`);
    console.log('');
    
    if (response1.statusCode === 200) {
      console.log('✅ SUCCESS: Webhook accepted!');
      const responseData = JSON.parse(response1.body);
      console.log(`   Response: ${JSON.stringify(responseData, null, 2)}`);
    } else if (response1.statusCode === 429) {
      const errorData = JSON.parse(response1.body);
      console.log('⚠️  RATE LIMITED:');
      console.log(`   Error: ${errorData.error}`);
      console.log(`   CompanyId: ${errorData.companyId}`);
      console.log(`   Retry After: ${errorData.retryAfter}s`);
      console.log(`   Reset At: ${errorData.resetAt}`);
      
      if (errorData.companyId === 'unknown') {
        console.log('');
        console.log('❌ ISSUE: CompanyId is still "unknown"');
        console.log('   This means the extraction logic needs to be updated.');
        console.log('   Check the application logs for [DEBUG_WEBHOOK] entries.');
      } else {
        console.log('');
        console.log('✅ CompanyId extracted correctly!');
      }
    } else {
      console.log(`❌ Unexpected status: ${response1.statusCode}`);
      console.log(`   Response: ${response1.body}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Make sure your development server is running: pnpm dev');
    }
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('Test completed!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Check your application logs for [DEBUG_WEBHOOK] entries');
  console.log('2. Look for "CompanyId extraction result" to see what was extracted');
  console.log('3. If companyId is still "unknown", share the log output');
}

// Run the test
runTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

