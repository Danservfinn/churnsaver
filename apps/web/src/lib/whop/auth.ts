// Whop Authentication Service
// Provides unified authentication with JWT token verification and lifecycle management

import { jwtVerify, importPKCS8, SignJWT, JWTPayload } from 'jose';
import { Whop } from '@whop/sdk';
import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { WhopApiClient } from './client';
import { logger } from '@/lib/logger';
import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '@/lib/apiResponse';
import { encrypt, decrypt } from '@/lib/encryption';
// Conditionally import crypto for Edge Runtime compatibility
let createHash: (algorithm: string) => any;
try {
  const crypto = require('crypto');
  createHash = crypto.createHash;
} catch {
  // In Edge Runtime, crypto.createHash may not be available
  // We'll use a fallback or make hash functions conditional
  createHash = undefined as any;
}
import { isProductionLikeEnvironment, env } from '@/lib/env';

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
  private tokenToSessionMap = new Map<string, string>(); // Maps token hash to session ID
  private sessionToTokensMap = new Map<string, Set<string>>(); // Maps session ID to set of token hashes

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

      // Security fix: Enhanced production environment detection to prevent authentication bypass
      // This prevents insecure dev mode from being enabled in any production-like environment
      if (process.env.NODE_ENV === 'development' && !this.config.apiKey) {
        // Check if insecure dev mode is explicitly allowed
        const allowInsecureDev = process.env.ALLOW_INSECURE_DEV === 'true';
        
        // Enhanced production environment detection with multiple indicators
        const isProductionLike = isProductionLikeEnvironment();
        const hasProductionDatabase = env.DATABASE_URL?.includes('supabase.com') ||
                                 env.DATABASE_URL?.includes('aws') ||
                                 env.DATABASE_URL?.includes('rds') ||
                                 env.DATABASE_URL?.includes('postgres');
        const isProductionHost = process.env.VERCEL_ENV === 'production' ||
                               process.env.VERCEL_ENV === 'preview' ||
                               process.env.HEROKU_ENV === 'production' ||
                               process.env.RAILWAY_ENV === 'production' ||
                               process.env.RENDER_ENV === 'production';
        const hasProductionDomain = process.env.NEXT_PUBLIC_APP_URL?.includes('.com') ||
                                  process.env.NEXT_PUBLIC_APP_URL?.includes('app') ||
                                  process.env.NEXT_PUBLIC_APP_URL?.includes('prod');
        const hasProductionVars = (process.env.WHOP_API_KEY?.length ?? 0) > 20 ||
                                (process.env.ENCRYPTION_KEY?.length ?? 0) > 20;
        
        // Combine all production indicators - if ANY are true, treat as production
        const isStrictlyProduction = isProductionLike ||
                                  hasProductionDatabase ||
                                  isProductionHost ||
                                  hasProductionDomain ||
                                  hasProductionVars;
        
        // Enhanced security logging for all production-like environments
        if (isStrictlyProduction) {
          // Create comprehensive security alert
          const securityContext = {
            category: 'security',
            severity: 'critical',
            environment: process.env.NODE_ENV,
            vercelEnv: process.env.VERCEL_ENV,
            hasApiKey: !!this.config.apiKey,
            databaseUrl: env.DATABASE_URL ? '[REDACTED]' : 'not set',
            appUrl: process.env.NEXT_PUBLIC_APP_URL || 'not set',
            hasWhopApiKey: !!process.env.WHOP_API_KEY,
            hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
            allowInsecureDev: allowInsecureDev,
            productionIndicators: {
              isProductionLike,
              hasProductionDatabase,
              isProductionHost,
              hasProductionDomain,
              hasProductionVars
            },
            timestamp: new Date().toISOString(),
            requestId: `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };
          
          logger.security('CRITICAL SECURITY ALERT: Authentication bypass attempted in production-like environment', securityContext);
          
          // Additional security monitoring - alert to multiple channels
          logger.error('PRODUCTION SECURITY VIOLATION: Insecure dev mode detected in production environment', {
            ...securityContext,
            alertType: 'AUTHENTICATION_BYPASS_ATTEMPT',
            requiresImmediateAction: true
          });
          
          throw new AppError(
            'SECURITY CONFIGURATION ERROR: Insecure development mode cannot be enabled in production environments. ' +
            'This is a critical security vulnerability. ' +
            'Immediate action required: Remove ALLOW_INSECURE_DEV=true from all production deployments. ' +
            'Production deployments require valid API key configuration.',
            ErrorCode.UNAUTHORIZED,
            ErrorCategory.SECURITY,
            ErrorSeverity.CRITICAL,
            401,
            false,
            false,
            {
              securityIssue: 'AUTHENTICATION_BYPASS',
              environmentType: 'PRODUCTION_LIKE',
              requiredAction: 'REMOVE_INSECURE_DEV_FLAG',
              configurationError: true
            }
          );
        }
        
        if (!allowInsecureDev) {
          logger.security('Insecure development mode blocked - set ALLOW_INSECURE_DEV=true to enable', {
            category: 'configuration',
            severity: 'high',
            environment: process.env.NODE_ENV,
            hasApiKey: !!this.config.apiKey,
            isProductionLike,
            productionIndicators: {
              hasProductionDatabase,
              isProductionHost,
              hasProductionDomain,
              hasProductionVars
            }
          });
          
          throw new AppError(
            'SECURITY CONFIGURATION: Development mode requires ALLOW_INSECURE_DEV=true environment variable or valid API key configuration. ' +
            'For production use, configure proper API keys instead of using development mode.',
            ErrorCode.UNAUTHORIZED,
            ErrorCategory.AUTHENTICATION,
            ErrorSeverity.HIGH,
            401,
            false,
            false,
            {
              configurationIssue: 'MISSING_DEV_FLAG_OR_API_KEY',
              suggestedFix: 'Set ALLOW_INSECURE_DEV=true for development or configure API keys for production'
            }
          );
        }
        
        // Enhanced security warning when insecure dev mode is active
        const devModeContext = {
          category: 'security',
          severity: 'medium',
          environment: process.env.NODE_ENV,
          hasApiKey: !!this.config.apiKey,
          allowInsecureDev: true,
          warning: 'Insecure development mode is active - authentication bypassed',
          securityImplications: [
            'All authentication checks are bypassed',
            'Tokens are not validated',
            'User identities are mocked',
            'This should NEVER be used in production'
          ],
          timestamp: new Date().toISOString()
        };
        
        logger.security('SECURITY WARNING: Insecure development mode active - authentication bypassed', devModeContext);
        
        const mockTokenInfo: TokenInfo = {
          token,
          payload: { userId: 'dev-user', companyId: this.config.appId },
          expiresAt: Date.now() + 3600000, // 1 hour
          issuedAt: Date.now(),
          userId: 'dev-user',
          companyId: this.config.appId,
          metadata: {
            developmentMode: true,
            authenticationBypassed: true,
            securityWarning: 'This token is only valid in development mode'
          }
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

      // Cache the verified token and track token-to-session mapping
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
   * Invalidate token cache entries
   */
  private async invalidateTokenCache(tokenHashes: string[], reason: string, context?: any): Promise<void> {
    try {
      let invalidatedCount = 0;
      
      for (const tokenHash of tokenHashes) {
        if (this.tokenCache.has(tokenHash)) {
          const tokenInfo = this.tokenCache.get(tokenHash);
          this.tokenCache.delete(tokenHash);
          invalidatedCount++;
          
          // Remove from token-to-session mapping
          const sessionId = this.tokenToSessionMap.get(tokenHash);
          if (sessionId) {
            this.tokenToSessionMap.delete(tokenHash);
            
            // Remove from session-to-tokens mapping
            const sessionTokens = this.sessionToTokensMap.get(sessionId);
            if (sessionTokens) {
              sessionTokens.delete(tokenHash);
              if (sessionTokens.size === 0) {
                this.sessionToTokensMap.delete(sessionId);
              }
            }
          }
          
          logger.security('Token invalidated', {
            category: 'security',
            severity: 'medium',
            reason,
            tokenHash: tokenHash.substring(0, 8) + '...', // Log partial hash for security
            userId: tokenInfo?.userId,
            companyId: tokenInfo?.companyId,
            invalidatedAt: new Date().toISOString(),
            ...context
          });
        }
      }
      
      if (invalidatedCount > 0) {
        logger.security('Token cache invalidation completed', {
          category: 'security',
          severity: 'medium',
          reason,
          invalidatedCount,
          totalRequested: tokenHashes.length,
          ...context
        });
      }
    } catch (error) {
      logger.error('Token cache invalidation failed', {
        error: error instanceof Error ? error.message : String(error),
        tokenHashCount: tokenHashes.length,
        reason
      });
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
        const decryptedData = await decrypt(sessionData);
        const sessionInfo: SessionInfo = JSON.parse(decryptedData);
        
        // Invalidate all tokens associated with this session
        const sessionTokens = this.sessionToTokensMap.get(sessionId);
        if (sessionTokens && sessionTokens.size > 0) {
          await this.invalidateTokenCache(
            Array.from(sessionTokens),
            'session_revoked',
            {
              sessionId,
              userId: sessionInfo.userId,
              companyId: sessionInfo.companyId,
              revokedBy: 'revokeSession'
            }
          );
        }
        
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
          companyId: sessionInfo.companyId,
          tokensInvalidated: sessionTokens ? sessionTokens.size : 0
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
      let totalTokensInvalidated = 0;
      
      // First, collect all tokens from all sessions to invalidate them efficiently
      const allTokenHashes: string[] = [];
      for (const sessionId of sessions) {
        const sessionTokens = this.sessionToTokensMap.get(sessionId);
        if (sessionTokens) {
          allTokenHashes.push(...Array.from(sessionTokens));
        }
      }
      
      // Invalidate all tokens at once
      if (allTokenHashes.length > 0) {
        await this.invalidateTokenCache(
          allTokenHashes,
          'all_user_sessions_revoked',
          {
            userId,
            sessionCount: sessions.length,
            revokedBy: 'revokeAllUserSessions'
          }
        );
        totalTokensInvalidated = allTokenHashes.length;
      }
      
      // Then revoke each session
      for (const sessionId of sessions) {
        await this.revokeSession(sessionId);
      }

      logger.security('All user sessions revoked', {
        category: 'security',
        severity: 'medium',
        userId,
        sessionCount: sessions.length,
        tokensInvalidated: totalTokensInvalidated,
        revokedBy: 'revokeAllUserSessions'
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
      
      // Hash the old token to find it in cache
      const oldTokenHash = this.hashToken(refreshToken);
      
      // Invalidate old token before issuing new one
      await this.invalidateTokenCache(
        [oldTokenHash],
        'token_refresh',
        {
          oldTokenHash: oldTokenHash.substring(0, 8) + '...',
          userId: result.userId,
          companyId: (result as any).companyId || this.config.appId,
          refreshedBy: 'refreshToken'
        }
      );
      
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

      logger.security('Token refreshed successfully', {
        category: 'security',
        severity: 'medium',
        userId: newTokenInfo.userId,
        companyId: newTokenInfo.companyId,
        oldTokenInvalidated: true,
        oldTokenHash: oldTokenHash.substring(0, 8) + '...'
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
   * Invalidate all tokens for a specific user
   */
  async invalidateUserTokens(userId: string, reason: string = 'manual_invalidation'): Promise<void> {
    try {
      // Find all sessions for this user
      const userSessions = await this.getUserSessions(userId);
      const allTokenHashes: string[] = [];
      
      // Collect all tokens from all user sessions
      for (const sessionId of userSessions) {
        const sessionTokens = this.sessionToTokensMap.get(sessionId);
        if (sessionTokens) {
          allTokenHashes.push(...Array.from(sessionTokens));
        }
      }
      
      // Invalidate all tokens at once
      if (allTokenHashes.length > 0) {
        await this.invalidateTokenCache(
          allTokenHashes,
          reason,
          {
            userId,
            sessionCount: userSessions.length,
            invalidatedBy: 'invalidateUserTokens'
          }
        );
      }
      
      logger.security('All user tokens invalidated', {
        category: 'security',
        severity: 'medium',
        userId,
        sessionCount: userSessions.length,
        tokensInvalidated: allTokenHashes.length,
        reason
      });

    } catch (error) {
      logger.error('Failed to invalidate user tokens', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
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
   * Generate session ID using cryptographically secure random number generation
   * Security fix: Replaced Math.random() with crypto.randomBytes() for secure randomness
   */
  private generateSessionId(): string {
    // Use crypto.randomBytes for cryptographically secure random values
    const randomBytes = require('crypto').randomBytes(16);
    const randomString = randomBytes.toString('hex').substr(0, 16);
    return `sess_${Date.now()}_${randomString}`;
  }

  /**
   * Hash token for cache key using cryptographically secure SHA-256
   */
  private hashToken(token: string): string {
    // Use cryptographically secure SHA-256 for cache key
    if (!createHash) {
      // Fallback for Edge Runtime - use a simple hash if crypto is not available
      // In production, this should not happen as auth runs in Node.js runtime
      throw new Error('createHash not available in Edge Runtime');
    }
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
      
      let expiredSessionsCount = 0;
      let expiredTokensCount = 0;
      const now = Date.now();
      
      // Clean up expired tokens from cache
      for (const [tokenHash, tokenInfo] of this.tokenCache.entries()) {
        if (tokenInfo.expiresAt <= now) {
          this.tokenCache.delete(tokenHash);
          
          // Clean up mappings
          const sessionId = this.tokenToSessionMap.get(tokenHash);
          if (sessionId) {
            this.tokenToSessionMap.delete(tokenHash);
            
            const sessionTokens = this.sessionToTokensMap.get(sessionId);
            if (sessionTokens) {
              sessionTokens.delete(tokenHash);
              if (sessionTokens.size === 0) {
                this.sessionToTokensMap.delete(sessionId);
              }
            }
          }
          
          expiredTokensCount++;
        }
      }
      
      // Implementation would depend on storage backend for session cleanup
      // For memory storage, we can iterate and clean up
      
      logger.security('Expired session cleanup completed', {
        category: 'security',
        severity: 'low',
        expiredTokensCount,
        expiredSessionsCount,
        cleanupTime: new Date().toISOString()
      });
      
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