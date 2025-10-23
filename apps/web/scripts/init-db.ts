// Database initialization script
// Runs migrations and tests connection

import { readFileSync } from 'fs';
import { join } from 'path';
import { initDb, sql, closeDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    // Read migration file
    const migrationPath = join(
      __dirname,
      '../../../infra/migrations/001_init.sql'
    );
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    // Execute the entire migration as one statement
    // The IF NOT EXISTS clauses will handle duplicates safely
    logger.info('Executing migration SQL', {
      size: migrationSQL.length,
      preview: migrationSQL.substring(0, 100) + '...',
    });

    await sql.execute(migrationSQL);

    logger.info('Migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    // Initialize database connection
    await initDb();

    // Run migrations
    await runMigrations();

    // Test basic queries
    const testResult = await sql.select<{ version: string }>('SELECT version()');
    logger.info('Database version check', {
      version: testResult[0]?.version?.substring(0, 50),
    });

    // Test table creation
    const tablesResult = await sql.select(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('events', 'recovery_cases', 'creator_settings')
      ORDER BY table_name
    `);

    const tableNames = tablesResult.map((row) => (row as { table_name: string }).table_name);
    logger.info('Created tables', { tables: tableNames });

    logger.info('Database initialization completed successfully');
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  } finally {
    await closeDb();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
