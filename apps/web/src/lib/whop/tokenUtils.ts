// Whop Token Utilities
// Provides token introspection and validation utilities

import { jwtVerify, importPKCS8, decodeJwt } from 'jose';
import { whopAuthService, type TokenInfo } from './auth';
import { whopConfig, type WhopSdkConfig } from './sdkConfig';
import { logger } from '@/lib/logger';
import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '@/lib/apiResponse';
import { createHash } from 'crypto';

/**
 * Token validation result interface
 */
export interface TokenValidationResult {
  valid: boolean;
  tokenInfo?: TokenInfo;
  errors: string[];
  warnings: string[];
  metadata: {
    issuedAt?: number;
    expiresAt?: number;
    notBefore?: number;
    audience?: string;
    issuer?: string;
    subject?: string;
    jwtId?: string;
    tokenType?: string;
    algorithm?: string;
  };
}

/**
 * Token introspection result interface
 */
export interface TokenIntrospectionResult {
  active: boolean;
  scope?: string;
  clientId?: string;
  username?: string;
  tokenType?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  jti?: string;
  permissions?: string[];
  companyId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  error?: string;
}

/**
 * Token analysis result interface
 */
export interface TokenAnalysisResult {
  structure: {
    header: Record<string, any>;
    payload: Record<string, any>;
    signature: string;
  };
  validation: TokenValidationResult;
  security: {
    algorithm: string;
    keyId?: string;
    isEncrypted: boolean;
    hasCriticalClaims: boolean;
    suspiciousPatterns: string[];
  };
  metadata: {
    tokenLength: number;
    estimatedEntropy: number;
    timeToExpiry: number;
    isExpired: boolean;
    isExpiredSoon: boolean;
    age: number;
  };
}

/**
 * Token validation options
 */
export interface TokenValidationOptions {
  checkExpiration?: boolean;
  checkIssuer?: boolean;
  checkAudience?: boolean;
  allowedIssuers?: string[];
  allowedAudiences?: string[];
  requiredClaims?: string[];
  clockSkewTolerance?: number; // seconds
  minimumRemainingTime?: number; // seconds
}

/**
 * Default validation options
 */
const DEFAULT_VALIDATION_OPTIONS: TokenValidationOptions = {
  checkExpiration: true,
  checkIssuer: false,
  checkAudience: false,
  allowedIssuers: [],
  allowedAudiences: [],
  requiredClaims: [],
  clockSkewTolerance: 30, // 30 seconds
  minimumRemainingTime: 60 // 1 minute
};

/**
 * Token introspection and validation utilities
 */
export class TokenUtils {
  private config: WhopSdkConfig;

  constructor(config?: WhopSdkConfig) {
    try {
      this.config = config || whopConfig.get();
    } catch (error) {
      // Handle configuration errors gracefully
      logger.error('Failed to initialize TokenUtils', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create a minimal mock configuration for testing
      this.config = config || {
        appId: 'test-app-id',
        apiBaseUrl: 'https://api.whop.com/api/v1',
        requestTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        enableMetrics: true,
        enableLogging: true,
        enableRetry: true,
        environment: 'development',
        debugMode: true
      };
    }
  }

  /**
   * Validate JWT token with comprehensive checks
   */
  async validateToken(token: string, options: TokenValidationOptions = {}): Promise<TokenValidationResult> {
    const opts = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: any = {};

    try {
      // Basic format validation
      if (!token || typeof token !== 'string') {
        errors.push('Token is required and must be a string');
        return { valid: false, errors, warnings, metadata };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        errors.push('Token must have 3 parts (header.payload.signature)');
        return { valid: false, errors, warnings, metadata };
      }

      // Decode without verification first for basic checks
      let decoded;
      try {
        decoded = decodeJwt(token);
      } catch (decodeError) {
        errors.push(`Token decode failed: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`);
        return { valid: false, errors, warnings, metadata };
      }

      // Extract metadata
      metadata.issuedAt = decoded.iat ? decoded.iat * 1000 : undefined;
      metadata.expiresAt = decoded.exp ? decoded.exp * 1000 : undefined;
      metadata.notBefore = decoded.nbf ? decoded.nbf * 1000 : undefined;
      metadata.audience = decoded.aud as string;
      metadata.issuer = decoded.iss as string;
      metadata.subject = decoded.sub as string;
      metadata.jwtId = decoded.jti as string;
      metadata.tokenType = decoded.typ as string;
      metadata.algorithm = decoded.alg as string;

      // Time-based validations
      const now = Date.now();
      const clockSkewMs = opts.clockSkewTolerance! * 1000;

      if (opts.checkExpiration && metadata.expiresAt) {
        if (now + clockSkewMs >= metadata.expiresAt) {
          errors.push('Token has expired');
        } else if (opts.minimumRemainingTime) {
          const timeRemaining = metadata.expiresAt - now;
          if (timeRemaining < opts.minimumRemainingTime * 1000) {
            warnings.push('Token expires soon');
          }
        }
      }

      if (metadata.notBefore && now - clockSkewMs < metadata.notBefore) {
        errors.push('Token is not yet valid (not before)');
      }

      // Issuer validation
      if (opts.checkIssuer && opts.allowedIssuers && opts.allowedIssuers.length > 0) {
        if (!metadata.issuer || !opts.allowedIssuers.includes(metadata.issuer)) {
          errors.push(`Invalid issuer: ${metadata.issuer}`);
        }
      }

      // Audience validation
      if (opts.checkAudience && opts.allowedAudiences && opts.allowedAudiences.length > 0) {
        const audiences = Array.isArray(metadata.audience) ? metadata.audience : [metadata.audience];
        const hasValidAudience = audiences.some((aud: any) => opts.allowedAudiences!.includes(aud));
        
        if (!hasValidAudience) {
          errors.push(`Invalid audience: ${JSON.stringify(metadata.audience)}`);
        }
      }

      // Required claims validation
      if (opts.requiredClaims && opts.requiredClaims.length > 0) {
        for (const claim of opts.requiredClaims) {
          if (!(claim in decoded)) {
            errors.push(`Required claim missing: ${claim}`);
          }
        }
      }

      // Cryptographic verification
      let tokenInfo: TokenInfo | undefined;
      try {
        tokenInfo = await whopAuthService.verifyToken(token);
        
        // Additional checks from verified token
        if (tokenInfo) {
          metadata.userId = tokenInfo.userId;
          metadata.companyId = tokenInfo.companyId;
        }
        
      } catch (verifyError) {
        errors.push(`Token verification failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
      }

      const isValid = errors.length === 0;
      
      if (isValid && this.config.debugMode) {
        logger.debug('Token validation successful', {
          userId: metadata.userId,
          companyId: metadata.companyId,
          expiresAt: metadata.expiresAt ? new Date(metadata.expiresAt).toISOString() : undefined,
          warnings: warnings.length
        });
      }

      return {
        valid: isValid,
        tokenInfo: isValid ? tokenInfo : undefined,
        errors,
        warnings,
        metadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Validation error: ${errorMessage}`);
      
      logger.error('Token validation failed unexpectedly', {
        error: errorMessage,
        tokenLength: token.length
      });

      return { valid: false, errors, warnings, metadata };
    }
  }

  /**
   * Introspect token for detailed information
   */
  async introspectToken(token: string): Promise<TokenIntrospectionResult> {
    try {
      const validation = await this.validateToken(token);
      
      if (!validation.valid || !validation.tokenInfo) {
        return {
          active: false,
          error: validation.errors.join(', ')
        };
      }

      const tokenInfo = validation.tokenInfo;
      const payload = tokenInfo.payload;

      return {
        active: true,
        scope: payload.scope as string,
        clientId: payload.client_id as string,
        username: payload.username as string || tokenInfo.userId,
        tokenType: payload.typ as string || 'Bearer',
        exp: Math.floor(tokenInfo.expiresAt / 1000),
        iat: Math.floor(tokenInfo.issuedAt / 1000),
        sub: payload.sub as string,
        aud: payload.aud as string,
        iss: payload.iss as string,
        jti: payload.jti as string,
        permissions: tokenInfo.permissions,
        companyId: tokenInfo.companyId,
        userId: tokenInfo.userId,
        metadata: tokenInfo.metadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Token introspection failed', {
        error: errorMessage,
        tokenLength: token.length
      });

      return {
        active: false,
        error: errorMessage
      };
    }
  }

  /**
   * Analyze token for security and structure information
   */
  analyzeToken(token: string): TokenAnalysisResult {
    try {
      const parts = token.split('.');
      
      if (parts.length !== 3) {
        throw new Error('Invalid JWT structure');
      }

      // Decode parts
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const signature = parts[2];

      // Security analysis
      const algorithm = header.alg || 'unknown';
      const keyId = header.kid;
      const isEncrypted = header.enc !== undefined;
      const hasCriticalClaims = payload.crit !== undefined;
      
      // Check for suspicious patterns
      const suspiciousPatterns: string[] = [];
      
      // Check for weak algorithms
      if (['none', 'HS256', 'HS384', 'HS512'].includes(algorithm)) {
        suspiciousPatterns.push(`Weak algorithm: ${algorithm}`);
      }

      // Check for None algorithm
      if (algorithm === 'none') {
        suspiciousPatterns.push('None algorithm - no signature verification');
      }

      // Check for very short tokens (potential weakness)
      if (token.length < 100) {
        suspiciousPatterns.push('Token appears unusually short');
      }

      // Check for very long tokens (potential DoS)
      if (token.length > 4096) {
        suspiciousPatterns.push('Token appears unusually long');
      }

      // Calculate entropy (basic)
      const uniqueChars = new Set(token).size;
      const estimatedEntropy = uniqueChars / token.length;

      // Time analysis
      const now = Date.now();
      const exp = payload.exp ? payload.exp * 1000 : undefined;
      const iat = payload.iat ? payload.iat * 1000 : now;
      
      const timeToExpiry = exp ? exp - now : Infinity;
      const isExpired = exp ? now >= exp : false;
      const isExpiredSoon = exp ? (exp - now) < (5 * 60 * 1000) : false; // 5 minutes
      const age = now - iat;

      return {
        structure: {
          header,
          payload,
          signature
        },
        validation: {
          valid: false, // Would need full validation to determine
          errors: [],
          warnings: suspiciousPatterns,
          metadata: {
            issuedAt: iat,
            expiresAt: exp,
            notBefore: payload.nbf ? payload.nbf * 1000 : undefined,
            audience: payload.aud,
            issuer: payload.iss,
            subject: payload.sub,
            jwtId: payload.jti,
            tokenType: payload.typ,
            algorithm
          }
        },
        security: {
          algorithm,
          keyId,
          isEncrypted,
          hasCriticalClaims,
          suspiciousPatterns
        },
        metadata: {
          tokenLength: token.length,
          estimatedEntropy,
          timeToExpiry,
          isExpired,
          isExpiredSoon,
          age
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('Token analysis failed', {
        error: errorMessage,
        tokenLength: token.length
      });

      throw new AppError(
        `Token analysis failed: ${errorMessage}`,
        ErrorCode.INVALID_TOKEN,
        ErrorCategory.AUTHENTICATION,
        ErrorSeverity.MEDIUM,
        400
      );
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string, clockSkewTolerance: number = 30): boolean {
    try {
      const decoded = decodeJwt(token);
      const now = Date.now();
      const exp = decoded.exp ? decoded.exp * 1000 : undefined;
      
      if (!exp) {
        return false; // No expiration claim
      }

      return now + (clockSkewTolerance * 1000) >= exp;
      
    } catch (error) {
      return true; // Assume expired if can't decode
    }
  }

  /**
   * Check if token expires soon
   */
  isTokenExpiringSoon(token: string, thresholdMinutes: number = 5): boolean {
    try {
      const decoded = decodeJwt(token);
      const now = Date.now();
      const exp = decoded.exp ? decoded.exp * 1000 : undefined;
      
      if (!exp) {
        return false; // No expiration claim
      }

      const thresholdMs = thresholdMinutes * 60 * 1000;
      return (exp - now) <= thresholdMs;
      
    } catch (error) {
      return true; // Assume expiring soon if can't decode
    }
  }

  /**
   * Get token age in milliseconds
   */
  getTokenAge(token: string): number {
    try {
      const decoded = decodeJwt(token);
      const now = Date.now();
      const iat = decoded.iat ? decoded.iat * 1000 : now;
      
      return now - iat;
      
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get time until token expires in milliseconds
   */
  getTimeUntilExpiry(token: string): number {
    try {
      const decoded = decodeJwt(token);
      const now = Date.now();
      const exp = decoded.exp ? decoded.exp * 1000 : 0;
      
      return Math.max(0, exp - now);
      
    } catch (error) {
      return 0;
    }
  }

  /**
   * Extract user ID from token
   */
  extractUserId(token: string): string | undefined {
    try {
      const decoded = decodeJwt(token);
      return decoded.userId as string || decoded.sub as string;
      
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Extract company ID from token
   */
  extractCompanyId(token: string): string | undefined {
    try {
      const decoded = decodeJwt(token);
      return decoded.companyId as string || decoded.aud as string;
      
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Extract permissions from token
   */
  extractPermissions(token: string): string[] {
    try {
      const decoded = decodeJwt(token);
      const permissions = decoded.permissions;
      
      // Handle different permission formats
      if (typeof permissions === 'string') {
        return permissions.split(',').map((p: string) => p.trim());
      }
      
      return Array.isArray(permissions) ? permissions : [];
      
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if token has specific permission
   */
  hasPermission(token: string, permission: string): boolean {
    const permissions = this.extractPermissions(token);
    return permissions.includes(permission) || 
           permissions.includes('*') || 
           permissions.includes('admin');
  }

  /**
   * Check if token has any of the specified permissions
   */
  hasAnyPermission(token: string, permissions: string[]): boolean {
    const tokenPermissions = this.extractPermissions(token);
    
    // Check for admin wildcard
    if (tokenPermissions.includes('*') || tokenPermissions.includes('admin')) {
      return true;
    }

    // Check for any required permission
    return permissions.some(permission => tokenPermissions.includes(permission));
  }

  /**
   * Sanitize token for logging (remove sensitive parts)
   */
  sanitizeTokenForLogging(token: string): string {
    if (!token || typeof token !== 'string') {
      return '[invalid]';
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return '[invalid_format]';
    }

    // Show first 8 and last 4 characters of signature
    const signature = parts[2];
    const sanitizedSignature = signature.length > 12 
      ? `${signature.substring(0, 8)}...${signature.substring(signature.length - 4)}`
      : signature;

    return `${parts[0]}.${parts[1]}.${sanitizedSignature}`;
  }

  /**
   * Generate token fingerprint for caching/identification using cryptographically secure SHA-256
   */
  generateTokenFingerprint(token: string): string {
    try {
      const decoded = decodeJwt(token);
      const keyData = {
        jti: decoded.jti,
        sub: decoded.sub,
        iat: decoded.iat,
        exp: decoded.exp
      };
      
      // Use cryptographically secure SHA-256 for fingerprint
      const keyString = JSON.stringify(keyData);
      return createHash('sha256').update(keyString).digest('hex');
      
    } catch (error) {
      return 'invalid';
    }
  }
}

/**
 * Default token utilities instance
 */
export const tokenUtils = new TokenUtils();

/**
 * Convenience functions for common operations
 */
export const validateToken = (token: string, options?: TokenValidationOptions) => 
  tokenUtils.validateToken(token, options);

export const introspectToken = (token: string) => 
  tokenUtils.introspectToken(token);

export const analyzeToken = (token: string) => 
  tokenUtils.analyzeToken(token);

export const isTokenExpired = (token: string, clockSkewTolerance?: number) => 
  tokenUtils.isTokenExpired(token, clockSkewTolerance);

export const isTokenExpiringSoon = (token: string, thresholdMinutes?: number) => 
  tokenUtils.isTokenExpiringSoon(token, thresholdMinutes);

export const extractUserId = (token: string) => 
  tokenUtils.extractUserId(token);

export const extractCompanyId = (token: string) => 
  tokenUtils.extractCompanyId(token);

export const extractPermissions = (token: string) => 
  tokenUtils.extractPermissions(token);

export const hasPermission = (token: string, permission: string) => 
  tokenUtils.hasPermission(token, permission);

export const hasAnyPermission = (token: string, permissions: string[]) => 
  tokenUtils.hasAnyPermission(token, permissions);

export const sanitizeTokenForLogging = (token: string) => 
  tokenUtils.sanitizeTokenForLogging(token);

// Export types for external use