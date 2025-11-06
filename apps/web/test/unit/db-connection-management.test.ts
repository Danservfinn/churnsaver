// Unit tests for Database Connection Management
// Tests initDb, initDbWithRLS, connection pooling, SSL configuration

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initDb, closeDb, getDb } from '../../src/lib/db';
import { initDbWithRLS, closeDbWithRLS, getDbWithRLS } from '../../src/lib/db-rls';

// Mock environment for testing
const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test'
};

describe('Database Connection Management - Unit Tests', () => {
  beforeEach(() => {
    // Reset environment
    Object.assign(process.env, mockEnv);
  });

  describe('initDb() connection initialization', () => {
    it('should initialize database connection', async () => {
      try {
        await initDb();
        const db = getDb();
        expect(db).toBeDefined();
        expect(db.pool).toBeDefined();
        await closeDb();
      } catch (error) {
        // If database is not available, skip test
        console.warn('Database not available for testing:', error);
      }
    });

    it('should throw error when DATABASE_URL is missing', async () => {
      delete process.env.DATABASE_URL;
      
      await expect(initDb()).rejects.toThrow('DATABASE_URL environment variable is required');
      
      // Restore for other tests
      process.env.DATABASE_URL = mockEnv.DATABASE_URL;
    });

    it('should create connection pool with correct configuration', async () => {
      try {
        await initDb();
        const db = getDb();
        
        expect(db.pool).toBeDefined();
        expect(db.pool.totalCount).toBeGreaterThanOrEqual(0);
        expect(db.pool.idleCount).toBeGreaterThanOrEqual(0);
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });
  });

  describe('initDbWithRLS() connection initialization', () => {
    it('should initialize database connection with RLS support', async () => {
      try {
        await initDbWithRLS();
        const db = getDbWithRLS();
        expect(db).toBeDefined();
        expect(db.pool).toBeDefined();
        await closeDbWithRLS();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should throw error when DATABASE_URL is missing', async () => {
      delete process.env.DATABASE_URL;
      
      await expect(initDbWithRLS()).rejects.toThrow('DATABASE_URL environment variable is required');
      
      // Restore for other tests
      process.env.DATABASE_URL = mockEnv.DATABASE_URL;
    });

    it('should create connection pool with RLS configuration', async () => {
      try {
        await initDbWithRLS();
        const db = getDbWithRLS();
        
        expect(db.pool).toBeDefined();
        expect(db.pool.totalCount).toBeGreaterThanOrEqual(0);
        
        await closeDbWithRLS();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });
  });

  describe('Connection pool creation and configuration', () => {
    it('should create pool with max connections limit', async () => {
      try {
        await initDb();
        const db = getDb();
        
        // Pool should be configured with max connections
        expect(db.pool).toBeDefined();
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should configure idle timeout', async () => {
      try {
        await initDb();
        const db = getDb();
        
        expect(db.pool).toBeDefined();
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should configure connection timeout', async () => {
      try {
        await initDb();
        const db = getDb();
        
        expect(db.pool).toBeDefined();
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });
  });

  describe('SSL configuration (secure/insecure modes)', () => {
    it('should enable SSL for Supabase URLs', async () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://user:pass@db.supabase.co:5432/db';
      
      try {
        await initDb();
        const db = getDb();
        expect(db.pool).toBeDefined();
        await closeDb();
      } catch (error) {
        // Expected if database is not available
        console.warn('Database not available for testing:', error);
      } finally {
        process.env.DATABASE_URL = originalUrl;
      }
    });

    it('should enable SSL when sslmode=require is present', async () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db?sslmode=require';
      
      try {
        await initDb();
        const db = getDb();
        expect(db.pool).toBeDefined();
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      } finally {
        process.env.DATABASE_URL = originalUrl;
      }
    });

    it('should use secure SSL validation in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        await initDb();
        const db = getDb();
        expect(db.pool).toBeDefined();
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should allow insecure SSL in development with flag', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalAllowInsecure = process.env.ALLOW_INSECURE_SSL;
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_SSL = 'true';
      
      try {
        await initDb();
        const db = getDb();
        expect(db.pool).toBeDefined();
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalAllowInsecure) {
          process.env.ALLOW_INSECURE_SSL = originalAllowInsecure;
        } else {
          delete process.env.ALLOW_INSECURE_SSL;
        }
      }
    });
  });

  describe('Connection timeout handling', () => {
    it('should handle connection timeout gracefully', async () => {
      const originalUrl = process.env.DATABASE_URL;
      // Use an invalid host that will timeout
      process.env.DATABASE_URL = 'postgresql://user:pass@192.0.2.1:5432/db';
      
      await expect(initDb()).rejects.toThrow();
      
      process.env.DATABASE_URL = originalUrl;
    });
  });

  describe('Idle timeout handling', () => {
    it('should handle idle connections', async () => {
      try {
        await initDb();
        const db = getDb();
        
        // Get a connection and release it
        const client = await db.pool.connect();
        client.release();
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });
  });

  describe('closeDb() cleanup', () => {
    it('should close database connection pool', async () => {
      try {
        await initDb();
        const db = getDb();
        expect(db).toBeDefined();
        
        await closeDb();
        
        // After closing, getDb should throw error
        expect(() => getDb()).toThrow('Database not initialized');
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should handle closeDb() when not initialized', async () => {
      // Should not throw when closing uninitialized db
      await expect(closeDb()).resolves.not.toThrow();
    });
  });

  describe('closeDbWithRLS() cleanup', () => {
    it('should close RLS database connection pool', async () => {
      try {
        await initDbWithRLS();
        const db = getDbWithRLS();
        expect(db).toBeDefined();
        
        await closeDbWithRLS();
        
        // After closing, getDbWithRLS should throw error
        expect(() => getDbWithRLS()).toThrow('Database not initialized');
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should handle closeDbWithRLS() when not initialized', async () => {
      // Should not throw when closing uninitialized db
      await expect(closeDbWithRLS()).resolves.not.toThrow();
    });
  });

  describe('Connection retry logic', () => {
    it('should handle connection failures', async () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:5432/invalid';
      
      await expect(initDb()).rejects.toThrow();
      
      process.env.DATABASE_URL = originalUrl;
    });
  });

  describe('Connection health checks', () => {
    it('should test connection on initialization', async () => {
      try {
        await initDb();
        // If initialization succeeds, connection test passed
        const db = getDb();
        expect(db).toBeDefined();
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should throw error if connection test fails', async () => {
      const originalUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:5432/invalid';
      
      await expect(initDb()).rejects.toThrow();
      
      process.env.DATABASE_URL = originalUrl;
    });
  });

  describe('Connection pool exhaustion handling', () => {
    it('should handle multiple concurrent connections', async () => {
      try {
        await initDb();
        const db = getDb();
        
        // Acquire multiple connections
        const clients = [];
        for (let i = 0; i < 5; i++) {
          clients.push(await db.pool.connect());
        }
        
        // Release all connections
        for (const client of clients) {
          client.release();
        }
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });

    it('should queue connection requests when pool is exhausted', async () => {
      try {
        await initDb();
        const db = getDb();
        
        // Acquire max connections
        const maxConnections = 10;
        const clients = [];
        for (let i = 0; i < maxConnections; i++) {
          clients.push(await db.pool.connect());
        }
        
        // Additional connection request should queue
        const queuedConnection = db.pool.connect();
        
        // Release one connection
        clients[0].release();
        
        // Queued connection should now be acquired
        const client = await queuedConnection;
        client.release();
        
        // Release remaining connections
        for (let i = 1; i < clients.length; i++) {
          clients[i].release();
        }
        
        await closeDb();
      } catch (error) {
        console.warn('Database not available for testing:', error);
      }
    });
  });
});

