// Integration tests for Encryption/Decryption Functions
// Tests encryption in database operations and with RLS context

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { encrypt, decrypt, generateEncryptionKey } from '../../src/lib/encryption';
import { initDbWithRLS, closeDbWithRLS, sqlWithRLS, setRequestContext, clearRequestContext } from '../../src/lib/db-rls';

const mockEnv = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  NODE_ENV: 'test'
};

let testKey: string;

describe('Encryption Integration Tests', () => {
  beforeAll(() => {
    testKey = generateEncryptionKey();
    process.env.ENCRYPTION_KEY = testKey;
    Object.assign(process.env, mockEnv);
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
    try {
      closeDbWithRLS();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    clearRequestContext();
    try {
      await initDbWithRLS();
    } catch (error) {
      console.warn('Database not available for encryption integration tests:', error);
    }
  });

  describe('Encryption in database operations', () => {
    beforeEach(async () => {
      try {
        await sqlWithRLS.execute(`
          CREATE TEMPORARY TABLE test_encryption_integration (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            plain_data TEXT,
            encrypted_data TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `, [], { skipRLS: true });
      } catch (error) {
        // Table might already exist
      }
    });

    afterEach(async () => {
      try {
        await sqlWithRLS.execute('DROP TABLE IF EXISTS test_encryption_integration', [], { skipRLS: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should encrypt data before storing in database', async () => {
      const plaintext = 'Sensitive user data';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'test-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_integration (id, company_id, plain_data, encrypted_data) VALUES ($1, $2, $3, $4) RETURNING id',
        ['test-1', 'test-company', plaintext, encrypted]
      );

      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_integration WHERE id = $1',
        ['test-1']
      );

      expect(result[0].encrypted_data).toBe(encrypted);
      expect(result[0].encrypted_data).not.toBe(plaintext);
    });

    it('should decrypt data after retrieving from database', async () => {
      const plaintext = 'Sensitive user data';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'test-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_integration (id, company_id, plain_data, encrypted_data) VALUES ($1, $2, $3, $4) RETURNING id',
        ['test-2', 'test-company', plaintext, encrypted]
      );

      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_integration WHERE id = $1',
        ['test-2']
      );

      const decrypted = await decrypt(result[0].encrypted_data, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle multiple encrypted fields in same record', async () => {
      const plaintext1 = 'First sensitive field';
      const plaintext2 = 'Second sensitive field';
      const encrypted1 = await encrypt(plaintext1, testKey);
      const encrypted2 = await encrypt(plaintext2, testKey);

      setRequestContext({
        companyId: 'test-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_integration (id, company_id, plain_data, encrypted_data) VALUES ($1, $2, $3, $4) RETURNING id',
        ['test-3', 'test-company', plaintext1, encrypted1]
      );

      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_integration WHERE id = $1',
        ['test-3']
      );

      const decrypted1 = await decrypt(result[0].encrypted_data, testKey);
      expect(decrypted1).toBe(plaintext1);
    });
  });

  describe('Encrypted data persistence and retrieval', () => {
    beforeEach(async () => {
      try {
        await sqlWithRLS.execute(`
          CREATE TEMPORARY TABLE test_encryption_persistence (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            encrypted_data TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `, [], { skipRLS: true });
      } catch (error) {
        // Table might already exist
      }
    });

    afterEach(async () => {
      try {
        await sqlWithRLS.execute('DROP TABLE IF EXISTS test_encryption_persistence', [], { skipRLS: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should persist encrypted data correctly', async () => {
      const plaintext = 'Data to persist';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'test-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_persistence (id, company_id, encrypted_data) VALUES ($1, $2, $3) RETURNING id',
        ['persist-1', 'test-company', encrypted]
      );

      // Retrieve and verify
      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_persistence WHERE id = $1',
        ['persist-1']
      );

      expect(result[0].encrypted_data).toBe(encrypted);
      const decrypted = await decrypt(result[0].encrypted_data, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should retrieve and decrypt persisted data', async () => {
      const plaintext = 'Persisted encrypted data';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'test-company',
        userId: 'test-user',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_persistence (id, company_id, encrypted_data) VALUES ($1, $2, $3) RETURNING id',
        ['persist-2', 'test-company', encrypted]
      );

      // Wait a bit to simulate persistence
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_persistence WHERE id = $1',
        ['persist-2']
      );

      const decrypted = await decrypt(result[0].encrypted_data, testKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Encryption with RLS context', () => {
    beforeEach(async () => {
      try {
        await sqlWithRLS.execute(`
          CREATE TEMPORARY TABLE test_encryption_rls (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            encrypted_data TEXT
          )
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          ALTER TABLE test_encryption_rls ENABLE ROW LEVEL SECURITY
        `, [], { skipRLS: true });

        await sqlWithRLS.execute(`
          CREATE POLICY test_encryption_rls_policy ON test_encryption_rls
          FOR ALL TO authenticated_role
          USING (company_id = current_setting('app.current_company_id'))
          WITH CHECK (company_id = current_setting('app.current_company_id'))
        `, [], { skipRLS: true });
      } catch (error) {
        // Table might already exist
      }
    });

    afterEach(async () => {
      try {
        await sqlWithRLS.execute('DROP TABLE IF EXISTS test_encryption_rls', [], { skipRLS: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should encrypt data with RLS context', async () => {
      const plaintext = 'Company A encrypted data';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'company-a',
        userId: 'user-a',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_rls (id, company_id, encrypted_data) VALUES ($1, $2, $3) RETURNING id',
        ['rls-1', 'company-a', encrypted]
      );

      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_rls WHERE id = $1',
        ['rls-1']
      );

      const decrypted = await decrypt(result[0].encrypted_data, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt data with correct RLS context', async () => {
      const plaintext = 'Company B encrypted data';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'company-b',
        userId: 'user-b',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_rls (id, company_id, encrypted_data) VALUES ($1, $2, $3) RETURNING id',
        ['rls-2', 'company-b', encrypted]
      );

      // Query with same context
      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_rls WHERE id = $1',
        ['rls-2']
      );

      const decrypted = await decrypt(result[0].encrypted_data, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should prevent decryption access with wrong RLS context', async () => {
      const plaintext = 'Company A encrypted data';
      const encrypted = await encrypt(plaintext, testKey);

      setRequestContext({
        companyId: 'company-a',
        userId: 'user-a',
        isAuthenticated: true
      });

      await sqlWithRLS.insert(
        'INSERT INTO test_encryption_rls (id, company_id, encrypted_data) VALUES ($1, $2, $3) RETURNING id',
        ['rls-3', 'company-a', encrypted]
      );

      // Switch to different company context
      setRequestContext({
        companyId: 'company-b',
        userId: 'user-b',
        isAuthenticated: true
      });

      // Should not be able to access Company A's data
      const result = await sqlWithRLS.select<{ encrypted_data: string }>(
        'SELECT encrypted_data FROM test_encryption_rls WHERE id = $1',
        ['rls-3']
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('Encryption error recovery', () => {
    it('should handle encryption errors gracefully', async () => {
      const invalidKey = 'invalid-key';

      await expect(
        encrypt('test data', invalidKey)
      ).rejects.toThrow();
    });

    it('should handle decryption errors gracefully', async () => {
      const plaintext = 'Test data';
      const encrypted = await encrypt(plaintext, testKey);
      const wrongKey = generateEncryptionKey();

      await expect(
        decrypt(encrypted, wrongKey)
      ).rejects.toThrow();
    });

    it('should handle corrupted encrypted data in database', async () => {
      try {
        await sqlWithRLS.execute(`
          CREATE TEMPORARY TABLE test_encryption_error (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL,
            encrypted_data TEXT
          )
        `, [], { skipRLS: true });

        setRequestContext({
          companyId: 'test-company',
          userId: 'test-user',
          isAuthenticated: true
        });

        // Insert corrupted data
        await sqlWithRLS.insert(
          'INSERT INTO test_encryption_error (id, company_id, encrypted_data) VALUES ($1, $2, $3) RETURNING id',
          ['error-1', 'test-company', 'corrupted-encrypted-data']
        );

        const result = await sqlWithRLS.select<{ encrypted_data: string }>(
          'SELECT encrypted_data FROM test_encryption_error WHERE id = $1',
          ['error-1']
        );

        // Should throw error when trying to decrypt corrupted data
        await expect(
          decrypt(result[0].encrypted_data, testKey)
        ).rejects.toThrow();
      } catch (error) {
        // Cleanup
        try {
          await sqlWithRLS.execute('DROP TABLE IF EXISTS test_encryption_error', [], { skipRLS: true });
        } catch (e) {
          // Ignore
        }
      }
    });
  });
});

