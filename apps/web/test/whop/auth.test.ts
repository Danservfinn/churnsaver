// Whop Authentication Service Tests
// Comprehensive tests for authentication flows and token lifecycle management

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WhopAuthService, TokenStorage, SessionInfo } from '@/lib/whop/auth';
import { TokenUtils } from '@/lib/whop/tokenUtils';
import { whopConfig } from '@/lib/whop/sdkConfig';
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';
import { encrypt, decrypt } from '@/lib/encryption';

// Mock dependencies
jest.mock('@/lib/whop/sdkConfig');
jest.mock('@/lib/whop/client');
jest.mock('@/lib/encryption');
jest.mock('@whop/sdk');

const mockWhopConfig = whopConfig as jest.Mocked<typeof whopConfig>;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockDecrypt = decrypt as jest.MockedFunction<typeof decrypt>;

describe('WhopAuthService', () => {
  let authService: WhopAuthService;
  let mockStorage: jest.Mocked<TokenStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock storage
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn()
    } as any;

    // Mock config
    mockWhopConfig.get.mockReturnValue({
      appId: 'test-app-id',
      apiKey: 'test-api-key',
      webhookSecret: 'test-webhook-secret',
      apiBaseUrl: 'https://api.whop.com/api/v5/app',
      requestTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      enableMetrics: true,
      enableLogging: true,
      enableRetry: true,
      environment: 'test',
      debugMode: false
    });

    // Mock encryption
    mockEncrypt.mockImplementation((data: string) => `encrypted_${data}`);
    mockDecrypt.mockImplementation((data: string) => data.replace('encrypted_', ''));

    authService = new WhopAuthService(undefined, mockStorage, 3600);
  });

  describe('Token Verification', () => {
    it('should verify valid token successfully', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJjb21wYW55SWQiOiJ0ZXN0LWNvbXBhbnkifQ.test-signature';
      
      // Mock successful verification
      const mockWhopSdk = {
        verifyUserToken: jest.fn().mockResolvedValue({
          userId: 'test-user',
          companyId: 'test-company'
        })
      };
      
      // Create service with mocked SDK
      authService = new WhopAuthService(undefined, mockStorage, 3600);
      
      const result = await authService.verifyToken(validToken);
      
      expect(result.token).toBe(validToken);
      expect(result.userId).toBe('test-user');
      expect(result.companyId).toBe('test-company');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.token.format';
      
      await expect(authService.verifyToken(invalidToken))
        .rejects
        .toThrow(AppError);
    });

    it('should handle development mode without API key', async () => {
      // Set development environment
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const devConfig = {
        appId: 'dev-app-id',
        apiKey: undefined, // No API key in development
        environment: 'development' as const,
        debugMode: true
      };
      
      mockWhopConfig.get.mockReturnValue(devConfig as any);
      
      const devAuthService = new WhopAuthService(devConfig as any, mockStorage, 3600);
      
      const result = await devAuthService.verifyToken('any-token');
      
      expect(result.userId).toBe('dev-user');
      expect(result.companyId).toBe('dev-app-id');
      
      // Restore environment
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should cache verified tokens', async () => {
      const token = 'test.jwt.token';
      
      // Mock successful verification
      const mockWhopSdk = {
        verifyUserToken: jest.fn().mockResolvedValue({
          userId: 'cached-user',
          companyId: 'cached-company'
        })
      };
      
      authService = new WhopAuthService(undefined, mockStorage, 3600);
      
      // First call
      await authService.verifyToken(token);
      // Second call should use cache
      await authService.verifyToken(token);
      
      // SDK should only be called once due to caching
      expect(mockWhopSdk.verifyUserToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authentication', () => {
    it('should authenticate request with valid token', async () => {
      const request = {
        headers: {
          get: jest.fn()
            .mockReturnValueOnce('Bearer valid-token')
            .mockReturnValueOnce(null)
        }
      };

      // Mock successful token verification
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: 'valid-token',
        payload: { userId: 'user123', companyId: 'company456' },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: 'user123',
        companyId: 'company456'
      } as any);

      const result = await authService.authenticate(request);

      expect(result.isAuthenticated).toBe(true);
      expect(result.userId).toBe('user123');
      expect(result.companyId).toBe('company456');
    });

    it('should handle missing token', async () => {
      const request = {
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      };

      const result = await authService.authenticate(request);

      expect(result.isAuthenticated).toBe(false);
      expect(result.userId).toBeUndefined();
      expect(result.companyId).toBe('test-app-id');
    });

    it('should validate session when required', async () => {
      const request = {
        headers: {
          get: jest.fn().mockReturnValue('Bearer valid-token')
        }
      };

      // Mock successful token verification
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: 'valid-token',
        payload: { userId: 'user123' },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: 'user123'
      } as any);

      // Mock successful session validation
      const mockSession: SessionInfo = {
        sessionId: 'sess_123',
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        expiresAt: Date.now() + 3600000,
        isActive: true,
        userId: 'user123'
      };

      jest.spyOn(authService as any, 'validateSession').mockResolvedValue(mockSession);

      const result = await authService.authenticate(request, { validateSession: true });

      expect(result.isAuthenticated).toBe(true);
      expect(result.sessionInfo).toEqual(mockSession);
    });

    it('should reject when session is invalid', async () => {
      const request = {
        headers: {
          get: jest.fn().mockReturnValue('Bearer valid-token')
        }
      };

      // Mock successful token verification
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: 'valid-token',
        payload: { userId: 'user123' },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: 'user123'
      } as any);

      // Mock failed session validation
      jest.spyOn(authService as any, 'validateSession').mockResolvedValue(undefined);

      await expect(authService.authenticate(request, { validateSession: true }))
        .rejects
        .toThrow('Session expired or invalid');
    });

    it('should check permissions when required', async () => {
      const request = {
        headers: {
          get: jest.fn().mockReturnValue('Bearer valid-token')
        }
      };

      // Mock successful token verification with limited permissions
      jest.spyOn(authService, 'verifyToken').mockResolvedValue({
        token: 'valid-token',
        payload: { userId: 'user123', permissions: ['read'] },
        expiresAt: Date.now() + 3600000,
        issuedAt: Date.now(),
        userId: 'user123',
        permissions: ['read']
      } as any);

      await expect(authService.authenticate(request, { 
        checkPermissions: ['admin'] 
      }))
        .rejects
        .toThrow('Insufficient permissions');
    });
  });

  describe('Session Management', () => {
    it('should create session successfully', async () => {
      const userId = 'user123';
      const companyId = 'company456';

      const session = await authService.createSession(userId, companyId, 1800);

      expect(session.userId).toBe(userId);
      expect(session.companyId).toBe(companyId);
      expect(session.isActive).toBe(true);
      expect(session.expiresAt).toBeGreaterThan(Date.now()));
      expect(mockStorage.set).toHaveBeenCalledWith(
        expect.stringContaining('session:'),
        expect.any(String),
        1800
      );
    });

    it('should validate active session', async () => {
      const sessionId = 'sess_123';
      const userId = 'user123';
      
      const mockSession: SessionInfo = {
        sessionId,
        createdAt: Date.now() - 1000,
        lastAccessedAt: Date.now() - 500,
        expiresAt: Date.now() + 3600000,
        isActive: true,
        userId
      };

      mockStorage.get.mockResolvedValue('encrypted_' + JSON.stringify(mockSession));

      const result = await authService.validateSession(userId, sessionId);

      expect(result).toBeDefined();
      expect(result!.sessionId).toBe(sessionId);
      expect(result!.isActive).toBe(true);
      expect(result!.lastAccessedAt).toBeGreaterThan(mockSession.lastAccessedAt);
    });

    it('should reject expired session', async () => {
      const sessionId = 'sess_expired';
      const userId = 'user123';
      
      const mockSession: SessionInfo = {
        sessionId,
        createdAt: Date.now() - 7200000, // 2 hours ago
        lastAccessedAt: Date.now() - 3600000, // 1 hour ago
        expiresAt: Date.now() - 1800000, // 30 minutes ago (expired)
        isActive: true,
        userId
      };

      mockStorage.get.mockResolvedValue('encrypted_' + JSON.stringify(mockSession));

      const result = await authService.validateSession(userId, sessionId);

      expect(result).toBeUndefined();
      expect(mockStorage.delete).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('should revoke session successfully', async () => {
      const sessionId = 'sess_revoke';
      const userId = 'user123';
      
      const mockSession: SessionInfo = {
        sessionId,
        createdAt: Date.now() - 1000,
        lastAccessedAt: Date.now() - 500,
        expiresAt: Date.now() + 3600000,
        isActive: true,
        userId
      };

      mockStorage.get.mockResolvedValue('encrypted_' + JSON.stringify(mockSession));

      await authService.revokeSession(sessionId);

      expect(mockStorage.delete).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('should revoke all user sessions', async () => {
      const userId = 'user123';
      const sessions = ['sess_1', 'sess_2', 'sess_3'];
      
      // Mock user sessions
      mockStorage.get.mockResolvedValue('encrypted_' + JSON.stringify(sessions));
      
      // Mock individual session revocation
      jest.spyOn(authService, 'revokeSession').mockResolvedValue();

      await authService.revokeAllUserSessions(userId);

      expect(authService.revokeSession).toHaveBeenCalledTimes(3);
      sessions.forEach(sessionId => {
        expect(authService.revokeSession).toHaveBeenCalledWith(sessionId);
      });
    });
  });

  describe('Token Refresh', () => {
    it('should refresh valid token', async () => {
      const refreshToken = 'refresh-token';
      
      // Mock successful refresh
      const mockWhopSdk = {
        verifyUserToken: jest.fn().mockResolvedValue({
          userId: 'refreshed-user',
          companyId: 'refreshed-company'
        })
      };
      
      authService = new WhopAuthService(undefined, mockStorage, 3600);
      
      const result = await authService.refreshToken(refreshToken);

      expect(result.userId).toBe('refreshed-user');
      expect(result.companyId).toBe('refreshed-company');
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should handle refresh failure', async () => {
      const refreshToken = 'invalid-refresh';
      
      // Mock failed refresh
      const mockWhopSdk = {
        verifyUserToken: jest.fn().mockRejectedValue(new Error('Invalid refresh token'))
      };
      
      authService = new WhopAuthService(undefined, mockStorage, 3600);
      
      await expect(authService.refreshToken(refreshToken))
        .rejects
        .toThrow(AppError);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      const userId = 'user123';
      
      // Mock storage error
      mockStorage.set.mockRejectedValue(new Error('Storage error'));

      await expect(authService.createSession(userId))
        .rejects
        .toThrow(AppError);
    });

    it('should handle encryption errors gracefully', async () => {
      const sessionId = 'sess_encrypt_error';
      
      // Mock encryption error
      mockEncrypt.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      await expect(authService.revokeSession(sessionId))
        .rejects
        .toThrow(AppError);
    });
  });
});

describe('TokenUtils', () => {
  let tokenUtils: TokenUtils;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockWhopConfig.get.mockReturnValue({
      appId: 'test-app-id',
      environment: 'test',
      debugMode: false
    });

    tokenUtils = new TokenUtils();
  });

  describe('Token Validation', () => {
    it('should validate valid JWT token', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJjb21wYW55SWQiOiJ0ZXN0LWNvbXBhbnkifQ.test-signature';
      
      // Mock successful verification
      jest.spyOn(tokenUtils as any, 'verifyToken').mockResolvedValue({
        valid: true,
        tokenInfo: {
          token: validToken,
          payload: { userId: 'test-user', companyId: 'test-company' },
          expiresAt: Date.now() + 3600000,
          issuedAt: Date.now(),
          userId: 'test-user',
          companyId: 'test-company'
        },
        errors: [],
        warnings: [],
        metadata: {}
      });

      const result = await tokenUtils.validateToken(validToken);

      expect(result.valid).toBe(true);
      expect(result.tokenInfo?.userId).toBe('test-user');
      expect(result.errors).toHaveLength(0);
    });

    it('should reject malformed token', async () => {
      const malformedToken = 'not.a.jwt';

      const result = await tokenUtils.validateToken(malformedToken);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token must have 3 parts (header.payload.signature)');
    });

    it('should check expiration when required', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MjM0NTY3OTl9.test-signature';
      
      // Mock current time
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => 1623456800000); // After expiration

      const result = await tokenUtils.validateToken(expiredToken, {
        checkExpiration: true
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token has expired');

      // Restore
      Date.now = originalDateNow;
    });

    it('should validate required claims', async () => {
      const tokenWithoutClaims = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0In0.test-signature';
      
      const result = await tokenUtils.validateToken(tokenWithoutClaims, {
        requiredClaims: ['sub', 'aud']
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Required claim missing: sub');
      expect(result.errors).toContain('Required claim missing: aud');
    });
  });

  describe('Token Introspection', () => {
    it('should introspect valid token', async () => {
      const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJjb21wYW55SWQiOiJ0ZXN0LWNvbXBhbnkiLCJwZXJtaXNzaW9ucyI6WyJyZWFkIiwid3JpdGUiXX0.test-signature';
      
      // Mock successful validation
      jest.spyOn(tokenUtils, 'validateToken').mockResolvedValue({
        valid: true,
        tokenInfo: {
          token: validToken,
          payload: { 
            userId: 'test-user', 
            companyId: 'test-company',
            permissions: ['read', 'write']
          },
          expiresAt: Date.now() + 3600000,
          issuedAt: Date.now(),
          userId: 'test-user',
          companyId: 'test-company',
          permissions: ['read', 'write']
        },
        errors: [],
        warnings: [],
        metadata: {}
      });

      const result = await tokenUtils.introspectToken(validToken);

      expect(result.active).toBe(true);
      expect(result.userId).toBe('test-user');
      expect(result.companyId).toBe('test-company');
      expect(result.permissions).toEqual(['read', 'write']);
    });

    it('should handle inactive token', async () => {
      const invalidToken = 'invalid.token.here';
      
      // Mock failed validation
      jest.spyOn(tokenUtils, 'validateToken').mockResolvedValue({
        valid: false,
        errors: ['Invalid token format'],
        warnings: [],
        metadata: {}
      });

      const result = await tokenUtils.introspectToken(invalidToken);

      expect(result.active).toBe(false);
      expect(result.errors).toBe('Invalid token format');
    });
  });

  describe('Token Analysis', () => {
    it('should analyze token structure and security', () => {
      const token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InRlc3Qta2V5In0.eyJ1c2VySWQiOiJ0ZXN0LXVzZXIiLCJjb21wYW55SWQiOiJ0ZXN0LWNvbXBhbnkifQ.signature';
      
      const result = tokenUtils.analyzeToken(token);

      expect(result.structure.header.alg).toBe('RS256');
      expect(result.structure.header.kid).toBe('test-key');
      expect(result.structure.payload.userId).toBe('test-user');
      expect(result.security.algorithm).toBe('RS256');
      expect(result.security.isEncrypted).toBe(false);
      expect(result.metadata.tokenLength).toBe(token.length);
      expect(result.metadata.isExpired).toBe(false);
    });

    it('should detect suspicious patterns', () => {
      const weakToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiJ0ZXN0In0.signature';
      
      const result = tokenUtils.analyzeToken(weakToken);

      expect(result.security.suspiciousPatterns).toContain('Weak algorithm: none');
    });

    it('should calculate token age and expiry', () => {
      const now = Date.now();
      const iat = Math.floor(now / 1000) - 3600; // 1 hour ago
      const exp = Math.floor(now / 1000) + 3600; // 1 hour from now
      
      const token = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjIwLCJleHAiOjF9.signature`;
      
      // Mock decodeJwt to return our test values
      jest.doMock('jose', () => ({
        decodeJwt: () => ({ iat, exp })
      }));

      const result = tokenUtils.analyzeToken(token);

      expect(result.metadata.age).toBeGreaterThan(0);
      expect(result.metadata.timeToExpiry).toBeGreaterThan(0);
      expect(result.metadata.isExpired).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    it('should extract user ID from token', () => {
      const token = 'eyJ1c2VySWQiOiJ0ZXN0LXVzZXIifQ.signature';
      
      jest.doMock('jose', () => ({
        decodeJwt: () => ({ userId: 'test-user' })
      }));

      const userId = tokenUtils.extractUserId(token);

      expect(userId).toBe('test-user');
    });

    it('should extract permissions from token', () => {
      const token = 'eyJwZXJtaXNzaW9ucyI6WyJyZWFkIiwid3JpdGUiXX0.signature';
      
      jest.doMock('jose', () => ({
        decodeJwt: () => ({ permissions: ['read', 'write'] })
      }));

      const permissions = tokenUtils.extractPermissions(token);

      expect(permissions).toEqual(['read', 'write']);
    });

    it('should check token expiration', () => {
      const expiredToken = 'eyJleHAiOjE2MjM0NTY3OTl9.signature';
      const validToken = 'eyJleHAiOjE5MjM0NTY3OTl9.signature';
      
      // Mock current time
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => 1623456800000);

      expect(tokenUtils.isTokenExpired(expiredToken)).toBe(true);
      expect(tokenUtils.isTokenExpired(validToken)).toBe(false);

      // Restore
      Date.now = originalDateNow;
    });

    it('should sanitize token for logging', () => {
      const token = 'header.payload.verylongsignaturethatshouldbetruncated';
      
      const sanitized = tokenUtils.sanitizeTokenForLogging(token);

      expect(sanitized).toBe('header.payload.verylo...ened');
    });

    it('should generate token fingerprint', () => {
      const token = 'eyJqdGkiOiJ0ZXN0LWp0aSIsInN1YiI6InRlc3QtdXNlciIsImlhdCI6MTYyMzQ1Njc5OSwiZXhwIjoxNjIzNDYwMzk5fQ.signature';
      
      jest.doMock('jose', () => ({
        decodeJwt: () => ({ 
          jti: 'test-jti', 
          sub: 'test-user', 
          iat: 1623456799, 
          exp: 1623456799 
        })
      }));

      const fingerprint = tokenUtils.generateTokenFingerprint(token);

      expect(typeof fingerprint).toBe('string');
      expect(fingerprint.length).toBeGreaterThan(0);
    });
  });
});

describe('Integration Tests', () => {
  let authService: WhopAuthService;
  let mockStorage: jest.Mocked<TokenStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockStorage = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn()
    } as any;

    mockWhopConfig.get.mockReturnValue({
      appId: 'integration-test-app',
      apiKey: 'integration-test-key',
      environment: 'test',
      debugMode: true
    });

    authService = new WhopAuthService(undefined, mockStorage, 3600);
  });

  it('should handle complete authentication flow', async () => {
    const userId = 'integration-user';
    const companyId = 'integration-company';
    const token = 'integration.jwt.token';

    // Step 1: Create session
    const session = await authService.createSession(userId, companyId);
    expect(session.userId).toBe(userId);

    // Step 2: Authenticate with token
    const request = {
      headers: {
        get: jest.fn().mockReturnValue(`Bearer ${token}`)
      }
    };

    // Mock successful token verification
    jest.spyOn(authService, 'verifyToken').mockResolvedValue({
      token,
      payload: { userId, companyId },
      expiresAt: Date.now() + 3600000,
      issuedAt: Date.now(),
      userId,
      companyId
    } as any);

    // Mock session validation
    jest.spyOn(authService as any, 'validateSession').mockResolvedValue(session);

    const authContext = await authService.authenticate(request, { validateSession: true });

    expect(authContext.isAuthenticated).toBe(true);
    expect(authContext.userId).toBe(userId);
    expect(authContext.companyId).toBe(companyId);
    expect(authContext.sessionInfo).toEqual(session);

    // Step 3: Revoke session
    await authService.revokeSession(session.sessionId);
    expect(mockStorage.delete).toHaveBeenCalledWith(`session:${session.sessionId}`);
  });

  it('should handle authentication failure flow', async () => {
    const request = {
      headers: {
        get: jest.fn().mockReturnValue('Bearer invalid.token')
      }
    };

    // Mock failed token verification
    jest.spyOn(authService, 'verifyToken').mockRejectedValue(
      new AppError('Invalid token', ErrorCode.INVALID_TOKEN, ErrorCategory.AUTHENTICATION)
    );

    await expect(authService.authenticate(request))
      .rejects
      .toThrow('Invalid token');
  });
});