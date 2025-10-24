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

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export async function initDb(): Promise<void> {
  logger.info('Initializing database connection', {
    url: env.DATABASE_URL ? '[REDACTED]' : 'not set',
  });

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Enable SSL for Supabase or when sslmode=require is present
  const isSupabase = env.DATABASE_URL.includes('supabase.com');
  const sslEnabled = isSupabase || env.DATABASE_URL.includes('sslmode=require');
  logger.info('Database SSL configuration', { sslEnabled });

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10, // Maximum number of clients in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });

  // Test the connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
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
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.pool.end();
    db = null;
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
    const client = getDb().pool;
    try {
      // Acquire connection and set RLS context if provided
      const pgClient = await client.connect();

      try {
        // Set company context for RLS if specified
        if (companyContext) {
          await pgClient.query('SELECT set_company_context($1)', [companyContext]);
        }

        const result = await pgClient.query(text, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount || 0,
        };
      } finally {
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
  async execute(text: string, params?: unknown[], companyContext?: string): Promise<number> {
    const result = await this.query(text, params, companyContext);
    return result.rowCount;
  },
};
