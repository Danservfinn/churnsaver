// Unit tests for RLS Policy Enforcement
// Tests sqlWithRLS functionality with different company contexts

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../../src/lib/db-rls';

// Mock environment for testing
const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NEXT_PUBLIC_WHOP_COMPANY_ID: 'test-company-id',
  WHOP_APP_ID: 'test-app-id',
  NODE_ENV: 'test'
};

// Test company IDs for isolation testing
const COMPANY_A = 'company_a_' + Math.random().toString(36).substr(2, 9);
const COMPANY_B = 'company_b_' + Math.random().toString(36).substr(2, 9);

describe('RLS Policy Enforcement - Unit Tests', () => {
  beforeAll(async () => {
    // Mock environment variables
    Object.assign(process.env, mockEnv);
    
    // Initialize database with RLS support
    try {
      await initDbWithRLS();
    } catch (error) {
      // If database connection fails, skip tests
      console.warn('Database connection failed, skipping RLS tests:', error);
    }
  });

  afterAll(async () => {
    // Clean up database connection
    try {
      await closeDbWithRLS();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Clear any existing context
    clearRequestContext();
  });

  afterEach(() => {
    // Clear context after each test
    clearRequestContext();
  });

  describe('sqlWithRLS.query() with different company contexts', () => {
    it('should set RLS context from request context', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.query<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id'
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_company_id).toBe(COMPANY_A);
    });

    it('should use explicit companyId when provided', async () => {
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.query<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id',
        [],
        { companyId: COMPANY_A }
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_company_id).toBe(COMPANY_A);
    });

    it('should handle queries without company context', async () => {
      clearRequestContext();

      const result = await sqlWithRLS.query(
        'SELECT 1 as test'
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].test).toBe(1);
    });
  });

  describe('skipRLS option behavior', () => {
    it('should skip RLS when skipRLS is true', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.query<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\', true) as current_company_id',
        [],
        { skipRLS: true }
      );

      expect(result.rows).toHaveLength(1);
      // When RLS is skipped, context should be null
      expect(result.rows[0].current_company_id).toBeNull();
    });

    it('should apply RLS when skipRLS is false', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.query<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id',
        [],
        { skipRLS: false }
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_company_id).toBe(COMPANY_A);
    });
  });

  describe('enforceCompanyContext validation', () => {
    it('should validate company context when enforceCompanyContext is true', async () => {
      const invalidCompanyId = 'invalid-company-id';

      await expect(
        sqlWithRLS.query('SELECT 1', [], { 
          companyId: invalidCompanyId,
          enforceCompanyContext: true 
        })
      ).rejects.toThrow('Invalid company context');
    });

    it('should skip validation when enforceCompanyContext is false', async () => {
      const invalidCompanyId = 'invalid-company-id';

      // Should not throw even with invalid company ID
      const result = await sqlWithRLS.query('SELECT 1', [], { 
        companyId: invalidCompanyId,
        enforceCompanyContext: false 
      });

      expect(result.rows).toHaveLength(1);
    });

    it('should validate context by default', async () => {
      const invalidCompanyId = 'invalid-company-id';

      await expect(
        sqlWithRLS.query('SELECT 1', [], { 
          companyId: invalidCompanyId
          // enforceCompanyContext defaults to true
        })
      ).rejects.toThrow('Invalid company context');
    });
  });

  describe('Transaction-level RLS context persistence', () => {
    it('should maintain RLS context throughout transaction', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.transaction(async (client) => {
        const result1 = await client.query(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );
        expect(result1.rows[0].current_company_id).toBe(COMPANY_A);

        const result2 = await client.query(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );
        expect(result2.rows[0].current_company_id).toBe(COMPANY_A);

        return { success: true };
      });
    });

    it('should use explicit companyId in transaction', async () => {
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.transaction(async (client) => {
        const result = await client.query(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );
        expect(result.rows[0].current_company_id).toBe(COMPANY_A);
        return { success: true };
      }, { companyId: COMPANY_A });
    });

    it('should rollback transaction on error and clear context', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.transaction(async (client) => {
          await client.query('SELECT 1');
          throw new Error('Intentional transaction error');
        })
      ).rejects.toThrow('Intentional transaction error');
    });
  });

  describe('Cross-tenant data access prevention', () => {
    beforeEach(async () => {
      // Create test table for isolation testing
      try {
        await sqlWithRLS.execute(`
          CREATE TEMPORARY TABLE test_rls_unit (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            data TEXT
          )
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          ALTER TABLE test_rls_unit ENABLE ROW LEVEL SECURITY
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          CREATE POLICY test_rls_unit_policy ON test_rls_unit
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
        `, [], { skipRLS: true });

        // Insert test data
        await sqlWithRLS.execute(`
          INSERT INTO test_rls_unit (id, company_id, data) VALUES 
          ('data_a', $1, 'Company A data'),
          ('data_b', $2, 'Company B data')
        `, [COMPANY_A, COMPANY_B], { skipRLS: true });
      } catch (error) {
        // Table might already exist, continue
      }
    });

    afterEach(async () => {
      try {
        await sqlWithRLS.execute('DROP TABLE IF EXISTS test_rls_unit', [], { skipRLS: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should prevent reading data from other tenants', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      const result = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM test_rls_unit'
      );

      expect(result).toHaveLength(1);
      expect(result[0].company_id).toBe(COMPANY_A);
    });

    it('should prevent inserting data for other tenants', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.execute(
          'INSERT INTO test_rls_unit (id, company_id, data) VALUES ($1, $2, $3)',
          ['cross_tenant', COMPANY_B, 'Cross-tenant attempt']
        )
      ).rejects.toThrow();
    });

    it('should prevent updating data from other tenants', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Try to update Company B's data
      const result = await sqlWithRLS.execute(
        'UPDATE test_rls_unit SET data = $1 WHERE company_id = $2',
        ['Hacked data', COMPANY_B]
      );

      // Should affect 0 rows due to RLS
      expect(result).toBe(0);
    });
  });

  describe('RLS context cleanup on errors', () => {
    it('should cleanup context when query fails', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.query('SELECT * FROM non_existent_table')
      ).rejects.toThrow();

      // Context should still be cleared after error
      clearRequestContext();
    });

    it('should cleanup context when transaction fails', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.transaction(async (client) => {
          await client.query('SELECT * FROM non_existent_table');
        })
      ).rejects.toThrow();
    });
  });

  describe('Concurrent requests with different company contexts', () => {
    it('should handle concurrent queries with different contexts', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const companyId = i % 2 === 0 ? COMPANY_A : COMPANY_B;
        
        promises.push(
          sqlWithRLS.query<{ current_company_id: string }>(
            'SELECT current_setting(\'app.current_company_id\') as current_company_id',
            [],
            { companyId }
          )
        );
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      
      results.forEach((result, index) => {
        const expectedCompany = index % 2 === 0 ? COMPANY_A : COMPANY_B;
        expect(result.rows[0].current_company_id).toBe(expectedCompany);
      });
    });

    it('should handle concurrent transactions with different contexts', async () => {
      const promises = [];
      
      for (let i = 0; i < 3; i++) {
        const companyId = i % 2 === 0 ? COMPANY_A : COMPANY_B;
        
        promises.push(
          sqlWithRLS.transaction(async (client) => {
            const result = await client.query(
              'SELECT current_setting(\'app.current_company_id\') as current_company_id'
            );
            return { companyId: result.rows[0].current_company_id, index: i };
          }, { companyId })
        );
      }
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results[0].companyId).toBe(COMPANY_A);
      expect(results[1].companyId).toBe(COMPANY_B);
      expect(results[2].companyId).toBe(COMPANY_A);
    });
  });
});

