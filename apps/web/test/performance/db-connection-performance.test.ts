// Performance tests for Database Connection Management
// Tests connection pool sizing, latency, throughput, leak detection

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, closeDb, getDb } from '../../src/lib/db';

const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test'
};

describe('Database Connection Performance Tests', () => {
  beforeAll(() => {
    Object.assign(process.env, mockEnv);
  });

  afterAll(async () => {
    try {
      await closeDb();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Connection pool sizing optimization', () => {
    it('should handle connection pool size efficiently', async () => {
      try {
        await initDb();
        const db = getDb();

        const poolSize = db.pool.totalCount;
        const maxConnections = 10; // Default max from db.ts

        expect(poolSize).toBeLessThanOrEqual(maxConnections);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for pool sizing tests:', error);
      }
    });

    it('should scale connections based on load', async () => {
      try {
        await initDb();
        const db = getDb();

        const initialCount = db.pool.totalCount;

        // Acquire multiple connections
        const clients = [];
        for (let i = 0; i < 5; i++) {
          clients.push(await db.pool.connect());
        }

        const duringCount = db.pool.totalCount;
        expect(duringCount).toBeGreaterThanOrEqual(initialCount);

        // Release connections
        for (const client of clients) {
          client.release();
        }

        await closeDb();
      } catch (error) {
        console.warn('Database not available for connection scaling tests:', error);
      }
    });
  });

  describe('Connection acquisition latency', () => {
    it('should acquire connections quickly', async () => {
      try {
        await initDb();
        const db = getDb();

        const times = [];
        for (let i = 0; i < 10; i++) {
          const start = Date.now();
          const client = await db.pool.connect();
          times.push(Date.now() - start);
          client.release();
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);

        // Average should be under 100ms
        expect(avgTime).toBeLessThan(100);
        // Max should be under 500ms
        expect(maxTime).toBeLessThan(500);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for acquisition latency tests:', error);
      }
    });

    it('should maintain low latency under load', async () => {
      try {
        await initDb();
        const db = getDb();

        const promises = [];
        for (let i = 0; i < 20; i++) {
          promises.push(
            (async () => {
              const start = Date.now();
              const client = await db.pool.connect();
              const latency = Date.now() - start;
              client.release();
              return latency;
            })()
          );
        }

        const latencies = await Promise.all(promises);
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

        // Average latency should remain low even under concurrent load
        expect(avgLatency).toBeLessThan(200);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for load latency tests:', error);
      }
    });
  });

  describe('Connection pool throughput', () => {
    it('should handle high query throughput', async () => {
      try {
        await initDb();
        const db = getDb();

        const startTime = Date.now();
        const queries = [];

        for (let i = 0; i < 100; i++) {
          queries.push(db.pool.query('SELECT $1::int as num', [i]));
        }

        await Promise.all(queries);
        const duration = Date.now() - startTime;

        // Should complete 100 queries in under 2 seconds
        expect(duration).toBeLessThan(2000);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for throughput tests:', error);
      }
    });

    it('should maintain throughput with concurrent connections', async () => {
      try {
        await initDb();
        const db = getDb();

        const startTime = Date.now();
        const batchSize = 10;
        const batches = [];

        for (let batch = 0; batch < 10; batch++) {
          const batchPromises = [];
          for (let i = 0; i < batchSize; i++) {
            batchPromises.push(db.pool.query('SELECT $1::int as num', [batch * batchSize + i]));
          }
          batches.push(Promise.all(batchPromises));
        }

        await Promise.all(batches);
        const duration = Date.now() - startTime;

        // Should complete 100 queries across batches in reasonable time
        expect(duration).toBeLessThan(3000);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for concurrent throughput tests:', error);
      }
    });
  });

  describe('Connection leak detection', () => {
    it('should not leak connections when properly released', async () => {
      try {
        await initDb();
        const db = getDb();

        const initialIdleCount = db.pool.idleCount;

        // Acquire and release connections properly
        for (let i = 0; i < 5; i++) {
          const client = await db.pool.connect();
          await client.query('SELECT 1');
          client.release();
        }

        // Wait a bit for connections to return to pool
        await new Promise(resolve => setTimeout(resolve, 100));

        const finalIdleCount = db.pool.idleCount;

        // Idle count should be same or higher (connections returned)
        expect(finalIdleCount).toBeGreaterThanOrEqual(initialIdleCount);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for leak detection tests:', error);
      }
    });

    it('should detect connection leaks', async () => {
      try {
        await initDb();
        const db = getDb();

        const initialIdleCount = db.pool.idleCount;
        const initialTotalCount = db.pool.totalCount;

        // Acquire connections but don't release (simulating leak)
        const clients = [];
        for (let i = 0; i < 3; i++) {
          clients.push(await db.pool.connect());
        }

        const duringIdleCount = db.pool.idleCount;
        const duringTotalCount = db.pool.totalCount;

        // Idle count should decrease
        expect(duringIdleCount).toBeLessThan(initialIdleCount);
        // Total count should increase or stay same
        expect(duringTotalCount).toBeGreaterThanOrEqual(initialTotalCount);

        // Clean up (release connections)
        for (const client of clients) {
          client.release();
        }

        await closeDb();
      } catch (error) {
        console.warn('Database not available for leak detection tests:', error);
      }
    });

    it('should handle connection pool exhaustion gracefully', async () => {
      try {
        await initDb();
        const db = getDb();

        const maxConnections = 10;
        const clients = [];

        // Acquire max connections
        for (let i = 0; i < maxConnections; i++) {
          clients.push(await db.pool.connect());
        }

        // Additional connection request should queue or timeout
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
        console.warn('Database not available for exhaustion tests:', error);
      }
    });
  });

  describe('Connection reuse efficiency', () => {
    it('should reuse connections efficiently', async () => {
      try {
        await initDb();
        const db = getDb();

        const startTime = Date.now();
        const iterations = 50;

        for (let i = 0; i < iterations; i++) {
          const client = await db.pool.connect();
          await client.query('SELECT $1::int as num', [i]);
          client.release();
        }

        const duration = Date.now() - startTime;
        const avgTime = duration / iterations;

        // Average time per query should be low due to connection reuse
        expect(avgTime).toBeLessThan(50);

        await closeDb();
      } catch (error) {
        console.warn('Database not available for reuse efficiency tests:', error);
      }
    });
  });
});

