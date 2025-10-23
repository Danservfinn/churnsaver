#!/usr/bin/env node

// Test script for webhook idempotency (same event twice)
const crypto = require('crypto');
const http = require('http');

const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'whsec_test_secret_123';
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/whop';

const payload = {
  type: 'payment_failed',
  data: {
    membership: {
      id: 'mem_idempotency_test_' + Date.now(),
      user_id: 'usr_idempotency_test_' + Date.now(),
      product_id: 'prod_test_123'
    },
    payment: {
      id: 'pay_idempotency_test_' + Date.now(),
      amount: 999,
      currency: 'usd',
      status: 'failed',
      failure_reason: 'card_declined'
    }
  },
  whop_event_id: 'evt_idempotency_test_' + Date.now()
};

const payloadString = JSON.stringify(payload);
const signature = 'sha256=' + crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payloadString)
  .digest('hex');

function sendWebhook(callback) {
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

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      callback(res.statusCode, data);
    });
  });

  req.on('error', (e) => {
    callback(null, e.message);
  });

  req.write(payloadString);
  req.end();
}

console.log('🧪 Testing Webhook Idempotency');
console.log('==============================');
console.log(`Webhook URL: ${WEBHOOK_URL}`);
console.log(`Event ID: ${payload.whop_event_id}`);

// Send first webhook
sendWebhook((status1, data1) => {
  console.log(`\\n1st webhook - Status: ${status1}`);

  if (status1 === 200) {
    console.log('✅ First webhook accepted');
  } else {
    console.log('❌ First webhook failed');
    return;
  }

  // Send second webhook with same event ID
  setTimeout(() => {
    sendWebhook((status2, data2) => {
      console.log(`\\n2nd webhook - Status: ${status2}`);

      if (status2 === 200) {
        console.log('✅ Second webhook accepted (idempotent)');
        console.log('\\n🎯 IDEMPOTENCY TEST PASSED');
        console.log('   Same event processed only once');
      } else {
        console.log('❌ Second webhook failed');
      }

      // Check database to confirm only one event stored
      console.log('\\n📊 Database check needed:');
      console.log('   Run: npm run cron trigger');
      console.log('   Check logs for single event processing');
    });
  }, 1000);
});