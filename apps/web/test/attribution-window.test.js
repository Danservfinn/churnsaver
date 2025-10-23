#!/usr/bin/env node

// Integration tests for attribution window logic using occurred_at vs created_at
// Tests recovery attribution timing logic for production readiness

const crypto = require('crypto');

// Mock database for testing
let mockCases = new Map();
let mockEvents = new Map();

// Mock sql functions
const mockSql = {
  select: async (query, params) => {
    if (query.includes('SELECT id, membership_id, user_id, first_failure_at, status FROM recovery_cases')) {
      const [membershipId] = params;
      const cases = Array.from(mockCases.values()).filter(c => c.membership_id === membershipId && c.status === 'open');
      return cases.sort((a, b) => new Date(b.first_failure_at) - new Date(a.first_failure_at));
    }
    if (query.includes('SELECT * FROM events')) {
      const [eventId] = params;
      return mockEvents.has(eventId) ? [mockEvents.get(eventId)] : [];
    }
    return [];
  },
  execute: async (query, params) => {
    if (query.includes('UPDATE recovery_cases SET status = \'recovered\'')) {
      const [recoveredAmountCents, caseId] = params;
      if (mockCases.has(caseId)) {
        mockCases.get(caseId).status = 'recovered';
        mockCases.get(caseId).recovered_amount_cents = recoveredAmountCents;
        return 1;
      }
    }
    return 0;
  }
};

// Copy attribution window functions for testing
function markCaseRecoveredByMembership(membershipId, recoveredAmountCents, successTime, attributionWindowDays = 14) {
  return new Promise(async (resolve) => {
    try {
      // If successTime is provided, enforce the attribution window based on the time difference
      if (successTime) {
        // Find the open case for this membership
        const cases = await mockSql.select(
          `SELECT id, membership_id, user_id, first_failure_at, status
           FROM recovery_cases
           WHERE membership_id = $1 AND status = 'open'
           ORDER BY first_failure_at DESC
           LIMIT 1`,
          [membershipId]
        );

        if (cases.length === 0) {
          resolve(false);
          return;
        }

        const case_ = cases[0];
        const firstFailureTime = new Date(case_.first_failure_at);
        const timeDiffDays = (successTime.getTime() - firstFailureTime.getTime()) / (1000 * 60 * 60 * 24);

        if (timeDiffDays > attributionWindowDays) {
          resolve(false);
          return;
        }

        // Update the specific case that matches the attribution window
        const result = await mockSql.execute(
          `UPDATE recovery_cases
           SET status = 'recovered',
               recovered_amount_cents = $1
           WHERE id = $2 AND status = 'open'
           RETURNING id, membership_id, status, recovered_amount_cents`,
          [recoveredAmountCents, case_.id]
        );

        resolve(result > 0);
        return;
      } else {
        // Fallback to original logic if no successTime provided
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - attributionWindowDays);

        const result = await mockSql.execute(
          `UPDATE recovery_cases
           SET status = 'recovered',
               recovered_amount_cents = $1
           WHERE membership_id = $2
             AND status = 'open'
             AND first_failure_at >= $3
           RETURNING id, membership_id, status, recovered_amount_cents`,
          [recoveredAmountCents, membershipId, cutoffDate]
        );

        resolve(result > 0);
        return;
      }
    } catch (error) {
      resolve(false);
    }
  });
}

function processPaymentSucceededEvent(event, successTime) {
  return new Promise(async (resolve) => {
    try {
      // Convert amount to cents (assuming USD if no currency specified)
      const amountCents = Math.round(event.amount * 100);

      // Mark the case as recovered with proper attribution window check
      const recovered = await markCaseRecoveredByMembership(
        event.membershipId,
        amountCents,
        successTime
      );

      resolve(recovered);
    } catch (error) {
      resolve(false);
    }
  });
}

function processMembershipValidEvent(event, successTime) {
  return new Promise(async (resolve) => {
    try {
      // Mark the case as recovered (no amount attribution for valid events)
      const recovered = await markCaseRecoveredByMembership(
        event.membershipId,
        0,
        successTime
      );

      resolve(recovered);
    } catch (error) {
      resolve(false);
    }
  });
}

// Helper functions for test data
function createMockCase(id, membershipId, firstFailureAt, status = 'open') {
  const case_ = {
    id,
    membership_id: membershipId,
    user_id: 'user_' + membershipId,
    first_failure_at: firstFailureAt,
    status,
    recovered_amount_cents: 0
  };
  mockCases.set(id, case_);
  return case_;
}

function resetMockData() {
  mockCases.clear();
  mockEvents.clear();
}

function runAttributionWindowTests() {
  console.log('⏰ Starting Attribution Window Test Suite\n');
  console.log('='.repeat(60));

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  function runTest(name, testFn) {
    try {
      console.log(`\n🧪 ${name}`);
      const result = testFn();
      if (result && typeof result.then === 'function') {
        return result.then(() => {
          console.log(`✅ ${name} - PASSED`);
          results.passed++;
          results.tests.push({ name, status: 'PASSED' });
        }).catch(error => {
          console.log(`❌ ${name} - FAILED: ${error.message}`);
          results.failed++;
          results.tests.push({ name, status: 'FAILED', error: error.message });
        });
      } else {
        console.log(`✅ ${name} - PASSED`);
        results.passed++;
        results.tests.push({ name, status: 'PASSED' });
      }
    } catch (error) {
      console.log(`❌ ${name} - FAILED: ${error.message}`);
      results.failed++;
      results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  // Test attribution window with occurred_at timing
  runTest('Attribution window accepts success within 14 days (occurred_at)', async () => {
    resetMockData();
    const membershipId = 'mem_123';
    const caseId = 'case_123';

    // Create case from 10 days ago
    const failureTime = new Date();
    failureTime.setDate(failureTime.getDate() - 10);
    createMockCase(caseId, membershipId, failureTime.toISOString());

    // Success occurs 12 days after failure (within 14-day window)
    const successTime = new Date(failureTime);
    successTime.setDate(successTime.getDate() + 12);

    const event = {
      eventId: 'evt_success',
      membershipId,
      userId: 'user_123',
      amount: 29.99
    };

    const result = await processPaymentSucceededEvent(event, successTime);
    if (!result) {
      throw new Error('Expected recovery attribution within window');
    }

    // Verify case was marked as recovered
    const case_ = mockCases.get(caseId);
    if (case_.status !== 'recovered' || case_.recovered_amount_cents !== 2999) {
      throw new Error('Case should be marked as recovered with correct amount');
    }
  });

  runTest('Attribution window rejects success outside 14 days (occurred_at)', async () => {
    resetMockData();
    const membershipId = 'mem_456';
    const caseId = 'case_456';

    // Create case from 20 days ago
    const failureTime = new Date();
    failureTime.setDate(failureTime.getDate() - 20);
    createMockCase(caseId, membershipId, failureTime.toISOString());

    // Success occurs 16 days after failure (outside 14-day window)
    const successTime = new Date(failureTime);
    successTime.setDate(successTime.getDate() + 16);

    const event = {
      eventId: 'evt_success_late',
      membershipId,
      userId: 'user_456',
      amount: 49.99
    };

    const result = await processPaymentSucceededEvent(event, successTime);
    if (result) {
      throw new Error('Expected no recovery attribution outside window');
    }

    // Verify case remains open
    const case_ = mockCases.get(caseId);
    if (case_.status !== 'open') {
      throw new Error('Case should remain open when outside attribution window');
    }
  });

  runTest('Attribution window accepts membership validation within window', async () => {
    resetMockData();
    const membershipId = 'mem_789';
    const caseId = 'case_789';

    // Create case from 7 days ago
    const failureTime = new Date();
    failureTime.setDate(failureTime.getDate() - 7);
    createMockCase(caseId, membershipId, failureTime.toISOString());

    // Membership becomes valid 10 days after failure (within window)
    const validTime = new Date(failureTime);
    validTime.setDate(validTime.getDate() + 10);

    const event = {
      eventId: 'evt_valid',
      membershipId,
      userId: 'user_789'
    };

    const result = await processMembershipValidEvent(event, validTime);
    if (!result) {
      throw new Error('Expected recovery attribution for membership validation within window');
    }

    // Verify case was marked as recovered with $0 amount
    const case_ = mockCases.get(caseId);
    if (case_.status !== 'recovered' || case_.recovered_amount_cents !== 0) {
      throw new Error('Case should be marked as recovered with $0 amount for validation events');
    }
  });

  runTest('Attribution window rejects membership validation outside window', async () => {
    resetMockData();
    const membershipId = 'mem_999';
    const caseId = 'case_999';

    // Create case from 15 days ago
    const failureTime = new Date();
    failureTime.setDate(failureTime.getDate() - 15);
    createMockCase(caseId, membershipId, failureTime.toISOString());

    // Membership becomes valid 16 days after failure (outside window)
    const validTime = new Date(failureTime);
    validTime.setDate(validTime.getDate() + 16);

    const event = {
      eventId: 'evt_valid_late',
      membershipId,
      userId: 'user_999'
    };

    const result = await processMembershipValidEvent(event, validTime);
    if (result) {
      throw new Error('Expected no recovery attribution for validation outside window');
    }

    // Verify case remains open
    const case_ = mockCases.get(caseId);
    if (case_.status !== 'open') {
      throw new Error('Case should remain open when validation is outside attribution window');
    }
  });

  runTest('Attribution window handles exact boundary (14 days)', async () => {
    resetMockData();
    const membershipId = 'mem_boundary';
    const caseId = 'case_boundary';

    // Create case from exactly 14 days ago
    const failureTime = new Date();
    failureTime.setDate(failureTime.getDate() - 14);
    createMockCase(caseId, membershipId, failureTime.toISOString());

    // Success occurs exactly 14 days after failure (boundary test)
    const successTime = new Date(failureTime);
    successTime.setDate(successTime.getDate() + 14);

    const event = {
      eventId: 'evt_boundary',
      membershipId,
      userId: 'user_boundary',
      amount: 19.99
    };

    const result = await processPaymentSucceededEvent(event, successTime);
    if (!result) {
      throw new Error('Expected recovery attribution at exact 14-day boundary');
    }

    const case_ = mockCases.get(caseId);
    if (case_.status !== 'recovered') {
      throw new Error('Case should be recovered at exact boundary');
    }
  });

  runTest('Attribution window handles multiple cases - selects most recent', async () => {
    resetMockData();
    const membershipId = 'mem_multi';

    // Create two cases - older one 20 days ago, newer one 5 days ago
    const oldFailureTime = new Date();
    oldFailureTime.setDate(oldFailureTime.getDate() - 20);
    createMockCase('case_old', membershipId, oldFailureTime.toISOString());

    const newFailureTime = new Date();
    newFailureTime.setDate(newFailureTime.getDate() - 5);
    createMockCase('case_new', membershipId, newFailureTime.toISOString());

    // Success occurs 7 days after the most recent failure (within window)
    const successTime = new Date(newFailureTime);
    successTime.setDate(successTime.getDate() + 7);

    const event = {
      eventId: 'evt_multi',
      membershipId,
      userId: 'user_multi',
      amount: 39.99
    };

    const result = await processPaymentSucceededEvent(event, successTime);
    if (!result) {
      throw new Error('Expected recovery attribution for most recent case');
    }

    // Verify the newer case was recovered, older one remains open
    const oldCase = mockCases.get('case_old');
    const newCase = mockCases.get('case_new');

    if (oldCase.status !== 'open') {
      throw new Error('Older case should remain open');
    }
    if (newCase.status !== 'recovered') {
      throw new Error('Newer case should be recovered');
    }
  });

  runTest('Attribution window handles no successTime provided (fallback logic)', async () => {
    resetMockData();
    const membershipId = 'mem_fallback';
    const caseId = 'case_fallback';

    // Create case from 5 days ago
    const failureTime = new Date();
    failureTime.setDate(failureTime.getDate() - 5);
    createMockCase(caseId, membershipId, failureTime.toISOString());

    const event = {
      eventId: 'evt_fallback',
      membershipId,
      userId: 'user_fallback',
      amount: 24.99
    };

    // Call without successTime (should use fallback logic)
    const result = await processPaymentSucceededEvent(event, undefined);
    if (!result) {
      throw new Error('Expected recovery attribution with fallback logic');
    }

    const case_ = mockCases.get(caseId);
    if (case_.status !== 'recovered') {
      throw new Error('Case should be recovered with fallback logic');
    }
  });

  runTest('Attribution window handles no open cases', async () => {
    resetMockData();
    const membershipId = 'mem_no_case';

    const event = {
      eventId: 'evt_no_case',
      membershipId,
      userId: 'user_no_case',
      amount: 9.99
    };

    const result = await processPaymentSucceededEvent(event, new Date());
    if (result) {
      throw new Error('Expected no recovery attribution when no cases exist');
    }
  });

  // Wait for all async tests to complete
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ATTRIBUTION WINDOW TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📈 Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

    if (results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      results.tests.filter(t => t.status === 'FAILED').forEach(test => {
        console.log(`   - ${test.name}: ${test.error}`);
      });
    }

    process.exit(results.failed === 0 ? 0 : 1);
  }, 2000); // Give async tests time to complete
}

// Run tests if called directly
if (require.main === module) {
  runAttributionWindowTests();
}

module.exports = { runAttributionWindowTests };