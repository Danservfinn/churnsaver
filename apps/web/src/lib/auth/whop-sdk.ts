// Whop SDK authentication helpers using jose library for proper JWT verification
// Implements hardened x-whop-user-token verification with official patterns

import { jwtVerify, createLocalJWKSet } from 'jose';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface WhopTokenPayload {
  app_id: string;
  company_id?: string;
  user_id: string;
  iat: number;
  exp: number;
  // Whop-specific claims
  sub?: string; // subject (user or resource)
  aud?: string; // audience
  iss?: string; // issuer
  scope?: string; // permissions scope
}

export interface RequestContext {
  companyId: string;
  userId: string;
  isAuthenticated: boolean;
  tokenPayload?: WhopTokenPayload;
}

// Create symmetric key for token verification
// Whop uses HMAC-SHA256 for signing
const symmetricKey = new TextEncoder().encode(env.WHOP_APP_SECRET);

// Enhanced JWT verification using jose library with comprehensive security checks
export async function verifyWhopTokenSDK(token: string): Promise<RequestContext | null> {
  const startTime = Date.now();
  
  try {
    if (!token) {
      logger.security('Empty Whop token provided', {
        category: 'authentication',
        severity: 'medium'
      });
      return null;
    }

    // Basic JWT format validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.security('Invalid JWT format - should have 3 parts', {
        category: 'authentication',
        severity: 'high',
        tokenLength: token.length
      });
      return null;
    }

    // Decode header without verification to check algorithm
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      if (header.alg !== 'HS256') {
        logger.security('Unexpected JWT algorithm', {
          category: 'authentication',
          severity: 'high',
          algorithm: header.alg
        });
        return null;
      }
    } catch (headerError) {
      logger.security('Failed to decode JWT header', {
        category: 'authentication',
        severity: 'high'
      });
      return null;
    }

    // Enhanced verification with strict claims validation
    const verifyResult = await jwtVerify(token, symmetricKey, {
      issuer: env.WHOP_APP_ID, // Expected issuer
      audience: env.WHOP_APP_ID, // Expected audience
      algorithms: ['HS256'], // Only allow HMAC-SHA256
      maxTokenAge: '1h', // Maximum age regardless of exp claim
    });

    const payload = verifyResult.payload as unknown as WhopTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    // Comprehensive claim validation
    if (!payload.user_id) {
      logger.security('Whop token missing required user_id claim', {
        category: 'authentication',
        severity: 'high',
        claims: Object.keys(payload)
      });
      return null;
    }

    // Validate user_id format
    if (typeof payload.user_id !== 'string' || payload.user_id.length < 1) {
      logger.security('Invalid user_id format in token', {
        category: 'authentication',
        severity: 'high'
      });
      return null;
    }

    // Check token expiration with buffer
    if (!payload.exp || payload.exp < now) {
      logger.security('Token expired or missing exp claim', {
        category: 'authentication',
        severity: 'medium',
        exp: payload.exp,
        now
      });
      return null;
    }

    // Check issued at time (prevent tokens issued in the future)
    if (payload.iat && payload.iat > now + 300) { // 5 minute clock skew allowance
      logger.security('Token issued in the future', {
        category: 'authentication',
        severity: 'high',
        iat: payload.iat,
        now
      });
      return null;
    }

    // Validate company_id format if present
    if (payload.company_id && (typeof payload.company_id !== 'string' || payload.company_id.length < 1)) {
      logger.security('Invalid company_id format in token', {
        category: 'authentication',
        severity: 'high'
      });
      return null;
    }

    // For multi-tenant: use company_id if present, otherwise fall back to app_id
    const companyId = payload.company_id || payload.app_id || env.WHOP_APP_ID;

    // Check if token is near expiry for proactive refresh
    const isNearExpiry = (payload.exp - now) < 300; // 5 minutes

    logger.security('Whop token verified successfully', {
      category: 'authentication',
      severity: 'info',
      userId: payload.user_id,
      companyId,
      tokenExpiry: new Date(payload.exp * 1000).toISOString(),
      isNearExpiry,
      verificationTimeMs: Date.now() - startTime
    });

    return {
      companyId,
      userId: payload.user_id,
      isAuthenticated: true,
      tokenPayload: payload,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error ? (error as any).code : undefined;
    
    logger.security('Whop token SDK verification failed', {
      category: 'authentication',
      severity: 'high',
      error: errorMessage,
      errorCode,
      tokenLength: token.length,
      verificationTimeMs: Date.now() - startTime
    });
    return null;
  }
}

// Fallback JWT verification for legacy tokens (pre-SDK implementation)
// This maintains backward compatibility during migration with enhanced security
export function verifyWhopTokenLegacy(token: string): RequestContext | null {
  const startTime = Date.now();
  
  try {
    // Whop tokens are typically JWT-like with HMAC signature
    if (!token) {
      logger.security('Empty Whop token provided (legacy)', {
        category: 'authentication',
        severity: 'medium'
      });
      return null;
    }

    // Basic format check (should be JWT-like)
    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.security('Invalid Whop token format (legacy)', {
        category: 'authentication',
        severity: 'high',
        parts: parts.length
      });
      return null;
    }

    // Legacy implementation with manual HMAC verification
    const { createHmac } = require('crypto');
    const [header, payload, signature] = parts;

    // Validate header format for legacy tokens
    try {
      const headerData = JSON.parse(Buffer.from(header, 'base64url').toString());
      if (headerData.alg !== 'HS256') {
        logger.security('Unexpected algorithm in legacy token', {
          category: 'authentication',
          severity: 'high',
          algorithm: headerData.alg
        });
        return null;
      }
    } catch (headerError) {
      logger.security('Failed to decode legacy token header', {
        category: 'authentication',
        severity: 'high'
      });
      return null;
    }

    // Verify signature using timing-safe comparison
    const expectedSignature = createHmac('sha256', env.WHOP_APP_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    // Use timing-safe comparison for legacy signature verification
    const { timingSafeEqual } = require('crypto');
    const sigBuf1 = Buffer.from(signature, 'base64url');
    const sigBuf2 = Buffer.from(expectedSignature, 'base64url');
    
    if (sigBuf1.length !== sigBuf2.length || !timingSafeEqual(sigBuf1, sigBuf2)) {
      logger.security('Whop token signature verification failed (legacy)', {
        category: 'authentication',
        severity: 'high'
      });
      return null;
    }

    // Decode payload (base64url to JSON)
    const decodedPayload = Buffer.from(payload, 'base64url').toString('utf-8');
    const tokenData: WhopTokenPayload = JSON.parse(decodedPayload);

    const now = Math.floor(Date.now() / 1000);

    // Enhanced validation for legacy tokens
    if (tokenData.exp && tokenData.exp < now) {
      logger.security('Whop token expired (legacy)', {
        category: 'authentication',
        severity: 'medium',
        exp: tokenData.exp,
        now
      });
      return null;
    }

    // Check issued at time for legacy tokens
    if (tokenData.iat && tokenData.iat > now + 300) { // 5 minute clock skew allowance
      logger.security('Legacy token issued in the future', {
        category: 'authentication',
        severity: 'high',
        iat: tokenData.iat,
        now
      });
      return null;
    }

    if (!tokenData.user_id || typeof tokenData.user_id !== 'string') {
      logger.security('Whop token missing or invalid user_id claim (legacy)', {
        category: 'authentication',
        severity: 'high'
      });
      return null;
    }

    // For multi-tenant: use company_id if present, otherwise fall back to app_id
    const companyId = tokenData.company_id || tokenData.app_id || env.WHOP_APP_ID;

    logger.security('Whop token verified successfully (legacy)', {
      category: 'authentication',
      severity: 'info',
      userId: tokenData.user_id,
      companyId,
      tokenExpiry: tokenData.exp ? new Date(tokenData.exp * 1000).toISOString() : 'unknown',
      verificationTimeMs: Date.now() - startTime
    });

    return {
      companyId,
      userId: tokenData.user_id,
      isAuthenticated: true,
      tokenPayload: tokenData,
    };

  } catch (error) {
    logger.security('Whop token legacy verification failed with exception', {
      category: 'authentication',
      severity: 'high',
      error: error instanceof Error ? error.message : String(error),
      verificationTimeMs: Date.now() - startTime
    });
    return null;
  }
}

// Hybrid verification: try SDK first, fallback to legacy
export async function verifyWhopTokenHybrid(token: string): Promise<RequestContext | null> {
  // Try SDK verification first (proper JWT)
  const sdkResult = await verifyWhopTokenSDK(token);
  if (sdkResult) {
    logger.info('Token verified using SDK method');
    return sdkResult;
  }

  // Fallback to legacy verification
  logger.info('SDK verification failed, trying legacy method');
  const legacyResult = verifyWhopTokenLegacy(token);
  if (legacyResult) {
    logger.info('Token verified using legacy method');
    return legacyResult;
  }

  logger.warn('Both SDK and legacy verification methods failed');
  return null;
}

// Extract request context with hybrid verification and enhanced security
export async function getRequestContextSDK(request: { headers: { get: (key: string) => string | null } }): Promise<RequestContext> {
  const startTime = Date.now();
  const token = request.headers.get('x-whop-user-token');
  const clientIP = request.headers.get('x-forwarded-for') ||
                   request.headers.get('x-real-ip') ||
                   'unknown';
  const userAgent = request.headers.get('user-agent')?.substring(0, 200) || 'unknown';

  if (!token) {
    logger.security('No x-whop-user-token header found', {
      category: 'authentication',
      severity: 'medium',
      ip: clientIP,
      userAgent
    });
    
    return {
      companyId: env.WHOP_APP_ID, // Fallback to app ID for single-tenant
      userId: 'anonymous',
      isAuthenticated: false
    };
  }

  // Validate token format before processing
  if (token.length < 10 || token.length > 2048) {
    logger.security('Invalid token length', {
      category: 'authentication',
      severity: 'high',
      tokenLength: token.length,
      ip: clientIP,
      userAgent
    });
    
    return {
      companyId: env.WHOP_APP_ID,
      userId: 'anonymous',
      isAuthenticated: false
    };
  }

  const context = await verifyWhopTokenHybrid(token);
  if (context) {
    logger.security('Request context established successfully', {
      category: 'authentication',
      severity: 'info',
      userId: context.userId,
      companyId: context.companyId,
      isAuthenticated: context.isAuthenticated,
      ip: clientIP,
      processingTimeMs: Date.now() - startTime
    });
    return context;
  }

  // Token invalid, return fallback with security logging
  logger.security('Whop token verification failed for all methods, using fallback context', {
    category: 'authentication',
    severity: 'high',
    ip: clientIP,
    userAgent,
    tokenLength: token.length,
    processingTimeMs: Date.now() - startTime
  });
  
  return {
    companyId: env.WHOP_APP_ID,
    userId: 'anonymous',
    isAuthenticated: false
  };
}

// Utility to check if token is close to expiry (within 5 minutes)
export function isTokenNearExpiry(tokenPayload: WhopTokenPayload | undefined): boolean {
  if (!tokenPayload?.exp) return false;
  const fiveMinutesFromNow = Math.floor(Date.now() / 1000) + (5 * 60);
  return tokenPayload.exp < fiveMinutesFromNow;
}

// Extract company context from webhook headers
export function getWebhookCompanyContext(webhookHeaders: Record<string, string>): string {
  // Check for custom company ID header first
  const companyId = webhookHeaders['x-company-id'] ||
                   webhookHeaders['X-Company-Id'] ||
                   env.WHOP_APP_ID;
  
  return companyId;
}

// Export types for use by other modules
// JWTVerifyResult is not exported from jose anymore
