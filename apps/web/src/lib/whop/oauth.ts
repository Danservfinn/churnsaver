// Whop OAuth Service
// Provides OAuth 2.0 authorization code flow with proper state and nonce handling

import { createHash, randomBytes } from 'crypto';
import { Whop } from '@whop/sdk';
import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { WhopApiClient } from './client';
import { logger } from '@/lib/logger';
import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '@/lib/apiResponse';
import { encrypt, decrypt } from '@/lib/encryption';

/**
 * OAuth configuration interface
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string[];
  responseType?: 'code';
  grantType?: 'authorization_code' | 'refresh_token';
  stateLength?: number;
  nonceLength?: number;
}

/**
 * OAuth token response interface
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * OAuth authorization request parameters
 */
export interface OAuthAuthRequest {
  clientId: string;
  redirectUri: string;
  scope?: string[];
  state?: string;
  nonce?: string;
  responseType?: 'code';
}

/**
 * OAuth token exchange request
 */
export interface OAuthTokenExchangeRequest {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  grantType?: 'authorization_code';
  codeVerifier?: string; // PKCE
}

/**
 * OAuth refresh token request
 */
export interface OAuthRefreshRequest {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  grantType?: 'refresh_token';
  scope?: string[];
}

/**
 * OAuth session information
 */
export interface OAuthSession {
  sessionId: string;
  userId?: string;
  companyId?: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  scope?: string;
  createdAt: number;
  lastAccessedAt: number;
  isActive: boolean;
  metadata?: Record<string, any>;
}

/**
 * OAuth state information
 */
export interface OAuthState {
  state: string;
  nonce?: string;
  codeVerifier?: string; // PKCE
  codeChallenge?: string; // PKCE
  codeChallengeMethod?: string; // PKCE
  createdAt: number;
  expiresAt: number;
  redirectUri: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * OAuth storage interface
 */
export interface OAuthStorage {
  getState(state: string): Promise<OAuthState | null>;
  setState(state: string, data: OAuthState, ttl?: number): Promise<void>;
  deleteState(state: string): Promise<void>;
  getSession(sessionId: string): Promise<OAuthSession | null>;
  setSession(sessionId: string, data: OAuthSession, ttl?: number): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  clearExpired(): Promise<void>;
}

/**
 * In-memory OAuth storage implementation (for development/testing)
 */
class MemoryOAuthStorage implements OAuthStorage {
  private states = new Map<string, { data: OAuthState; expires?: number }>();
  private sessions = new Map<string, { data: OAuthSession; expires?: number }>();

  async getState(state: string): Promise<OAuthState | null> {
    const item = this.states.get(state);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.states.delete(state);
      return null;
    }
    
    return item.data;
  }

  async setState(state: string, data: OAuthState, ttl: number = 600): Promise<void> {
    const expires = Date.now() + (ttl * 1000);
    this.states.set(state, { data, expires });
  }

  async deleteState(state: string): Promise<void> {
    this.states.delete(state);
  }

  async getSession(sessionId: string): Promise<OAuthSession | null> {
    const item = this.sessions.get(sessionId);
    if (!item) return null;
    
    if (item.expires && Date.now() > item.expires) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    return item.data;
  }

  async setSession(sessionId: string, data: OAuthSession, ttl: number = 3600): Promise<void> {
    const expires = Date.now() + (ttl * 1000);
    this.sessions.set(sessionId, { data, expires });
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async clearExpired(): Promise<void> {
    const now = Date.now();
    
    for (const [key, item] of this.states.entries()) {
      if (item.expires && now > item.expires) {
        this.states.delete(key);
      }
    }
    
    for (const [key, item] of this.sessions.entries()) {
      if (item.expires && now > item.expires) {
        this.sessions.delete(key);
      }
    }
  }
}

/**
 * Whop OAuth Service
 * Provides OAuth 2.0 authorization code flow with PKCE support
 */
export class WhopOAuthService {
  private config: WhopSdkConfig;
  private sdk: Whop;
  private apiClient: WhopApiClient;
  private oauthConfig: OAuthConfig;
  private storage: OAuthStorage;

  constructor(
    oauthConfig: OAuthConfig,
    storage?: OAuthStorage,
    sdkConfig?: WhopSdkConfig
  ) {
    this.config = sdkConfig || whopConfig.get();
    this.oauthConfig = {
      responseType: 'code',
      grantType: 'authorization_code',
      stateLength: 32,
      nonceLength: 32,
      scope: ['read', 'write'],
      ...oauthConfig
    };

    this.sdk = new Whop({
      appID: this.config.appId,
      apiKey: this.config.apiKey,
      webhookKey: this.config.webhookSecret
        ? Buffer.from(this.config.webhookSecret, 'utf8').toString('base64')
        : undefined,
    });

    this.apiClient = new WhopApiClient(this.config);
    this.storage = storage || new MemoryOAuthStorage();

    if (this.config.debugMode) {
      logger.info('Whop OAuth Service initialized', {
        clientId: this.oauthConfig.clientId,
        redirectUri: this.oauthConfig.redirectUri,
        scope: this.oauthConfig.scope,
        environment: this.config.environment
      });
    }
  }

  /**
   * Generate cryptographically secure random string
   */
  private generateSecureRandom(length: number): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate SHA256 hash
   */
  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('base64url');
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { verifier: string; challenge: string; method: string } {
    const verifier = this.generateSecureRandom(64);
    const challenge = this.sha256(verifier);
    
    return {
      verifier,
      challenge,
      method: 'S256'
    };
  }

  /**
   * Build authorization URL with proper parameters
   */
  async buildAuthorizationUrl(options: {
    redirectUri?: string;
    scope?: string[];
    state?: string;
    nonce?: string;
    usePKCE?: boolean;
  } = {}): Promise<{ url: string; state: string; nonce?: string; codeVerifier?: string }> {
    const {
      redirectUri = this.oauthConfig.redirectUri,
      scope = this.oauthConfig.scope,
      usePKCE = true
    } = options;

    // Generate state parameter for CSRF protection
    const state = options.state || this.generateSecureRandom(this.oauthConfig.stateLength!);
    
    // Generate nonce for replay protection
    const nonce = options.nonce || this.generateSecureRandom(this.oauthConfig.nonceLength!);
    
    // Generate PKCE if enabled
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    let codeChallengeMethod: string | undefined;
    
    if (usePKCE) {
      const pkce = this.generatePKCE();
      codeVerifier = pkce.verifier;
      codeChallenge = pkce.challenge;
      codeChallengeMethod = pkce.method;
    }

    // Store state information
    const stateData: OAuthState = {
      state,
      nonce,
      codeVerifier,
      codeChallenge,
      codeChallengeMethod,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes
      redirectUri,
      metadata: {
        usePKCE,
        scope
      }
    };

    await this.storage.setState(state, stateData, 600); // 10 minutes TTL

    // Build authorization URL parameters
    const params = new URLSearchParams({
      response_type: this.oauthConfig.responseType!,
      client_id: this.oauthConfig.clientId,
      redirect_uri: redirectUri,
      scope: scope?.join(' ') || '',
      state
    });

    if (nonce) {
      params.append('nonce', nonce);
    }

    if (codeChallenge && codeChallengeMethod) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', codeChallengeMethod);
    }

    const baseUrl = this.config.apiBaseUrl.replace('/api/v5/app', '');
    const authUrl = `${baseUrl}/oauth/authorize?${params.toString()}`;

    logger.info('OAuth authorization URL generated', {
      state,
      redirectUri,
      scope: scope?.join(' '),
      usePKCE,
      hasNonce: !!nonce,
      url: authUrl.replace(/state=[^&]+/, 'state=REDACTED') // Log with redacted state
    });

    return {
      url: authUrl,
      state,
      nonce,
      codeVerifier
    };
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    options: {
      redirectUri?: string;
      codeVerifier?: string;
    } = {}
  ): Promise<OAuthTokenResponse> {
    const startTime = Date.now();

    try {
      // Verify state parameter
      const stateData = await this.storage.getState(state);
      if (!stateData) {
        throw new AppError(
          'Invalid or expired state parameter',
          ErrorCode.INVALID_TOKEN,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.HIGH,
          400
        );
      }

      // Verify redirect URI matches
      const redirectUri = options.redirectUri || stateData.redirectUri;
      if (redirectUri !== stateData.redirectUri) {
        throw new AppError(
          'Redirect URI mismatch',
          ErrorCode.INVALID_TOKEN,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.HIGH,
          400
        );
      }

      // Verify PKCE if used
      const codeVerifier = options.codeVerifier || stateData.codeVerifier;
      if (stateData.codeChallenge && !codeVerifier) {
        throw new AppError(
          'PKCE code verifier required',
          ErrorCode.INVALID_TOKEN,
          ErrorCategory.AUTHENTICATION,
          ErrorSeverity.HIGH,
          400
        );
      }

      if (codeVerifier && stateData.codeChallenge) {
        const computedChallenge = this.sha256(codeVerifier);
        if (computedChallenge !== stateData.codeChallenge) {
          throw new AppError(
            'PKCE code verifier mismatch',
            ErrorCode.INVALID_TOKEN,
            ErrorCategory.AUTHENTICATION,
            ErrorSeverity.HIGH,
            400
        );
        }
      }

      // Clean up state
      await this.storage.deleteState(state);

      // Exchange code for token
      const tokenRequest: OAuthTokenExchangeRequest = {
        clientId: this.oauthConfig.clientId,
        clientSecret: this.oauthConfig.clientSecret,
        code,
        redirectUri,
        grantType: 'authorization_code',
        codeVerifier
      };

      const tokenResponse = await this.performTokenExchange(tokenRequest);

      // Create session
      const sessionId = this.generateSecureRandom(32);
      const sessionData: OAuthSession = {
        sessionId,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenType: tokenResponse.token_type,
        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        scope: tokenResponse.scope,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        isActive: true,
        metadata: {
          state,
          nonce: stateData.nonce,
          grantType: 'authorization_code',
          scope: stateData.metadata?.scope
        }
      };

      await this.storage.setSession(sessionId, sessionData, tokenResponse.expires_in);

      logger.info('OAuth code exchange successful', {
        sessionId,
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        hasRefreshToken: !!tokenResponse.refresh_token,
        exchangeTimeMs: Date.now() - startTime
      });

      return tokenResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.security('OAuth code exchange failed', {
        category: 'authentication',
        severity: 'high',
        error: errorMessage,
        state: state.substring(0, 8) + '...', // Log partial state for debugging
        exchangeTimeMs: Date.now() - startTime
      });

      throw new AppError(
        'Token exchange failed',
        ErrorCode.INVALID_TOKEN,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        400,
        false,
        undefined,
        { originalError: errorMessage }
      );
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string, options: {
    scope?: string[];
  } = {}): Promise<OAuthTokenResponse> {
    const startTime = Date.now();

    try {
      const refreshRequest: OAuthRefreshRequest = {
        clientId: this.oauthConfig.clientId,
        clientSecret: this.oauthConfig.clientSecret,
        refreshToken,
        grantType: 'refresh_token',
        scope: options.scope
      };

      const tokenResponse = await this.performTokenRefresh(refreshRequest);

      logger.info('OAuth token refresh successful', {
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        hasRefreshToken: !!tokenResponse.refresh_token,
        refreshTimeMs: Date.now() - startTime
      });

      return tokenResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.security('OAuth token refresh failed', {
        category: 'authentication',
        severity: 'high',
        error: errorMessage,
        refreshTimeMs: Date.now() - startTime
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
   * Perform token exchange with Whop OAuth endpoint
   */
  private async performTokenExchange(request: OAuthTokenExchangeRequest): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: request.grantType!,
      client_id: request.clientId,
      client_secret: request.clientSecret,
      code: request.code,
      redirect_uri: request.redirectUri
    });

    if (request.codeVerifier) {
      params.append('code_verifier', request.codeVerifier);
    }

    const response = await fetch(`${this.config.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  /**
   * Perform token refresh with Whop OAuth endpoint
   */
  private async performTokenRefresh(request: OAuthRefreshRequest): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: request.grantType!,
      client_id: request.clientId,
      client_secret: request.clientSecret,
      refresh_token: request.refreshToken
    });

    if (request.scope) {
      params.append('scope', request.scope.join(' '));
    }

    const response = await fetch(`${this.config.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token refresh failed: ${response.status} ${errorText}`);
    }

    return await response.json() as OAuthTokenResponse;
  }

  /**
   * Validate OAuth session
   */
  async validateSession(sessionId: string): Promise<OAuthSession | null> {
    try {
      const session = await this.storage.getSession(sessionId);
      
      if (!session || !session.isActive) {
        return null;
      }

      // Check if session is expired
      if (Date.now() > session.expiresAt) {
        await this.storage.deleteSession(sessionId);
        return null;
      }

      // Update last accessed time
      session.lastAccessedAt = Date.now();
      await this.storage.setSession(sessionId, session, Math.ceil((session.expiresAt - Date.now()) / 1000));

      return session;

    } catch (error) {
      logger.error('OAuth session validation failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Revoke OAuth session
   */
  async revokeSession(sessionId: string): Promise<void> {
    try {
      const session = await this.storage.getSession(sessionId);
      
      if (session) {
        // Revoke token at Whop if possible
        if (session.accessToken) {
          try {
            await this.revokeToken(session.accessToken);
          } catch (error) {
            logger.warn('Failed to revoke token at Whop', {
              sessionId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        // Remove session from storage
        await this.storage.deleteSession(sessionId);

        logger.info('OAuth session revoked', {
          sessionId,
          userId: session.userId,
          companyId: session.companyId
        });
      }

    } catch (error) {
      logger.error('OAuth session revocation failed', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new AppError(
        'Session revocation failed',
        ErrorCode.INTERNAL_SERVER_ERROR,
        ErrorCategory.SYSTEM,
        ErrorSeverity.MEDIUM,
        500
      );
    }
  }

  /**
   * Revoke token at Whop
   */
  private async revokeToken(token: string): Promise<void> {
    const params = new URLSearchParams({
      token,
      client_id: this.oauthConfig.clientId,
      client_secret: this.oauthConfig.clientSecret
    });

    const response = await fetch(`${this.config.apiBaseUrl}/oauth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`Token revocation failed: ${response.status}`);
    }
  }

  /**
   * Clean up expired states and sessions
   */
  async cleanup(): Promise<void> {
    try {
      await this.storage.clearExpired();
      logger.debug('OAuth cleanup completed');
    } catch (error) {
      logger.error('OAuth cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Default OAuth service instance
 */
export const whopOAuthService = (() => {
  try {
    // Try to get OAuth configuration from environment
    const oauthConfig: OAuthConfig = {
      clientId: process.env.WHOP_OAUTH_CLIENT_ID || '',
      clientSecret: process.env.WHOP_OAUTH_CLIENT_SECRET || '',
      redirectUri: process.env.WHOP_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      scope: ['read', 'write']
    };

    if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
      logger.warn('OAuth service not properly configured - missing client credentials', {
        hasClientId: !!oauthConfig.clientId,
        hasClientSecret: !!oauthConfig.clientSecret
      });
      return null;
    }

    return new WhopOAuthService(oauthConfig);
  } catch (error) {
    logger.error('Failed to initialize OAuth service', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
})();

// Export types for external use
export type {
  OAuthConfig,
  OAuthTokenResponse,
  OAuthAuthRequest,
  OAuthTokenExchangeRequest,
  OAuthRefreshRequest,
  OAuthSession,
  OAuthState,
  OAuthStorage
};