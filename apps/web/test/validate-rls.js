#!/usr/bin/env node

// RLS Validation Test Script
// Tests Row Level Security functionality for multi-tenant data isolation
// Expanded to cover all tables with policies for production readiness

const { Pool } = require('pg');
const crypto = require('crypto');

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;

// Test company IDs
const COMPANY_A = 'test_company_a_' + crypto.randomBytes(4).toString('hex');
const COMPANY_B = 'test_company_b_' + crypto.randomBytes(4).toString('hex');

// Test data
const testCaseA = {
  id: 'test_case_a_' + crypto.randomBytes(4).toString('hex'),
  company_id: COMPANY_A,
  membership_id: 'mem_test_a_' + crypto.randomBytes(4).toString('hex'),
  user_id: 'user_test_a_' + crypto.randomBytes(4).toString('hex'),
  first_failure_at: new Date().toISOString()
};

const testCaseB = {
  id: 'test_case_b_' + crypto.randomBytes(4).toString('hex'),
  company_id: COMPANY_B,
  membership_id: 'mem_test_b_' + crypto.randomBytes(4).toString('hex'),
  user_id: 'user_test_b_' + crypto.randomBytes(4).toString('hex'),
  first_failure_at: new Date().toISOString()
};

async function testRLS() {
  console.log('🔒 Testing Row Level Security (RLS) Functionality\n');
  console.log('=' .repeat(60));

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  async function executeQuery(client, query, params = []) {
    try {
      const result = await client.query(query, params);
      return result;
    } catch (error) {
      return { error: error.message };
    }
  }

  async function testIsolation(client, companyId, expectedCases) {
    console.log(`\n📊 Testing isolation for company: ${companyId.slice(-8)}`);

    let success = true;

    // Count recovery cases
    const caseResult = await executeQuery(client,
      'SELECT COUNT(*) as count FROM recovery_cases WHERE company_id = $1',
      [companyId]
    );

    if (caseResult.error) {
      console.log(`   ❌ Recovery cases query failed: ${caseResult.error}`);
      success = false;
    } else {
      const actualCount = parseInt(caseResult.rows[0].count);
      console.log(`   ✅ Found ${actualCount} recovery cases (expected: ${expectedCases})`);
      if (actualCount !== expectedCases) success = false;
    }

    // Count settings
    const settingsResult = await executeQuery(client,
      'SELECT COUNT(*) as count FROM creator_settings WHERE company_id = $1',
      [companyId]
    );

    if (settingsResult.error) {
      console.log(`   ❌ Settings query failed: ${settingsResult.error}`);
      success = false;
    } else {
      const settingsCount = parseInt(settingsResult.rows[0].count);
      console.log(`   ✅ Found ${settingsCount} settings records`);
    }

    // Test events table isolation
    const eventsResult = await executeQuery(client,
      'SELECT COUNT(*) as count FROM events WHERE company_id = $1',
      [companyId]
    );

    if (eventsResult.error) {
      console.log(`   ❌ Events query failed: ${eventsResult.error}`);
      success = false;
    } else {
      const eventsCount = parseInt(eventsResult.rows[0].count);
      console.log(`   ✅ Found ${eventsCount} events`);
    }

    // Test recovery_actions table isolation
    const actionsResult = await executeQuery(client,
      'SELECT COUNT(*) as count FROM recovery_actions WHERE company_id = $1',
      [companyId]
    );

    if (actionsResult.error) {
      console.log(`   ❌ Recovery actions query failed: ${actionsResult.error}`);
      success = false;
    } else {
      const actionsCount = parseInt(actionsResult.rows[0].count);
      console.log(`   ✅ Found ${actionsCount} recovery actions`);
    }

    return success;
  }

  let success = true;

  try {
    // Test 1: Setup test data
    console.log('📝 Setting up test data...');

    const client = await pool.connect();

    try {
      // Insert test data for both companies
      await executeQuery(client, `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at) VALUES ($1, $2, $3, $4, $5)`, [
        testCaseA.id, testCaseA.company_id, testCaseA.membership_id, testCaseA.user_id, testCaseA.first_failure_at
      ]);

      await executeQuery(client, `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at) VALUES ($1, $2, $3, $4, $5)`, [
        testCaseB.id, testCaseB.company_id, testCaseB.membership_id, testCaseB.user_id, testCaseB.first_failure_at
      ]);

      // Insert test settings
      await executeQuery(client, `INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_days) VALUES ($1, $2, $3, $4) ON CONFLICT (company_id) DO NOTHING`, [
        COMPANY_A, true, false, 3
      ]);

      await executeQuery(client, `INSERT INTO creator_settings (company_id, enable_push, enable_dm, incentive_days) VALUES ($1, $2, $3, $4) ON CONFLICT (company_id) DO NOTHING`, [
        COMPANY_B, false, true, 0
      ]);

      // Insert test events
      await executeQuery(client, `INSERT INTO events (id, company_id, event_type, event_data, occurred_at) VALUES ($1, $2, $3, $4, $5)`, [
        'test_event_a_' + crypto.randomBytes(4).toString('hex'), COMPANY_A, 'payment.succeeded', JSON.stringify({ membership_id: testCaseA.membership_id }), new Date().toISOString()
      ]);

      await executeQuery(client, `INSERT INTO events (id, company_id, event_type, event_data, occurred_at) VALUES ($1, $2, $3, $4, $5)`, [
        'test_event_b_' + crypto.randomBytes(4).toString('hex'), COMPANY_B, 'payment.failed', JSON.stringify({ membership_id: testCaseB.membership_id }), new Date().toISOString()
      ]);

      // Insert test recovery actions
      await executeQuery(client, `INSERT INTO recovery_actions (company_id, case_id, membership_id, user_id, type, channel, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        COMPANY_A, testCaseA.id, testCaseA.membership_id, testCaseA.user_id, 'nudge_push', 'push', JSON.stringify({ attemptNumber: 1 })
      ]);

      await executeQuery(client, `INSERT INTO recovery_actions (company_id, case_id, membership_id, user_id, type, channel, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        COMPANY_B, testCaseB.id, testCaseB.membership_id, testCaseB.user_id, 'nudge_dm', 'dm', JSON.stringify({ attemptNumber: 1 })
      ]);

      console.log('   ✅ Test data inserted for all tables');

      // Test 2: Verify no company context = no access
      console.log('\n🚫 Testing: No company context should show 0 rows');

      const noContextResult = await executeQuery(client, 'SELECT COUNT(*) as count FROM recovery_cases');
      if (noContextResult.error) {
        console.log(`   ❌ Query without context failed: ${noContextResult.error}`);
        success = false;
      } else {
        const count = parseInt(noContextResult.rows[0].count);
        if (count > 0) {
          console.log(`   ❌ Expected 0 rows without context, got ${count}`);
          success = false;
        } else {
          console.log(`   ✅ Got ${count} rows (correctly isolated)`);
        }
      }

      // Test 3: Test Company A isolation
      if (!(await testIsolation(client, COMPANY_A, 1))) {
        success = false;
      }

      // Test 4: Test Company B isolation
      if (!(await testIsolation(client, COMPANY_B, 1))) {
        success = false;
      }

      // Test 5: Cross-company access should fail
      console.log('\n🛡️  Testing: Cross-company access prevention');

      // Try to insert a case for Company A while acting as Company B
      await executeQuery(client, 'SELECT set_company_context($1)', [COMPANY_B]);

      const crossInsert = await executeQuery(client, `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at) VALUES ($1, $2, $3, $4, $5)`, [
        'cross_company_test', COMPANY_A, 'mem_cross', 'user_cross', new Date().toISOString()
      ]);

      if (crossInsert.error && crossInsert.error.includes('Access denied')) {
        console.log('   ✅ Cross-company insert correctly blocked');
      } else {
        console.log('   ❌ Cross-company insert was not blocked');
        success = false;
      }

      // Test 6: Verify different companies can't access each other's data when context is set
      console.log('\n🔍 Testing: Company A cannot access Company B data');

      await executeQuery(client, 'SELECT set_company_context($1)', [COMPANY_A]);
      const companyAViewB = await executeQuery(client, 'SELECT COUNT(*) as count FROM recovery_cases WHERE company_id = $1', [COMPANY_B]);

      if (companyAViewB.error) {
        console.log(`   ❌ Query failed: ${companyAViewB.error}`);
        success = false;
      } else if (parseInt(companyAViewB.rows[0].count) > 0) {
        console.log('   ❌ Company A can access Company B data (RLS breach!)');
        success = false;
      } else {
        console.log('   ✅ Company A correctly isolated from Company B data');
      }

      // Test 7: Test events table isolation
      console.log('\n📋 Testing: Events table RLS policies');

      await executeQuery(client, 'SELECT set_company_context($1)', [COMPANY_A]);
      const eventsA = await executeQuery(client, 'SELECT COUNT(*) as count FROM events WHERE company_id = $1', [COMPANY_A]);
      const eventsB = await executeQuery(client, 'SELECT COUNT(*) as count FROM events WHERE company_id = $1', [COMPANY_B]);

      if (eventsA.error || eventsB.error) {
        console.log('   ❌ Events isolation test failed');
        success = false;
      } else {
        const countA = parseInt(eventsA.rows[0].count);
        const countB = parseInt(eventsB.rows[0].count);
        if (countA === 1 && countB === 0) {
          console.log('   ✅ Events table correctly isolated');
        } else {
          console.log(`   ❌ Events isolation failed: Company A saw ${countA} events, Company B saw ${countB} events`);
          success = false;
        }
      }

      // Test 8: Test recovery_actions table isolation
      console.log('\n📋 Testing: Recovery actions table RLS policies');

      const actionsA = await executeQuery(client, 'SELECT COUNT(*) as count FROM recovery_actions WHERE company_id = $1', [COMPANY_A]);
      const actionsB = await executeQuery(client, 'SELECT COUNT(*) as count FROM recovery_actions WHERE company_id = $1', [COMPANY_B]);

      if (actionsA.error || actionsB.error) {
        console.log('   ❌ Recovery actions isolation test failed');
        success = false;
      } else {
        const countA = parseInt(actionsA.rows[0].count);
        const countB = parseInt(actionsB.rows[0].count);
        if (countA === 1 && countB === 0) {
          console.log('   ✅ Recovery actions table correctly isolated');
        } else {
          console.log(`   ❌ Recovery actions isolation failed: Company A saw ${countA} actions, Company B saw ${countB} actions`);
          success = false;
        }
      }

      // Test 9: Test cross-table consistency
      console.log('\n🔗 Testing: Cross-table data consistency');

      await executeQuery(client, 'SELECT set_company_context($1)', [COMPANY_A]);
      const crossTableResult = await executeQuery(client, `
        SELECT
          (SELECT COUNT(*) FROM recovery_cases WHERE company_id = $1) as cases,
          (SELECT COUNT(*) FROM events WHERE company_id = $1) as events,
          (SELECT COUNT(*) FROM recovery_actions WHERE company_id = $1) as actions,
          (SELECT COUNT(*) FROM creator_settings WHERE company_id = $1) as settings
      `, [COMPANY_A]);

      if (crossTableResult.error) {
        console.log('   ❌ Cross-table consistency test failed');
        success = false;
      } else {
        const row = crossTableResult.rows[0];
        if (row.cases === '1' && row.events === '1' && row.actions === '1' && row.settings === '1') {
          console.log('   ✅ Cross-table data consistency maintained');
        } else {
          console.log(`   ❌ Cross-table inconsistency: cases=${row.cases}, events=${row.events}, actions=${row.actions}, settings=${row.settings}`);
          success = false;
        }
      }

      // Cleanup test data
      console.log('\n🧹 Cleaning up test data...');

      // Reset context to access all data for cleanup
      await executeQuery(client, 'RESET app.current_company_id');

      await executeQuery(client, 'DELETE FROM recovery_cases WHERE company_id IN ($1, $2)', [COMPANY_A, COMPANY_B]);
      await executeQuery(client, 'DELETE FROM creator_settings WHERE company_id IN ($1, $2)', [COMPANY_A, COMPANY_B]);
      await executeQuery(client, 'DELETE FROM events WHERE company_id IN ($1, $2)', [COMPANY_A, COMPANY_B]);
      await executeQuery(client, 'DELETE FROM recovery_actions WHERE company_id IN ($1, $2)', [COMPANY_A, COMPANY_B]);

      console.log('   ✅ Test data cleaned up from all tables');

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    success = false;
  } finally {
    await pool.end();
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('🎯 RLS VALIDATION RESULTS');
  console.log('=' .repeat(60));

  if (success) {
    console.log('✅ ALL RLS TESTS PASSED');
    console.log('\n✨ Row Level Security is properly configured!');
    console.log('   • Multi-tenant data isolation working correctly');
    console.log('   • Cross-company access prevention active');
    console.log('   • Defense-in-depth security layer operational');
  } else {
    console.log('❌ RLS TESTS FAILED');
    console.log('\n⚠️  Data isolation may be compromised. Please review RLS setup.');
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testRLS().catch(error => {
    console.error('RLS validation script failed:', error);
    process.exit(1);
  });
}
