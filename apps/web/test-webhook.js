#!/usr/bin/env node
/**
 * Test script to simulate a Whop webhook request
 * This creates a properly signed webhook payload and sends it to your endpoint
 */

const crypto = require('node:crypto');
const https = require('node:https');

// Configuration
const WEBHOOK_URL = 'https://churnsaver-dannys-projects-de68569e.vercel.app/api/webhooks/whop';
const WEBHOOK_SECRET = 'ws_e9ccbb37c299e6ffa1778bcba702780d4f39aa1263b6884a459b273ec1e84614';

// Test payload for payment_failed event
const testPayload = {
  id: `evt_test_${Date.now()}`,
  type: 'payment_failed',
  data: {
    membership: {
      id: 'membership_test_123',
      user_id: 'user_test_123',
      company_id: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID || 'test_company_id'
    },
    payment: {
      id: 'payment_test_123',
      failure_reason: 'insufficient_funds',
      amount: 2999,
      currency: 'usd'
    }
  },
  created_at: new Date().toISOString()
};

// Generate HMAC signature
function generateSignature(payload, secret) {
  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadString);
  return hmac.digest('hex');
}

// Send webhook test
function sendWebhookTest() {
  const payloadString = JSON.stringify(testPayload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateSignature(testPayload, WEBHOOK_SECRET);

  const url = new URL(WEBHOOK_URL);
  const options = {
    hostname: url.hostname,
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

  console.log('🚀 Sending test webhook...');
  console.log('📋 Payload:', JSON.stringify(testPayload, null, 2));
  console.log('🔐 Signature:', signature);
  console.log('⏰ Timestamp:', timestamp);
  console.log('🌐 URL:', WEBHOOK_URL);
  console.log('');

  const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('📊 Response Status:', res.statusCode, res.statusMessage);
      console.log('📦 Response Headers:', JSON.stringify(res.headers, null, 2));
      console.log('📄 Response Body:', data);
      console.log('');
      
      if (res.statusCode === 200) {
        console.log('✅ Webhook test SUCCESSFUL!');
      } else {
        console.log('❌ Webhook test FAILED');
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request error:', error.message);
  });

  req.write(payloadString);
  req.end();
}

// Run the test
sendWebhookTest();
