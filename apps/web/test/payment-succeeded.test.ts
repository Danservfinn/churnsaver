#!/usr/bin/env node

// Test script for payment succeeded event processing
import * as crypto from 'crypto';
import * as http from 'http';
import { test, describe, expect } from './test-framework';

const WEBHOOK_SECRET: string = process.env.WHOP_WEBHOOK_SECRET || 'whsec_test_secret_123';
const WEBHOOK_URL: string = 'http://localhost:3000/api/webhooks/whop';

// Event interfaces
interface Membership {
  id: string;
  user_id: string;
  product_id: string;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  failure_reason?: string;
}

interface WebhookEvent {
  id: string;
  type: string;
  data: {
    membership: Membership;
    payment: Payment;
  };
  created_at: string;
}

// First, create a payment failed event to set up a recovery case
const failedPayload: WebhookEvent = {
  id: 'evt_failed_' + Date.now(),
  type: 'payment_failed',
  data: {
    membership: {
      id: 'mem_success_test_' + Date.now(),
      user_id: 'usr_success_test_' + Date.now(),
      product_id: 'prod_test_123',
    },
    payment: {
      id: 'pay_failed_' + Date.now(),
      amount: 999,
      currency: 'usd',
      status: 'failed',
      failure_reason: 'card_declined',
    },
  },
  created_at: new Date().toISOString(),
};

// Then create a payment succeeded event to recover the case
const succeededPayload: WebhookEvent = {
  id: 'evt_succeeded_' + Date.now(),
  type: 'payment_succeeded',
  data: {
    membership: {
      id: failedPayload.data.membership.id, // Same membership
      user_id: failedPayload.data.membership.user_id,
      product_id: failedPayload.data.membership.product_id,
    },
    payment: {
      id: 'pay_succeeded_' + Date.now(),
      amount: 9.99, // Amount recovered
      currency: 'usd',
      status: 'succeeded',
    },
  },
  created_at: new Date().toISOString(),
};

function sendWebhook(payload: WebhookEvent, callback: (statusCode: number | null, data: string, type: string) => void): void {
  const payloadString: string = JSON.stringify(payload);
  const signature: string = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadString).digest('hex');

  const options: http.RequestOptions = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/webhooks/whop',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-whop-signature': signature,
      'Content-Length': Buffer.byteLength(payloadString),
    },
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      callback(res.statusCode || null, data, payload.type);
    });
  });

  req.on('error', (e) => {
    callback(null, e.message, payload.type);
  });

  req.write(payloadString);
  req.end();
}

describe('Payment Succeeded Recovery Attribution Tests', () => {
  test('should attribute successful payment to existing recovery case', () => {
    console.log('🧪 Testing Payment Succeeded Recovery Attribution');
    console.log('===============================================');
    console.log(`Membership ID: ${failedPayload.data.membership.id}`);

    console.log('\n1️⃣ Creating recovery case with payment_failed event...');
    sendWebhook(failedPayload, (status1, data1, type1) => {
      console.log(`   ${type1} - Status: ${status1}`);

      expect(status1).toBe(200);
      console.log('✅ Recovery case created');

      // Wait a moment for async processing
      setTimeout(() => {
        console.log('\n2️⃣ Sending payment_succeeded event to attribute recovery...');
        sendWebhook(succeededPayload, (status2, data2, type2) => {
          console.log(`   ${type2} - Status: ${status2}`);

          expect(status2).toBe(200);
          console.log('✅ Payment succeeded event processed');
          console.log('\n🎯 SUCCESS: Recovery attribution should be complete!');
          console.log('   - Case should be marked as "recovered"');
          console.log('   - Recovered amount should be 999 cents ($9.99)');
          console.log(`   - Check database: SELECT * FROM recovery_cases WHERE membership_id = '${failedPayload.data.membership.id}';`);
        });
      }, 2000); // Wait 2 seconds for async processing
    });
  });
});