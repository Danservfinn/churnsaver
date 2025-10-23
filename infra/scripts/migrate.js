#!/usr/bin/env node

/**
 * Migration Management Script
 * Handles forward migrations and rollbacks with state tracking
 * 
 * Usage:
 *   node migrate.js up [migration_number] - Run forward migrations
 *   node migrate.js down [migration_number] - Rollback migrations
 *   node migrate.js status - Show migration status
 *   node migrate.js validate - Validate migration integrity
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS_DIR = path.join(__dirname, '../migrations');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL or POSTGRES_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

class MigrationManager {
  constructor() {
    this.migrations = this.loadMigrations();
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
        const checksum = crypto.createHash('sha256').update(content).digest('hex');
        
        migrations.push({
          number,
          name,
          filename: file,
          content,
          checksum,
          rollbackFile: path.join(MIGRATIONS_DIR, `${number}_rollback.sql`)
        });
      }
    }

    return migrations;
  }

  async ensureMigrationTable() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS migration_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          migration_number integer NOT NULL UNIQUE,
          migration_name text NOT NULL,
          migration_type text NOT NULL CHECK (migration_type IN ('forward', 'rollback')),
          status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
          checksum text NOT NULL,
          executed_at timestamptz DEFAULT now(),
          completed_at timestamptz,
          error_message text,
          execution_time_ms integer,
          rollback_data jsonb DEFAULT '{}'::jsonb
        )
      `);
    } catch (error) {
      console.error('Error ensuring migration table:', error.message);
      throw error;
    }
  }

  async getLastExecutedMigration() {
    try {
      const result = await pool.query(`
        SELECT COALESCE(MAX(migration_number), 0) as last_migration
        FROM migration_history
        WHERE status = 'completed' AND migration_type = 'forward'
      `);
      return parseInt(result.rows[0].last_migration);
    } catch (error) {
      console.error('Error getting last executed migration:', error.message);
      return 0;
    }
  }

  async recordMigrationStart(migration, type = 'forward') {
    try {
      const result = await pool.query(`
        INSERT INTO migration_history (
          migration_number, migration_name, migration_type, status, checksum
        ) VALUES ($1, $2, $3, 'running', $4)
        RETURNING id
      `, [migration.number, migration.name, type, migration.checksum]);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Error recording migration start:', error.message);
      throw error;
    }
  }

  async recordMigrationComplete(migrationId, success = true, errorMessage = null) {
    try {
      await pool.query(`
        UPDATE migration_history
        SET 
          status = $1,
          completed_at = now(),
          error_message = $2,
          execution_time_ms = EXTRACT(EPOCH FROM (now() - executed_at)) * 1000
        WHERE id = $3
      `, [success ? 'completed' : 'failed', errorMessage, migrationId]);
    } catch (error) {
      console.error('Error recording migration completion:', error.message);
      throw error;
    }
  }

  async executeMigration(migration) {
    console.log(`\n🔄 Executing migration ${migration.number}: ${migration.name}`);
    
    const migrationId = await this.recordMigrationStart(migration);
    const startTime = Date.now();

    try {
      await pool.query('BEGIN');
      
      // Execute migration content
      await pool.query(migration.content);
      
      await pool.query('COMMIT');
      
      const executionTime = Date.now() - startTime;
      await this.recordMigrationComplete(migrationId, true);
      
      console.log(`✅ Migration ${migration.number} completed successfully (${executionTime}ms)`);
      return true;
    } catch (error) {
      await pool.query('ROLLBACK');
      await this.recordMigrationComplete(migrationId, false, error.message);
      
      console.error(`❌ Migration ${migration.number} failed:`, error.message);
      return false;
    }
  }

  async executeRollback(migration) {
    if (!fs.existsSync(migration.rollbackFile)) {
      console.error(`❌ Rollback file not found: ${migration.rollbackFile}`);
      return false;
    }

    console.log(`\n⏪ Rolling back migration ${migration.number}: ${migration.name}`);
    
    const rollbackContent = fs.readFileSync(migration.rollbackFile, 'utf8');
    const migrationId = await this.recordMigrationStart(migration, 'rollback');
    const startTime = Date.now();

    try {
      await pool.query('BEGIN');
      
      // Execute rollback content
      await pool.query(rollbackContent);
      
      // Mark original migration as rolled back
      await pool.query(`
        UPDATE migration_history
        SET status = 'rolled_back'
        WHERE migration_number = $1 AND migration_type = 'forward'
      `, [migration.number]);
      
      await pool.query('COMMIT');
      
      const executionTime = Date.now() - startTime;
      await this.recordMigrationComplete(migrationId, true);
      
      console.log(`✅ Rollback ${migration.number} completed successfully (${executionTime}ms)`);
      return true;
    } catch (error) {
      await pool.query('ROLLBACK');
      await this.recordMigrationComplete(migrationId, false, error.message);
      
      console.error(`❌ Rollback ${migration.number} failed:`, error.message);
      return false;
    }
  }

  async migrateUp(targetMigration = null) {
    console.log('🚀 Starting forward migration...');
    
    await this.ensureMigrationTable();
    const lastMigration = await this.getLastExecutedMigration();
    
    const migrationsToRun = this.migrations.filter(m => 
      m.number > lastMigration && (!targetMigration || m.number <= targetMigration)
    );

    if (migrationsToRun.length === 0) {
      console.log('✅ No migrations to run');
      return true;
    }

    console.log(`Found ${migrationsToRun.length} migrations to run`);

    for (const migration of migrationsToRun) {
      const success = await this.executeMigration(migration);
      if (!success) {
        console.error(`\n💥 Migration failed at ${migration.number}. Stopping.`);
        return false;
      }
    }

    console.log('\n🎉 All migrations completed successfully!');
    return true;
  }

  async migrateDown(targetMigration) {
    console.log('⏪ Starting rollback...');
    
    await this.ensureMigrationTable();
    const lastMigration = await this.getLastExecutedMigration();
    
    if (targetMigration >= lastMigration) {
      console.log('✅ No migrations to rollback');
      return true;
    }

    const migrationsToRollback = this.migrations
      .filter(m => m.number > targetMigration && m.number <= lastMigration)
      .reverse(); // Rollback in reverse order

    if (migrationsToRollback.length === 0) {
      console.log('✅ No migrations to rollback');
      return true;
    }

    console.log(`Found ${migrationsToRollback.length} migrations to rollback`);

    for (const migration of migrationsToRollback) {
      const success = await this.executeRollback(migration);
      if (!success) {
        console.error(`\n💥 Rollback failed at ${migration.number}. Stopping.`);
        return false;
      }
    }

    console.log('\n🎉 All rollbacks completed successfully!');
    return true;
  }

  async showStatus() {
    console.log('\n📊 Migration Status:');
    console.log('─'.repeat(60));
    
    await this.ensureMigrationTable();
    const lastMigration = await this.getLastExecutedMigration();
    
    const result = await pool.query(`
      SELECT migration_number, migration_name, status, executed_at, execution_time_ms
      FROM migration_history
      WHERE migration_type = 'forward'
      ORDER BY migration_number
    `);

    for (const migration of this.migrations) {
      const history = result.rows.find(r => r.migration_number === migration.number);
      const status = history ? history.status : 'pending';
      const icon = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
      const time = history?.execution_time_ms ? `${history.execution_time_ms}ms` : '-';
      
      console.log(`${icon} ${migration.number.toString().padStart(3)}: ${migration.name.padEnd(25)} ${status.padEnd(10)} ${time}`);
    }

    console.log(`\nCurrent migration: ${lastMigration}`);
  }

  async validateMigrations() {
    console.log('\n🔍 Validating migrations...');
    
    await this.ensureMigrationTable();
    const result = await pool.query(`
      SELECT migration_number, checksum, status
      FROM migration_history
      WHERE migration_type = 'forward' AND status = 'completed'
      ORDER BY migration_number
    `);

    let allValid = true;

    for (const history of result.rows) {
      const migration = this.migrations.find(m => m.number === history.migration_number);
      if (!migration) {
        console.log(`❌ Migration ${history.migration_number} not found in files`);
        allValid = false;
        continue;
      }

      if (migration.checksum !== history.checksum) {
        console.log(`❌ Migration ${history.migration_number} checksum mismatch`);
        console.log(`   Expected: ${migration.checksum}`);
        console.log(`   Database: ${history.checksum}`);
        allValid = false;
      } else {
        console.log(`✅ Migration ${history.migration_number} valid`);
      }
    }

    // Check for missing rollback files
    for (const migration of this.migrations) {
      if (!fs.existsSync(migration.rollbackFile)) {
        console.log(`⚠️  Migration ${migration.number} missing rollback file`);
      }
    }

    if (allValid) {
      console.log('\n✅ All migrations are valid');
    } else {
      console.log('\n❌ Migration validation failed');
    }

    return allValid;
  }

  async close() {
    await pool.end();
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const target = process.argv[3] ? parseInt(process.argv[3]) : null;

  const manager = new MigrationManager();

  try {
    switch (command) {
      case 'up':
        await manager.migrateUp(target);
        break;
      case 'down':
        if (target === null) {
          console.error('ERROR: Target migration number required for rollback');
          process.exit(1);
        }
        await manager.migrateDown(target);
        break;
      case 'status':
        await manager.showStatus();
        break;
      case 'validate':
        await manager.validateMigrations();
        break;
      default:
        console.log(`
Usage: node migrate.js <command> [options]

Commands:
  up [migration_number]    Run forward migrations (optional: stop at specific migration)
  down <migration_number>  Rollback to specific migration number
  status                   Show migration status
  validate                 Validate migration integrity

Examples:
  node migrate.js up                    # Run all pending migrations
  node migrate.js up 5                  # Run migrations up to migration 5
  node migrate.js down 8                # Rollback to migration 8
  node migrate.js status                # Show current status
  node migrate.js validate              # Validate migration integrity
        `);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = MigrationManager;