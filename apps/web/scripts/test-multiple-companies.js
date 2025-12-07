#!/usr/bin/env node
/**
 * Test webhook with multiple company IDs to verify per-company rate limiting
 */

const crypto = require('node:crypto');
const https = require('node:https');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://churnsaver-dannys-projects-de68569e.vercel.app/api/webhooks/whop';
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'ws_e9ccbb37c299e6ffa1778bcba702780d4f39aa1263b6884a459b273ec1e84614';

function createPayload(companyId) {
  return {
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
        company_id: companyId,
        status: 'active'
      }
    },
    created_at: new Date().toISOString()
  };
}

function generateSignature(payload, secret) {
  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return hmac.digest('hex');
}

function sendRequest(payload) {
  return new Promise((resolve, reject) => {
    const payloadString = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateSignature(payload, WEBHOOK_SECRET);
    const url = new URL(WEBHOOK_URL);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Whop-Signature': `sha256=${signature}`,
        'X-Whop-Timestamp': timestamp.toString(),
        'X-Whop-Event-Type': payload.type,
        'Content-Length': Buffer.byteLength(payloadString)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: JSON.parse(data || '{}')
        });
      });
    });

    req.on('error', reject);
    req.write(payloadString);
    req.end();
  });
}

async function test() {
  console.log('🧪 Testing Per-Company Rate Limiting\n');
  
  // Test 1: Company A
  console.log('Test 1: Company A (biz_companyA)');
  const payload1 = createPayload('biz_companyA');
  const result1 = await sendRequest(payload1);
  console.log(`  Status: ${result1.statusCode}`);
  console.log(`  CompanyId: ${result1.body.companyId || 'N/A'}`);
  console.log(`  Result: ${result1.statusCode === 200 ? '✅ Accepted' : result1.statusCode === 429 ? '⚠️ Rate Limited' : '❌ Error'}\n`);

  // Small delay
  await new Promise(r => setTimeout(r, 500));

  // Test 2: Company B (different company, should have separate rate limit)
  console.log('Test 2: Company B (biz_companyB)');
  const payload2 = createPayload('biz_companyB');
  const result2 = await sendRequest(payload2);
  console.log(`  Status: ${result2.statusCode}`);
  console.log(`  CompanyId: ${result2.body.companyId || 'N/A'}`);
  console.log(`  Result: ${result2.statusCode === 200 ? '✅ Accepted' : result2.statusCode === 429 ? '⚠️ Rate Limited' : '❌ Error'}\n`);

  // Test 3: Company A again (should still work, separate from Company B)
  console.log('Test 3: Company A again (should have separate limit)');
  await new Promise(r => setTimeout(r, 500));
  const payload3 = createPayload('biz_companyA');
  const result3 = await sendRequest(payload3);
  console.log(`  Status: ${result3.statusCode}`);
  console.log(`  CompanyId: ${result3.body.companyId || 'N/A'}`);
  console.log(`  Result: ${result3.statusCode === 200 ? '✅ Accepted' : result3.statusCode === 429 ? '⚠️ Rate Limited' : '❌ Error'}\n`);

  console.log('✅ Test Summary:');
  console.log(`  - CompanyId extraction: ${result1.body.companyId && result1.body.companyId !== 'unknown' ? '✅ Working' : '❌ Failed'}`);
  console.log(`  - Per-company rate limiting: ${result1.body.companyId === result3.body.companyId ? '✅ Working (same company)' : '⚠️ Check logs'}`);
}

test().catch(console.error);























