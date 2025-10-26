// Secure Development Mode Tests
// Tests for ALLOW_INSECURE_DEV environment flag and security controls

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WhopAuthService } from '@/lib/whop/auth';
import { validateWhopSdkConfig } from '@/lib/whop/sdkConfig';
import { logger } from '@/lib/logger';

// Mock dependencies
jest.mock('@/lib/logger');
jest.mock('@/lib/whop/sdkConfig');

const mockLogger = logger as jest.Mocked<typeof logger>;
const mockValidateWhopSdkConfig = validateWhopSdkConfig as jest.MockedFunction<typeof validateWhopSdkConfig>;

describe('Secure Development Mode', () => {
  const originalEnv = process.env;
  let authService: WhopAuthService;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    // Mock logger to capture security logs
    jest.spyOn(logger, 'security').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Environment Flag Validation', () => {
    it('should block insecure dev mode when ALLOW_INSECURE_DEV is not set', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_INSECURE_DEV;
      
      authService = new WhopAuthService();

      // Act & Assert
      await expect(authService.verifyToken('test-token')).rejects.toThrow(
        'Development mode requires ALLOW_INSECURE_DEV=true environment variable or valid API key configuration'
      );

      expect(logger.security).toHaveBeenCalledWith(
        'Insecure development mode blocked - set ALLOW_INSECURE_DEV=true to enable',
        expect.objectContaining({
          category: 'configuration',
          severity: 'high',
          environment: 'development',
          hasApiKey: false
        })
      );
    });

    it('should block insecure dev mode when ALLOW_INSECURE_DEV is false', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_DEV = 'false';
      
      authService = new WhopAuthService();

      // Act & Assert
      await expect(authService.verifyToken('test-token')).rejects.toThrow(
        'Development mode requires ALLOW_INSECURE_DEV=true environment variable or valid API key configuration'
      );
    });

    it('should allow insecure dev mode when ALLOW_INSECURE_DEV is true', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_DEV = 'true';
      
      authService = new WhopAuthService();

      // Act
      const result = await authService.verifyToken('test-token');

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe('dev-user');
      expect(result.token).toBe('test-token');

      expect(logger.security).toHaveBeenCalledWith(
        'WARNING: Insecure development mode is active - authentication bypassed',
        expect.objectContaining({
          category: 'security',
          severity: 'medium',
          environment: 'development',
          hasApiKey: false,
          allowInsecureDev: true
        })
      );
    });

    it('should not require ALLOW_INSECURE_DEV when API key is provided', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.WHOP_API_KEY = 'valid_development_api_key_16_characters';
      delete process.env.ALLOW_INSECURE_DEV;
      
      authService = new WhopAuthService();

      // Act - This should not throw due to missing API key
      // Note: This might still throw for other reasons (invalid token, network, etc.)
      // but should not throw due to missing ALLOW_INSECURE_DEV
      try {
        await authService.verifyToken('test-token');
      } catch (error) {
        // Should not be the ALLOW_INSECURE_DEV error
        expect(error.message).not.toContain('ALLOW_INSECURE_DEV');
      }
    });
  });

  describe('Production Safety Checks', () => {
    it('should block production deployment with ALLOW_INSECURE_DEV=true', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_INSECURE_DEV = 'true';
      process.env.NEXT_PUBLIC_WHOP_APP_ID = 'test_app_id';
      process.env.WHOP_API_KEY = 'valid_production_api_key_16_characters';
      process.env.WHOP_WEBHOOK_SECRET = 'valid_production_webhook_secret_16_characters';

      // Act
      const result = validateWhopSdkConfig();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'CRITICAL: ALLOW_INSECURE_DEV=true is not allowed in production environment - this creates a severe security vulnerability'
      );
    });

    it('should allow production deployment with ALLOW_INSECURE_DEV=false', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_INSECURE_DEV = 'false';
      process.env.NEXT_PUBLIC_WHOP_APP_ID = 'test_app_id';
      process.env.WHOP_API_KEY = 'valid_production_api_key_16_characters';
      process.env.WHOP_WEBHOOK_SECRET = 'valid_production_webhook_secret_16_characters';

      // Act
      const result = validateWhopSdkConfig();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(
        expect.stringContaining('ALLOW_INSECURE_DEV')
      );
    });

    it('should allow production deployment without ALLOW_INSECURE_DEV set', () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_INSECURE_DEV;
      process.env.NEXT_PUBLIC_WHOP_APP_ID = 'test_app_id';
      process.env.WHOP_API_KEY = 'valid_production_api_key_16_characters';
      process.env.WHOP_WEBHOOK_SECRET = 'valid_production_webhook_secret_16_characters';

      // Act
      const result = validateWhopSdkConfig();

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.errors).not.toContain(
        expect.stringContaining('ALLOW_INSECURE_DEV')
      );
    });
  });

  describe('Staging Environment', () => {
    it('should block staging deployment with ALLOW_INSECURE_DEV=true', () => {
      // Arrange
      process.env.NODE_ENV = 'staging';
      process.env.ALLOW_INSECURE_DEV = 'true';
      process.env.NEXT_PUBLIC_WHOP_APP_ID = 'test_app_id';
      process.env.WHOP_API_KEY = 'valid_staging_api_key_16_characters';
      process.env.WHOP_WEBHOOK_SECRET = 'valid_staging_webhook_secret_16_characters';

      // Act
      const result = validateWhopSdkConfig();

      // Assert
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'CRITICAL: ALLOW_INSECURE_DEV=true is not allowed in production environment - this creates a severe security vulnerability'
      );
    });
  });

  describe('Security Logging', () => {
    it('should log security events with proper categorization', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_DEV = 'true';
      
      authService = new WhopAuthService();

      // Act
      await authService.verifyToken('test-token');

      // Assert
      expect(logger.security).toHaveBeenCalledWith(
        'WARNING: Insecure development mode is active - authentication bypassed',
        expect.objectContaining({
          category: 'security',
          severity: 'medium'
        })
      );
    });

    it('should log configuration blocks with proper categorization', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_INSECURE_DEV;
      
      authService = new WhopAuthService();

      // Act
      try {
        await authService.verifyToken('test-token');
      } catch (error) {
        // Expected to throw
      }

      // Assert
      expect(logger.security).toHaveBeenCalledWith(
        'Insecure development mode blocked - set ALLOW_INSECURE_DEV=true to enable',
        expect.objectContaining({
          category: 'configuration',
          severity: 'high'
        })
      );
    });
  });

  describe('Token Verification Behavior', () => {
    it('should return mock token info in insecure dev mode', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_DEV = 'true';
      
      authService = new WhopAuthService();

      // Act
      const result = await authService.verifyToken('test-token');

      // Assert
      expect(result).toEqual({
        token: 'test-token',
        payload: { userId: 'dev-user', companyId: expect.any(String) },
        expiresAt: expect.any(Number),
        issuedAt: expect.any(Number),
        userId: 'dev-user',
        companyId: expect.any(String)
      });
    });

    it('should cache mock tokens in insecure dev mode', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_INSECURE_DEV = 'true';
      
      authService = new WhopAuthService();
      const token = 'test-token';

      // Act
      const result1 = await authService.verifyToken(token);
      const result2 = await authService.verifyToken(token);

      // Assert
      expect(result1).toBe(result2); // Should be same cached result
    });
  });

  describe('Environment Detection', () => {
    it('should only apply dev mode rules in development environment', async () => {
      // Arrange - Test production environment
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_INSECURE_DEV = 'true';
      process.env.NEXT_PUBLIC_WHOP_APP_ID = 'test_app_id';
      process.env.WHOP_API_KEY = 'valid_production_api_key_16_characters';
      process.env.WHOP_WEBHOOK_SECRET = 'valid_production_webhook_secret_16_characters';

      // Act
      const configResult = validateWhopSdkConfig();

      // Assert - Production should block insecure dev mode
      expect(configResult.isValid).toBe(false);
      expect(configResult.errors).toContain(
        expect.stringContaining('ALLOW_INSECURE_DEV')
      );
    });

    it('should handle case-insensitive environment names', () => {
      // Arrange
      process.env.NODE_ENV = 'DEVELOPMENT';
      process.env.ALLOW_INSECURE_DEV = 'true';

      // Act
      const configResult = validateWhopSdkConfig();

      // Assert
      expect(configResult.config?.environment).toBe('development');
    });
  });
});