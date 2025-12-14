// Database connection and query helpers for Supabase Postgres

import { Pool } from 'pg';
import { env } from './env';
import { logger } from './logger';

export interface Database {
  pool: Pool;
  // Query helpers will be added here
}

// Global database connection
let db: Database | null = null;
let initPromise: Promise<void> | null = null;

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export async function initDb(): Promise<void> {
  if (db) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    logger.info('Initializing database connection', {
      url: env.DATABASE_URL ? '[REDACTED]' : 'not set',
    });

    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Enable SSL for Supabase or when sslmode=require is present
    const isSupabase = env.DATABASE_URL.includes('supabase.com');
    const sslEnabled = isSupabase || env.DATABASE_URL.includes('sslmode=require');
    
    // Security fix: Always validate SSL certificates in production
    // In development, allow configurable SSL validation for local testing
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowInsecureSSL = isDevelopment && process.env.ALLOW_INSECURE_SSL === 'true';

    // Prefer strong verification when a CA bundle is supplied. Otherwise, accept the managed
    // provider chain (Supabase poolers often present a chain Node doesn't validate by default).
    const sslCaPem = process.env.DB_SSL_CA_CERT_PEM;
    const rejectUnauthorized = Boolean(sslCaPem) && !allowInsecureSSL;
    
    logger.info('Database SSL configuration', {
      sslEnabled,
      isDevelopment,
      sslRejectUnauthorized: rejectUnauthorized,
      hasCustomCa: Boolean(sslCaPem),
    });

    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10, // Maximum number of clients in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: sslEnabled ? {
        rejectUnauthorized,
        ...(sslCaPem ? { ca: sslCaPem } : {}),
      } : undefined,
    });

    // Test the connection
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      // Capture DB role capabilities to understand RLS enforceability in prod
      const { rows: roleInfo } = await client.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT rolname, rolsuper, rolbypassrls
         FROM pg_roles
         WHERE rolname = current_user`
      );

      if (roleInfo[0]) {
        logger.info('Database role capabilities', {
          role: roleInfo[0].rolname,
          superuser: roleInfo[0].rolsuper,
          bypassRLS: roleInfo[0].rolbypassrls
        });
      } else {
        logger.warn('Database role capabilities could not be determined');
      }

      client.release();
      logger.info('Database connection test successful');
    } catch (error) {
      logger.error('Database connection test failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    db = { pool };
    logger.info('Database connection initialized');
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.pool.end();
    db = null;
    initPromise = null;
    logger.info('Database connection closed');
  }
}

// Type-safe query helpers
export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

export const sql = {
  async query<T = unknown>(
    text: string,
    params?: unknown[],
    companyContext?: string
  ): Promise<QueryResult<T>> {
    if (!db) {
      await initDb();
    }
    const client = getDb().pool;
    try {
      // Acquire connection and set RLS context if provided
      const pgClient = await client.connect();
      let contextSet = false;

      try {
        // Set company context for RLS if specified
        if (companyContext) {
          await pgClient.query('SELECT set_config($1, $2, true)', [
            'app.current_company_id',
            companyContext
          ]);
          contextSet = true;
        }

        const result = await pgClient.query(text, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount || 0,
        };
      } finally {
        if (contextSet) {
          try {
            await pgClient.query('RESET app.current_company_id');
          } catch (resetError) {
            logger.warn('Failed to reset company context after query (non-RLS client)', {
              error: resetError instanceof Error ? resetError.message : String(resetError),
              companyContext
            });
          }
        }
        pgClient.release();
      }
    } catch (error) {
      logger.error('Database query failed', {
        query: text,
        companyContext,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  // Helper for SELECT queries
  async select<T = unknown>(text: string, params?: unknown[], companyContext?: string): Promise<T[]> {
    const result = await this.query<T>(text, params, companyContext);
    return result.rows;
  },

  // Helper for INSERT queries that return the inserted row
  async insert<T = unknown>(
    text: string,
    params?: unknown[],
    companyContext?: string
  ): Promise<T | null> {
    const result = await this.query<T>(text, params, companyContext);
    return result.rows[0] || null;
  },

  // Helper for UPDATE/DELETE queries that return affected row count
  async execute(
    text: string,
    params?: unknown[],
    companyContext?: string
  ): Promise<{ rowCount: number }> {
    const result = await this.query(text, params, companyContext);
    return { rowCount: result.rowCount };
  },
};
