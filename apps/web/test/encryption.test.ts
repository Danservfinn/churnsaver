// Comprehensive tests for encryption module
// Tests all encryption/decryption round-trips and password functions

import { 
  encrypt, 
  decrypt, 
  hashPassword, 
  comparePassword, 
  generateSecureToken, 
  generateRandomString,
  generateEncryptionKey,
  isValidBase64Key,
  isCorrectKeyLength,
  deriveKey
} from '../src/lib/encryption';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('Encryption Module', () => {
  let testKey: string;
  let testPassword: string;
  let testHash: string;

  beforeAll(async () => {
    // Generate a proper 32-byte base64 key for testing
    testKey = generateEncryptionKey();
    testPassword = 'TestPassword123!';
    
    // Set environment variable for tests
    process.env.ENCRYPTION_KEY = testKey;
    
    // Generate a hash for password tests
    testHash = await hashPassword(testPassword);
  });

  afterAll(() => {
    // Clean up environment
    delete process.env.ENCRYPTION_KEY;
  });

  describe('Key Generation and Validation', () => {
    it('should generate a valid base64 encryption key', () => {
      const key = generateEncryptionKey();
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(isValidBase64Key(key)).toBe(true);
      expect(isCorrectKeyLength(key)).toBe(true);
    });

    it('should validate base64 keys correctly', () => {
      const validKey = generateEncryptionKey();
      expect(isValidBase64Key(validKey)).toBe(true);
      expect(isValidBase64Key('invalid-key!@#')).toBe(false);
      expect(isValidBase64Key('')).toBe(false);
    });

    it('should validate key length correctly', () => {
      const validKey = generateEncryptionKey();
      expect(isCorrectKeyLength(validKey)).toBe(true);
      
      // Create a key that's not 32 bytes when decoded
      const shortKey = Buffer.alloc(16).toString('base64');
      expect(isCorrectKeyLength(shortKey)).toBe(false);
    });
  });

  describe('AES-256-GCM Encryption/Decryption', () => {
    it('should encrypt and decrypt text correctly', async () => {
      const plaintext = 'This is a secret message';
      
      const encrypted = await encrypt(plaintext, testKey);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
      
      const decrypted = await decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt empty string', async () => {
      const plaintext = '';
      
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt Unicode characters', async () => {
      const plaintext = 'Hello 🌍 世界 🚀';
      
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt long text', async () => {
      const plaintext = 'A'.repeat(10000); // 10KB
      
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should use environment key when no key provided', async () => {
      const plaintext = 'Test message';
      
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should fail encryption with invalid key', async () => {
      const plaintext = 'Test message';
      
      await expect(encrypt(plaintext, 'invalid-key')).rejects.toThrow();
    });

    it('should fail decryption with wrong key', async () => {
      const plaintext = 'Test message';
      const wrongKey = generateEncryptionKey();
      
      const encrypted = await encrypt(plaintext, testKey);
      
      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow();
    });

    it('should fail decryption with tampered data', async () => {
      const plaintext = 'Test message';
      
      const encrypted = await encrypt(plaintext, testKey);
      const tampered = encrypted.slice(0, -1) + 'X'; // Change last character
      
      await expect(decrypt(tampered, testKey)).rejects.toThrow();
    });

    it('should produce different ciphertext for same plaintext', async () => {
      const plaintext = 'Same message';
      
      const encrypted1 = await encrypt(plaintext, testKey);
      const encrypted2 = await encrypt(plaintext, testKey);
      
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('Password Hashing with bcrypt', () => {
    it('should hash password correctly', async () => {
      const password = 'MySecurePassword123';
      
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
      expect(hash.startsWith('$2b$')).toBe(true); // bcrypt prefix
    });

    it('should compare password correctly', async () => {
      const password = 'MySecurePassword123';
      const hash = await hashPassword(password);
      
      const isMatch = await comparePassword(password, hash);
      expect(isMatch).toBe(true);
    });

    it('should reject wrong password', async () => {
      const password = 'MySecurePassword123';
      const wrongPassword = 'WrongPassword456';
      const hash = await hashPassword(password);
      
      const isMatch = await comparePassword(wrongPassword, hash);
      expect(isMatch).toBe(false);
    });

    it('should handle empty password error', async () => {
      await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
      await expect(comparePassword('', testHash)).rejects.toThrow('Password cannot be empty');
    });

    it('should handle empty hash error', async () => {
      await expect(comparePassword(testPassword, '')).rejects.toThrow('Hash cannot be empty');
    });

    it('should use custom salt rounds', async () => {
      const password = 'TestPassword';
      const hash1 = await hashPassword(password, 10);
      const hash2 = await hashPassword(password, 12);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).toMatch(/^\$2b\$10\$/); // Check salt rounds
      expect(hash2).toMatch(/^\$2b\$12\$/); // Check salt rounds
    });
  });

  describe('Token Generation', () => {
    it('should generate secure token', () => {
      const token = generateSecureToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate token with custom length', () => {
      const token = generateSecureToken(16);
      
      expect(token.length).toBe(16);
    });

    it('should generate different tokens each time', () => {
      const token1 = generateSecureToken();
      const token2 = generateSecureToken();
      
      expect(token1).not.toBe(token2);
    });
  });

  describe('Random String Generation', () => {
    it('should generate random string', () => {
      const str = generateRandomString();
      
      expect(str).toBeDefined();
      expect(typeof str).toBe('string');
      expect(str.length).toBe(16); // default length
    });

    it('should generate string with custom length', () => {
      const length = 32;
      const str = generateRandomString(length);
      
      expect(str.length).toBe(length);
    });

    it('should only contain alphanumeric characters', () => {
      const str = generateRandomString(100);
      const alphanumeric = /^[A-Za-z0-9]+$/;
      
      expect(alphanumeric.test(str)).toBe(true);
    });

    it('should generate different strings each time', () => {
      const str1 = generateRandomString();
      const str2 = generateRandomString();
      
      expect(str1).not.toBe(str2);
    });
  });

  describe('Key Derivation', () => {
    it('should derive key from password and salt', async () => {
      const password = 'TestPassword';
      const salt = 'TestSalt';
      
      const derivedKey = await deriveKey(password, salt);
      
      expect(derivedKey).toBeDefined();
      expect(Buffer.isBuffer(derivedKey)).toBe(true);
      expect(derivedKey.length).toBe(32); // 32 bytes for AES-256
    });

    it('should derive same key for same inputs', async () => {
      const password = 'TestPassword';
      const salt = 'TestSalt';
      
      const key1 = await deriveKey(password, salt);
      const key2 = await deriveKey(password, salt);
      
      expect(key1.toString('hex')).toBe(key2.toString('hex'));
    });

    it('should derive different keys for different inputs', async () => {
      const password = 'TestPassword';
      const salt1 = 'Salt1';
      const salt2 = 'Salt2';
      
      const key1 = await deriveKey(password, salt1);
      const key2 = await deriveKey(password, salt2);
      
      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle keys derived from non-base64 input', async () => {
      const plaintext = 'Test message';
      const nonBase64Key = 'this-is-not-base64-key';
      
      const encrypted = await encrypt(plaintext, nonBase64Key);
      const decrypted = await decrypt(encrypted, nonBase64Key);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle short base64 keys by deriving proper key', async () => {
      const plaintext = 'Test message';
      const shortKey = Buffer.alloc(16).toString('base64'); // 16 bytes instead of 32
      
      const encrypted = await encrypt(plaintext, shortKey);
      const decrypted = await decrypt(encrypted, shortKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long base64 keys by deriving proper key', async () => {
      const plaintext = 'Test message';
      const longKey = Buffer.alloc(64).toString('base64'); // 64 bytes instead of 32
      
      const encrypted = await encrypt(plaintext, longKey);
      const decrypted = await decrypt(encrypted, longKey);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing encryption key', async () => {
      delete process.env.ENCRYPTION_KEY;
      
      await expect(encrypt('test')).rejects.toThrow('Encryption key is required');
      await expect(decrypt('test')).rejects.toThrow('Encryption key is required');
      
      // Restore for other tests
      process.env.ENCRYPTION_KEY = testKey;
    });

    it('should handle invalid encrypted data format', async () => {
      const invalidData = 'not-valid-base64url';
      
      await expect(decrypt(invalidData, testKey)).rejects.toThrow();
    });

    it('should handle too short encrypted data', async () => {
      const shortData = 'dGVzdA'; // Too short to contain IV + auth tag + data
      
      await expect(decrypt(shortData, testKey)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle encryption performance within reasonable time', async () => {
      const plaintext = 'A'.repeat(1000); // 1KB
      const startTime = Date.now();
      
      await encrypt(plaintext, testKey);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 100ms (very generous limit)
      expect(duration).toBeLessThan(100);
    });

    it('should handle decryption performance within reasonable time', async () => {
      const plaintext = 'A'.repeat(1000); // 1KB
      const encrypted = await encrypt(plaintext, testKey);
      const startTime = Date.now();
      
      await decrypt(encrypted, testKey);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 100ms (very generous limit)
      expect(duration).toBeLessThan(100);
    });
  });
});