/**
 * Security Monitoring Session Invalidation Tests
 * Tests the enhanced security monitoring system with session invalidation capabilities
 */

const { describe, it, expect, beforeEach, afterEach, jest } = require('@jest/globals');

// Import the services we need to test
const { SecurityMonitor, securityMonitor } = require('../src/lib/security-monitoring');
const { whopAuthService } = require('../src/lib/whop/auth');

// Mock dependencies
jest.mock('../src/lib/logger', () => ({
  logger: {
    security: jest.fn(),
    metric: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('../src/lib/whop/auth', () => ({
  whopAuthService: {
    revokeAllUserSessions: jest.fn(),
    revokeSession: jest.fn()
  }
}));

jest.mock('../src/lib/db', () => ({
  sql: {
    execute: jest.fn()
  }
}));

describe('Security Monitoring Session Invalidation', () => {
  let monitor: SecurityMonitor;

  beforeEach(() => {
    jest.clearAllMocks();
    monitor = new SecurityMonitor();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Session Invalidation Triggers', () => {
    describe('Invalid Authentication Attempts', () => {
      it('should invalidate user sessions when auth failure threshold is exceeded', async () => {
        const userId = 'test-user';
        const ip = '192.168.1.100';

        // Create multiple auth failure events
        const authFailures = Array(6).fill(null).map((_, i) => ({
          id: `auth-fail-${i}`,
          category: 'authentication' as const,
          severity: 'high' as const,
          type: 'login_failed',
          description: `Login failed for user ${userId}`,
          userId,
          ip,
          timestamp: new Date(Date.now() - (6 - i) * 60 * 1000), // 6 failures over 6 minutes
          resolved: false
        }));

        // Add events to history
        authFailures.forEach(event => {
          (monitor as any).addToHistory(event);
        });

        // Process the latest failure event
        await monitor.processSecurityEvent({
          category: 'authentication',
          severity: 'high',
          type: 'login_failed',
          description: 'Login failed threshold test',
          userId,
          ip
        });

        // Should trigger session invalidation
        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId);
      });

      it('should invalidate sessions by IP when auth failures exceed threshold', async () => {
        const ip = '192.168.1.100';

        // Create multiple auth failure events from same IP
        const authFailures = Array(6).fill(null).map((_, i) => ({
          id: `ip-fail-${i}`,
          category: 'authentication' as const,
          severity: 'high' as const,
          type: 'login_failed',
          description: `Login failed from IP ${ip}`,
          ip,
          timestamp: new Date(Date.now() - (6 - i) * 60 * 1000),
          resolved: false
        }));

        authFailures.forEach(event => {
          (monitor as any).addToHistory(event);
        });

        await monitor.processSecurityEvent({
          category: 'authentication',
          severity: 'high',
          type: 'login_failed',
          description: 'IP-based auth failure test',
          ip
        });

        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalled();
      });
    });

    describe('Rate Limit Violations', () => {
      it('should invalidate sessions when rate limit violations exceed threshold', async () => {
        const ip = '192.168.1.100';

        const violations = Array(11).fill(null).map((_, i) => ({
          id: `rate-violation-${i}`,
          category: 'rate_limit' as const,
          severity: 'medium' as const,
          type: 'rate_limit_exceeded',
          description: `Rate limit exceeded from IP ${ip}`,
          ip,
          timestamp: new Date(Date.now() - (11 - i) * 60 * 1000),
          resolved: false
        }));

        violations.forEach(event => {
          (monitor as any).addToHistory(event);
        });

        await monitor.processSecurityEvent({
          category: 'rate_limit',
          severity: 'medium',
          type: 'rate_limit_exceeded',
          description: 'Rate limit violation test',
          ip
        });

        // Should trigger IP-based session invalidation
        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalled();
      });
    });

    describe('Suspicious User Agent Patterns', () => {
      it('should invalidate sessions when suspicious user agents exceed threshold', async () => {
        const userId = 'test-user';

        const suspiciousEvents = Array(4).fill(null).map((_, i) => ({
          id: `ua-suspicious-${i}`,
          category: 'anomaly' as const,
          severity: 'low' as const,
          type: 'suspicious_user_agent',
          description: 'Suspicious user agent detected',
          userId,
          userAgent: 'bot-crawler-scanner',
          timestamp: new Date(Date.now() - (4 - i) * 60 * 1000),
          resolved: false
        }));

        suspiciousEvents.forEach(event => {
          (monitor as any).addToHistory(event);
        });

        await monitor.processSecurityEvent({
          category: 'anomaly',
          severity: 'low',
          type: 'suspicious_user_agent',
          description: 'Suspicious user agent test',
          userId,
          userAgent: 'bot-crawler-scanner'
        });

        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId);
      });
    });

    describe('Geographic Anomalies', () => {
      it('should invalidate sessions when geographic anomalies are detected', async () => {
        const userId = 'test-user';

        await monitor.processSecurityEvent({
          category: 'anomaly',
          severity: 'medium',
          type: 'geographic_anomaly',
          description: 'User logged in from unusual location',
          userId
        });

        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId);
      });
    });

    describe('Critical Security Alerts', () => {
      it('should invalidate sessions when critical security alerts are received', async () => {
        const userId = 'test-user';
        const ip = '192.168.1.100';

        await monitor.processSecurityEvent({
          category: 'intrusion',
          severity: 'critical',
          type: 'critical_security_event',
          description: 'Critical security breach detected',
          userId,
          ip
        });

        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId);
        // Should also trigger IP-based invalidation for critical events
        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Session Invalidation Methods', () => {
    describe('invalidateUserSessions', () => {
      it('should revoke all sessions for a user and track the invalidation', async () => {
        const userId = 'test-user';
        const reason = 'security_violation';

        await monitor.invalidateUserSessions(userId, reason);

        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId);

        // Check that invalidation is tracked
        const invalidations = (monitor as any).sessionInvalidations;
        expect(invalidations.has(userId)).toBe(true);
        expect(invalidations.get(userId)).toMatchObject({
          userId,
          reason,
          timestamp: expect.any(Date)
        });
      });

      it('should handle errors gracefully when session revocation fails', async () => {
        const userId = 'test-user';
        whopAuthService.revokeAllUserSessions.mockRejectedValue(new Error('Revocation failed'));

        await expect(monitor.invalidateUserSessions(userId, 'test')).resolves.not.toThrow();

        // Should still track the invalidation attempt
        const invalidations = (monitor as any).sessionInvalidations;
        expect(invalidations.has(userId)).toBe(true);
      });
    });

    describe('invalidateSessionsByIp', () => {
      it('should find users associated with IP and revoke their sessions', async () => {
        const ip = '192.168.1.100';
        const userId1 = 'user1';
        const userId2 = 'user2';

        // Add events that associate users with the IP
        const events = [
          {
            id: 'event1',
            category: 'authentication' as const,
            severity: 'info' as const,
            type: 'login_success',
            description: 'Login success',
            userId: userId1,
            ip,
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
            resolved: false
          },
          {
            id: 'event2',
            category: 'authentication' as const,
            severity: 'info' as const,
            type: 'login_success',
            description: 'Login success',
            userId: userId2,
            ip,
            timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
            resolved: false
          }
        ];

        events.forEach(event => {
          (monitor as any).addToHistory(event);
        });

        await monitor.invalidateSessionsByIp(ip, 'ip_based_violation');

        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId1);
        expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId2);
      });
    });
  });

  describe('Configuration and Thresholds', () => {
    it('should respect environment-based configuration for thresholds', () => {
      // Mock environment variables
      const originalEnv = process.env;
      process.env.SESSION_INVALIDATION_INVALID_AUTH_ATTEMPTS_THRESHOLD = '10';
      process.env.SESSION_INVALIDATION_RATE_LIMIT_THRESHOLD = '20';
      process.env.SESSION_INVALIDATION_ENABLED = 'true';

      // Create new monitor instance to pick up env vars
      const configuredMonitor = new SecurityMonitor();

      const thresholds = (configuredMonitor as any).SESSION_INVALIDATION_THRESHOLDS;

      expect(thresholds.invalidAuthAttempts.threshold).toBe(10);
      expect(thresholds.rateLimitViolations.threshold).toBe(20);
      expect(thresholds.invalidAuthAttempts.enabled).toBe(true);

      // Restore env
      process.env = originalEnv;
    });

    it('should use default values when environment variables are not set', () => {
      const defaultMonitor = new SecurityMonitor();
      const thresholds = (defaultMonitor as any).SESSION_INVALIDATION_THRESHOLDS;

      expect(thresholds.invalidAuthAttempts.threshold).toBe(5);
      expect(thresholds.rateLimitViolations.threshold).toBe(10);
      expect(thresholds.invalidAuthAttempts.enabled).toBe(true);
    });
  });

  describe('Metrics and Logging', () => {
    it('should track session invalidation metrics', async () => {
      const { logger } = require('../src/lib/logger');

      await monitor.invalidateUserSessions('test-user', 'test_reason');

      expect(logger.metric).toHaveBeenCalledWith(
        'security.session_invalidations',
        1,
        expect.objectContaining({
          reason: 'test_reason',
          invalidationType: 'user_sessions'
        })
      );
    });

    it('should log security events for session invalidations', async () => {
      const { logger } = require('../src/lib/logger');

      await monitor.invalidateUserSessions('test-user', 'security_violation');

      expect(logger.security).toHaveBeenCalledWith(
        'User sessions invalidated due to security event',
        expect.objectContaining({
          category: 'security',
          severity: 'high',
          operation: 'session_invalidation',
          userId: 'test-user',
          reason: 'security_violation',
          invalidationType: 'user_sessions'
        })
      );
    });

    it('should include session invalidation metrics in security metrics', async () => {
      // Add some session invalidations
      await monitor.invalidateUserSessions('user1', 'reason1');
      await monitor.invalidateUserSessions('user2', 'reason1');
      await monitor.invalidateUserSessions('user1', 'reason2');

      const metrics = await monitor.getSecurityMetrics('24h');

      expect(metrics.sessionInvalidations.total).toBe(3);
      expect(metrics.sessionInvalidations.byReason.reason1).toBe(2);
      expect(metrics.sessionInvalidations.byReason.reason2).toBe(1);
      expect(metrics.sessionInvalidations.byUser.user1).toBe(2);
      expect(metrics.sessionInvalidations.byUser.user2).toBe(1);
    });
  });

  describe('Integration with Security Event Processing', () => {
    it('should automatically trigger session invalidation during event processing', async () => {
      // Create conditions for auth failure threshold
      const userId = 'test-user';
      const ip = '192.168.1.100';

      // Add threshold number of failures
      for (let i = 0; i < 5; i++) {
        (monitor as any).addToHistory({
          id: `fail-${i}`,
          category: 'authentication',
          severity: 'high',
          type: 'login_failed',
          description: 'Login failed',
          userId,
          ip,
          timestamp: new Date(Date.now() - (5 - i) * 60 * 1000),
          resolved: false
        });
      }

      // Process one more failure - should trigger invalidation
      await monitor.processSecurityEvent({
        category: 'authentication',
        severity: 'high',
        type: 'login_failed',
        description: 'Final login failure triggering invalidation',
        userId,
        ip
      });

      expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledWith(userId);
    });

    it('should handle multiple invalidation triggers without duplicate calls', async () => {
      const userId = 'test-user';

      // Add multiple types of security events that would trigger invalidation
      await monitor.processSecurityEvent({
        category: 'authentication',
        severity: 'high',
        type: 'login_failed',
        description: 'Auth failure',
        userId
      });

      await monitor.processSecurityEvent({
        category: 'anomaly',
        severity: 'medium',
        type: 'geographic_anomaly',
        description: 'Geo anomaly',
        userId
      });

      // Should only call revoke once per unique user/reason combination
      expect(whopAuthService.revokeAllUserSessions).toHaveBeenCalledTimes(2);
    });
  });
});