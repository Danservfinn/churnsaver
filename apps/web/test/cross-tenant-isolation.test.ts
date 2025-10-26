// Cross-Tenant Data Isolation Test
// Verifies RLS policies prevent data access between companies

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../src/lib/db-rls';

// Test company IDs
const COMPANY_A = 'company_a_' + Math.random().toString(36).substr(2, 9);
const COMPANY_B = 'company_b_' + Math.random().toString(36).substr(2, 9);

describe('Cross-Tenant Data Isolation', () => {
  beforeAll(async () => {
    // Initialize database with RLS support
    await initDbWithRLS();
  });

  afterAll(async () => {
    // Clean up database connection
    await closeDbWithRLS();
  });

  beforeEach(() => {
    // Clear any existing context
    clearRequestContext();
  });

  afterEach(() => {
    // Clear context after each test
    clearRequestContext();
  });

  describe('Basic Isolation', () => {
    it('should prevent cross-company data access', async () => {
      // Create test tables for isolation testing
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE isolation_test (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        CREATE POLICY isolation_test_policy ON isolation_test
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
      `, [], { skipRLS: true });

      // Insert test data for both companies
      await sqlWithRLS.execute(`
        INSERT INTO isolation_test (id, company_id, data) VALUES 
        ('data_a', $1, 'Company A data'),
        ('data_b', $2, 'Company B data')
      `, [COMPANY_A, COMPANY_B], { skipRLS: true });

      // Set context to Company A and query - should only see Company A data
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      const companyAResult = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM isolation_test ORDER BY id'
      );

      expect(companyAResult).toHaveLength(1);
      expect(companyAResult[0].company_id).toBe(COMPANY_A);
      expect(companyAResult[0].data).toBe('Company A data');

      // Clear context and set to Company B - should only see Company B data
      clearRequestContext();
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      const companyBResult = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM isolation_test ORDER BY id'
      );

      expect(companyBResult).toHaveLength(1);
      expect(companyBResult[0].company_id).toBe(COMPANY_B);
      expect(companyBResult[0].data).toBe('Company B data');

      // Try to access Company A data with Company B context - should fail
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.select('SELECT * FROM isolation_test WHERE company_id = $1', [COMPANY_A])
      ).rejects.toThrow();

      // Clean up
      await sqlWithRLS.execute(`
        DROP TABLE IF EXISTS isolation_test
      `, [], { skipRLS: true });
    });

    it('should show no data without company context', async () => {
      // Create test table
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE context_test (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        CREATE POLICY context_test_policy ON context_test
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
      `, [], { skipRLS: true });

      // Insert test data
      await sqlWithRLS.execute(`
        INSERT INTO context_test (id, company_id, data) VALUES 
        ('test_data', 'test-company', 'Test data')
      `, [], { skipRLS: true });

      // Query without context - should return no rows
      clearRequestContext();
      const result = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM context_test ORDER BY id'
      );

      expect(result).toHaveLength(0);

      // Query with context - should return data
      setRequestContext({
        companyId: 'test-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      const contextResult = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM context_test ORDER BY id'
      );

      expect(contextResult).toHaveLength(1);
      expect(contextResult[0].company_id).toBe('test-company');
      expect(contextResult[0].data).toBe('Test data');

      // Clean up
      await sqlWithRLS.execute(`
        DROP TABLE IF EXISTS context_test
      `, [], { skipRLS: true });
    });
  });

  describe('Advanced Isolation', () => {
    it('should enforce RLS in transactions', async () => {
      // Create test table
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE transaction_test (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        CREATE POLICY transaction_test_policy ON transaction_test
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
      `, [], { skipRLS: true });

      // Insert test data
      await sqlWithRLS.execute(`
        INSERT INTO transaction_test (id, company_id, data) VALUES 
        ('tx_data', $1, 'Transaction data')
      `, [COMPANY_A], { skipRLS: true });

      // Test transaction with Company A context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.transaction(async (client) => {
        // First operation - should see Company A data
        const result1 = await client.query(
          'SELECT COUNT(*) FROM transaction_test WHERE company_id = $1'
        );
        expect(result1.rows[0].count).toBe('1');

        // Second operation - should still only see Company A data
        const result2 = await client.query(
          'SELECT COUNT(*) FROM transaction_test WHERE company_id = $2'
        );
        expect(result2.rows[0].count).toBe('0');

        return { success: true };
      });

      // Test transaction with Company B context
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.transaction(async (client) => {
        // First operation - should see Company B data
        const result1 = await client.query(
          'SELECT COUNT(*) FROM transaction_test WHERE company_id = $1'
        );
        expect(result1.rows[0].count).toBe('0');

        // Second operation - should still only see Company B data
        const result2 = await client.query(
          'SELECT COUNT(*) FROM transaction_test WHERE company_id = $2'
        );
        expect(result2.rows[0].count).toBe('1');

        return { success: true };
      });

      // Clean up
      await sqlWithRLS.execute(`
        DROP TABLE IF EXISTS transaction_test
      `, [], { skipRLS: true });
    });

    it('should prevent cross-company data modification', async () => {
      // Create test table
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE modification_test (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        CREATE POLICY modification_test_policy ON modification_test
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
      `, [], { skipRLS: true });

      // Insert test data
      await sqlWithRLS.execute(`
        INSERT INTO modification_test (id, company_id, data) VALUES 
        ('mod_data', $1, 'Original data')
      `, [COMPANY_A], { skipRLS: true });

      // Try to modify with different company context - should fail
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.execute(`
          UPDATE modification_test SET data = 'Modified by wrong company' WHERE id = 'mod_data'
        `)
      ).rejects.toThrow();

      // Clean up
      await sqlWithRLS.execute(`
        DROP TABLE IF EXISTS modification_test
      `, [], { skipRLS: true });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing company context', async () => {
      // Try operation without company context
      clearRequestContext();
      
      await expect(
        sqlWithRLS.select('SELECT 1', [], { enforceCompanyContext: true })
      ).rejects.toThrow('Company context required for tenant-scoped operation');
    });

    it('should handle invalid company context', async () => {
      // Try operation with invalid company context
      setRequestContext({
        companyId: 'invalid-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      await expect(
        sqlWithRLS.select('SELECT 1', [], { enforceCompanyContext: true })
      ).rejects.toThrow('Invalid company context: invalid-company');
    });

    it('should handle database errors gracefully', async () => {
      // Mock database error
      const originalSelect = sqlWithRLS.select;
      sqlWithRLS.select = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await expect(
        originalSelect('SELECT 1')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Performance', () => {
    it('should maintain performance with RLS overhead', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Measure performance of multiple operations
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        await sqlWithRLS.select('SELECT 1');
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 operations
    });
  });
});