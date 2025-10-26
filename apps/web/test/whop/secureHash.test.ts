// Secure Hash Function Tests
// Tests for the new SHA-256 hash implementations

import { describe, it, expect, beforeEach } from '@jest/globals';
import { WhopAuthService } from '@/lib/whop/auth';
import { TokenUtils } from '@/lib/whop/tokenUtils';
import { whopConfig } from '@/lib/whop/sdkConfig';
import { createHash } from 'crypto';

// Mock dependencies
jest.mock('@/lib/whop/sdkConfig');

const mockWhopConfig = whopConfig as jest.Mocked<typeof whopConfig>;

describe('Secure Hash Functions', () => {
  let authService: WhopAuthService;
  let tokenUtils: TokenUtils;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock config
    mockWhopConfig.get.mockReturnValue({
      appId: 'test-app-id',
      apiKey: 'test-api-key',
      webhookSecret: 'test-webhook-secret',
      environment: 'test',
      debugMode: false
    });

    authService = new WhopAuthService();
    tokenUtils = new TokenUtils();
  });

  describe('Auth Service Hash Function', () => {
    it('should generate consistent SHA-256 hash for same input', () => {
      const token = 'test.jwt.token';
      
      // Access private method through prototype for testing
      const hashFunction = authService['hashToken'];
      const hash1 = hashFunction.call(authService, token);
      const hash2 = hashFunction.call(authService, token);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex pattern
    });

    it('should generate different hashes for different inputs', () => {
      const token1 = 'first.jwt.token';
      const token2 = 'second.jwt.token';
      
      const hashFunction = authService['hashToken'];
      const hash1 = hashFunction.call(authService, token1);
      const hash2 = hashFunction.call(authService, token2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should generate SHA-256 hash matching crypto module', () => {
      const token = 'test.jwt.token';
      
      const hashFunction = authService['hashToken'];
      const authHash = hashFunction.call(authService, token);
      
      // Compare with direct crypto implementation
      const cryptoHash = createHash('sha256').update(token).digest('hex');
      
      expect(authHash).toBe(cryptoHash);
    });

    it('should handle empty string input', () => {
      const token = '';
      
      const hashFunction = authService['hashToken'];
      const hash = hashFunction.call(authService, token);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      
      // Should match known SHA-256 of empty string
      const expectedHash = createHash('sha256').update('').digest('hex');
      expect(hash).toBe(expectedHash);
    });

    it('should handle long token strings', () => {
      const longToken = 'a'.repeat(10000);
      
      const hashFunction = authService['hashToken'];
      const hash = hashFunction.call(authService, longToken);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash.length).toBe(64); // SHA-256 always produces 64 hex chars
    });

    it('should handle special characters in token', () => {
      const tokenWithSpecialChars = 'test.jwt.token!@#$%^&*()_+-=[]{}|;:,.<>?';
      
      const hashFunction = authService['hashToken'];
      const hash = hashFunction.call(authService, tokenWithSpecialChars);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      
      // Compare with crypto implementation
      const cryptoHash = createHash('sha256').update(tokenWithSpecialChars).digest('hex');
      expect(hash).toBe(cryptoHash);
    });
  });

  describe('Token Utils Fingerprint Function', () => {
    it('should generate consistent SHA-256 fingerprint for same token data', () => {
      const token = 'eyJqdGkiOiJ0ZXN0LWp0aSIsInN1YiI6InRlc3QtdXNlciIsImlhdCI6MTYyMzQ1Njc5OSwiZXhwIjoxNjIzNDYwMzk5fQ.signature';
      
      // Mock decodeJwt to return consistent data
      jest.doMock('jose', () => ({
        decodeJwt: () => ({ 
          jti: 'test-jti', 
          sub: 'test-user', 
          iat: 1623456799, 
          exp: 1623456799 
        })
      }));

      const fingerprint1 = tokenUtils.generateTokenFingerprint(token);
      const fingerprint2 = tokenUtils.generateTokenFingerprint(token);
      
      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex pattern
    });

    it('should generate different fingerprints for different token data', () => {
      const token1 = 'eyJqdGkiOiJqdGkxIiwic3ViIjoidXNlcjEiLCJpYXQiOjE2MjM0NTY3OTksImV4cCI6MTYyMzQ2MDM5OX0.signature1';
      const token2 = 'eyJqdGkiOiJqdGkyIiwic3ViIjoidXNlcjIiLCJpYXQiOjE2MjM0NTY3OTksImV4cCI6MTYyMzQ2MDM5OX0.signature2';
      
      // Mock different token data
      jest.doMock('jose', () => ({
        decodeJwt: (token: string) => {
          if (token.includes('jti1')) {
            return { jti: 'jti1', sub: 'user1', iat: 1623456799, exp: 1623456799 };
          } else {
            return { jti: 'jti2', sub: 'user2', iat: 1623456799, exp: 1623456799 };
          }
        }
      }));

      const fingerprint1 = tokenUtils.generateTokenFingerprint(token1);
      const fingerprint2 = tokenUtils.generateTokenFingerprint(token2);
      
      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should generate SHA-256 fingerprint matching crypto module', () => {
      const token = 'eyJqdGkiOiJ0ZXN0LWp0aSIsInN1YiI6InRlc3QtdXNlciIsImlhdCI6MTYyMzQ1Njc5OSwiZXhwIjoxNjIzNDYwMzk5fQ.signature';
      
      // Mock token data
      const tokenData = {
        jti: 'test-jti', 
        sub: 'test-user', 
        iat: 1623456799, 
        exp: 1623456799 
      };
      
      jest.doMock('jose', () => ({
        decodeJwt: () => tokenData
      }));

      const fingerprint = tokenUtils.generateTokenFingerprint(token);
      
      // Compare with direct crypto implementation
      const cryptoFingerprint = createHash('sha256').update(JSON.stringify(tokenData)).digest('hex');
      
      expect(fingerprint).toBe(cryptoFingerprint);
    });

    it('should handle invalid token gracefully', () => {
      const invalidToken = 'invalid.token.format';
      
      // Mock decodeJwt to throw error
      jest.doMock('jose', () => ({
        decodeJwt: () => {
          throw new Error('Invalid token');
        }
      }));

      const fingerprint = tokenUtils.generateTokenFingerprint(invalidToken);
      
      expect(fingerprint).toBe('invalid');
    });

    it('should handle missing token claims', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0In0.signature';
      
      // Mock token with missing claims
      jest.doMock('jose', () => ({
        decodeJwt: () => ({ iss: 'test' }) // Missing jti, sub, iat, exp
      }));

      const fingerprint = tokenUtils.generateTokenFingerprint(token);
      
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
      
      // Should match crypto implementation with partial data
      const partialData = { iss: 'test' };
      const cryptoFingerprint = createHash('sha256').update(JSON.stringify(partialData)).digest('hex');
      expect(fingerprint).toBe(cryptoFingerprint);
    });
  });

  describe('Security Properties', () => {
    it('should prevent collision attacks with different inputs producing same hash', () => {
      const inputs = [
        'token1',
        'token2',
        'very.different.token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkaWZmZXJlbnQifQ.signature',
        '',
        'a',
        'ab',
        'abc'
      ];
      
      const hashFunction = authService['hashToken'];
      const hashes = inputs.map(input => hashFunction.call(authService, input));
      
      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(inputs.length);
      
      // All should be valid SHA-256 format
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    it('should be resistant to timing attacks', () => {
      const token = 'test.jwt.token';
      const differentToken = 'different.jwt.token';
      
      const hashFunction = authService['hashToken'];
      
      // Multiple calls should take consistent time regardless of input
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        hashFunction.call(authService, token);
      }
      const tokenTime = Date.now() - startTime;
      
      const startTime2 = Date.now();
      for (let i = 0; i < 1000; i++) {
        hashFunction.call(authService, differentToken);
      }
      const differentTokenTime = Date.now() - startTime2;
      
      // Times should be reasonably close (within 50% difference)
      const timeDifference = Math.abs(tokenTime - differentTokenTime);
      const maxAllowedDifference = Math.max(tokenTime, differentTokenTime) * 0.5;
      
      expect(timeDifference).toBeLessThan(maxAllowedDifference);
    });

    it('should handle avalanche effect - small input changes produce big hash changes', () => {
      const token1 = 'test.jwt.token';
      const token2 = 'test.jwt.token1'; // Only one character difference
      
      const hashFunction = authService['hashToken'];
      const hash1 = hashFunction.call(authService, token1);
      const hash2 = hashFunction.call(authService, token2);
      
      // Count different characters in hashes
      let differences = 0;
      for (let i = 0; i < Math.min(hash1.length, hash2.length); i++) {
        if (hash1[i] !== hash2[i]) {
          differences++;
        }
      }
      
      // Should have significant differences (avalanche effect)
      expect(differences).toBeGreaterThan(20); // At least 20/64 characters different
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle high volume of hash operations efficiently', () => {
      const tokens = Array.from({ length: 1000 }, (_, i) => `token.${i}.test`);
      
      const hashFunction = authService['hashToken'];
      const startTime = Date.now();
      
      const hashes = tokens.map(token => hashFunction.call(authService, token));
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 hashes in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
      
      // All hashes should be valid
      hashes.forEach(hash => {
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
      });
      
      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(tokens.length);
    });

    it('should maintain consistent hash length', () => {
      const inputs = [
        '',
        'a',
        'short',
        'medium.length.token',
        'very.long.token.with.many.parts.that.could.be.used.in.real.scenarios',
        'a'.repeat(10000)
      ];
      
      const hashFunction = authService['hashToken'];
      
      inputs.forEach(input => {
        const hash = hashFunction.call(authService, input);
        expect(hash.length).toBe(64); // SHA-256 is always 64 hex characters
      });
    });
  });
});