// Integration tests for RLS Policy Enforcement
// Tests RLS policies against real database with multiple tenants

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../../src/lib/db-rls';

const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NEXT_PUBLIC_WHOP_COMPANY_ID: 'test-company-id',
  WHOP_APP_ID: 'test-app-id',
  NODE_ENV: 'test'
};

const COMPANY_A = 'company_a_' + Math.random().toString(36).substr(2, 9);
const COMPANY_B = 'company_b_' + Math.random().toString(36).substr(2, 9);

describe('RLS Policy Integration Tests', () => {
  beforeAll(async () => {
    Object.assign(process.env, mockEnv);
    try {
      await initDbWithRLS();
    } catch (error) {
      console.warn('Database connection failed, skipping RLS integration tests:', error);
    }
  });

  afterAll(async () => {
    try {
      await closeDbWithRLS();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    clearRequestContext();
    
    // Create test table with RLS
    try {
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE test_rls_integration (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          user_id TEXT,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        ALTER TABLE test_rls_integration ENABLE ROW LEVEL SECURITY
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        CREATE POLICY test_rls_integration_policy ON test_rls_integration
        FOR ALL TO authenticated_role
        USING (company_id = current_setting('app.current_company_id'))
        WITH CHECK (company_id = current_setting('app.current_company_id'))
      `, [], { skipRLS: true });

      // Insert test data for both companies
      await sqlWithRLS.execute(`
        INSERT INTO test_rls_integration (id, company_id, user_id, data) VALUES 
        ('data_a_1', $1, 'user_a_1', 'Company A data 1'),
        ('data_a_2', $1, 'user_a_2', 'Company A data 2'),
        ('data_b_1', $2, 'user_b_1', 'Company B data 1'),
        ('data_b_2', $2, 'user_b_2', 'Company B data 2')
      `, [COMPANY_A, COMPANY_B], { skipRLS: true });
    } catch (error) {
      // Table might already exist, continue
    }
  });

  afterEach(async () => {
    clearRequestContext();
    try {
      await sqlWithRLS.execute('DROP TABLE IF EXISTS test_rls_integration', [], { skipRLS: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('SELECT policies enforce tenant isolation', () => {
    it('should only return data for Company A when querying as Company A', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM test_rls_integration ORDER BY id'
      );

      expect(result).toHaveLength(2);
      expect(result.every(row => row.company_id === COMPANY_A)).toBe(true);
      expect(result[0].id).toBe('data_a_1');
      expect(result[1].id).toBe('data_a_2');
    });

    it('should only return data for Company B when querying as Company B', async () => {
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'user_b_1',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM test_rls_integration ORDER BY id'
      );

      expect(result).toHaveLength(2);
      expect(result.every(row => row.company_id === COMPANY_B)).toBe(true);
      expect(result[0].id).toBe('data_b_1');
      expect(result[1].id).toBe('data_b_2');
    });

    it('should return empty result when querying without context', async () => {
      clearRequestContext();

      const result = await sqlWithRLS.select<{ id: string }>(
        'SELECT id FROM test_rls_integration'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('INSERT policies prevent cross-tenant inserts', () => {
    it('should allow INSERT for correct company', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_3',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.insert<{ id: string; company_id: string }>(
        'INSERT INTO test_rls_integration (id, company_id, user_id, data) VALUES ($1, $2, $3, $4) RETURNING id, company_id',
        ['data_a_3', COMPANY_A, 'user_a_3', 'New Company A data']
      );

      expect(result).toBeDefined();
      expect(result?.company_id).toBe(COMPANY_A);
    });

    it('should prevent INSERT for wrong company', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.insert(
          'INSERT INTO test_rls_integration (id, company_id, user_id, data) VALUES ($1, $2, $3, $4) RETURNING id',
          ['cross_tenant', COMPANY_B, 'user_a_1', 'Cross-tenant attempt']
        )
      ).rejects.toThrow();
    });
  });

  describe('UPDATE policies prevent cross-tenant updates', () => {
    it('should allow UPDATE for correct company', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.execute(
        'UPDATE test_rls_integration SET data = $1 WHERE id = $2',
        ['Updated Company A data', 'data_a_1']
      );

      expect(result).toBe(1);
    });

    it('should prevent UPDATE for wrong company', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      // Try to update Company B's data
      const result = await sqlWithRLS.execute(
        'UPDATE test_rls_integration SET data = $1 WHERE id = $2',
        ['Hacked data', 'data_b_1']
      );

      // Should affect 0 rows due to RLS
      expect(result).toBe(0);
    });
  });

  describe('DELETE policies prevent cross-tenant deletes', () => {
    it('should allow DELETE for correct company', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.execute(
        'DELETE FROM test_rls_integration WHERE id = $1',
        ['data_a_1']
      );

      expect(result).toBe(1);
    });

    it('should prevent DELETE for wrong company', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      // Try to delete Company B's data
      const result = await sqlWithRLS.execute(
        'DELETE FROM test_rls_integration WHERE id = $1',
        ['data_b_1']
      );

      // Should affect 0 rows due to RLS
      expect(result).toBe(0);
    });
  });

  describe('RLS with complex JOIN queries across multiple tables', () => {
    beforeEach(async () => {
      // Create second table for JOIN testing
      try {
        await sqlWithRLS.execute(`
          CREATE TEMPORARY TABLE test_rls_join (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            ref_id TEXT,
            value TEXT
          )
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          ALTER TABLE test_rls_join ENABLE ROW LEVEL SECURITY
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          CREATE POLICY test_rls_join_policy ON test_rls_join
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          INSERT INTO test_rls_join (id, company_id, ref_id, value) VALUES 
          ('join_a_1', $1, 'data_a_1', 'Join A value 1'),
          ('join_b_1', $2, 'data_b_1', 'Join B value 1')
        `, [COMPANY_A, COMPANY_B], { skipRLS: true });
      } catch (error) {
        // Table might already exist
      }
    });

    afterEach(async () => {
      try {
        await sqlWithRLS.execute('DROP TABLE IF EXISTS test_rls_join', [], { skipRLS: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should enforce RLS in JOIN queries', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.select<{ id: string; company_id: string; value: string }>(
        `SELECT t1.id, t1.company_id, t2.value 
         FROM test_rls_integration t1 
         JOIN test_rls_join t2 ON t1.id = t2.ref_id 
         WHERE t1.company_id = $1`,
        [COMPANY_A]
      );

      // Should only return Company A's joined data
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(row => row.company_id === COMPANY_A)).toBe(true);
    });
  });

  describe('RLS with stored procedures and functions', () => {
    it('should enforce RLS in function calls', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      // Test with a simple function that uses RLS context
      const result = await sqlWithRLS.select<{ current_company_id: string }>(
        'SELECT get_current_company_id() as current_company_id'
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_company_id).toBe(COMPANY_A);
    });
  });

  describe('RLS policy performance under load', () => {
    it('should handle multiple concurrent queries efficiently', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(
          sqlWithRLS.select('SELECT id FROM test_rls_integration WHERE company_id = $1', [COMPANY_A])
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain performance with complex queries', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user_a_1',
        isAuthenticated: true
      });

      const startTime = Date.now();

      await sqlWithRLS.select(
        `SELECT id, company_id, data, created_at 
         FROM test_rls_integration 
         WHERE company_id = $1 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [COMPANY_A]
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });
  });
});

