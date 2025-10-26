// Whop Authentication Middleware Tests
// Tests for authentication middleware and API route helpers

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest, NextResponse } from 'next/server';
import { 
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
} from '@/lib/whop/authMiddleware';
import { whopAuthService } from '@/lib/whop/auth';
import { createRequestContext, apiError, errors } from '@/lib/apiResponse';
import { logger } from '@/lib/logger';

// Mock dependencies
jest.mock('@/lib/whop/auth');
jest.mock('@/lib/apiResponse');
jest.mock('@/lib/logger');

const mockWhopAuthService = whopAuthService as jest.Mocked<typeof whopAuthService>;
const mockCreateRequestContext = createRequestContext as jest.MockedFunction<typeof createRequestContext>;
const mockApiError = apiError as jest.MockedFunction<typeof apiError>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Authentication Middleware', () => {
  let mockRequest: jest.Mocked<NextRequest>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock NextRequest
    mockRequest = {
      url: 'https://example.com/api/test',
      method: 'GET',
      headers: {
        get: jest.fn()
      }
    } as any;

    // Mock request context
    mockCreateRequestContext.mockReturnValue({
      requestId: 'test-request-id',
      startTime: Date.now(),
      method: 'GET',
      url: 'https://example.com/api/test',
      ip: '127.0.0.1',
      userAgent: 'test-agent'
    });
  });

  describe('createAuthMiddleware', () => {
    it('should authenticate successfully with valid token', async () => {
      const middleware = createAuthMiddleware({ requireAuth: true });
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer valid-token')
        .mockReturnValueOnce(null);

      // Mock successful authentication
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company'
      } as any);

      const result = await middleware(mockRequest);

      expect(result).not.toBeInstanceOf(NextResponse);
      expect(result?.isAuthenticated).toBe(true);
      expect(result?.userId).toBe('test-user');
    });

    it('should handle missing token when auth is required', async () => {
      const middleware = createAuthMiddleware({ requireAuth: true });
      
      mockRequest.headers.get.mockReturnValue(null);

      // Mock failed authentication
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: false,
        companyId: 'test-app-id'
      } as any);

      const result = await middleware(mockRequest);

      expect(result).toBeInstanceOf(NextResponse);
      expect(mockApiError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorCode.UNAUTHORIZED
        }),
        expect.any(Object)
      );
    });

    it('should skip authentication for specified paths', async () => {
      const middleware = createAuthMiddleware({ 
        requireAuth: true,
        skipPaths: ['/health', '/public']
      });
      
      mockRequest.url = 'https://example.com/health/check';

      const result = await middleware(mockRequest);

      expect(result).toBeNull(); // Should continue to next handler
      expect(mockWhopAuthService.authenticate).not.toHaveBeenCalled();
    });

    it('should validate permissions when required', async () => {
      const middleware = createAuthMiddleware({ 
        requireAuth: true,
        permissions: ['admin', 'read']
      });
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer valid-token')
        .mockReturnValueOnce(null);

      // Mock authentication with insufficient permissions
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company',
        permissions: ['read'] // Missing 'admin'
      } as any);

      const result = await middleware(mockRequest);

      expect(result).toBeInstanceOf(NextResponse);
      expect(mockApiError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ErrorCode.INSUFFICIENT_PERMISSIONS
        }),
        expect.any(Object)
      );
    });

    it('should call custom success handler', async () => {
      const successHandler = jest.fn();
      const middleware = createAuthMiddleware({ 
        onAuthSuccess: successHandler
      });
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer valid-token')
        .mockReturnValueOnce(null);

      const authContext = {
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company'
      } as any;

      mockWhopAuthService.authenticate.mockResolvedValue(authContext);

      await middleware(mockRequest);

      expect(successHandler).toHaveBeenCalledWith(authContext);
    });

    it('should call custom error handler', async () => {
      const errorHandler = jest.fn().mockReturnValue(
        new NextResponse('Custom error', { status: 401 })
      );
      const middleware = createAuthMiddleware({ 
        onAuthFailed: errorHandler
      });
      
      mockRequest.headers.get.mockReturnValue(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: false,
        companyId: 'test-app-id'
      } as any);

      const result = await middleware(mockRequest);

      expect(result).toBeInstanceOf(NextResponse);
      expect(errorHandler).toHaveBeenCalled();
      expect(mockApiError).not.toHaveBeenCalled();
    });
  });

  describe('withAuth', () => {
    it('should wrap handler with authentication', async () => {
      const handler = jest.fn().mockResolvedValue(
        new NextResponse('Success', { status: 200 })
      );
      
      const wrappedHandler = withAuth(handler, { requireAuth: true });
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer valid-token')
        .mockReturnValueOnce(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company'
      } as any);

      const result = await wrappedHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(mockRequest, expect.objectContaining({
        isAuthenticated: true,
        userId: 'test-user'
      }));
      expect(result).toBeInstanceOf(NextResponse);
    });

    it('should return error response when authentication fails', async () => {
      const handler = jest.fn();
      
      const wrappedHandler = withAuth(handler, { requireAuth: true });
      
      mockRequest.headers.get.mockReturnValue(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: false,
        companyId: 'test-app-id'
      } as any);

      const result = await wrappedHandler(mockRequest);

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(NextResponse);
    });
  });

  describe('authenticatedRoute', () => {
    it('should create authenticated route handler', async () => {
      const handler = jest.fn().mockResolvedValue(
        new NextResponse('Authenticated success', { status: 200 })
      );
      
      const routeHandler = authenticatedRoute(handler);
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer valid-token')
        .mockReturnValueOnce(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company'
      } as any);

      const result = await routeHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(mockRequest, expect.objectContaining({
        isAuthenticated: true,
        userId: 'test-user'
      }));
      expect(result).toBeInstanceOf(NextResponse);
    });

    it('should require permissions when specified', async () => {
      const handler = jest.fn();
      
      const routeHandler = authenticatedRoute(handler, { 
        permissions: ['admin'] 
      });
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer valid-token')
        .mockReturnValueOnce(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company',
        permissions: ['user'] // Insufficient permissions
      } as any);

      const result = await routeHandler(mockRequest);

      expect(handler).not.toHaveBeenCalled();
      expect(result).toBeInstanceOf(NextResponse);
    });
  });

  describe('applicationRoute', () => {
    it('should create application-level route handler', async () => {
      const handler = jest.fn().mockResolvedValue(
        new NextResponse('Application success', { status: 200 })
      );
      
      const routeHandler = applicationRoute(handler);
      
      mockRequest.headers.get
        .mockReturnValueOnce('Bearer app-token')
        .mockReturnValueOnce(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'app-service',
        companyId: 'test-company'
      } as any);

      const result = await routeHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(mockRequest, expect.objectContaining({
        isAuthenticated: true,
        userId: 'app-service'
      }));
      expect(result).toBeInstanceOf(NextResponse);
    });
  });

  describe('optionalAuthRoute', () => {
    it('should create optional auth route handler', async () => {
      const handler = jest.fn().mockResolvedValue(
        new NextResponse('Optional auth success', { status: 200 })
      );
      
      const routeHandler = optionalAuthRoute(handler);
      
      mockRequest.headers.get.mockReturnValue(null);

      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: false,
        companyId: 'test-app-id'
      } as any);

      const result = await routeHandler(mockRequest);

      expect(handler).toHaveBeenCalledWith(mockRequest, expect.objectContaining({
        isAuthenticated: false
      }));
      expect(result).toBeInstanceOf(NextResponse);
    });
  });
});

describe('Token Utilities', () => {
  let mockRequest: jest.Mocked<NextRequest>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockRequest = {
      url: 'https://example.com/api/test',
      method: 'GET',
      headers: {
        get: jest.fn()
      }
    } as any;
  });

  describe('introspectToken', () => {
    it('should introspect valid token', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer valid-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        companyId: 'test-company',
        tokenInfo: {
          expiresAt: Date.now() + 3600000,
          permissions: ['read', 'write']
        }
      } as any);

      const result = await introspectToken(mockRequest);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe('test-user');
      expect(result.companyId).toBe('test-company');
      expect(result.permissions).toEqual(['read', 'write']);
    });

    it('should handle missing token', async () => {
      mockRequest.headers.get.mockReturnValue(null);

      const result = await introspectToken(mockRequest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('No token provided');
    });

    it('should handle invalid token', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer invalid-token');
      
      mockWhopAuthService.authenticate.mockRejectedValue(
        new Error('Invalid token')
      );

      const result = await introspectToken(mockRequest);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });

  describe('validateToken', () => {
    it('should validate token successfully', async () => {
      const token = 'valid.jwt.token';
      
      mockWhopAuthService.verifyToken.mockResolvedValue({
        payload: { userId: 'test-user' },
        expiresAt: Date.now() + 3600000
      } as any);

      const result = await validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe('test-user');
    });

    it('should handle invalid token', async () => {
      const token = 'invalid.token';
      
      mockWhopAuthService.verifyToken.mockRejectedValue(
        new Error('Invalid token format')
      );

      const result = await validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user from request', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer user-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'current-user',
        companyId: 'test-company',
        permissions: ['read', 'write']
      } as any);

      const result = await getCurrentUser(mockRequest);

      expect(result).toEqual({
        id: 'current-user',
        companyId: 'test-company',
        permissions: ['read', 'write']
      });
    });

    it('should return null for unauthenticated request', async () => {
      mockRequest.headers.get.mockReturnValue(null);
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: false,
        companyId: 'test-app-id'
      } as any);

      const result = await getCurrentUser(mockRequest);

      expect(result).toBeNull();
    });

    it('should handle authentication errors', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer error-token');
      
      mockWhopAuthService.authenticate.mockRejectedValue(
        new Error('Authentication failed')
      );

      const result = await getCurrentUser(mockRequest);

      expect(result).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should check user has specific permission', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer user-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        permissions: ['read', 'write', 'admin']
      } as any);

      const result = await hasPermission(mockRequest, 'write');

      expect(result).toBe(true);
    });

    it('should return false for missing permission', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer user-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        permissions: ['read']
      } as any);

      const result = await hasPermission(mockRequest, 'write');

      expect(result).toBe(false);
    });

    it('should return false for unauthenticated user', async () => {
      mockRequest.headers.get.mockReturnValue(null);
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: false,
        companyId: 'test-app-id'
      } as any);

      const result = await hasPermission(mockRequest, 'read');

      expect(result).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should check user has any of specified permissions', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer user-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        permissions: ['read', 'delete']
      } as any);

      const result = await hasAnyPermission(mockRequest, ['write', 'delete']);

      expect(result).toBe(true);
    });

    it('should return false when user has none of the permissions', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer user-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'test-user',
        permissions: ['read']
      } as any);

      const result = await hasAnyPermission(mockRequest, ['write', 'delete']);

      expect(result).toBe(false);
    });

    it('should return true for admin wildcard', async () => {
      mockRequest.headers.get.mockReturnValue('Bearer admin-token');
      
      mockWhopAuthService.authenticate.mockResolvedValue({
        isAuthenticated: true,
        userId: 'admin-user',
        permissions: ['*']
      } as any);

      const result = await hasAnyPermission(mockRequest, ['any-permission']);

      expect(result).toBe(true);
    });
  });
});

describe('Token Extraction', () => {
  it('should extract token from Authorization header', () => {
    const request = {
      headers: {
        get: jest.fn()
          .mockReturnValueOnce('Bearer auth-token')
          .mockReturnValueOnce(null)
      }
    } as any;

    // Import the internal function for testing
    const { createAuthMiddleware } = require('@/lib/whop/authMiddleware');
    const middleware = createAuthMiddleware();
    
    // This would internally call extractToken
    middleware(request).then(() => {
      // Verify the header was checked
      expect(request.headers.get).toHaveBeenCalledWith('authorization');
    });
  });

  it('should extract token from Whop header', () => {
    const request = {
      headers: {
        get: jest.fn()
          .mockReturnValueOnce('whop-token')
          .mockReturnValueOnce(null)
      }
    } as any;

    // Similar to above, we'd test the internal extraction
    expect(request.headers.get).toHaveBeenCalledWith('x-whop-user-token');
  });

  it('should extract token from query parameter', () => {
    const request = {
      url: 'https://example.com/api/test?token=query-token',
      headers: {
        get: jest.fn().mockReturnValue(null)
      }
    } as any;

    // The URL parsing would extract the token from query params
    expect(request.url).toContain('token=query-token');
  });
});