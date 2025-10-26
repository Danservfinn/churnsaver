// Enhanced Database connection with automatic RLS session context management
// Ensures consistent tenant isolation across all database operations

import { Pool, PoolClient } from 'pg';
import { env } from './env';
import { logger } from './logger';
import { getRequestContextSDK } from './whop-sdk';

export interface DatabaseWithRLS {
  pool: Pool;
}

// Global database connection with RLS support
let dbWithRLS: DatabaseWithRLS | null = null;

// Request context storage for the current request
let currentRequestContext: {
  companyId?: string;
  userId?: string;
  isAuthenticated: boolean;
} | null = null;

export function getDbWithRLS(): DatabaseWithRLS {
  if (!dbWithRLS) {
    throw new Error('Database not initialized. Call initDbWithRLS() first.');
  }
  return dbWithRLS;
}

/**
 * Initialize database connection with RLS support
 */
export async function initDbWithRLS(): Promise<void> {
  logger.info('Initializing database connection with RLS support', {
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
  
  logger.info('Database SSL configuration', {
    sslEnabled,
    isDevelopment,
    secureValidation: !allowInsecureSSL
  });

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10, // Maximum number of clients in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    // Security fix: Enable proper SSL certificate validation
    // rejectUnauthorized: true prevents man-in-the-middle attacks
    // Only allow insecure SSL in explicit development mode with ALLOW_INSECURE_SSL=true
    ssl: sslEnabled ? {
      rejectUnauthorized: !allowInsecureSSL,
    } : undefined,
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

  dbWithRLS = { pool };
  logger.info('Database connection with RLS support initialized');
}

export async function closeDbWithRLS(): Promise<void> {
  if (dbWithRLS) {
    await dbWithRLS.pool.end();
    dbWithRLS = null;
    logger.info('Database connection with RLS support closed');
  }
}

/**
 * Set request context for the current operation
 * This should be called at the beginning of each request
 */
export function setRequestContext(context: {
  companyId?: string;
  userId?: string;
  isAuthenticated: boolean;
}): void {
  currentRequestContext = context;
  logger.debug('Request context set', {
    companyId: context.companyId,
    userId: context.userId,
    isAuthenticated: context.isAuthenticated
  });
}

/**
 * Get current request context
 */
export function getRequestContext(): {
  companyId?: string;
  userId?: string;
  isAuthenticated: boolean;
} | null {
  return currentRequestContext;
}

/**
 * Clear request context (typically at end of request)
 */
export function clearRequestContext(): void {
  currentRequestContext = null;
}

/**
 * Extract company context from request headers
 */
export async function extractCompanyContext(request: {
  headers: { get: (key: string) => string | null };
}): Promise<string | null> {
  try {
    // Use existing SDK to get request context
    const context = await getRequestContextSDK(request);
    
    if (context.companyId && context.companyId !== 'unknown') {
      return context.companyId;
    }
    
    // Fallback to environment variable for system operations
    const fallbackCompanyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID || env.WHOP_APP_ID;
    if (fallbackCompanyId && fallbackCompanyId !== 'unknown') {
      logger.debug('Using fallback company context', { companyId: fallbackCompanyId });
      return fallbackCompanyId;
    }
    
    return null;
  } catch (error) {
    logger.error('Failed to extract company context', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Validate company context before database operations
 */
async function validateCompanyContext(companyId?: string): Promise<boolean> {
  if (!companyId) {
    logger.error('Company context missing for tenant-scoped operation');
    return false;
  }

  // Security fix: Never skip validation in production-like environments
  // Only allow in explicit development with additional safeguards
  const isDevelopment = process.env.NODE_ENV === 'development';
  const allowInsecureDev = process.env.ALLOW_INSECURE_DEV === 'true';
  
  // Additional security check: Never allow insecure dev mode if production indicators are present
  const isProductionLike =
    process.env.VERCEL_ENV === 'production' ||
    process.env.DATABASE_URL?.includes('supabase.com') ||
    process.env.NODE_ENV === 'production';
  
  if (isProductionLike && allowInsecureDev) {
    logger.security('SECURITY ALERT: Attempted to use insecure dev mode in production-like environment', {
      category: 'security',
      severity: 'critical',
      environment: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      companyId
    });
    
    throw new Error('Insecure development mode is not allowed in production environments');
  }
  
  if (isDevelopment && allowInsecureDev) {
    logger.warn('Development mode: skipping company context validation', { companyId });
    return true;
  }

  try {
    const client = getDbWithRLS().pool;
    const result = await client.query('SELECT id FROM companies WHERE id = $1', [companyId]);
    
    if (result.rows.length === 0) {
      logger.error('Company validation failed - company not found', { companyId });
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Company context validation error', {
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Enhanced SQL interface with automatic RLS context setting
 */
export const sqlWithRLS = {
  /**
   * Execute query with automatic RLS context setting
   */
  async query<T = unknown>(
    text: string,
    params?: unknown[],
    options?: {
      skipRLS?: boolean;
      companyId?: string;
      enforceCompanyContext?: boolean;
    }
  ): Promise<{ rows: T[]; rowCount: number }> {
    const client = getDbWithRLS().pool;
    const skipRLS = options?.skipRLS === true;
    const enforceCompanyContext = options?.enforceCompanyContext !== false;
    
    try {
      // Acquire connection
      const pgClient = await client.connect();

      try {
        let effectiveCompanyId = options?.companyId;
        
        // Set RLS context if not explicitly skipped
        if (!skipRLS) {
          // Use provided companyId, then request context, then extract from headers
          if (!effectiveCompanyId) {
            if (currentRequestContext?.companyId) {
              effectiveCompanyId = currentRequestContext.companyId;
            } else {
              // For backward compatibility, try to extract from headers
              // This is a fallback for code that doesn't use setRequestContext
              logger.warn('Using fallback company context extraction - consider using setRequestContext');
              effectiveCompanyId = env.NEXT_PUBLIC_WHOP_COMPANY_ID || env.WHOP_APP_ID;
            }
          }
        }

        // Validate company context if required
        if (enforceCompanyContext && !skipRLS && effectiveCompanyId) {
          const isValid = await validateCompanyContext(effectiveCompanyId);
          if (!isValid) {
            throw new Error(`Invalid company context: ${effectiveCompanyId}`);
          }
        }

        // Set company context for RLS if we have one and not skipping RLS
        if (effectiveCompanyId && !skipRLS) {
          await pgClient.query('SELECT set_company_context($1)', [effectiveCompanyId]);
          logger.debug('RLS context set', { companyId: effectiveCompanyId });
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
        params,
        skipRLS,
        companyId: options?.companyId || currentRequestContext?.companyId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  /**
   * Helper for SELECT queries with RLS
   */
  async select<T = unknown>(
    text: string,
    params?: unknown[],
    options?: {
      skipRLS?: boolean;
      companyId?: string;
      enforceCompanyContext?: boolean;
    }
  ): Promise<T[]> {
    const result = await this.query<T>(text, params, options);
    return result.rows;
  },

  /**
   * Helper for INSERT queries with RLS
   */
  async insert<T = unknown>(
    text: string,
    params?: unknown[],
    options?: {
      skipRLS?: boolean;
      companyId?: string;
      enforceCompanyContext?: boolean;
    }
  ): Promise<T | null> {
    const result = await this.query<T>(text, params, options);
    return result.rows[0] || null;
  },

  /**
   * Helper for UPDATE/DELETE queries with RLS
   */
  async execute(
    text: string,
    params?: unknown[],
    options?: {
      skipRLS?: boolean;
      companyId?: string;
      enforceCompanyContext?: boolean;
    }
  ): Promise<number> {
    const result = await this.query(text, params, options);
    return result.rowCount;
  },

  /**
   * Execute multiple queries in a transaction with consistent RLS context
   */
  async transaction<T = unknown>(
    callback: (client: PoolClient) => Promise<T>,
    options?: {
      skipRLS?: boolean;
      companyId?: string;
      enforceCompanyContext?: boolean;
    }
  ): Promise<T> {
    const client = getDbWithRLS().pool;
    const skipRLS = options?.skipRLS === true;
    const enforceCompanyContext = options?.enforceCompanyContext !== false;
    
    try {
      const pgClient = await client.connect();

      try {
        await pgClient.query('BEGIN');

        let effectiveCompanyId = options?.companyId;
        
        // Set RLS context if not explicitly skipped
        if (!skipRLS) {
          if (!effectiveCompanyId) {
            effectiveCompanyId = currentRequestContext?.companyId || 
                            env.NEXT_PUBLIC_WHOP_COMPANY_ID || 
                            env.WHOP_APP_ID;
          }

          // Validate company context if required
          if (enforceCompanyContext && effectiveCompanyId) {
            const isValid = await validateCompanyContext(effectiveCompanyId);
            if (!isValid) {
              throw new Error(`Invalid company context: ${effectiveCompanyId}`);
            }
          }

          // Set company context for RLS
          if (effectiveCompanyId) {
            await pgClient.query('SELECT set_company_context($1)', [effectiveCompanyId]);
            logger.debug('RLS context set for transaction', { companyId: effectiveCompanyId });
          }
        }

        const result = await callback(pgClient);
        await pgClient.query('COMMIT');
        
        return result;
      } catch (error) {
        await pgClient.query('ROLLBACK');
        throw error;
      } finally {
        pgClient.release();
      }
    } catch (error) {
      logger.error('Database transaction failed', {
        skipRLS,
        companyId: options?.companyId || currentRequestContext?.companyId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
};

// Export the enhanced SQL as default for backward compatibility
export default sqlWithRLS;