#!/usr/bin/env node

/**
 * Rollback Testing Script
 * Tests rollback procedures in a safe environment
 * 
 * Usage:
 *   node test-rollback.js --migration=010  # Test specific migration rollback
 *   node test-rollback.js --all            # Test all rollback procedures
 *   node test-rollback.js --dry-run        # Validate rollback files without executing
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: TEST_DATABASE_URL or DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

class RollbackTester {
  constructor() {
    this.migrations = this.loadMigrations();
    this.testResults = [];
  }

  loadMigrations() {
    const migrations = [];
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql') && !file.includes('_rollback'))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_([^.]+)\.sql$/);
      if (match) {
        const number = parseInt(match[1]);
        const name = match[2];
        const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        const rollbackFile = path.join(MIGRATIONS_DIR, `${number}_rollback.sql`);
        const rollbackContent = fs.existsSync(rollbackFile) 
          ? fs.readFileSync(rollbackFile, 'utf8')
          : null;
        
        migrations.push({
          number,
          name,
          filename: file,
          content,
          rollbackFile,
          rollbackContent
        });
      }
    }

    return migrations;
  }

  async createTestDatabase() {
    console.log('🔧 Creating test database environment...');
    
    try {
      // Create test schema
      await pool.query('CREATE SCHEMA IF NOT EXISTS test_rollback');
      await pool.query('SET search_path TO test_rollback, public');
      
      console.log('✅ Test environment created');
    } catch (error) {
      console.error('❌ Failed to create test environment:', error.message);
      throw error;
    }
  }

  async cleanupTestDatabase() {
    console.log('🧹 Cleaning up test environment...');
    
    try {
      await pool.query('DROP SCHEMA IF EXISTS test_rollback CASCADE');
      await pool.query('RESET search_path');
      
      console.log('✅ Test environment cleaned up');
    } catch (error) {
      console.error('❌ Failed to cleanup test environment:', error.message);
    }
  }

  async validateRollbackFile(migration) {
    console.log(`\n🔍 Validating rollback file for migration ${migration.number}: ${migration.name}`);
    
    const issues = [];
    
    if (!migration.rollbackContent) {
      issues.push('Missing rollback file');
      return { valid: false, issues };
    }

    // Check for dangerous operations
    const dangerousPatterns = [
      /DROP\s+TABLE\s+IF\s+NOT\s+EXISTS/gi,
      /DROP\s+SCHEMA\s+IF\s+NOT\s+EXISTS/gi,
      /TRUNCATE/gi
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(migration.rollbackContent)) {
        issues.push(`Contains potentially dangerous pattern: ${pattern.source}`);
      }
    }

    // Check for proper error handling
    if (!migration.rollbackContent.includes('BEGIN') && !migration.rollbackContent.includes('START TRANSACTION')) {
      issues.push('Missing transaction start (BEGIN/START TRANSACTION)');
    }

    if (!migration.rollbackContent.includes('ROLLBACK') && !migration.rollbackContent.includes('COMMIT')) {
      issues.push('Missing transaction handling (COMMIT/ROLLBACK)');
    }

    // Check for idempotent operations
    if (!migration.rollbackContent.includes('IF NOT EXISTS') && !migration.rollbackContent.includes('DROP IF EXISTS')) {
      issues.push('May not be idempotent - consider adding IF NOT EXISTS/DROP IF EXISTS');
    }

    // Check for data preservation warnings
    if (migration.rollbackContent.includes('DROP TABLE') && !migration.rollbackContent.includes('WARNING')) {
      issues.push('Drops table without data preservation warning');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  async testMigrationRollback(migration) {
    console.log(`\n🧪 Testing rollback for migration ${migration.number}: ${migration.name}`);
    
    const testResult = {
      migration: migration.number,
      name: migration.name,
      valid: false,
      issues: [],
      executionTime: 0
    };

    const startTime = Date.now();

    try {
      // Validate rollback file first
      const validation = await this.validateRollbackFile(migration);
      if (!validation.valid) {
        testResult.issues.push(...validation.issues);
        this.testResults.push(testResult);
        return testResult;
      }

      // Execute forward migration
      await pool.query('BEGIN');
      try {
        await pool.query(migration.content);
        await pool.query('COMMIT');
        console.log(`  ✅ Forward migration executed`);
      } catch (error) {
        await pool.query('ROLLBACK');
        throw new Error(`Forward migration failed: ${error.message}`);
      }

      // Verify forward migration created expected objects
      const verificationResult = await this.verifyMigrationObjects(migration);
      if (!verificationResult.success) {
        testResult.issues.push(...verificationResult.issues);
      }

      // Execute rollback
      await pool.query('BEGIN');
      try {
        await pool.query(migration.rollbackContent);
        await pool.query('COMMIT');
        console.log(`  ✅ Rollback executed`);
      } catch (error) {
        await pool.query('ROLLBACK');
        throw new Error(`Rollback failed: ${error.message}`);
      }

      // Verify rollback removed expected objects
      const rollbackVerification = await this.verifyRollbackCleanup(migration);
      if (!rollbackVerification.success) {
        testResult.issues.push(...rollbackVerification.issues);
      }

      testResult.valid = testResult.issues.length === 0;
      testResult.executionTime = Date.now() - startTime;

      if (testResult.valid) {
        console.log(`  ✅ Rollback test passed (${testResult.executionTime}ms)`);
      } else {
        console.log(`  ❌ Rollback test failed: ${testResult.issues.join(', ')}`);
      }

    } catch (error) {
      testResult.issues.push(`Test execution failed: ${error.message}`);
      console.log(`  ❌ Test failed: ${error.message}`);
    }

    this.testResults.push(testResult);
    return testResult;
  }

  async verifyMigrationObjects(migration) {
    const issues = [];
    const expectedObjects = this.extractExpectedObjects(migration.content);

    for (const obj of expectedObjects) {
      try {
        const result = await pool.query(this.getVerificationQuery(obj));
        if (result.rows.length === 0) {
          issues.push(`Expected ${obj.type} ${obj.name} not found`);
        }
      } catch (error) {
        issues.push(`Failed to verify ${obj.type} ${obj.name}: ${error.message}`);
      }
    }

    return {
      success: issues.length === 0,
      issues
    };
  }

  async verifyRollbackCleanup(migration) {
    const issues = [];
    const expectedObjects = this.extractExpectedObjects(migration.content);

    for (const obj of expectedObjects) {
      try {
        const result = await pool.query(this.getVerificationQuery(obj));
        if (result.rows.length > 0) {
          issues.push(`${obj.type} ${obj.name} still exists after rollback`);
        }
      } catch (error) {
        // Expected - object should not exist
      }
    }

    return {
      success: issues.length === 0,
      issues
    };
  }

  extractExpectedObjects(content) {
    const objects = [];
    
    // Extract tables
    const tableMatches = content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi);
    if (tableMatches) {
      for (const match of tableMatches) {
        const tableName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'table', name: tableName });
      }
    }

    // Extract indexes
    const indexMatches = content.match(/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi);
    if (indexMatches) {
      for (const match of indexMatches) {
        const indexName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'index', name: indexName });
      }
    }

    // Extract functions
    const functionMatches = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+)/gi);
    if (functionMatches) {
      for (const match of functionMatches) {
        const functionName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'function', name: functionName });
      }
    }

    // Extract schemas
    const schemaMatches = content.match(/CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi);
    if (schemaMatches) {
      for (const match of schemaMatches) {
        const schemaName = match.match(/(\w+)$/)[1];
        objects.push({ type: 'schema', name: schemaName });
      }
    }

    return objects;
  }

  getVerificationQuery(obj) {
    switch (obj.type) {
      case 'table':
        return `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'test_rollback' AND table_name = '${obj.name}'
        `;
      case 'index':
        return `
          SELECT indexname 
          FROM pg_indexes 
          WHERE schemaname = 'test_rollback' AND indexname = '${obj.name}'
        `;
      case 'function':
        return `
          SELECT routine_name 
          FROM information_schema.routines 
          WHERE routine_schema = 'test_rollback' AND routine_name = '${obj.name}'
        `;
      case 'schema':
        return `
          SELECT schema_name 
          FROM information_schema.schemata 
          WHERE schema_name = 'test_rollback'
        `;
      default:
        return `SELECT 1 WHERE false`;
    }
  }

  async runTests(options = {}) {
    console.log('🚀 Starting rollback tests...\n');

    try {
      await this.createTestDatabase();

      let migrationsToTest = this.migrations;
      
      if (options.migration) {
        migrationsToTest = this.migrations.filter(m => m.number === options.migration);
      }

      if (options.dryRun) {
        console.log('🔍 Dry run mode - validating rollback files only\n');
        for (const migration of migrationsToTest) {
          await this.validateRollbackFile(migration);
        }
      } else {
        for (const migration of migrationsToTest) {
          await this.testMigrationRollback(migration);
        }
      }

      this.printResults();

    } catch (error) {
      console.error('💥 Test suite failed:', error.message);
    } finally {
      await this.cleanupTestDatabase();
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));

    const passed = this.testResults.filter(r => r.valid).length;
    const failed = this.testResults.filter(r => !r.valid).length;
    const total = this.testResults.length;

    console.log(`\nTotal tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      for (const result of this.testResults.filter(r => !r.valid)) {
        console.log(`\n  Migration ${result.migration}: ${result.name}`);
        for (const issue of result.issues) {
          console.log(`    - ${issue}`);
        }
      }
    }

    console.log('\n' + '='.repeat(80));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--migration=')) {
      options.migration = parseInt(arg.split('=')[1]);
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help') {
      console.log(`
Usage: node test-rollback.js [options]

Options:
  --migration=N    Test specific migration number
  --all           Test all migrations
  --dry-run       Validate rollback files without executing
  --help          Show this help message

Examples:
  node test-rollback.js --migration=010     # Test migration 010 rollback
  node test-rollback.js --all               # Test all rollbacks
  node test-rollback.js --dry-run           # Validate rollback files only
      `);
      process.exit(0);
    }
  }

  if (!options.migration && !options.all && !options.dryRun) {
    console.error('ERROR: Please specify --migration=N, --all, or --dry-run');
    process.exit(1);
  }

  const tester = new RollbackTester();

  try {
    await tester.runTests(options);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = RollbackTester;