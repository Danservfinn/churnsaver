#!/usr/bin/env node

// Test script for invalid webhook signature
import * as crypto from 'crypto';
import * as http from 'http';
import { test, describe, expect } from './test-framework';

const WEBHOOK_URL: string = 'http://localhost:3000/api/webhooks/whop';

// Payload interfaces
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
  failure_reason: string;
}

interface InvalidWebhookPayload {
  type: string;
  data: {
    membership: Membership;
    payment: Payment;
  };
  whop_event_id: string;
}

const payload: InvalidWebhookPayload = {
  type: 'payment_failed',
  data: {
    membership: {
      id: 'mem_test_' + Date.now(),
      user_id: 'usr_test_' + Date.now(),
      product_id: 'prod_test_123',
    },
    payment: {
      id: 'pay_test_' + Date.now(),
      amount: 999,
      currency: 'usd',
      status: 'failed',
      failure_reason: 'card_declined',
    },
  },
  whop_event_id: 'evt_test_invalid_' + Date.now(),
};

const payloadString: string = JSON.stringify(payload);
// Create an intentionally wrong signature
const signature: string = crypto.createHmac('sha256', 'wrong_secret_key').update(payloadString).digest('hex');

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

describe('Invalid Webhook Signature Tests', () => {
  test('should reject webhook with invalid signature', () => {
    console.log('🧪 Testing Invalid Webhook Signature');
    console.log('====================================');
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

          expect(res.statusCode).toBe(401);
          console.log('✅ INVALID SIGNATURE CORRECTLY REJECTED');
        } catch (e) {
          console.log('Raw response:', data);
          expect(res.statusCode).toBe(401);
          console.log('✅ INVALID SIGNATURE CORRECTLY REJECTED');
        }
      });
    });

    req.on('error', (e) => {
      console.error('❌ REQUEST ERROR:', e.message);
      throw e;
    });

    req.write(payloadString);
    req.end();
  });
});