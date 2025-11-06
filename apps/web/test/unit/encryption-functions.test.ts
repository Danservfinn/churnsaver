// Unit tests for Encryption/Decryption Functions
// Tests encrypt, decrypt, and related utility functions

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  encrypt, 
  decrypt, 
  generateEncryptionKey,
  isValidBase64Key,
  isCorrectKeyLength
} from '../../src/lib/encryption';

describe('Encryption Functions - Unit Tests', () => {
  let testKey: string;

  beforeAll(() => {
    // Generate a proper 32-byte base64 key for testing
    testKey = generateEncryptionKey();
    process.env.ENCRYPTION_KEY = testKey;
  });

  afterAll(() => {
    // Clean up environment
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encrypt() with various data types and sizes', () => {
    it('should encrypt small text strings', async () => {
      const plaintext = 'Hello World';
      const encrypted = await encrypt(plaintext, testKey);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should encrypt empty strings', async () => {
      const plaintext = '';
      const encrypted = await encrypt(plaintext, testKey);
      
      expect(encrypted).toBeDefined();
      const decrypted = await decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt Unicode characters', async () => {
      const plaintext = 'Hello 🌍 世界 🚀';
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt large data sets', async () => {
      const plaintext = 'A'.repeat(100000); // 100KB
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(100000);
    });

    it('should encrypt JSON data', async () => {
      const plaintext = JSON.stringify({ name: 'Test', id: 123, nested: { value: 'nested' } });
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(plaintext));
    });

    it('should encrypt special characters', async () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt() with valid encrypted data', () => {
    it('should decrypt correctly encrypted data', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext, testKey);
      const decrypted = await decrypt(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt data encrypted with different IVs', async () => {
      const plaintext = 'Same message';
      const encrypted1 = await encrypt(plaintext, testKey);
      const encrypted2 = await encrypt(plaintext, testKey);
      
      // Both should decrypt to same plaintext
      expect(await decrypt(encrypted1, testKey)).toBe(plaintext);
      expect(await decrypt(encrypted2, testKey)).toBe(plaintext);
      // But ciphertexts should be different
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should decrypt when using environment key', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext);
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt() with invalid/corrupted data', () => {
    it('should reject tampered encrypted data', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext, testKey);
      const tampered = encrypted.slice(0, -5) + 'XXXXX';
      
      await expect(decrypt(tampered, testKey)).rejects.toThrow();
    });

    it('should reject data with corrupted auth tag', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext, testKey);
      // Corrupt the auth tag portion (first 28 characters after base64 decoding)
      const tampered = encrypted.slice(0, -10) + 'XXXXXXXXXX';
      
      await expect(decrypt(tampered, testKey)).rejects.toThrow();
    });

    it('should reject invalid base64url format', async () => {
      const invalidData = 'not-valid-base64url-format!@#';
      
      await expect(decrypt(invalidData, testKey)).rejects.toThrow();
    });

    it('should reject too short encrypted data', async () => {
      const shortData = 'dGVzdA'; // Too short to contain IV + auth tag + data
      
      await expect(decrypt(shortData, testKey)).rejects.toThrow();
    });

    it('should reject empty encrypted data', async () => {
      await expect(decrypt('', testKey)).rejects.toThrow();
    });
  });

  describe('Key validation and normalization', () => {
    it('should validate base64 keys', () => {
      const validKey = generateEncryptionKey();
      expect(isValidBase64Key(validKey)).toBe(true);
      expect(isValidBase64Key('invalid-key!@#')).toBe(false);
      expect(isValidBase64Key('')).toBe(false);
    });

    it('should validate key length', () => {
      const validKey = generateEncryptionKey();
      expect(isCorrectKeyLength(validKey)).toBe(true);
      
      const shortKey = Buffer.alloc(16).toString('base64');
      expect(isCorrectKeyLength(shortKey)).toBe(false);
    });

    it('should normalize non-base64 keys', async () => {
      const plaintext = 'Test message';
      const nonBase64Key = 'this-is-not-base64-key';
      
      const encrypted = await encrypt(plaintext, nonBase64Key);
      const decrypted = await decrypt(encrypted, nonBase64Key);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should normalize short base64 keys', async () => {
      const plaintext = 'Test message';
      const shortKey = Buffer.alloc(16).toString('base64');
      
      const encrypted = await encrypt(plaintext, shortKey);
      const decrypted = await decrypt(encrypted, shortKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should normalize long base64 keys', async () => {
      const plaintext = 'Test message';
      const longKey = Buffer.alloc(64).toString('base64');
      
      const encrypted = await encrypt(plaintext, longKey);
      const decrypted = await decrypt(encrypted, longKey);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('IV generation uniqueness', () => {
    it('should generate different IVs for same plaintext', async () => {
      const plaintext = 'Same message';
      const encrypted1 = await encrypt(plaintext, testKey);
      const encrypted2 = await encrypt(plaintext, testKey);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // Extract IVs (first 12 bytes when decoded)
      const buffer1 = Buffer.from(encrypted1, 'base64url');
      const buffer2 = Buffer.from(encrypted2, 'base64url');
      const iv1 = buffer1.subarray(0, 12);
      const iv2 = buffer2.subarray(0, 12);
      
      expect(iv1.equals(iv2)).toBe(false);
    });

    it('should generate unique IVs across multiple encryptions', async () => {
      const plaintext = 'Test message';
      const ivs = new Set();
      
      for (let i = 0; i < 100; i++) {
        const encrypted = await encrypt(plaintext, testKey);
        const buffer = Buffer.from(encrypted, 'base64url');
        const iv = buffer.subarray(0, 12).toString('hex');
        ivs.add(iv);
      }
      
      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });
  });

  describe('Auth tag verification', () => {
    it('should include auth tag in encrypted output', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext, testKey);
      const buffer = Buffer.from(encrypted, 'base64url');
      
      // Should have at least IV (12) + auth tag (16) bytes
      expect(buffer.length).toBeGreaterThanOrEqual(28);
    });

    it('should verify auth tag on decryption', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext, testKey);
      
      // Should successfully decrypt with correct auth tag
      const decrypted = await decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should reject data with modified auth tag', async () => {
      const plaintext = 'Test message';
      const encrypted = await encrypt(plaintext, testKey);
      const buffer = Buffer.from(encrypted, 'base64url');
      
      // Modify auth tag (bytes 12-28)
      buffer[20] = (buffer[20] + 1) % 256;
      const tampered = buffer.toString('base64url');
      
      await expect(decrypt(tampered, testKey)).rejects.toThrow();
    });
  });

  describe('Error handling for missing keys', () => {
    it('should throw error when encryption key is missing', async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      
      await expect(encrypt('test')).rejects.toThrow('Encryption key is required');
      
      // Restore for other tests
      process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should throw error when decryption key is missing', async () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      const encrypted = await encrypt('test', testKey);
      delete process.env.ENCRYPTION_KEY;
      
      await expect(decrypt(encrypted)).rejects.toThrow('Encryption key is required');
      
      // Restore for other tests
      process.env.ENCRYPTION_KEY = originalKey;
    });
  });

  describe('Error handling for invalid key formats', () => {
    it('should handle invalid key gracefully', async () => {
      await expect(encrypt('test', 'invalid-key')).rejects.toThrow();
    });

    it('should handle empty key', async () => {
      // Empty key gets normalized and derived, so it doesn't throw
      // This is expected behavior - empty string is valid key material
      const encrypted = await encrypt('test', '');
      expect(encrypted).toBeDefined();
    });
  });

  describe('Encryption/decryption round-trips with different keys', () => {
    it('should work with different valid keys', async () => {
      const plaintext = 'Test message';
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      
      const encrypted1 = await encrypt(plaintext, key1);
      const encrypted2 = await encrypt(plaintext, key2);
      
      expect(await decrypt(encrypted1, key1)).toBe(plaintext);
      expect(await decrypt(encrypted2, key2)).toBe(plaintext);
      
      // Data encrypted with one key should not decrypt with another
      await expect(decrypt(encrypted1, key2)).rejects.toThrow();
      await expect(decrypt(encrypted2, key1)).rejects.toThrow();
    });

    it('should maintain round-trip integrity', async () => {
      const testCases = [
        'Simple text',
        'Text with "quotes"',
        'Text with\nnewlines',
        'Text with\ttabs',
        'Text with special chars: !@#$%^&*()',
        'Unicode: 🌍 世界 🚀',
        'A'.repeat(1000)
      ];
      
      for (const plaintext of testCases) {
        const encrypted = await encrypt(plaintext, testKey);
        const decrypted = await decrypt(encrypted, testKey);
        expect(decrypted).toBe(plaintext);
      }
    });
  });

  describe('Performance with large data sets', () => {
    it('should handle 1KB data efficiently', async () => {
      const plaintext = 'A'.repeat(1000);
      const startTime = Date.now();
      
      const encrypted = await encrypt(plaintext, testKey);
      await decrypt(encrypted, testKey);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle 10KB data efficiently', async () => {
      const plaintext = 'A'.repeat(10000);
      const startTime = Date.now();
      
      const encrypted = await encrypt(plaintext, testKey);
      await decrypt(encrypted, testKey);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1s
    });

    it('should handle 100KB data efficiently', async () => {
      const plaintext = 'A'.repeat(100000);
      const startTime = Date.now();
      
      const encrypted = await encrypt(plaintext, testKey);
      await decrypt(encrypted, testKey);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete in under 5s
    });
  });
});

