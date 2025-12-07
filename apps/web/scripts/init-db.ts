// Database initialization script
// Runs migrations and tests connection

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initDb, sql, closeDb } from '../src/lib/db';
import { logger } from '../src/lib/logger';

// Load environment variables from .env files manually
function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  } catch (error) {
    // File doesn't exist, ignore
  }
}

// Try to load .env files in order of precedence
// Get the script directory (works with both CommonJS and ESM)
const scriptDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : new URL('.', import.meta.url).pathname;

loadEnvFile(resolve(scriptDir, '../.env.local'));
loadEnvFile(resolve(scriptDir, '../.env.development'));
loadEnvFile(resolve(scriptDir, '../.env'));

// Also check if DATABASE_URL is set, if not provide helpful message
if (!process.env.DATABASE_URL) {
  console.error('\n⚠️  DATABASE_URL not found in environment');
  console.error('Make sure your .env.local file contains:');
  console.error('DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev\n');
}

async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    // Read migration file
    const migrationPath = resolve(
      scriptDir,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('Database initialization failed', {
      error: errorMessage,
      stack: errorStack,
    });
    console.error('\n❌ Database initialization failed:');
    console.error(errorMessage);
    if (errorStack) {
      console.error('\nStack trace:');
      console.error(errorStack);
    }
    process.exit(1);
  } finally {
    await closeDb();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
