// Database initialization script
// Runs migrations and tests connection

import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
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
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.slice(0, eqIndex).trim();
        const rawValue = trimmed.slice(eqIndex + 1);
        const normalizedValue = rawValue.trim();

        let value = normalizedValue;
        const quoteMatch = normalizedValue.match(/^(['"])(.*)\1$/);
        if (quoteMatch) {
          value = quoteMatch[2];
        } else if (
          /^['"]/.test(normalizedValue) ||
          /['"]$/.test(normalizedValue)
        ) {
          throw new Error(
            `Invalid quoted value for ${key} in ${filePath}: remove trailing content or unmatched quotes`
          );
        }

        if (!key || value === '') continue;

        // Validate DATABASE_URL format before setting it
        if (key === 'DATABASE_URL') {
          try {
            // Accept any well-formed URL (postgres, supabase, etc.)
            // and fail fast if it is malformed to avoid confusing downstream errors.
            // eslint-disable-next-line no-new
            new URL(value);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Invalid URL';
            throw new Error(
              `Invalid DATABASE_URL in ${filePath}: ${message}`
            );
          }
        }

        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch (error) {
    // Ignore missing files, but surface all other errors (including validation failures)
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

// Try to load .env files in order of precedence
// Get the script directory (works with both CommonJS and ESM)
const scriptDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : fileURLToPath(new URL('.', import.meta.url));

loadEnvFile(resolve(scriptDir, '../.env.local'));
loadEnvFile(resolve(scriptDir, '../.env.development'));
loadEnvFile(resolve(scriptDir, '../.env'));

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

// Also check if DATABASE_URL is set, if not provide helpful message
if (!hasDatabaseUrl) {
  console.error('\n⚠️  DATABASE_URL not found in environment');
  console.error('Make sure your .env.local file contains:');
  console.error('DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev\n');
}

function resolveMigrationsDir(): string {
  // Prefer repo root (cwd) when script is invoked from arbitrary locations (e.g. npx tsx),
  // but keep scriptDir as a reliable fallback when the script path is resolvable.
  const candidateRoots = [
    process.cwd(),
    resolve(scriptDir, '../../..'),
  ];

  for (const root of candidateRoots) {
    const candidateDir = resolve(root, 'infra/migrations');
    const sentinel = resolve(candidateDir, '001_init.sql');
    if (existsSync(sentinel)) {
      return candidateDir;
    }
  }

  throw new Error(
    'Could not locate infra/migrations/001_init.sql from cwd or script directory'
  );
}

function listMigrationFiles(migrationsDir: string): string[] {
  const files = readdirSync(migrationsDir)
    .filter(
      (file) =>
        file.endsWith('.sql') &&
        !file.toLowerCase().includes('rollback') &&
        !file.toLowerCase().startsWith('.')
    )
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10);
      const numB = Number.parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });

  if (files.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  return files;
}

async function runMigrations(): Promise<void> {
  try {
    logger.info('Running database migrations...');

    const migrationsDir = resolveMigrationsDir();
    const files = listMigrationFiles(migrationsDir);

    logger.info('Discovered migration files', {
      dir: migrationsDir,
      count: files.length,
      files,
    });

    for (const file of files) {
      const migrationPath = resolve(migrationsDir, file);
      const migrationSQL = readFileSync(migrationPath, 'utf-8');

      logger.info('Executing migration SQL', {
        file,
        size: migrationSQL.length,
        preview: migrationSQL.substring(0, 100) + '...',
      });

      await sql.execute(migrationSQL);
    }

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

// Run if called directly (CJS or ESM/tsx)
const isDirectRun =
  (typeof import.meta !== 'undefined' &&
    typeof process?.argv?.[1] === 'string' &&
    import.meta.url === pathToFileURL(process.argv[1]).href) ||
  (typeof require !== 'undefined' && require.main === module);

if (isDirectRun) {
  if (!hasDatabaseUrl) {
    process.exit(1);
  }
  // Wrap in async IIFE to avoid top-level await in CJS execution
  (async () => {
    await main();
  })().catch((error) => {
    logger.error('Database initialization failed (unhandled)', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
