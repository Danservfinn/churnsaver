// Whop SDK Module Index
// Central exports for the Whop SDK configuration, client, and authentication

export * from './sdkConfig';
export * from './client';
export * from './auth';
export * from './authMiddleware';
export * from './tokenUtils';

// Re-export commonly used combinations
export { createWhopApiClient, whopApiClient, middleware } from './client';
export { whopConfig } from './sdkConfig';
export { whopAuthService } from './auth';
export { tokenUtils } from './tokenUtils';

// Authentication middleware exports
export {
  createAuthMiddleware,
  requireAuth,
  requirePermissions,
  optionalAuth,
  appAuth,
  withAuth,
  authenticatedRoute,
  applicationRoute,
  optionalAuthRoute,
  introspectToken,
  validateToken,
  getCurrentUser,
  hasPermission,
  hasAnyPermission
} from './authMiddleware';

// Token utilities exports
export {
  validateToken as validateJwtToken,
  introspectToken as introspectJwtToken,
  analyzeToken,
  isTokenExpired,
  isTokenExpiringSoon,
  extractUserId,
  extractCompanyId,
  extractPermissions,
  hasPermission as hasTokenPermission,
  hasAnyPermission as hasAnyTokenPermission,
  sanitizeTokenForLogging,
  generateTokenFingerprint
} from './tokenUtils';

// Type exports
export type {
  WhopSdkConfig,
  ConfigValidationResult,
  ApiRequestOptions,
  ApiResponse,
  ApiMiddleware,
  RequestContext,
  WhopApiClient
} from './client';

export type {
  TokenInfo,
  AuthContext,
  SessionInfo,
  AuthOptions,
  TokenStorage
} from './auth';

export type {
  AuthMiddlewareConfig,
  MiddlewareAuthContext
} from './authMiddleware';

export type {
  TokenValidationResult,
  TokenIntrospectionResult,
  TokenAnalysisResult,
  TokenValidationOptions
} from './tokenUtils';
export * from './resilience';
// Observability exports
export * from './observability';
// Re-export commonly used combinations
export { createWhopApiClient, whopApiClient, middleware } from './client';
export { whopConfig } from './sdkConfig';
export { whopAuthService } from './auth';
export { tokenUtils } from './tokenUtils';
export { resilienceService, executeResiliently } from './resilience';
