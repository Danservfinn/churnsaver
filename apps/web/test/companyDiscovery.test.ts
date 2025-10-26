#!/usr/bin/env node

/**
 * Unit tests for shared company discovery helpers
 * Focuses on shouldSendReminder and processReminderBatch pure logic
 */

require('ts-node/register');

const {
  shouldSendReminder,
  processReminderBatch,
} = require('../src/server/services/shared/companyDiscovery');

const assert = require('assert');

function createReminderCase({ attempts = 0, first_failure_at, last_nudge_at = null } = {}) {
  return {
    id: 'case_test',
    membership_id: 'membership_test',
    user_id: 'user_test',
    company_id: 'company_test',
    first_failure_at,
    last_nudge_at,
    attempts,
    status: 'open',
    incentive_days: 0,
  };
}

async function runTests() {
  const results = { passed: 0, failed: 0 };
  const tests = [];

  function test(name, fn) {
    tests.push({ name, fn });
  }

  // shouldSendReminder tests
  test('shouldSendReminder returns shouldSend=true when attempts < expected', () => {
    const case_ = createReminderCase({
      attempts: 0,
      first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    });

    const { shouldSend, attemptNumber } = shouldSendReminder(case_, [0, 2, 4]);

    assert.strictEqual(shouldSend, true, 'Expected shouldSend=true when attempts lag offsets');
    assert.strictEqual(attemptNumber, 1, 'Expected next attempt number to be attempts+1');
  });

  test('shouldSendReminder returns shouldSend=false when attempts meet offsets', () => {
    const case_ = createReminderCase({
      attempts: 2,
      first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    });

    const { shouldSend, attemptNumber } = shouldSendReminder(case_, [0, 2, 4]);

    assert.strictEqual(shouldSend, false, 'Expected shouldSend=false when attempts meet offsets');
    assert.strictEqual(attemptNumber, 0, 'Expected attemptNumber=0 when not sending');
  });

  test('shouldSendReminder throttles using last_nudge_at within 12 hours', () => {
    const case_ = createReminderCase({
      attempts: 1,
      first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      last_nudge_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    });

    const { shouldSend } = shouldSendReminder(case_, [0, 2, 4]);

    assert.strictEqual(shouldSend, false, 'Expected shouldSend=false when last_nudge_at < 12h');
  });

  // processReminderBatch tests
  test('processReminderBatch processes eligible cases and counts successes', async () => {
    const now = Date.now();
    const candidates = [
      createReminderCase({
        attempts: 0,
        first_failure_at: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      }),
      createReminderCase({
        attempts: 1,
        first_failure_at: new Date(now - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      }),
      createReminderCase({
        attempts: 3,
        first_failure_at: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        last_nudge_at: new Date(now - 1 * 60 * 60 * 1000), // 1 hour ago (should be throttled)
      }),
    ];

    let processedCalls = 0;
    const processor = async (candidate, attemptNumber) => {
      processedCalls++;
      return { candidateId: candidate.id, attemptNumber };
    };

    const result = await processReminderBatch(candidates, [0, 2, 5], processor);

    assert.strictEqual(result.processed, candidates.length, 'Expected processed count to match candidates length');
    assert.strictEqual(processedCalls, 2, 'Expected processor to be called for two eligible cases');
    assert.strictEqual(result.successful, 2, 'Expected successful count to match processed calls');
    assert.strictEqual(result.failed, 0, 'Expected failed count to be zero');
    assert.strictEqual(result.results.length, 2, 'Expected results array for successful calls only');
  });

  test('processReminderBatch handles processor failures and counts them', async () => {
    const now = Date.now();
    const candidates = [
      createReminderCase({
        attempts: 0,
        first_failure_at: new Date(now - 2 * 24 * 60 * 60 * 1000),
      }),
      createReminderCase({
        attempts: 0,
        first_failure_at: new Date(now - 3 * 24 * 60 * 60 * 1000),
      }),
    ];

    let calls = 0;
    const processor = async () => {
      calls++;
      if (calls === 1) {
        return { ok: true };
      }
      throw new Error('Simulated failure');
    };

    const result = await processReminderBatch(candidates, [0, 1, 2], processor);

    assert.strictEqual(result.processed, 2, 'Both candidates should be processed');
    assert.strictEqual(result.successful, 1, 'One processor call should succeed');
    assert.strictEqual(result.failed, 1, 'One processor call should fail');
    assert.strictEqual(result.results.length, 1, 'Only successful results should be captured');
  });

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✅ ${name}`);
      results.passed++;
    } catch (error) {
      console.error(`❌ ${name}: ${error.message}`);
      results.failed++;
    }
  }

  console.log('\n========== companyDiscovery helper test summary ==========');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log('==========================================================');

  if (results.failed > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runTests().catch((error) => {
    console.error('Test runner encountered an error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };