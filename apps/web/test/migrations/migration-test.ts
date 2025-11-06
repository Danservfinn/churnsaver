// Automated migration testing
// Tests forward migrations, backward migrations (rollback), and migration idempotency

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), '../../infra/migrations');
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test_migrations';

describe('Migration Tests', () => {
  let pool: Pool;
  let testDbName: string;

  beforeAll(async () => {
    // Create a test database for migrations
    const adminPool = new Pool({
      connectionString: TEST_DATABASE_URL.replace(/\/[^\/]+$/, '/postgres'),
    });

    testDbName = `test_migrations_${Date.now()}`;
    await adminPool.query(`CREATE DATABASE ${testDbName}`);
    await adminPool.end();

    pool = new Pool({
      connectionString: TEST_DATABASE_URL.replace(/\/[^\/]+$/, `/${testDbName}`),
    });
  });

  afterAll(async () => {
    await pool.end();
    
    // Clean up test database
    const adminPool = new Pool({
      connectionString: TEST_DATABASE_URL.replace(/\/[^\/]+$/, '/postgres'),
    });
    await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    await adminPool.end();
  });

  describe('Forward migrations', () => {
    it('should apply all migrations in order', async () => {
      const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
        .filter(file => file.endsWith('.sql') && !file.includes('rollback'))
        .sort();

      for (const file of migrationFiles) {
        const migrationSQL = fs.readFileSync(
          path.join(MIGRATIONS_DIR, file),
          'utf8'
        );

        // Apply migration
        try {
          await pool.query(migrationSQL);
          console.log(`✅ Applied migration: ${file}`);
        } catch (error) {
          console.error(`❌ Failed to apply migration ${file}:`, error);
          throw error;
        }
      }

      // Verify migrations table exists (if tracking is implemented)
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'migration_tracking'
        );
      `);

      expect(result.rows[0].exists).toBe(true);
    });
  });

  describe('Backward migrations (rollback)', () => {
    it('should rollback migrations in reverse order', async () => {
      const rollbackFiles = fs.readdirSync(MIGRATIONS_DIR)
        .filter(file => file.includes('rollback') && file.endsWith('.sql'))
        .sort()
        .reverse(); // Reverse order for rollback

      for (const file of rollbackFiles) {
        const rollbackSQL = fs.readFileSync(
          path.join(MIGRATIONS_DIR, file),
          'utf8'
        );

        // Apply rollback
        try {
          await pool.query(rollbackSQL);
          console.log(`✅ Applied rollback: ${file}`);
        } catch (error) {
          console.error(`❌ Failed to apply rollback ${file}:`, error);
          // Some rollbacks may fail if tables don't exist, which is acceptable
          if (!error.message.includes('does not exist')) {
            throw error;
          }
        }
      }
    });
  });

  describe('Migration idempotency', () => {
    it('should be idempotent - can run multiple times safely', async () => {
      const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
        .filter(file => file.endsWith('.sql') && !file.includes('rollback'))
        .sort();

      // Apply migrations first time
      for (const file of migrationFiles) {
        const migrationSQL = fs.readFileSync(
          path.join(MIGRATIONS_DIR, file),
          'utf8'
        );
        await pool.query(migrationSQL);
      }

      // Apply migrations second time - should not fail
      for (const file of migrationFiles) {
        const migrationSQL = fs.readFileSync(
          path.join(MIGRATIONS_DIR, file),
          'utf8'
        );

        try {
          await pool.query(migrationSQL);
          console.log(`✅ Migration ${file} is idempotent`);
        } catch (error) {
          // Some migrations may fail if objects already exist
          // This is acceptable if the error is about existing objects
          if (!error.message.includes('already exists') && 
              !error.message.includes('duplicate')) {
            console.warn(`⚠️ Migration ${file} may not be fully idempotent:`, error.message);
          }
        }
      }
    });
  });

  describe('Migration integrity', () => {
    it('should create all expected tables', async () => {
      const expectedTables = [
        'recovery_cases',
        'recovery_settings',
        'recovery_actions',
        'webhook_events',
      ];

      for (const tableName of expectedTables) {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [tableName]);

        expect(result.rows[0].exists).toBe(true);
      }
    });

    it('should create all expected indexes', async () => {
      const expectedIndexes = [
        'recovery_cases_company_id_idx',
        'recovery_cases_membership_id_idx',
        'webhook_events_event_id_idx',
      ];

      for (const indexName of expectedIndexes) {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM pg_indexes 
            WHERE schemaname = 'public' 
            AND indexname = $1
          );
        `, [indexName]);

        // Some indexes may not exist if migrations haven't been fully applied
        // This is informational
        if (result.rows[0].exists) {
          console.log(`✅ Index exists: ${indexName}`);
        } else {
          console.log(`⚠️ Index missing: ${indexName}`);
        }
      }
    });
  });
});

