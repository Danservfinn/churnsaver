// Database Role Setup Script (TypeScript version)
// Creates the churn_saver_dev role if it doesn't exist
// This fixes the "role churn_saver_dev does not exist" error

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
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
loadEnvFile(resolve(__dirname, '../.env.local'));
loadEnvFile(resolve(__dirname, '../.env.development'));
loadEnvFile(resolve(__dirname, '../.env'));

async function setupDatabaseRole(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    logger.error('DATABASE_URL environment variable is not set');
    console.error('\n❌ DATABASE_URL environment variable is not set');
    console.error('\nPlease set it in your .env.local file:');
    console.error('DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev');
    console.error('\nOr use the default postgres user:');
    console.error('DATABASE_URL=postgresql://postgres:postgres@localhost:5432/churn_saver_dev');
    process.exit(1);
  }

  // Parse DATABASE_URL
  // Format: postgresql://username:password@host:port/database
  const urlMatch = databaseUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):([^/]+)\/(.+)/);
  
  if (!urlMatch) {
    logger.error('Invalid DATABASE_URL format', { url: databaseUrl ? '[REDACTED]' : 'not set' });
    console.error('❌ Invalid DATABASE_URL format');
    console.error('Expected format: postgresql://username:password@host:port/database');
    process.exit(1);
  }

  const [, dbUser, dbPass, dbHost, dbPort, dbName] = urlMatch;

  logger.info('Setting up database role', {
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
  });

  console.log('\n🔧 Setting up database role: churn_saver_dev');
  console.log('==============================================');
  console.log(`📍 Database: ${dbName} on ${dbHost}:${dbPort}`);
  console.log(`   Current user: ${dbUser}\n`);

  // Try to connect as the current user first, then try postgres superuser
  const connectionAttempts = [
    databaseUrl, // Try current user first
    databaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//postgres:postgres@'), // Try postgres:postgres
    databaseUrl.replace(/\/\/[^:]+:[^@]+@/, '//postgres@'), // Try postgres without password
  ];

  let roleCreated = false;
  let client: Client | null = null;

  for (const connectionUrl of connectionAttempts) {
    try {
      client = new Client({ connectionString: connectionUrl });
      await client.connect();
      
      logger.info('Connected to database', {
        url: connectionUrl.includes('postgres') ? '[REDACTED]' : '[REDACTED]',
      });

      // Create role if it doesn't exist
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'churn_saver_dev') THEN
            CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';
            RAISE NOTICE 'Role churn_saver_dev created';
          ELSE
            RAISE NOTICE 'Role churn_saver_dev already exists';
          END IF;
        END
        $$;
      `);

      // Grant privileges on database
      await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO churn_saver_dev;`);
      
      // Grant schema privileges (need to connect to the specific database)
      // Close current connection and reconnect to the target database
      await client.end();
      
      // Reconnect to the specific database to grant schema privileges
      const dbConnectionUrl = connectionUrl.replace(/\/[^/]+$/, `/${dbName}`);
      client = new Client({ connectionString: dbConnectionUrl });
      await client.connect();
      
      await client.query(`GRANT ALL ON SCHEMA public TO churn_saver_dev;`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO churn_saver_dev;`);
      await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO churn_saver_dev;`);

      logger.info('Database role created successfully');
      console.log('✅ Successfully created role: churn_saver_dev');
      console.log('✅ Granted database privileges');
      roleCreated = true;
      break;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Connection attempt failed', {
        error: errorMessage,
      });
      
      if (client) {
        try {
          await client.end();
        } catch {
          // Ignore cleanup errors
        }
      }
      client = null;
      continue;
    }
  }

  if (!roleCreated) {
    logger.error('Could not create database role automatically');
    console.error('\n⚠️  Could not create role automatically. Please run manually:');
    console.error('\nConnect to PostgreSQL as superuser:');
    console.error(`  psql -U postgres -d ${dbName}`);
    console.error('\nThen run:');
    console.error("  CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';");
    console.error(`  GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO churn_saver_dev;`);
    console.error(`  \\c ${dbName}`);
    console.error('  GRANT ALL ON SCHEMA public TO churn_saver_dev;');
    console.error('\nOr if using Docker:');
    console.error("  docker exec -it <container-name> psql -U postgres -c \"CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';\"");
    process.exit(1);
  }

  if (client) {
    await client.end();
  }

  console.log('\n✅ Database role setup complete!');
  console.log('\nYour DATABASE_URL should be:');
  console.log(`DATABASE_URL=postgresql://churn_saver_dev:dev_password@${dbHost}:${dbPort}/${dbName}\n`);
}

// Run if called directly
if (require.main === module) {
  setupDatabaseRole()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database role setup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      console.error('\n❌ Database role setup failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

export { setupDatabaseRole };

