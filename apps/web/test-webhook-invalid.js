#!/usr/bin/env node

// Test script for invalid webhook signature
const crypto = require('crypto');
const http = require('http');

const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/whop';

const payload = {
  type: 'payment_failed',
  data: {
    membership: {
      id: 'mem_test_' + Date.now(),
      user_id: 'usr_test_' + Date.now(),
      product_id: 'prod_test_123'
    },
    payment: {
      id: 'pay_test_' + Date.now(),
      amount: 999,
      currency: 'usd',
      status: 'failed',
      failure_reason: 'card_declined'
    }
  },
  whop_event_id: 'evt_test_invalid_' + Date.now()
};

const payloadString = JSON.stringify(payload);
// Create an intentionally wrong signature
const signature = crypto
  .createHmac('sha256', 'wrong_secret_key')
  .update(payloadString)
  .digest('hex');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/webhooks/whop',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-whop-signature': signature,
    'Content-Length': Buffer.byteLength(payloadString)
  }
};

console.log('🧪 Testing Invalid Webhook Signature');
console.log('=====================================');
console.log(`Webhook URL: ${WEBHOOK_URL}`);
console.log(`Event ID: ${payload.whop_event_id}`);
console.log('Signature: Intentionally wrong');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('Response:', response);

      if (res.statusCode === 401) {
        console.log('✅ INVALID SIGNATURE CORRECTLY REJECTED');
      } else {
        console.log('❌ INVALID SIGNATURE NOT REJECTED');
      }
    } catch (e) {
      console.log('Raw response:', data);
      if (res.statusCode === 401) {
        console.log('✅ INVALID SIGNATURE CORRECTLY REJECTED');
      } else {
        console.log('❌ INVALID SIGNATURE NOT REJECTED');
      }
    }
  });
});

req.on('error', (e) => {
  console.error('❌ REQUEST ERROR:', e.message);
});

req.write(payloadString);
req.end();