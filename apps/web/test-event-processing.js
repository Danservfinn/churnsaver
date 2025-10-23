// Test event processing end-to-end
const crypto = require('crypto');

function generateSignature(body, secret) {
  return crypto.createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Test payload
const testPayload = {
  id: `evt_test_processing_${Date.now()}`,
  type: 'payment_failed',
  data: {
    membership_id: `mem_processing_test_${Date.now()}`,
    user_id: `user_processing_test_${Date.now()}`,
    reason: 'card_declined',
    amount: 2999,
    currency: 'usd'
  },
  created_at: new Date().toISOString()
};

const body = JSON.stringify(testPayload);
const signature = generateSignature(body, 'test_webhook_secret');

console.log('🧪 Testing Event Processing Flow');
console.log('================================');
console.log('Test Event ID:', testPayload.id);
console.log('Membership ID:', testPayload.data.membership_id);
console.log('');

// Step 1: Send webhook
async function testEventProcessing() {
  console.log('1️⃣ Sending webhook...');
  try {
    const response = await fetch('http://localhost:3000/api/webhooks/whop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-signature': signature
      },
      body: body
    });

    const result = await response.json();
    console.log('   Webhook response:', response.status, result);

    if (response.ok) {
      console.log('   ✅ Webhook accepted');
    } else {
      console.log('   ❌ Webhook rejected');
      return;
    }

  } catch (error) {
    console.error('   ❌ Webhook request failed:', error.message);
    return;
  }

  // Step 2: Wait for async processing
  console.log('2️⃣ Waiting for event processing (2 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 3: Check if recovery case was created
  console.log('3️⃣ Checking for recovery case creation...');

  // Simple database check
  const { Client } = require('pg');
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  });

  try {
    await client.connect();

    // Check events
    const events = await client.query(
      'SELECT COUNT(*) as count FROM events WHERE whop_event_id = $1',
      [testPayload.id]
    );
    console.log('   Events created:', events.rows[0].count);

    // Check recovery cases
    const cases = await client.query(
      'SELECT id, membership_id, user_id, status, attempts FROM recovery_cases WHERE membership_id = $1',
      [testPayload.data.membership_id]
    );

    console.log('   Recovery cases created:', cases.rows.length);
    if (cases.rows.length > 0) {
      console.log('   Case details:', {
        id: cases.rows[0].id,
        membershipId: cases.rows[0].membership_id,
        userId: cases.rows[0].user_id,
        status: cases.rows[0].status,
        attempts: cases.rows[0].attempts
      });
    }

    if (events.rows[0].count > 0 && cases.rows.length > 0) {
      console.log('🎉 SUCCESS: Event processing working end-to-end!');
    } else {
      console.log('❌ FAILED: Event processing incomplete');
    }

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  } finally {
    await client.end();
  }

  console.log('================================');
}

testEventProcessing();

