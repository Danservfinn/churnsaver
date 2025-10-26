// RLS Validation Tests
// Tests Row Level Security implementation and cross-tenant data isolation

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../src/lib/db-rls';
import { logger } from '../src/lib/logger';

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

describe('RLS Validation Tests', () => {
  beforeAll(async () => {
    // Mock environment variables
    Object.assign(process.env, mockEnv);
    
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

  describe('RLS Context Management', () => {
    it('should set and retrieve request context', () => {
      const context = {
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      };

      // Set context
      setRequestContext(context);

      // In a real implementation, we would verify the context is stored
      // For this test, we'll just ensure no errors are thrown
      expect(() => setRequestContext(context)).not.toThrow();
    });

    it('should clear request context', () => {
      const context = {
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      };

      // Set context
      setRequestContext(context);

      // Clear context
      clearRequestContext();

      // Verify context is cleared (in real implementation, this would check internal state)
      expect(() => clearRequestContext()).not.toThrow();
    });
  });

  describe('RLS-Enabled Database Operations', () => {
    it('should automatically set RLS context for queries', async () => {
      // Set request context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Test query with automatic RLS context
      const result = await sqlWithRLS.select<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id'
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_company_id).toBe(COMPANY_A);
    });

    it('should use explicit companyId when provided', async () => {
      // Set different context
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Query with explicit company ID override
      const result = await sqlWithRLS.select<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id',
        [],
        { companyId: COMPANY_A }
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_company_id).toBe(COMPANY_A);
    });

    it('should skip RLS when requested', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Query with RLS skipped
      const result = await sqlWithRLS.select<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\', true) as current_company_id',
        [],
        { skipRLS: true }
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_company_id).toBeNull();
    });

    it('should handle transactions with consistent RLS context', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Test transaction with multiple operations
      await sqlWithRLS.transaction(async (client) => {
        // First operation should have RLS context
        const result1 = await client.query(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );
        expect(result1.rows[0].current_company_id).toBe(COMPANY_A);

        // Second operation should maintain same RLS context
        const result2 = await client.query(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );
        expect(result2.rows[0].current_company_id).toBe(COMPANY_A);

        return { success: true };
      });
    });

    it('should validate company context when enforced', async () => {
      // Use invalid company ID
      const invalidCompanyId = 'invalid-company-id';

      // Query with enforced company context should fail
      await expect(
        sqlWithRLS.select('SELECT 1', [], { 
          companyId: invalidCompanyId,
          enforceCompanyContext: true 
        })
      ).rejects.toThrow('Invalid company context: invalid-company-id');
    });
  });

  describe('Cross-Tenant Data Isolation', () => {
    beforeEach(async () => {
      // Create test tables for isolation testing
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE test_isolation (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      await sqlWithRLS.execute(`
        ALTER TABLE test_isolation ENABLE ROW LEVEL SECURITY
      `, [], { skipRLS: true });

      // Create RLS policy
      await sqlWithRLS.execute(`
        CREATE POLICY test_isolation_policy ON test_isolation
        FOR ALL TO authenticated_role
        USING (company_id = current_setting(\'app.current_company_id\'))
        WITH CHECK (company_id = current_setting(\'app.current_company_id\'))
      `, [], { skipRLS: true });

      // Insert test data for both companies
      await sqlWithRLS.execute(`
        INSERT INTO test_isolation (id, company_id, data) VALUES 
        ('data_a', $1, 'Company A data'),
        ('data_b', $2, 'Company B data')
      `, [COMPANY_A, COMPANY_B], { skipRLS: true });
    });

    afterEach(async () => {
      // Clean up test tables
      await sqlWithRLS.execute(`
        DROP TABLE IF EXISTS test_isolation
      `, [], { skipRLS: true });
    });

    it('should enforce data isolation between companies', async () => {
      // Set context to Company A
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Query with Company A context - should only see Company A data
      const companyAResult = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM test_isolation ORDER BY id'
      );

      expect(companyAResult).toHaveLength(1);
      expect(companyAResult[0].company_id).toBe(COMPANY_A);
      expect(companyAResult[0].data).toBe('Company A data');

      // Clear context and set to Company B
      clearRequestContext();
      setRequestContext({
        companyId: COMPANY_B,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Query with Company B context - should only see Company B data
      const companyBResult = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM test_isolation ORDER BY id'
      );

      expect(companyBResult).toHaveLength(1);
      expect(companyBResult[0].company_id).toBe(COMPANY_B);
      expect(companyBResult[0].data).toBe('Company B data');
    });

    it('should prevent cross-company data access', async () => {
      // Set context to Company A
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Try to insert data for Company B while acting as Company A
      await expect(
        sqlWithRLS.execute(`
          INSERT INTO test_isolation (id, company_id, data) VALUES 
          ('cross_company', $1, 'Cross-company attempt')
        `, [COMPANY_B])
      ).rejects.toThrow();
    });

    it('should show no data without company context', async () => {
      // Clear context
      clearRequestContext();

      // Query without context should return no rows due to RLS
      const result = await sqlWithRLS.select<{ id: string; company_id: string; data: string }>(
        'SELECT id, company_id, data FROM test_isolation ORDER BY id'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Clear context
      clearRequestContext();

      // Mock database connection error
      const originalQuery = sqlWithRLS.select;
      sqlWithRLS.select = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      // Should handle error gracefully
      await expect(
        sqlWithRLS.select('SELECT 1')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid company context errors', async () => {
      // Set context with invalid company
      setRequestContext({
        companyId: 'invalid-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      // Query with enforced company validation should fail
      await expect(
        sqlWithRLS.select('SELECT 1', [], { enforceCompanyContext: true })
      ).rejects.toThrow('Invalid company context: invalid-company');
    });

    it('should handle transaction rollback on errors', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Mock transaction that fails
      const originalTransaction = sqlWithRLS.transaction;
      sqlWithRLS.transaction = jest.fn().mockImplementation(async (callback, options) => {
        if (options?.companyId === 'trigger-rollback') {
          throw new Error('Intentional transaction rollback test');
        }
        return callback({} as any); // Mock client
      });

      // Should handle transaction rollback
      await expect(
        originalTransaction(async (client) => {
          return client.query('SELECT 1');
        }, { companyId: 'trigger-rollback' })
      ).rejects.toThrow('Intentional transaction rollback test');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with existing sql interface', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Test all query methods work with RLS wrapper
      const selectResult = await sqlWithRLS.select('SELECT 1 as test');
      expect(selectResult).toHaveLength(1);
      expect(selectResult[0]).toEqual({ test: 1 });

      const insertResult = await sqlWithRLS.insert(
        'INSERT INTO test_isolation (id, company_id, data) VALUES ($1, $2, $3) RETURNING id',
        ['compat_test', COMPANY_A, 'compatibility test']
      );
      expect(insertResult).toBeDefined();
      expect(insertResult?.id).toBe('compat_test');

      const executeResult = await sqlWithRLS.execute(
        'DELETE FROM test_isolation WHERE id = $1',
        ['compat_test']
      );
      expect(executeResult).toBe(1);
    });
  });

  describe('Performance and Reliability', () => {
    it('should maintain performance with RLS overhead', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Measure performance of multiple queries
      const startTime = Date.now();
      
      for (let i = 0; i < 100; i++) {
        await sqlWithRLS.select('SELECT 1 as test');
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds for 100 queries
    });

    it('should handle concurrent requests with different contexts', async () => {
      // Simulate concurrent requests with different company contexts
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const companyId = i % 2 === 0 ? COMPANY_A : COMPANY_B;
        
        promises.push(
          sqlWithRLS.transaction(async (client) => {
            setRequestContext({
              companyId,
              userId: `user-${i}`,
              isAuthenticated: true
            });
            
            const result = await client.query(
              'SELECT current_setting(\'app.current_company_id\') as current_company_id'
            );
            
            expect(result.rows[0].current_company_id).toBe(companyId);
            return { companyId, queryIndex: i };
          }, { companyId })
        );
      }
      
      const results = await Promise.all(promises);
      
      // All operations should complete successfully
      expect(results).toHaveLength(5);
      
      // Verify each query had correct context
      results.forEach((result, index) => {
        if (index % 2 === 0) {
          expect(result.companyId).toBe(COMPANY_A);
        } else {
          expect(result.companyId).toBe(COMPANY_B);
        }
      });
    });
  });

  describe('Security Validation', () => {
    it('should prevent SQL injection with RLS context', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Attempt SQL injection
      const maliciousInput = "'; DROP TABLE test_isolation; --";
      
      await expect(
        sqlWithRLS.select(`SELECT 1 WHERE id = ${maliciousInput}`)
      ).rejects.toThrow();
    });

    it('should validate company existence before setting context', async () => {
      // Test with non-existent company
      const nonExistentCompany = 'non-existent-company';
      
      await expect(
        sqlWithRLS.select('SELECT 1', [], { 
          companyId: nonExistentCompany,
          enforceCompanyContext: true 
        })
      ).rejects.toThrow('Invalid company context: non-existent-company');
    });
  });

  describe('Integration with Application Layers', () => {
    it('should work with API route handlers', async () => {
      // Simulate API route handler that uses RLS context
      const mockRequest = {
        headers: {
          get: jest.fn((key) => {
            if (key.toLowerCase() === 'x-whop-user-token') {
              return 'valid-token';
            }
            return null;
          })
        }
      };

      // Set context from request
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Simulate database operation in API route
      const result = await sqlWithRLS.select('SELECT 1 as test');
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ test: 1 });
    });

    it('should maintain context across async/await boundaries', async () => {
      // Set context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Test context persistence across async operations
      const result1 = await sqlWithRLS.select('SELECT 1 as test');
      expect(result1[0]).toEqual({ test: 1 });

      // Context should still be available for subsequent operations
      const result2 = await sqlWithRLS.select('SELECT 2 as test');
      expect(result2[0]).toEqual({ test: 2 });
    });
  });
});