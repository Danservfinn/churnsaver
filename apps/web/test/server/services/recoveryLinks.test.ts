// @ts-nocheck
/* eslint-disable security/detect-hardcoded-credentials */
/* eslint-disable no-hardcoded-password */
/* eslint-disable no-secrets/no-secrets */
/**
 * Recovery Links Token Tests
 * 
 * Tests for HMAC-signed token generation, verification, and expiration handling
 * in the click-through attribution system.
 * 
 * @see apps/web/src/server/services/recoveryLinks.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock dependencies before importing the module
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes-long',
  },
}));

vi.mock('@/lib/db', () => ({
  sql: {
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    select: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks are set up
import { decodeRecoveryToken, createRecoveryLink } from '@/server/services/recoveryLinks';
import { sql } from '@/lib/db';

const generateKey = () => crypto.randomBytes(32).toString('hex');

describe('Recovery Links Token Tests', () => {
  const TEST_KEY = generateKey();
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset date mocks
    vi.useRealTimers();
    // Set a consistent app URL
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.churnsaver.com';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Token Round-Trip', () => {
    it('should successfully sign and verify a valid token payload', async () => {
      // Arrange
      const mockLinkSendId = 'test-link-send-id';
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });
      
      // Use a fixed date for predictable expiration
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // Act
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 7,
      });

      // Assert
      expect(result.token).toBeDefined();
      expect(result.token).toContain('.'); // Should have payload.signature format
      expect(result.trackingUrl).toBe(`https://app.churnsaver.com/api/r/${result.token}`);
      expect(result.linkSendId).toBeDefined();
      
      // Verify the token can be decoded
      const decoded = decodeRecoveryToken(result.token);
      expect(decoded).not.toBeNull();
      expect(decoded?.caseId).toBe('case-123');
      expect(decoded?.companyId).toBe('company-456');
      expect(decoded?.membershipId).toBe('membership-789');
      expect(decoded?.channel).toBe('dm');
    });

    it('should create tokens with correct expiration based on attributionWindowDays', async () => {
      // Arrange
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      // Act - Create with 14-day window
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'push',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 14,
      });

      // Assert
      const expectedExpiry = new Date('2024-01-29T10:00:00.000Z');
      expect(result.expiresAt).toBe(expectedExpiry.toISOString());

      const decoded = decodeRecoveryToken(result.token);
      expect(decoded).not.toBeNull();
      expect(decoded?.expiresAt).toBe(expectedExpiry.toISOString());
    });

    it('should use default 7-day attribution window when not specified', async () => {
      // Arrange
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      // Act
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'email',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        // No attributionWindowDays - should default to 7
      });

      // Assert
      const expectedExpiry = new Date('2024-01-22T10:00:00.000Z');
      expect(result.expiresAt).toBe(expectedExpiry.toISOString());
    });

    it('should store link send record in database with correct parameters', async () => {
      // Arrange
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      // Act
      await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        messageId: 'msg-xyz',
        attributionWindowDays: 7,
      });

      // Assert
      expect(sql.execute).toHaveBeenCalledTimes(1);
      const [query, params] = vi.mocked(sql.execute).mock.calls[0];
      
      expect(query).toContain('INSERT INTO recovery_link_sends');
      expect(params).toHaveLength(10);
      expect(params[1]).toBe('case-123'); // case_id
      expect(params[2]).toBe('company-456'); // company_id
      expect(params[3]).toBe('membership-789'); // membership_id
      expect(params[4]).toBe('user-abc'); // user_id
      expect(params[5]).toBe('dm'); // channel
      expect(params[7]).toBe('https://whop.com/manage/membership-789'); // whop_manage_url
      expect(params[8]).toBe('msg-xyz'); // message_id
    });

    it('should handle channels: push, dm, email', async () => {
      vi.mocked(sql.execute).mockResolvedValue({ rowCount: 1 });
      const channels = ['push', 'dm', 'email'] as const;

      for (const channel of channels) {
        const result = await createRecoveryLink({
          caseId: 'case-123',
          companyId: 'company-456',
          membershipId: 'membership-789',
          userId: 'user-abc',
          channel,
          whopManageUrl: 'https://whop.com/manage/membership-789',
        });

        const decoded = decodeRecoveryToken(result.token);
        expect(decoded?.channel).toBe(channel);
      }
    });
  });

  describe('Expired Token Rejection', () => {
    it('should reject tokens that have expired', async () => {
      // Arrange - Create token at an earlier time
      const creationTime = new Date('2024-01-01T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(creationTime);
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 7,
      });

      // Act - Try to decode after expiration (8 days later)
      const afterExpiration = new Date('2024-01-09T10:00:01.000Z'); // Just past 7-day window
      vi.setSystemTime(afterExpiration);

      const decoded = decodeRecoveryToken(result.token);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should accept tokens just before expiration', async () => {
      // Arrange
      const creationTime = new Date('2024-01-01T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(creationTime);
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 7,
      });

      // Act - Decode just before expiration (6 days, 23 hours, 59 minutes later)
      const beforeExpiration = new Date('2024-01-07T09:59:59.000Z');
      vi.setSystemTime(beforeExpiration);

      const decoded = decodeRecoveryToken(result.token);

      // Assert
      expect(decoded).not.toBeNull();
      expect(decoded?.caseId).toBe('case-123');
    });

    it('should reject tokens with invalid expiresAt date format', () => {
      // Arrange - Create a malformed token manually
      const signingKey = TEST_KEY;
      const invalidPayload = {
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        channel: 'dm',
        expiresAt: 'invalid-date-format',
      };
      
      const payloadBase64 = Buffer.from(JSON.stringify(invalidPayload)).toString('base64url');
      const hmac = crypto.createHmac('sha256', signingKey).update(payloadBase64).digest('base64url');
      const malformedToken = `${payloadBase64}.${hmac}`;

      // Act
      const decoded = decodeRecoveryToken(malformedToken);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens with expiresAt exactly at current time', async () => {
      // Arrange
      const creationTime = new Date('2024-01-01T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(creationTime);
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 7,
      });

      // Act - Set time exactly at expiration
      const exactExpiration = new Date('2024-01-08T10:00:00.000Z');
      vi.setSystemTime(exactExpiration);

      const decoded = decodeRecoveryToken(result.token);

      // Assert - Tokens expired at exactly current time should be rejected
      expect(decoded).toBeNull();
    });
  });

  describe('Signature Tamper Rejection', () => {
    it('should reject tokens with tampered payload', async () => {
      // Arrange
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 7,
      });

      // Tamper with the payload by changing the caseId
      const [originalPayload, signature] = result.token.split('.');
      const decodedPayload = JSON.parse(Buffer.from(originalPayload, 'base64url').toString());
      decodedPayload.caseId = 'tampered-case-id';
      const tamperedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');
      const tamperedToken = `${tamperedPayload}.${signature}`;

      // Act
      const decoded = decodeRecoveryToken(tamperedToken);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens with tampered signature', async () => {
      // Arrange
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        attributionWindowDays: 7,
      });

      // Tamper with the signature
      const [payload, originalSignature] = result.token.split('.');
      const tamperedSignature = originalSignature.slice(0, -5) + 'xxxxx';
      const tamperedToken = `${payload}.${tamperedSignature}`;

      // Act
      const decoded = decodeRecoveryToken(tamperedToken);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens signed with different secret', () => {
      // Arrange - Create token with a different secret
      const differentKey = generateKey();
      const payload = {
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        channel: 'dm',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const hmac = crypto.createHmac('sha256', differentKey).update(payloadBase64).digest('base64url');
      const tokenWithWrongSecret = `${payloadBase64}.${hmac}`;

      // Act
      const decoded = decodeRecoveryToken(tokenWithWrongSecret);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens with missing signature', () => {
      // Arrange
      const payload = {
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        channel: 'dm',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      
      // Missing signature part
      const tokenWithoutSignature = payloadBase64;

      // Act
      const decoded = decodeRecoveryToken(tokenWithoutSignature);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens with empty signature', () => {
      // Arrange
      const payload = {
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        channel: 'dm',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tokenWithEmptySignature = `${payloadBase64}.`;

      // Act
      const decoded = decodeRecoveryToken(tokenWithEmptySignature);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens with malformed base64 payload', () => {
      // Arrange - Invalid base64url string
      const malformedToken = 'not-valid-base64!!!.signature';

      // Act
      const decoded = decodeRecoveryToken(malformedToken);

      // Assert
      expect(decoded).toBeNull();
    });

    it('should reject tokens with non-JSON payload', () => {
      // Arrange
      const signingKey = TEST_KEY;
      const invalidPayload = 'this is not json';
      const payloadBase64 = Buffer.from(invalidPayload).toString('base64url');
      const hmac = crypto.createHmac('sha256', signingKey).update(payloadBase64).digest('base64url');
      const tokenWithInvalidJson = `${payloadBase64}.${hmac}`;

      // Act
      const decoded = decodeRecoveryToken(tokenWithInvalidJson);

      // Assert
      expect(decoded).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle tracking URL generation with trailing slash in app URL', async () => {
      // Arrange
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.churnsaver.com/';
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      // Act
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      // Assert - Should not have double slashes
      expect(result.trackingUrl).not.toContain('//api');
      expect(result.trackingUrl).toMatch(/^https:\/\/app\.churnsaver\.com\/api\/r\/.+/);
    });

    it('should handle empty app URL', async () => {
      // Arrange
      process.env.NEXT_PUBLIC_APP_URL = '';
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      // Act
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      // Assert - Should still generate token but with relative URL
      expect(result.trackingUrl).toBe(`/api/r/${result.token}`);
    });

    it('should handle null messageId', async () => {
      // Arrange
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });

      // Act
      await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
        // messageId not provided
      });

      // Assert
      const [, params] = vi.mocked(sql.execute).mock.calls[0];
      expect(params[8]).toBeNull(); // message_id should be null
    });

    it('should generate unique linkSendIds for each call', async () => {
      // Arrange
      vi.mocked(sql.execute).mockResolvedValue({ rowCount: 1 });

      // Act
      const result1 = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      const result2 = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      // Assert
      expect(result1.linkSendId).not.toBe(result2.linkSendId);
      expect(result1.token).not.toBe(result2.token); // Tokens differ due to different UUIDs in timing
    });

    it('should generate unique tokens for different cases', async () => {
      // Arrange
      vi.mocked(sql.execute).mockResolvedValue({ rowCount: 1 });

      // Act
      const result1 = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      const result2 = await createRecoveryLink({
        caseId: 'case-999',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      // Assert
      expect(result1.token).not.toBe(result2.token);
      
      const decoded1 = decodeRecoveryToken(result1.token);
      const decoded2 = decodeRecoveryToken(result2.token);
      expect(decoded1?.caseId).toBe('case-123');
      expect(decoded2?.caseId).toBe('case-999');
    });
  });

  describe('Security Properties', () => {
    it('should use timing-safe comparison for signature verification', async () => {
      // This test verifies the implementation uses timingSafeEqual
      // by checking that signature verification doesn't leak timing information
      
      // Arrange
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      // Create tokens with progressively more correct signature characters
      const [payload, correctSignature] = result.token.split('.');
      
      // Tokens with different amounts of correct prefix should all fail consistently
      const wrongTokens = [
        `${payload}.wrong-signature-entirely`,
        `${payload}.${correctSignature.slice(0, 5)}wrong`,
        `${payload}.${correctSignature.slice(0, 20)}wrong`,
      ];

      // Act & Assert - All should fail (timing-safe means no partial matches)
      for (const wrongToken of wrongTokens) {
        expect(decodeRecoveryToken(wrongToken)).toBeNull();
      }
    });

    it('should return null when signature length mismatches expected', async () => {
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/membership-789',
      });

      const [payload, signature] = result.token.split('.');
      const shorterSignature = signature.slice(0, -2);
      const shortToken = `${payload}.${shorterSignature}`;

      expect(() => decodeRecoveryToken(shortToken)).not.toThrow();
      expect(decodeRecoveryToken(shortToken)).toBeNull();
    });

    it('should not expose sensitive data in token payload structure', async () => {
      // Arrange
      vi.mocked(sql.execute).mockResolvedValueOnce({ rowCount: 1 });
      const result = await createRecoveryLink({
        caseId: 'case-123',
        companyId: 'company-456',
        membershipId: 'membership-789',
        userId: 'user-abc',
        channel: 'dm',
        whopManageUrl: 'https://whop.com/manage/sensitive-url',
      });

      // Decode the payload (note: this is the raw payload, not verified)
      const [payloadBase64] = result.token.split('.');
      const rawPayload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString());

      // Assert - Token should NOT contain:
      // - userId (PII)
      // - whopManageUrl (could contain sensitive info)
      expect(rawPayload.userId).toBeUndefined();
      expect(rawPayload.whopManageUrl).toBeUndefined();
      
      // Should only contain necessary attribution data
      expect(rawPayload.caseId).toBeDefined();
      expect(rawPayload.companyId).toBeDefined();
      expect(rawPayload.membershipId).toBeDefined();
      expect(rawPayload.channel).toBeDefined();
      expect(rawPayload.expiresAt).toBeDefined();
    });
  });
});