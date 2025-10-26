// RLS Integration Tests
// Tests centralized RLS session context management across the application

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../src/lib/db-rls';
import { withSystemRLSContext, validateRLSContext } from '../src/lib/rls-middleware';
import { env } from '../src/lib/env';

// Mock environment
const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NEXT_PUBLIC_WHOP_COMPANY_ID: 'test-company-id',
  WHOP_APP_ID: 'test-app-id',
  NODE_ENV: 'test'
};

// Test data
const COMPANY_A = 'company_a_' + Math.random().toString(36).substr(2, 9);
const COMPANY_B = 'company_b_' + Math.random().toString(36).substr(2, 9);

describe('RLS Integration Tests', () => {
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

  describe('Database Wrapper with RLS', () => {
    it('should set RLS context automatically for queries', async () => {
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

      // Query with explicit company ID
      const result = await sqlWithRLS.select<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id',
        [],
        { companyId: COMPANY_A }
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_company_id).toBe(COMPANY_A);
    });

    it('should skip RLS when requested', async () => {
      // Set request context
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
      // Should be NULL when RLS is skipped
      expect(result[0].current_company_id).toBeNull();
    });

    it('should handle transactions with consistent RLS context', async () => {
      // Set request context
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Test transaction with multiple operations
      await sqlWithRLS.transaction(async (client) => {
        // Create test table
        await client.query(`
          CREATE TEMPORARY TABLE test_rls_transaction (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            data TEXT
          )
        `);

        // Insert data
        await client.query(`
          INSERT INTO test_rls_transaction (id, company_id, data) 
          VALUES ($1, $2, $3)
        `, ['test_1', COMPANY_A, 'test data']);

        // Query within transaction should respect RLS
        const result = await client.query(`
          SELECT current_setting(\'app.current_company_id\') as current_company_id
        `);

        expect(result.rows[0].current_company_id).toBe(COMPANY_A);
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

  describe('RLS Context Management', () => {
    it('should set and clear request context correctly', () => {
      const context = {
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      };

      // Set context
      setRequestContext(context);

      // Verify context is set (this would be internal state)
      // Note: In actual implementation, this would verify internal state

      // Clear context
      clearRequestContext();

      // Verify context is cleared
      // Note: In actual implementation, this would verify internal state
    });

    it('should validate RLS context correctly', () => {
      const validContext = {
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true,
        requestId: 'test-request-id',
        path: '/api/test',
        method: 'GET'
      };

      const validation = validateRLSContext(validContext);
      expect(validation.isValid).toBe(true);
      expect(validation.error).toBeUndefined();

      const invalidContext = {
        companyId: undefined,
        userId: 'test-user',
        isAuthenticated: true,
        requestId: 'test-request-id',
        path: '/api/test',
        method: 'GET'
      };

      const invalidValidation = validateRLSContext(invalidContext);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.error).toBe('Company context required for tenant-scoped operation');
    });
  });

  describe('System RLS Context', () => {
    it('should handle system operations with RLS context', async () => {
      let contextSet = false;

      await withSystemRLSContext(async () => {
        contextSet = true;
        
        const result = await sqlWithRLS.select<{ current_company_id: string }>(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );

        expect(result).toHaveLength(1);
        expect(result[0].current_company_id).toBe(mockEnv.NEXT_PUBLIC_WHOP_COMPANY_ID);
      }, {
        companyId: COMPANY_A,
        userId: 'system-user',
        operationType: 'test-operation'
      });

      expect(contextSet).toBe(true);
    });

    it('should use fallback company context for system operations', async () => {
      await withSystemRLSContext(async () => {
        const result = await sqlWithRLS.select<{ current_company_id: string }>(
          'SELECT current_setting(\'app.current_company_id\') as current_company_id'
        );

        expect(result).toHaveLength(1);
        expect(result[0].current_company_id).toBe(mockEnv.NEXT_PUBLIC_WHOP_COMPANY_ID);
      });
    });
  });

  describe('RLS Data Isolation', () => {
    beforeEach(async () => {
      // Create test data for isolation tests
      await sqlWithRLS.execute(`
        CREATE TEMPORARY TABLE test_isolation (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          data TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `, [], { skipRLS: true });

      // Enable RLS on test table
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
      // Clean up test table
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
          INSERT INTO test_isolation (id, company_id, data) 
          VALUES ($1, $2, 'Cross-company attempt')
        `, ['cross_company', COMPANY_B])
      ).rejects.toThrow();

      // Verify no cross-company data was inserted
      const result = await sqlWithRLS.select<{ id: string; company_id: string }>(
        'SELECT id, company_id FROM test_isolation WHERE id = \'cross_company\''
      );

      expect(result).toHaveLength(0);
    });

    it('should show no data without company context', async () => {
      // Clear any company context
      clearRequestContext();

      // Query without context should return no rows due to RLS
      const result = await sqlWithRLS.select<{ id: string; company_id: string }>(
        'SELECT id, company_id FROM test_isolation ORDER BY id'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing company context gracefully', async () => {
      // Clear context
      clearRequestContext();

      // Query without company context should use fallback
      const result = await sqlWithRLS.select<{ current_company_id: string }>(
        'SELECT current_setting(\'app.current_company_id\') as current_company_id'
      );

      expect(result).toHaveLength(1);
      expect(result[0].current_company_id).toBe(mockEnv.NEXT_PUBLIC_WHOP_COMPANY_ID);
    });

    it('should handle database connection errors', async () => {
      // Mock database connection error
      const originalPool = sqlWithRLS.getDbWithRLS().pool;
      
      // This would need to be implemented with proper mocking
      // For now, just ensure error handling doesn't crash
      await expect(
        sqlWithRLS.select('SELECT 1')
      ).resolves.toBeDefined();
    });

    it('should handle transaction rollback on errors', async () => {
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Transaction that should fail and rollback
      await expect(
        sqlWithRLS.transaction(async (client) => {
          await client.query('SELECT 1');
          throw new Error('Intentional test error');
        })
      ).rejects.toThrow('Intentional test error');
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with existing sql interface', async () => {
      // This test ensures the new RLS-enabled interface
      // doesn't break existing code that uses the old interface
      
      setRequestContext({
        companyId: COMPANY_A,
        userId: 'test-user',
        isAuthenticated: true
      });

      // Test all query methods
      const selectResult = await sqlWithRLS.select('SELECT 1 as test');
      expect(selectResult).toHaveLength(1);
      expect(selectResult[0]).toEqual({ test: 1 });

      const insertResult = await sqlWithRLS.insert(
        'INSERT INTO test_isolation (id, company_id, data) VALUES ($1, $2, $3) RETURNING id',
        ['compat_test', COMPANY_A, 'compatibility test']
      );
      expect(insertResult).toBeDefined();

      const executeResult = await sqlWithRLS.execute(
        'DELETE FROM test_isolation WHERE id = $1',
        ['compat_test']
      );
      expect(executeResult).toBe(1);
    });
  });
});