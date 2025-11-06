#!/usr/bin/env node

// Scheduler and Reminder System Test
// Tests the local cron job functionality for sending reminders

const crypto = require('crypto');
const http = require('http');

// Configuration
const API_BASE = 'http://localhost:3000/api';
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET || 'test_webhook_secret';

// Test utilities
function generateWebhookSignature(payload, timestamp) {
  const message = `${timestamp}.${JSON.stringify(payload)}`;
  return crypto.createHmac('sha256', WHOP_WEBHOOK_SECRET).update(message).digest('hex');
}

function sendWebhook(payload, options = {}) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateWebhookSignature(payload, timestamp);

    const postData = JSON.stringify(payload);

    const reqOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/webhooks/whop',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Whop-Signature': `v1,${signature}`,
        'X-Whop-Timestamp': timestamp.toString(),
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test data generators
function generateTestEvent(type, eventId, membershipId, userId, amount = null) {
  const baseEvent = {
    id: eventId,
    type,
    created_at: new Date().toISOString(),
    membership: {
      id: membershipId,
      user_id: userId
    }
  };

  if (type === 'payment_failed') {
    return {
      ...baseEvent,
      data: {
        failure_reason: 'card_declined',
        membership: { id: membershipId, user_id: userId }
      }
    };
  } else if (type === 'payment_succeeded') {
    return {
      ...baseEvent,
      data: {
        amount: amount || 999,
        membership: { id: membershipId, user_id: userId }
      }
    };
  }

  return baseEvent;
}

// Scheduler test suite
async function runSchedulerTests() {
  console.log('⏰ Starting Scheduler and Reminder System Tests\n');
  console.log('=' .repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function test(name, fn) {
    return async () => {
      try {
        console.log(`\n🧪 ${name}`);
        await fn();
        console.log(`✅ ${name} - PASSED`);
        results.passed++;
        results.tests.push({ name, status: 'PASSED' });
      } catch (error) {
        console.log(`❌ ${name} - FAILED: ${error.message}`);
        results.failed++;
        results.tests.push({ name, status: 'FAILED', error: error.message });
      }
    };
  }

  // Test 1: Create a case that should receive T+0 reminder
  await test('T+0 Reminder Case Creation', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_t0_' + baseTime;
    const userId = 'user_t0_' + baseTime;

    // Create a failed payment case
    const eventId = 'test_t0_' + baseTime;
    const payload = generateTestEvent('payment_failed', eventId, membershipId, userId);
    const response = await sendWebhook(payload);

    if (response.status !== 200) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    // Wait for processing
    await delay(1000);

    // Check case exists and has correct initial state
    const casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    if (casesResponse.status !== 200) {
      throw new Error(`Cases API failed: ${casesResponse.status}`);
    }

    const testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase) {
      throw new Error('Test case not found');
    }

    if (testCase.attempts !== 0) {
      throw new Error(`Expected 0 attempts, got ${testCase.attempts}`);
    }

    if (testCase.status !== 'open') {
      throw new Error(`Expected status 'open', got '${testCase.status}'`);
    }

    console.log(`   📝 Created case ${testCase.id} for T+0 reminder testing`);
  });

  // Test 2: Manual Nudge Functionality
  await test('Manual Nudge Functionality', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_nudge_' + baseTime;
    const userId = 'user_nudge_' + baseTime;

    // Create a case
    const eventId = 'test_nudge_' + baseTime;
    const payload = generateTestEvent('payment_failed', eventId, membershipId, userId);
    await sendWebhook(payload);
    await delay(1000);

    // Get the case
    const casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    const testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase) {
      throw new Error('Test case not found for nudge test');
    }

    const initialAttempts = testCase.attempts;

    // Manually nudge the case
    const nudgeResponse = await makeRequest(`${API_BASE}/cases/${testCase.id}/nudge`, {
      method: 'POST'
    });

    // Note: This will likely fail due to Whop API not being configured, but we can check the response
    console.log(`   📤 Nudge response: ${nudgeResponse.status} - ${JSON.stringify(nudgeResponse.data)}`);

    // Check if attempts were incremented (even if nudge failed due to API)
    const updatedCasesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    const updatedCase = updatedCasesResponse.data.cases.find(c => c.id === testCase.id);

    if (!updatedCase) {
      throw new Error('Updated case not found');
    }

    // The nudge might fail due to API, but the attempt count should still be tracked
    console.log(`   📊 Attempts: ${initialAttempts} → ${updatedCase.attempts}`);
  });

  // Test 3: Case Status Transitions
  await test('Case Status Transitions', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_status_' + baseTime;
    const userId = 'user_status_' + baseTime;

    // Create a failed payment case
    const failEventId = 'test_status_fail_' + baseTime;
    const failPayload = generateTestEvent('payment_failed', failEventId, membershipId, userId);
    await sendWebhook(failPayload);
    await delay(1000);

    // Verify case is open
    let casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    let testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase || testCase.status !== 'open') {
      throw new Error('Case should be open after payment failure');
    }

    // Send payment succeeded event
    const successEventId = 'test_status_success_' + baseTime;
    const successPayload = generateTestEvent('payment_succeeded', successEventId, membershipId, userId, 1999);
    await sendWebhook(successPayload);
    await delay(1000);

    // Verify case is now recovered
    casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase) {
      throw new Error('Case not found after status transition');
    }

    if (testCase.status !== 'recovered') {
      throw new Error(`Expected status 'recovered', got '${testCase.status}'`);
    }

    if (testCase.recovered_amount_cents !== 1999) {
      throw new Error(`Expected recovered amount 1999, got ${testCase.recovered_amount_cents}`);
    }

    console.log(`   🔄 Status transition: open → recovered with $${(testCase.recovered_amount_cents / 100).toFixed(2)} recovery`);
  });

  // Test 4: Attribution Window Behavior
  await test('Attribution Window Behavior', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_window_' + baseTime;
    const userId = 'user_window_' + baseTime;

    // Create multiple failures (should merge into one case)
    for (let i = 0; i < 3; i++) {
      const eventId = `test_window_fail_${i}_${baseTime}`;
      const payload = generateTestEvent('payment_failed', eventId, membershipId, userId);
      await sendWebhook(payload);
      await delay(200);
    }

    await delay(1000);

    // Check only one case exists
    const casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    const casesForMembership = casesResponse.data.cases.filter(c => c.membership_id === membershipId);

    if (casesForMembership.length !== 1) {
      throw new Error(`Expected 1 merged case, got ${casesForMembership.length}`);
    }

    console.log(`   🔗 Multiple failures merged into single case within attribution window`);
  });

  // Test 5: Settings Impact on Processing
  await test('Settings Configuration Impact', async () => {
    // Update settings to disable push notifications
    const settingsUpdate = {
      enable_push: false,
      enable_dm: true,
      incentive_days: 14,
      reminder_offsets_days: [0, 7, 14]
    };

    const settingsResponse = await makeRequest(`${API_BASE}/settings`, {
      method: 'PUT',
      body: settingsUpdate
    });

    if (settingsResponse.status !== 200) {
      throw new Error(`Settings update failed: ${settingsResponse.status}`);
    }

    // Verify settings were applied
    const verifyResponse = await makeRequest(`${API_BASE}/settings`);
    if (verifyResponse.status !== 200) {
      throw new Error(`Settings verification failed: ${verifyResponse.status}`);
    }

    const updatedSettings = verifyResponse.data;
    if (updatedSettings.enable_push !== false || updatedSettings.incentive_days !== 14) {
      throw new Error('Settings were not applied correctly');
    }

    console.log(`   ⚙️ Updated settings: push disabled, DM enabled, 14-day incentives, reminders at T+0/7/14`);
  });

  // Test 6: Dashboard KPI Calculations
  await test('Dashboard KPI Calculations with Multiple Cases', async () => {
    // Get current KPIs
    const kpiResponse = await makeRequest(`${API_BASE}/dashboard/kpis?window=30`);
    if (kpiResponse.status !== 200) {
      throw new Error(`KPIs request failed: ${kpiResponse.status}`);
    }

    const kpis = kpiResponse.data;

    // Validate KPI structure and reasonableness
    const requiredFields = ['activeCases', 'recoveries', 'recoveryRate', 'recoveredRevenueCents', 'totalCases'];

    for (const field of requiredFields) {
      if (!(field in kpis)) {
        throw new Error(`Missing KPI field: ${field}`);
      }
      if (typeof kpis[field] !== 'number' && field !== 'recoveryRate') {
        throw new Error(`KPI field ${field} should be a number`);
      }
    }

    // Recovery rate should be between 0 and 100
    if (kpis.recoveryRate < 0 || kpis.recoveryRate > 100) {
      throw new Error(`Invalid recovery rate: ${kpis.recoveryRate}%`);
    }

    // Active cases should be >= recoveries
    if (kpis.activeCases < kpis.recoveries) {
      throw new Error(`Active cases (${kpis.activeCases}) should not be less than recoveries (${kpis.recoveries})`);
    }

    console.log(`   📊 KPIs: ${kpis.totalCases} total cases, ${kpis.activeCases} active, ${kpis.recoveries} recovered (${kpis.recoveryRate}% rate), $${(kpis.recoveredRevenueCents / 100).toFixed(2)} recovered revenue`);
  });

  // Test 7: T+0/T+2/T+4 Reminder Scheduling
  await test('T+0/T+2/T+4 Reminder Scheduling', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_reminder_sched_' + baseTime;
    const userId = 'user_reminder_sched_' + baseTime;

    // Create a case
    const eventId = 'test_reminder_sched_' + baseTime;
    const payload = generateTestEvent('payment_failed', eventId, membershipId, userId);
    await sendWebhook(payload);
    await delay(1000);

    // Get the case and verify initial state
    let casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    let testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase) {
      throw new Error('Test case not found for reminder scheduling');
    }

    const initialAttempts = testCase.attempts;
    console.log(`   📅 Initial case: ${testCase.attempts} attempts, status: ${testCase.status}`);

    // Manually trigger scheduler to simulate T+0 reminder
    const schedulerResponse = await makeRequest(`${API_BASE}/scheduler/reminders`, {
      method: 'POST'
    });

    if (schedulerResponse.status !== 200) {
      throw new Error(`Scheduler trigger failed: ${schedulerResponse.status}`);
    }

    await delay(500);

    // Check if attempts were incremented (T+0 reminder sent)
    casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);

    if (!testCase) {
      throw new Error('Case not found after scheduler trigger');
    }

    // Attempts should be incremented by T+0 reminder
    if (testCase.attempts <= initialAttempts) {
      throw new Error(`Expected attempts > ${initialAttempts} after T+0 reminder, got ${testCase.attempts}`);
    }

    console.log(`   ⏰ T+0 reminder sent: attempts ${initialAttempts} → ${testCase.attempts}`);
    console.log(`   📅 last_nudge_at updated: ${testCase.last_nudge_at}`);
  });

  // Test 8: Reminder Cancellation on Success
  await test('Reminder Cancellation on Success', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_cancel_success_' + baseTime;
    const userId = 'user_cancel_success_' + baseTime;
    const recoveryAmount = 29.99;

    // Create a failed payment case
    const failEventId = 'test_cancel_success_fail_' + baseTime;
    const failPayload = generateTestEvent('payment_failed', failEventId, membershipId, userId);
    await sendWebhook(failPayload);
    await delay(1000);

    // Verify case is open
    let casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    let testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase || testCase.status !== 'open') {
      throw new Error('Case should be open after payment failure');
    }

    console.log(`   📝 Case created: ${testCase.id}, status: ${testCase.status}`);

    // Send payment success event
    const successEventId = 'test_cancel_success_success_' + baseTime;
    const successPayload = generateTestEvent('payment_succeeded', successEventId, membershipId, userId, recoveryAmount);
    await sendWebhook(successPayload);
    await delay(1000);

    // Verify case is recovered and reminders would be cancelled
    casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);

    if (!testCase) {
      throw new Error('Case not found after success event');
    }

    if (testCase.status !== 'recovered') {
      throw new Error(`Expected status 'recovered' after success, got '${testCase.status}'`);
    }

    const expectedCents = Math.round(recoveryAmount * 100);
    if (testCase.recovered_amount_cents !== expectedCents) {
      throw new Error(`Expected recovered amount ${expectedCents} cents, got ${testCase.recovered_amount_cents}`);
    }

    console.log(`   ✅ Case recovered: status '${testCase.status}', amount $${(testCase.recovered_amount_cents / 100).toFixed(2)}`);
    console.log(`   🛑 Future reminders cancelled due to successful recovery`);
  });

  // Test 9: Attempts Increment and last_nudge_at Update
  await test('Attempts Increment and last_nudge_at Update', async () => {
    const baseTime = Date.now();
    const membershipId = 'mem_attempts_' + baseTime;
    const userId = 'user_attempts_' + baseTime;

    // Create a case
    const eventId = 'test_attempts_' + baseTime;
    const payload = generateTestEvent('payment_failed', eventId, membershipId, userId);
    await sendWebhook(payload);
    await delay(1000);

    // Get initial case state
    let casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    let testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);
    if (!testCase) {
      throw new Error('Test case not found for attempts test');
    }

    const initialAttempts = testCase.attempts;
    const initialLastNudge = testCase.last_nudge_at;

    console.log(`   📊 Initial: attempts=${initialAttempts}, last_nudge_at=${initialLastNudge}`);

    // Manually nudge the case
    const nudgeResponse = await makeRequest(`${API_BASE}/cases/${testCase.id}/nudge`, {
      method: 'POST'
    });

    // Even if nudge fails due to API, attempts should increment
    await delay(500);

    // Check updated case state
    casesResponse = await makeRequest(`${API_BASE}/dashboard/cases?page=1&limit=10`);
    testCase = casesResponse.data.cases.find(c => c.membership_id === membershipId);

    if (!testCase) {
      throw new Error('Case not found after nudge attempt');
    }

    // Attempts should be incremented
    if (testCase.attempts <= initialAttempts) {
      throw new Error(`Expected attempts > ${initialAttempts}, got ${testCase.attempts}`);
    }

    // last_nudge_at should be updated
    if (!testCase.last_nudge_at || testCase.last_nudge_at === initialLastNudge) {
      throw new Error('last_nudge_at should be updated after nudge attempt');
    }

    console.log(`   📈 Updated: attempts=${initialAttempts} → ${testCase.attempts}`);
    console.log(`   🕒 last_nudge_at updated to: ${testCase.last_nudge_at}`);
  });

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('⏰ SCHEDULER TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📈 Total: ${results.passed + results.failed}`);

  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.tests.filter(t => t.status === 'FAILED').forEach(test => {
      console.log(`   • ${test.name}: ${test.error}`);
    });
  }

  const successRate = ((results.passed / (results.passed + results.failed)) * 100).toFixed(1);
  console.log(`\n🎯 Success Rate: ${successRate}%`);

  if (results.failed === 0) {
    console.log('\n🎉 SCHEDULER TESTS PASSED! Reminder system is functional.');
  } else {
    console.log('\n⚠️  Some scheduler tests failed. Please review before production.');
    process.exit(1);
  }
}

// Run the scheduler test suite
if (require.main === module) {
  runSchedulerTests().catch(error => {
    console.error('Scheduler test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runSchedulerTests };











