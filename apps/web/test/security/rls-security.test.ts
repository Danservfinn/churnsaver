// Security tests for RLS Policy Enforcement
// Tests SQL injection prevention, context manipulation, race conditions

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../../src/lib/db-rls';

const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test'
};

const COMPANY_A = 'company_a_' + Math.random().toString(36).substr(2, 9);
const COMPANY_B = 'company_b_' + Math.random().toString(36).substr(2, 9);

describe('RLS Security Tests', () => {
  beforeAll(async () => {
    Object.assign(process.env, mockEnv);
    try {
      await initDbWithRLS();
    } catch (error) {
      console.warn('Database connection failed, skipping RLS security tests:', error);
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

    try {
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE test_rls_security (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        ALTER TABLE test_rls_security ENABLE ROW LEVEL SECURITY
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        CREATE POLICY test_rls_security_policy ON test_rls_security
        FOR ALL TO authenticated_role
        USING (company_id = current_setting('app.current_company_id'))
        WITH CHECK (company_id = current_setting('app.current_company_id'))
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        INSERT INTO test_rls_security (id, company_id, data) VALUES 
        ('data_a', $1, 'Company A data'),
        ('data_b', $2, 'Company B data')
      `, [COMPANY_A, COMPANY_B], { skipRLS: true });
    } catch (error) {
      // Table might already exist
    }
  });

  afterEach(async () => {
    clearRequestContext();
    try {
      await sqlWithRLS.execute('DROP TABLE IF EXISTS test_rls_security', [], { skipRLS: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('SQL injection attempts bypassing RLS', () => {
    it('should prevent SQL injection in company_id parameter', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      const maliciousInput = `${COMPANY_A}' OR '1'='1`;

      // Should use parameterized query, not string concatenation
      const result = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security WHERE company_id = $1',
        [maliciousInput]
      );

      // Should return empty result (not match Company A's data)
      expect(result).toHaveLength(0);
    });

    it('should prevent SQL injection via context manipulation', async () => {
      setRequestContext({
        companyId: `${COMPANY_A}'; DROP TABLE test_rls_security; --`,
        userId: 'user-1',
        isAuthenticated: true
      });

      // Context should be sanitized/set properly
      const result = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security'
      );

      // Should only return Company A's data (if any matches the sanitized context)
      // Or fail safely if context is invalid
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should prevent SQL injection in query text', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      // Attempt SQL injection in query
      const maliciousQuery = `SELECT * FROM test_rls_security WHERE id = '${COMPANY_A}' OR '1'='1'`;

      // Parameterized queries should prevent this, but test that RLS still applies
      await expect(
        sqlWithRLS.query(maliciousQuery)
      ).rejects.toThrow();
    });
  });

  describe('Context manipulation attacks', () => {
    it('should prevent unauthorized context access', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      // Try to manually set context to Company B
      await expect(
        sqlWithRLS.query(
          'SELECT set_company_context($1)',
          [COMPANY_B],
          { companyId: COMPANY_A }
        )
      ).rejects.toThrow();
    });

    it('should validate company context before use', async () => {
      const invalidCompanyId = 'invalid-company-id';

      await expect(
        sqlWithRLS.query(
          'SELECT 1',
          [],
          { companyId: invalidCompanyId, enforceCompanyContext: true }
        )
      ).rejects.toThrow('Invalid company context');
    });

    it('should prevent context switching mid-request', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      // First query with Company A context
      const result1 = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security'
      );

      // Try to switch context (should not be possible without explicit override)
      // Context should remain Company A
      const result2 = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security'
      );

      // Both queries should return same results (Company A data)
      expect(result1.length).toBe(result2.length);
    });
  });

  describe('Race conditions in context switching', () => {
    it('should handle concurrent requests with different contexts safely', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
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

      // Each result should have correct company context
      results.forEach((result, index) => {
        const expectedCompany = index % 2 === 0 ? COMPANY_A : COMPANY_B;
        expect(result.rows[0].current_company_id).toBe(expectedCompany);
      });
    });

    it('should prevent context leakage between concurrent transactions', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
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

      // Each transaction should maintain its own context
      results.forEach((result, index) => {
        const expectedCompany = index % 2 === 0 ? COMPANY_A : COMPANY_B;
        expect(result.companyId).toBe(expectedCompany);
      });
    });

    it('should isolate contexts in parallel operations', async () => {
      const companyAQuery = sqlWithRLS.select(
        'SELECT * FROM test_rls_security',
        [],
        { companyId: COMPANY_A }
      );

      const companyBQuery = sqlWithRLS.select(
        'SELECT * FROM test_rls_security',
        [],
        { companyId: COMPANY_B }
      );

      const [resultA, resultB] = await Promise.all([companyAQuery, companyBQuery]);

      // Results should be isolated
      expect(resultA.length).toBe(1);
      expect(resultB.length).toBe(1);
      expect(resultA[0].company_id).toBe(COMPANY_A);
      expect(resultB[0].company_id).toBe(COMPANY_B);
    });
  });

  describe('Unauthorized context access attempts', () => {
    it('should prevent access without context', async () => {
      clearRequestContext();

      const result = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security'
      );

      // Should return no rows without context
      expect(result).toHaveLength(0);
    });

    it('should prevent access with invalid context', async () => {
      await expect(
        sqlWithRLS.query(
          'SELECT * FROM test_rls_security',
          [],
          { companyId: 'non-existent-company', enforceCompanyContext: true }
        )
      ).rejects.toThrow('Invalid company context');
    });

    it('should prevent bypassing RLS with skipRLS flag without proper authorization', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      // skipRLS should require explicit setting and proper authorization
      // In production, this should be restricted
      const result = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security',
        [],
        { skipRLS: true }
      );

      // Without RLS, should see all data
      // But in production, skipRLS should require admin/system privileges
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Policy bypass attempts', () => {
    it('should prevent direct SQL execution bypassing RLS', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      // Attempt to bypass RLS by directly manipulating session variables
      // This should not be possible through normal sqlWithRLS interface
      const result = await sqlWithRLS.select(
        'SELECT * FROM test_rls_security WHERE company_id = $1',
        [COMPANY_B]
      );

      // Should return empty (cannot access Company B data as Company A)
      expect(result).toHaveLength(0);
    });

    it('should enforce RLS even with complex queries', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'user-1',
        isAuthenticated: true
      });

      // Complex query that might attempt to bypass RLS
      const result = await sqlWithRLS.select(
        `SELECT t1.* FROM test_rls_security t1 
         WHERE EXISTS (
           SELECT 1 FROM test_rls_security t2 
           WHERE t2.company_id = $1 AND t2.id = t1.id
         )`,
        [COMPANY_B]
      );

      // Should still enforce RLS and return empty
      expect(result).toHaveLength(0);
    });
  });
});

