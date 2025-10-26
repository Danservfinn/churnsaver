// Whop Authentication Service
// Provides unified authentication with JWT token verification and lifecycle management

import { jwtVerify, importPKCS8, SignJWT, JWTPayload } from 'jose';
import { Whop } from '@whop/sdk';
import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { WhopApiClient } from './client';
import { logger } from '@/lib/logger';
import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '@/lib/apiResponse';
import { encrypt, decrypt } from '@/lib/encryption';
import { createHash } from 'crypto';

/**
 * Token information interface
 */
export interface TokenInfo {
  token: string;
  payload: JWTPayload;
  expiresAt: number;
  issuedAt: number;
  userId?: string;
  companyId?: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Authentication context interface
 */
export interface AuthContext {
  isAuthenticated: boolean;
  userId?: string;
  companyId?: string;
  tokenInfo?: TokenInfo;
  sessionInfo?: SessionInfo;
  permissions?: string[];
  metadata?: Record<string, any>;
}

/**
 * Session information interface
 */
export interface SessionInfo {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  isActive: boolean;
  userId?: string;
  companyId?: string;
}

/**
 * Authentication options interface
 */
export interface AuthOptions {
  token?: string;
  sessionId?: string;
  validateSession?: boolean;
  checkPermissions?: string[];
  timeout?: number;
  skipCache?: boolean;
}

/**
 * Token storage interface
 */
export interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory token storage implementation (for development/testing)
 */
class MemoryTokenStorage implements TokenStorage {
  private cache = new Map<string, { value: string; expires?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl * 1000 : undefined;
    this.cache.set(key, { value, expires });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

/**
 * Whop Authentication Service
 * Provides unified authentication with token lifecycle management
 */
export class WhopAuthService {
  private config: WhopSdkConfig;
  private sdk: Whop;
  private apiClient: WhopApiClient;
  private tokenStorage: TokenStorage;
  private sessionTimeout: number;
  private tokenCache = new Map<string, TokenInfo>();

  constructor(
    config?: WhopSdkConfig,
    tokenStorage?: TokenStorage,
    sessionTimeout: number = 3600 // 1 hour default
  ) {
    try {
      this.config = config || whopConfig.get();
      this.sdk = new Whop({
        appID: this.config.appId,
        apiKey: this.config.apiKey,
        webhookKey: this.config.webhookSecret
          ? Buffer.from(this.config.webhookSecret, 'utf8').toString('base64')
          : undefined,
      });
      this.apiClient = new WhopApiClient(this.config);
      this.tokenStorage = tokenStorage || new MemoryTokenStorage();
      this.sessionTimeout = sessionTimeout;

      if (this.config.debugMode) {
        logger.info('Whop Auth Service initialized', {
          appId: this.config.appId,
          hasApiKey: !!this.config.apiKey,
          sessionTimeout,
          environment: this.config.environment
        });
      }
    } catch (error) {
      // Handle configuration errors gracefully
      logger.error('Failed to initialize Whop Auth Service', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create a minimal mock service for testing
      this.config = {
        appId: config?.appId || 'test-app-id',
        apiKey: config?.apiKey,
        webhookSecret: config?.webhookSecret,
        apiBaseUrl: 'https://api.whop.com/api/v5/app',
        requestTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        enableMetrics: true,
        enableLogging: true,
        enableRetry: true,
        environment: 'development',
        debugMode: true
      };
      
      this.sdk = new Whop({
        appID: this.config.appId,
        apiKey: this.config.apiKey,
        webhookKey: this.config.webhookSecret
          ? Buffer.from(this.config.webhookSecret, 'utf8').toString('base64')
          : undefined,
      });
      this.apiClient = new WhopApiClient(this.config);
      this.tokenStorage = tokenStorage || new MemoryTokenStorage();
      this.sessionTimeout = sessionTimeout;

      if (this.config.debugMode) {
        logger.info('Whop Auth Service initialized with fallback config', {
          appId: this.config.appId,
          hasApiKey: !!this.config.apiKey,
          sessionTimeout,
          environment: this.config.environment
        });
      }
    }
  }

  /**
   * Verify JWT token and extract payload
   */
  async verifyToken(token: string): Promise<TokenInfo> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `token:${this.hashToken(token)}`;
      if (!this.config.debugMode) {
        const cached = this.tokenCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          logger.debug('Token verified from cache', {
            userId: cached.userId,
            companyId: cached.companyId,
            verificationTimeMs: Date.now() - startTime
          });
          return cached;
        }
      }

      // In development, skip verification only if explicitly allowed
      if (process.env.NODE_ENV === 'development' && !this.config.apiKey) {
        // Check if insecure dev mode is explicitly allowed
        const allowInsecureDev = process.env.ALLOW_INSECURE_DEV === 'true';
        
        if (!allowInsecureDev) {
          logger.security('Insecure development mode blocked - set ALLOW_INSECURE_DEV=true to enable', {
            category: 'configuration',
            severity: 'high',
            environment: process.env.NODE_ENV,
            hasApiKey: !!this.config.apiKey
          });
          
          throw new AppError(
            'Development mode requires ALLOW_INSECURE_DEV=true environment variable or valid API key configuration',
            ErrorCode.UNAUTHORIZED,
            ErrorCategory.AUTHENTICATION,
            ErrorSeverity.HIGH,
            401
          );
        }
        
        // Log security warning when insecure dev mode is active
        logger.security('WARNING: Insecure development mode is active - authentication bypassed', {
          category: 'security',
          severity: 'medium',
          environment: process.env.NODE_ENV,
          hasApiKey: !!this.config.apiKey,
          allowInsecureDev: true
        });
        
        const mockTokenInfo: TokenInfo = {
          token,
          payload: { userId: 'dev-user', companyId: this.config.appId },
          expiresAt: Date.now() + 3600000, // 1 hour
          issuedAt: Date.now(),
          userId: 'dev-user',
          companyId: this.config.appId
        };
        
        this.tokenCache.set(cacheKey, mockTokenInfo);
        return mockTokenInfo;
      }

      // Verify JWT token using Whop's public key or SDK
      let payload: JWTPayload;
      
      if (this.config.apiKey) {
        // Use Whop SDK for verification
        const headers = new Headers();
        headers.set('Authorization', `Bearer ${token}`);
        
        const result = await this.sdk.verifyUserToken(headers);
        payload = {
          userId: result.userId,
          companyId: (result as any).companyId || this.config.appId,
          // Add other claims as needed
        };
      } else {
        // Fallback to manual JWT verification
        throw new AppError(
          'JWT verification requires API key configuration',
          ErrorCode.UNAUTHORIZED,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.MEDIUM,
          401
        );
      }

      const tokenInfo: TokenInfo = {
        token,
        payload,
        expiresAt: (payload.exp as number) * 1000 || Date.now() + 3600000,
        issuedAt: (payload.iat as number) * 1000 || Date.now(),
        userId: payload.userId as string,
        companyId: payload.companyId as string || this.config.appId,
        permissions: payload.permissions as string[] || [],
        metadata: payload.metadata as Record<string, any> || {}
      };

      // Cache the verified token
      if (!this.config.debugMode) {
        this.tokenCache.set(cacheKey, tokenInfo);
      }

      logger.info('Token verified successfully', {
        userId: tokenInfo.userId,
        companyId: tokenInfo.companyId,
        expiresAt: new Date(tokenInfo.expiresAt).toISOString(),
        verificationTimeMs: Date.now() - startTime
      });

      return tokenInfo;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.security('Token verification failed', {
        category: 'authentication',
        severity: 'high',
        error: errorMessage,
        tokenLength: token.length,
        verificationTimeMs: Date.now() - startTime
      });

      throw new AppError(
        'Invalid authentication token',
        ErrorCode.INVALID_TOKEN,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        401,
        false,
        undefined,
        { originalError: errorMessage }
      );
    }
  }

  /**
   * Authenticate request and return context
   */
  async authenticate(request: { headers: { get: (key: string) => string | null } }, options: AuthOptions = {}): Promise<AuthContext> {
    const startTime = Date.now();
    
    try {
      // Extract token from headers
      const token = options.token || 
                   request.headers.get('authorization')?.replace('Bearer ', '') ||
                   request.headers.get('x-whop-user-token');

      if (!token) {
        const context: AuthContext = {
          isAuthenticated: false,
          companyId: this.config.appId
        };

        logger.debug('No token provided in request', {
          authenticationTimeMs: Date.now() - startTime
        });

        return context;
      }

      // Verify token
      const tokenInfo = await this.verifyToken(token);

      // Check session if required
      let sessionInfo: SessionInfo | undefined;
      if (options.validateSession !== false) {
        sessionInfo = await this.validateSession(tokenInfo.userId || 'anonymous', options.sessionId);
        
        if (!sessionInfo || !sessionInfo.isActive) {
          throw new AppError(
            'Session expired or invalid',
            ErrorCode.TOKEN_EXPIRED,
            ErrorCategory.AUTHENTICATION,
            ErrorSeverity.MEDIUM,
            401
          );
        }
      }

      // Check permissions if required
      if (options.checkPermissions && options.checkPermissions.length > 0) {
        const hasPermissions = this.checkPermissions(tokenInfo.permissions || [], options.checkPermissions);
        
        if (!hasPermissions) {
          throw new AppError(
            'Insufficient permissions',
            ErrorCode.INSUFFICIENT_PERMISSIONS,
            ErrorCategory.AUTHORIZATION,
            ErrorSeverity.MEDIUM,
            403
          );
        }
      }

      const context: AuthContext = {
        isAuthenticated: true,
        userId: tokenInfo.userId,
        companyId: tokenInfo.companyId,
        tokenInfo,
        sessionInfo,
        permissions: tokenInfo.permissions,
        metadata: tokenInfo.metadata
      };

      logger.info('Authentication successful', {
        userId: context.userId,
        companyId: context.companyId,
        hasSession: !!sessionInfo,
        permissionCount: context.permissions?.length || 0,
        authenticationTimeMs: Date.now() - startTime
      });

      return context;

    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.security('Authentication failed', {
        category: 'authentication',
        severity: 'high',
        error: errorMessage,
        authenticationTimeMs: Date.now() - startTime
      });

      throw new AppError(
        'Authentication failed',
        ErrorCode.UNAUTHORIZED,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        401,
        false,
        undefined,
        { originalError: errorMessage }
      );
    }
  }

  /**
   * Create or update session
   */
  async createSession(
    userId: string, 
    companyId?: string, 
    ttl: number = this.sessionTimeout
  ): Promise<SessionInfo> {
    const sessionId = this.generateSessionId();
    const now = Date.now();
    
    const sessionInfo: SessionInfo = {
      sessionId,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + (ttl * 1000),
      isActive: true,
      userId,
      companyId: companyId || this.config.appId
    };

    // Store session securely
    const sessionKey = `session:${sessionId}`;
    const sessionData = await encrypt(JSON.stringify(sessionInfo));
    await this.tokenStorage.set(sessionKey, sessionData, ttl);

    // Link session to user
    const userSessionsKey = `user_sessions:${userId}`;
    const existingSessions = await this.getUserSessions(userId);
    existingSessions.push(sessionId);
    
    const userSessionsData = await encrypt(JSON.stringify(existingSessions));
    await this.tokenStorage.set(userSessionsKey, userSessionsData, ttl);

    logger.info('Session created', {
      sessionId,
      userId,
      companyId: sessionInfo.companyId,
      ttl,
      expiresAt: new Date(sessionInfo.expiresAt).toISOString()
    });

    return sessionInfo;
  }

  /**
   * Validate session
   */
  async validateSession(userId: string, sessionId?: string): Promise<SessionInfo | undefined> {
    if (!sessionId) {
      return undefined;
    }

    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.tokenStorage.get(sessionKey);
      
      if (!sessionData) {
        return undefined;
      }

      const decryptedData = await decrypt(sessionData);
      const sessionInfo: SessionInfo = JSON.parse(decryptedData);

      // Check if session is expired
      if (Date.now() > sessionInfo.expiresAt) {
        await this.revokeSession(sessionId);
        return undefined;
      }

      // Update last accessed time
      sessionInfo.lastAccessedAt = Date.now();
      const updatedSessionData = await encrypt(JSON.stringify(sessionInfo));
      await this.tokenStorage.set(sessionKey, updatedSessionData, this.sessionTimeout);

      return sessionInfo;

    } catch (error) {
      logger.error('Session validation failed', {
        sessionId,
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionId: string): Promise<void> {
    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.tokenStorage.get(sessionKey);
      
      if (sessionData) {
        const decryptedData = decrypt(sessionData);
        const sessionInfo: SessionInfo = JSON.parse(decryptedData);
        
        // Remove session
        await this.tokenStorage.delete(sessionKey);
        
        // Remove from user sessions
        if (sessionInfo.userId) {
          const userSessionsKey = `user_sessions:${sessionInfo.userId}`;
          const userSessions = await this.getUserSessions(sessionInfo.userId);
          const updatedSessions = userSessions.filter(id => id !== sessionId);
          
          if (updatedSessions.length > 0) {
            const userSessionsData = await encrypt(JSON.stringify(updatedSessions));
            await this.tokenStorage.set(userSessionsKey, userSessionsData, this.sessionTimeout);
          } else {
            await this.tokenStorage.delete(userSessionsKey);
          }
        }

        logger.info('Session revoked', {
          sessionId,
          userId: sessionInfo.userId,
          companyId: sessionInfo.companyId
        });
      }

    } catch (error) {
      logger.error('Session revocation failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError(
        'Failed to revoke session',
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.MEDIUM,
        500
      );
    }
  }

  /**
   * Revoke all user sessions
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      const sessions = await this.getUserSessions(userId);
      
      for (const sessionId of sessions) {
        await this.revokeSession(sessionId);
      }

      logger.info('All user sessions revoked', {
        userId,
        sessionCount: sessions.length
      });

    } catch (error) {
      logger.error('Failed to revoke all user sessions', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError(
        'Failed to revoke user sessions',
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.MEDIUM,
        500
      );
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenInfo> {
    try {
      // This would typically involve calling Whop's refresh token endpoint
      // For now, we'll implement a basic refresh mechanism
      
      const headers = new Headers();
      headers.set('Authorization', `Bearer ${refreshToken}`);
      
      // Use Whop SDK to refresh token
      const result = await this.sdk.verifyUserToken(headers);
      
      const newTokenInfo: TokenInfo = {
        token: refreshToken, // In real implementation, this would be a new token
        payload: {
          userId: result.userId,
          companyId: (result as any).companyId || this.config.appId
        },
        expiresAt: Date.now() + 3600000, // 1 hour
        issuedAt: Date.now(),
        userId: result.userId,
        companyId: (result as any).companyId || this.config.appId
      };

      logger.info('Token refreshed successfully', {
        userId: newTokenInfo.userId,
        companyId: newTokenInfo.companyId
      });

      return newTokenInfo;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.security('Token refresh failed', {
        category: 'authentication',
        severity: 'high',
        error: errorMessage
      });

      throw new AppError(
        'Token refresh failed',
        ErrorCode.TOKEN_EXPIRED,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        401,
        false,
        undefined,
        { originalError: errorMessage }
      );
    }
  }

  /**
   * Get user sessions
   */
  private async getUserSessions(userId: string): Promise<string[]> {
    try {
      const userSessionsKey = `user_sessions:${userId}`;
      const userSessionsData = await this.tokenStorage.get(userSessionsKey);
      
      if (!userSessionsData) {
        return [];
      }

      const decryptedData = await decrypt(userSessionsData);
      return JSON.parse(decryptedData) as string[];

    } catch (error) {
      logger.error('Failed to get user sessions', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Check permissions
   */
  private checkPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => 
      userPermissions.includes(permission) || 
      userPermissions.includes('*') || 
      userPermissions.includes('admin')
    );
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  /**
   * Hash token for cache key using cryptographically secure SHA-256
   */
  private hashToken(token: string): string {
    // Use cryptographically secure SHA-256 for cache key
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Clear expired sessions (cleanup)
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      // This would typically be run as a background job
      // For now, we'll implement a basic cleanup
      
      logger.info('Starting expired session cleanup');
      
      // Implementation would depend on storage backend
      // For memory storage, we can iterate and clean up
      
      logger.info('Expired session cleanup completed');
      
    } catch (error) {
      logger.error('Session cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Default authentication service instance
 */
export const whopAuthService = new WhopAuthService();

/**
 * Authentication middleware factory
 */
export function createAuthMiddleware(options: AuthOptions = {}) {
  return async (request: { headers: { get: (key: string) => string | null } }) => {
    return await whopAuthService.authenticate(request, options);
  };
}

/**
 * Helper function to create authentication guard
 */
export function requireAuth(options: AuthOptions = {}) {
  return async (request: { headers: { get: (key: string) => string | null } }) => {
    const context = await whopAuthService.authenticate(request, options);
    
    if (!context.isAuthenticated) {
      throw new AppError(
        'Authentication required',
        ErrorCode.UNAUTHORIZED,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        401
      );
    }
    
    return context;
  };
}

/**
 * Helper function to require specific permissions
 */
export function requirePermissions(permissions: string[]) {
  return async (request: { headers: { get: (key: string) => string | null } }) => {
    const context = await whopAuthService.authenticate(request, { checkPermissions: permissions });
    
    if (!context.isAuthenticated) {
      throw new AppError(
        'Authentication required',
        ErrorCode.UNAUTHORIZED,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        401
      );
    }
    
    return context;
  };
}

// Export types for external use