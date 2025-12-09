// Test event processing end-to-end
import { Client } from 'pg';
import { test, describe, expect } from './test-framework';

function generateSignature(body: string, secret: string): string {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Test payload interface
interface TestPayload {
  id: string;
  type: string;
  data: {
    membership_id: string;
    user_id: string;
    reason: string;
    amount: number;
    currency: string;
  };
  created_at: string;
}

// Test payload
const testPayload: TestPayload = {
  id: `evt_test_processing_${Date.now()}`,
  type: 'payment_failed',
  data: {
    membership_id: `mem_processing_test_${Date.now()}`,
    user_id: `user_processing_test_${Date.now()}`,
    reason: 'card_declined',
    amount: 2999,
    currency: 'usd',
  },
  created_at: new Date().toISOString(),
};

const body: string = JSON.stringify(testPayload);
const signature: string = generateSignature(body, 'test_webhook_secret');

describe('Event Processing End-to-End Flow', () => {
  test('should process payment_failed event and create recovery case', async () => {
    console.log('🧪 Testing Event Processing Flow');
    console.log('================================');
    console.log('Test Event ID:', testPayload.id);
    console.log('Membership ID:', testPayload.data.membership_id);
    console.log('');

    // Step 1: Send webhook
    console.log('1️⃣ Sending webhook...');
    try {
      const response = await fetch('http://localhost:3000/api/webhooks/whop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-whop-signature': signature,
        },
        body: body,
      });

      const result = await response.json();
      console.log('   Webhook response:', response.status, result);

      expect(response.ok).toBe(true);
      console.log('   ✅ Webhook accepted');
    } catch (error) {
      console.error('   ❌ Webhook request failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }

    // Step 2: Wait for async processing
    console.log('2️⃣ Waiting for event processing (2 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 3: Check if recovery case was created
    console.log('3️⃣ Checking for recovery case creation...');

    // Simple database check
    const client = new Client({
      connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });

    try {
      await client.connect();

      // Check events
      const eventsResult = await client.query(
        'SELECT COUNT(*) as count FROM events WHERE whop_event_id = $1',
        [testPayload.id],
      );
      const eventsCount = parseInt(eventsResult.rows[0].count);
      console.log('   Events created:', eventsCount);

      // Check recovery cases
      const casesResult = await client.query(
        'SELECT id, membership_id, user_id, status, attempts FROM recovery_cases WHERE membership_id = $1',
        [testPayload.data.membership_id],
      );

      console.log('   Recovery cases created:', casesResult.rows.length);
      if (casesResult.rows.length > 0) {
        console.log('   Case details:', {
          id: casesResult.rows[0].id,
          membershipId: casesResult.rows[0].membership_id,
          userId: casesResult.rows[0].user_id,
          status: casesResult.rows[0].status,
          attempts: casesResult.rows[0].attempts,
        });
      }

      expect(eventsCount).toBeGreaterThan(0);
      expect(casesResult.rows.length).toBeGreaterThan(0);

      console.log('🎉 SUCCESS: Event processing working end-to-end!');
    } catch (error) {
      console.error('❌ Database check failed:', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      await client.end();
    }

    console.log('================================');
  });
});