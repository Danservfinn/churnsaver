#!/usr/bin/env node

// Test script for payment succeeded event processing
require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');
const http = require('http');

const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'whsec_test_secret_123';
const WEBHOOK_URL = 'http://localhost:3000/api/webhooks/whop';

// First, create a payment failed event to set up a recovery case
const failedPayload = {
  id: 'evt_failed_' + Date.now(),
  type: 'payment_failed',
  data: {
    membership: {
      id: 'mem_success_test_' + Date.now(),
      user_id: 'usr_success_test_' + Date.now(),
      product_id: 'prod_test_123'
    },
    payment: {
      id: 'pay_failed_' + Date.now(),
      amount: 999,
      currency: 'usd',
      status: 'failed',
      failure_reason: 'card_declined'
    }
  },
  created_at: new Date().toISOString()
};

// Then create a payment succeeded event to recover the case
const succeededPayload = {
  id: 'evt_succeeded_' + Date.now(),
  type: 'payment_succeeded',
  data: {
    membership: {
      id: failedPayload.data.membership.id, // Same membership
      user_id: failedPayload.data.membership.user_id,
      product_id: failedPayload.data.membership.product_id
    },
    payment: {
      id: 'pay_succeeded_' + Date.now(),
      amount: 9.99, // Amount recovered
      currency: 'usd',
      status: 'succeeded'
    }
  },
  created_at: new Date().toISOString()
};

function sendWebhook(payload, callback) {
  const payloadString = JSON.stringify(payload);
  const signature = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
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

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      callback(res.statusCode, data, payload.type);
    });
  });

  req.on('error', (e) => {
    callback(null, e.message, payload.type);
  });

  req.write(payloadString);
  req.end();
}

console.log('🧪 Testing Payment Succeeded Recovery Attribution');
console.log('================================================');
console.log(`Membership ID: ${failedPayload.data.membership.id}`);

console.log('\\n1️⃣ Creating recovery case with payment_failed event...');
sendWebhook(failedPayload, (status1, data1, type1) => {
  console.log(`   ${type1} - Status: ${status1}`);

  if (status1 !== 200) {
    console.log('❌ Failed to create recovery case');
    return;
  }

  console.log('✅ Recovery case created');

  // Wait a moment for async processing
  setTimeout(() => {
    console.log('\\n2️⃣ Sending payment_succeeded event to attribute recovery...');
    sendWebhook(succeededPayload, (status2, data2, type2) => {
      console.log(`   ${type2} - Status: ${status2}`);

      if (status2 === 200) {
        console.log('✅ Payment succeeded event processed');
        console.log('\\n🎯 SUCCESS: Recovery attribution should be complete!');
        console.log('   - Case should be marked as "recovered"');
        console.log('   - Recovered amount should be 999 cents ($9.99)');
        console.log('   - Check database: SELECT * FROM recovery_cases WHERE membership_id = \'' + failedPayload.data.membership.id + '\';');
      } else {
        console.log('❌ Payment succeeded event failed');
        console.log('Response:', data2);
      }
    });
  }, 2000); // Wait 2 seconds for async processing
});
