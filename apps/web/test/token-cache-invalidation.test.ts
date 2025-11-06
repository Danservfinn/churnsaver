// Token Cache Invalidation Test
// Tests the security improvements for token cache invalidation

// Set up test environment
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Token Cache Invalidation', () => {
  let authService: WhopAuthService;
  let tokenStorage: MemoryTokenStorage;

  beforeEach(() => {
    tokenStorage = new MemoryTokenStorage();
    authService = new WhopAuthService(
      {
        appId: 'test-app',
        apiKey: 'test-key',
        environment: 'test',
        debugMode: false
      },
      tokenStorage,
      3600
    );
  });

  afterEach(() => {
    // Clean up after each test
    tokenStorage.clear();
  });

  describe('Token-to-Session Mapping', () => {
    it('should track which tokens belong to which sessions', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-456';
      
      // Create a session
      const sessionInfo = await authService.createSession(userId, 'test-company', 3600);
      
      // Verify a token with session context
      const mockToken = 'mock.jwt.token';
      const tokenInfo = await authService.verifyToken(mockToken, { sessionId });
      
      expect(tokenInfo).toBeDefined();
      expect(tokenInfo?.userId).toBe(userId);
      
      // Check that token is tracked in session
      const privateAuth = authService as any;
      const tokenHash = privateAuth.hashToken(mockToken);
      expect(privateAuth.tokenToSessionMap.has(tokenHash)).toBe(true);
      expect(privateAuth.tokenToSessionMap.get(tokenHash)).toBe(sessionId);
      expect(privateAuth.sessionToTokensMap.has(sessionId)).toBe(true);
      expect(privateAuth.sessionToTokensMap.get(sessionId)?.has(tokenHash)).toBe(true);
    });
  });

  describe('Session Revocation', () => {
    it('should invalidate all tokens when a session is revoked', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-456';
      
      // Create a session and verify multiple tokens
      await authService.createSession(userId, 'test-company', 3600);
      const token1 = await authService.verifyToken('token1', { sessionId });
      const token2 = await authService.verifyToken('token2', { sessionId });
      
      const privateAuth = authService as any;
      expect(privateAuth.tokenCache.size).toBe(2);
      
      // Revoke the session
      await authService.revokeSession(sessionId);
      
      // All tokens should be invalidated
      expect(privateAuth.tokenCache.size).toBe(0);
      expect(privateAuth.tokenToSessionMap.size).toBe(0);
      expect(privateAuth.sessionToTokensMap.size).toBe(0);
    });
  });

  describe('User Session Revocation', () => {
    it('should invalidate all tokens when all user sessions are revoked', async () => {
      const userId = 'test-user-123';
      
      // Create multiple sessions for the user
      const session1 = await authService.createSession(userId, 'test-company', 3600);
      const session2 = await authService.createSession(userId, 'test-company', 3600);
      
      // Verify tokens for both sessions
      await authService.verifyToken('token1', { sessionId: session1.sessionId });
      await authService.verifyToken('token2', { sessionId: session2.sessionId });
      
      const privateAuth = authService as any;
      expect(privateAuth.tokenCache.size).toBe(2);
      
      // Revoke all user sessions
      await authService.revokeAllUserSessions(userId);
      
      // All tokens should be invalidated
      expect(privateAuth.tokenCache.size).toBe(0);
      expect(privateAuth.tokenToSessionMap.size).toBe(0);
      expect(privateAuth.sessionToTokensMap.size).toBe(0);
    });
  });

  describe('Token Refresh', () => {
    it('should invalidate old token when refreshing', async () => {
      const userId = 'test-user-123';
      const sessionId = 'test-session-456';
      const oldToken = 'old.jwt.token';
      
      // Create a session and verify old token
      await authService.createSession(userId, 'test-company', 3600);
      await authService.verifyToken(oldToken, { sessionId });
      
      const privateAuth = authService as any;
      expect(privateAuth.tokenCache.size).toBe(1);
      
      // Refresh token
      const newTokenInfo = await authService.refreshToken(oldToken);
      
      // Old token should be invalidated
      expect(privateAuth.tokenCache.size).toBe(0);
      expect(privateAuth.tokenToSessionMap.size).toBe(0);
      expect(privateAuth.sessionToTokensMap.size).toBe(0);
      
      expect(newTokenInfo).toBeDefined();
      expect(newTokenInfo.userId).toBe(userId);
    });
  });

  describe('Direct Token Invalidation', () => {
    it('should invalidate tokens for a specific user', async () => {
      const userId = 'test-user-123';
      
      // Create multiple sessions and tokens
      const session1 = await authService.createSession(userId, 'test-company', 3600);
      const session2 = await authService.createSession(userId, 'test-company', 3600);
      
      await authService.verifyToken('token1', { sessionId: session1.sessionId });
      await authService.verifyToken('token2', { sessionId: session2.sessionId });
      
      const privateAuth = authService as any;
      expect(privateAuth.tokenCache.size).toBe(2);
      
      // Invalidate user tokens directly
      await (authService as any).invalidateUserTokens(userId, 'security_violation');
      
      // All tokens should be invalidated
      expect(privateAuth.tokenCache.size).toBe(0);
      expect(privateAuth.tokenToSessionMap.size).toBe(0);
      expect(privateAuth.sessionToTokensMap.size).toBe(0);
    });
  });

  describe('Cleanup Expired Tokens', () => {
    it('should clean up expired tokens', async () => {
      const privateAuth = authService as any;
      
      // Add an expired token directly to cache for testing
      const expiredTokenHash = 'expired.token.hash';
      const expiredTokenInfo = {
        token: 'expired.token',
        payload: { userId: 'test-user' },
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        issuedAt: Date.now() - 3600000,
        userId: 'test-user',
        companyId: 'test-company'
      };
      
      privateAuth.tokenCache.set(expiredTokenHash, expiredTokenInfo);
      privateAuth.tokenToSessionMap.set(expiredTokenHash, 'test-session');
      privateAuth.sessionToTokensMap.set('test-session', new Set([expiredTokenHash]));
      
      expect(privateAuth.tokenCache.size).toBe(1);
      
      // Run cleanup
      await authService.cleanupExpiredSessions();
      
      // Expired token should be removed
      expect(privateAuth.tokenCache.size).toBe(0);
      expect(privateAuth.tokenToSessionMap.size).toBe(0);
      expect(privateAuth.sessionToTokensMap.size).toBe(0);
    });
  });
});