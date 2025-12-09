// Enhanced Database connection with automatic RLS session context management
// Ensures consistent tenant isolation across all database operations

import { Pool, PoolClient } from 'pg';
import { env, isProductionLikeEnvironment } from './env';
import { logger } from './logger';
import { getRequestContextSDK } from './whop-sdk';
import {
  clearRequestContext as clearALSRequestContext,
  getRequestContext as getALSRequestContext,
  RequestContextData,
  setRequestContext as setALSRequestContext
} from './requestContext';

// Conditionally import Node.js modules only when available (not in Edge Runtime)
let readFileSync: (path: string, encoding?: string) => string;
let join: (...paths: string[]) => string;

try {
  // These imports will fail in Edge Runtime, so we wrap them in try-catch
  const fs = require('fs');
  const pathModule = require('path');
  readFileSync = fs.readFileSync;
  join = pathModule.join;
} catch {
  // In Edge Runtime, these will be undefined and we'll skip certificate loading
  readFileSync = undefined as any;
  join = undefined as any;
}

export interface DatabaseWithRLS {
  pool: Pool;
}

/**
 * SSL Configuration interface for enhanced security
 */
export interface SSLConfig {
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
  checkServerIdentity?: (host: string, cert: any) => Error | undefined;
}

/**
 * Get SSL configuration based on environment and security requirements
 */
function getSSLConfiguration(): SSLConfig | undefined {
  // Always enable SSL for Supabase or when sslmode=require is present
  const isSupabase = env.DATABASE_URL?.includes('supabase.com');
  const sslEnabled = isSupabase || env.DATABASE_URL?.includes('sslmode=require');

  if (!sslEnabled) {
    return undefined;
  }

  // Security enhancement: Always validate certificates in production-like environments
  // Only allow insecure SSL in explicit development mode with additional safeguards
  // Security logging: Log SSL configuration decisions
  logger.info('SSL Configuration Decision', {
    sslEnabled,
    isDevelopment: process.env.NODE_ENV === 'development',
    isProductionLike: isProductionLikeEnvironment(),
    secureValidation: true,
    databaseProvider: isSupabase ? 'supabase' : 'other'
  });

  // Certificate pinning support for production deployments
  const sslConfig: SSLConfig = {
    rejectUnauthorized: true,
  };

  // Load custom CA certificate if specified (for certificate pinning)
  // Skip in Edge Runtime where Node.js file system APIs are not available
  const caCertPath = process.env.DB_SSL_CA_CERT;
  if (caCertPath && readFileSync && join && typeof process.cwd === 'function') {
    try {
      sslConfig.ca = readFileSync(join(process.cwd(), caCertPath), 'utf8');
      logger.info('Loaded custom CA certificate for SSL pinning', { caPath: caCertPath });
    } catch (error) {
      logger.error('Failed to load custom CA certificate', {
        caPath: caCertPath,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't fail startup, but log the error
    }
  }

  // Load client certificate and key if specified
  // Skip in Edge Runtime where Node.js file system APIs are not available
  const clientCertPath = process.env.DB_SSL_CLIENT_CERT;
  const clientKeyPath = process.env.DB_SSL_CLIENT_KEY;

  if (clientCertPath && clientKeyPath && readFileSync && join && typeof process.cwd === 'function') {
    try {
      sslConfig.cert = readFileSync(join(process.cwd(), clientCertPath), 'utf8');
      sslConfig.key = readFileSync(join(process.cwd(), clientKeyPath), 'utf8');
      logger.info('Loaded client certificate and key for SSL authentication');
    } catch (error) {
      logger.error('Failed to load client certificate or key', {
        certPath: clientCertPath,
        keyPath: clientKeyPath,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't fail startup, but log the error
    }
  }

  return sslConfig;
}

/**
 * Validate SSL configuration to prevent insecure deployments
 */
function validateSSLConfiguration(): void {
  const sslConfig = getSSLConfiguration();

  // If no SSL is configured but database URL suggests it should be
  if (!sslConfig && env.DATABASE_URL) {
    const isSupabase = env.DATABASE_URL.includes('supabase.com');
    const hasSSLMode = env.DATABASE_URL.includes('sslmode=require');

    if (isSupabase || hasSSLMode) {
      logger.security('SECURITY WARNING: SSL not configured for database connection that requires it', {
        category: 'database-security',
        severity: 'high',
        databaseProvider: isSupabase ? 'supabase' : 'unknown',
        hasSSLMode,
        databaseUrl: env.DATABASE_URL ? '[REDACTED]' : 'not set'
      });
    }
  }

  // Additional validation: Ensure certificate pinning is used when specified
  if (process.env.DB_SSL_CA_CERT && sslConfig && !sslConfig.ca && typeof readFileSync === 'function' && typeof join === 'function') {
    logger.warn('Certificate pinning configured but CA certificate not loaded', {
      caCertPath: process.env.DB_SSL_CA_CERT
    });
  }
}

// Global database connection with RLS support
let dbWithRLS: DatabaseWithRLS | null = null;

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

  // Use enhanced SSL configuration function
  const sslConfig = getSSLConfiguration();

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20, // Increased for serverless concurrency
    idleTimeoutMillis: 10000, // Shorter idle timeout for serverless
    connectionTimeoutMillis: 5000, // More tolerant for cold starts
    ssl: sslConfig,
  });

  // Monitor pool errors (helps detect exhaustion or network issues)
  pool.on('error', (err) => {
    logger.error('Postgres pool error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

  // Validate SSL configuration before testing connection
  validateSSLConfiguration();

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
export function setRequestContext(context: RequestContextData): void {
  setALSRequestContext(context);
  logger.debug('Request context set', {
    companyId: context.companyId,
    userId: context.userId,
    isAuthenticated: context.isAuthenticated
  });
}

/**
 * Get current request context
 */
export function getRequestContext(): RequestContextData | undefined {
  return getALSRequestContext();
}

/**
 * Clear request context (typically at end of request)
 */
export function clearRequestContext(): void {
  clearALSRequestContext();
}

/**
 * Execute a callback with an explicit company RLS context set on the session.
 * Ensures the context is reset even if the callback throws.
 */
export async function withCompanyContext<T>(
  companyId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!companyId) {
    throw new Error('companyId is required for RLS context');
  }

  const pool = getDbWithRLS().pool;
  const pgClient = await pool.connect();

  try {
    const isValid = await validateCompanyContext(companyId);
    if (!isValid) {
      throw new Error(`Invalid company context: ${companyId}`);
    }

    await pgClient.query('SELECT set_company_context($1)', [companyId]);
    logger.debug('withCompanyContext: RLS context set', { companyId });

    const result = await callback(pgClient);

    return result;
  } finally {
    try {
      await pgClient.query('RESET app.current_company_id');
    } catch (error) {
      logger.warn('Failed to reset company context after operation', {
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    pgClient.release();
  }
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
  const allowInsecureDev = process.env.ALLOW_INSECURE_DEV === 'true';

  if (isProductionLikeEnvironment() && allowInsecureDev) {
    logger.security('SECURITY ALERT: Attempted to use insecure dev mode in production-like environment', {
      category: 'security',
      severity: 'critical',
      environment: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      databaseUrl: env.DATABASE_URL ? '[REDACTED]' : 'not set',
      companyId
    });

    throw new Error(
      'Insecure development mode is not allowed in production environments. ' +
      'Remove ALLOW_INSECURE_DEV=true from environment variables in production deployments.'
    );
  }
  
  if (process.env.NODE_ENV === 'development' && allowInsecureDev && !isProductionLikeEnvironment()) {
    logger.warn('Development mode: skipping company context validation', { companyId });
    return true;
  }

  try {
    // Company existence check is not tenant-scoped data access; skip RLS to avoid false negatives
    const result = await sqlWithRLS.query(
      'SELECT id FROM companies WHERE id = $1',
      [companyId],
      { skipRLS: true, enforceCompanyContext: false }
    );
    
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
    const enforceCompanyContext = options?.enforceCompanyContext ?? true;
    
    try {
      // Acquire connection
      const pgClient = await client.connect();

      try {
        let effectiveCompanyId = options?.companyId;
        
        // Set RLS context if not explicitly skipped
        if (!skipRLS) {
          const requestContext = getALSRequestContext();
          if (!effectiveCompanyId && requestContext?.companyId) {
            effectiveCompanyId = requestContext.companyId;
          }

          if (enforceCompanyContext && !effectiveCompanyId) {
            throw new Error('Company context required for tenant-scoped operation');
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
        companyId: options?.companyId || getALSRequestContext()?.companyId,
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
  ): Promise<{ rowCount: number }> {
    const result = await this.query(text, params, options);
    return { rowCount: result.rowCount };
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
    const enforceCompanyContext = options?.enforceCompanyContext ?? true;
    
    try {
      const pgClient = await client.connect();

      try {
        await pgClient.query('BEGIN');

        let effectiveCompanyId = options?.companyId;
        
        // Set RLS context if not explicitly skipped
        if (!skipRLS) {
          const requestContext = getALSRequestContext();
          if (!effectiveCompanyId && requestContext?.companyId) {
            effectiveCompanyId = requestContext.companyId;
          }

          if (enforceCompanyContext && !effectiveCompanyId) {
            throw new Error('Company context required for tenant-scoped operation');
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
        companyId: options?.companyId || getALSRequestContext()?.companyId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
};

// Export the enhanced SQL as default for backward compatibility
export default sqlWithRLS;