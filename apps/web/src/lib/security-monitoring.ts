// Security monitoring and intrusion detection system
// Provides real-time threat detection, rate limiting monitoring, and security analytics

import { logger } from '@/lib/logger';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
// Lazy import whopAuthService to avoid Edge Runtime crypto issues
// Only import when actually needed (in Node.js runtime contexts)
// Check if we're in Edge Runtime before importing
const isEdgeRuntime = typeof (globalThis as any).EdgeRuntime !== 'undefined' || process.env.NEXT_RUNTIME === 'edge';
let whopAuthService: any;
async function getWhopAuthService() {
  // Skip loading in Edge Runtime
  if (isEdgeRuntime) {
    logger.warn('whopAuthService not available in Edge Runtime, skipping session invalidation');
    return null;
  }
  if (!whopAuthService) {
    try {
      const authModule = await import('@/lib/whop/auth');
      whopAuthService = authModule.whopAuthService;
    } catch (error) {
      logger.error('Failed to load whopAuthService', { error });
      return null;
    }
  }
  return whopAuthService;
}

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  category: 'authentication' | 'authorization' | 'intrusion' | 'data_breach' | 'rate_limit' | 'anomaly';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  type: string;
  description: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  companyId?: string;
  endpoint?: string;
  metadata?: Record<string, unknown>;
  resolved: boolean;
}

export interface SecurityMetrics {
  timeWindow: string; // '1h', '24h', '7d'
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  topOffenders: Array<{ ip: string; eventCount: number }>;
  unusualPatterns: Array<{ pattern: string; count: number; description: string }>;
  sessionInvalidations: {
    total: number;
    byReason: Record<string, number>;
    byUser: Record<string, number>;
  };
}

export class SecurityMonitor {
  private activeAlerts = new Map<string, SecurityEvent>();
  private eventHistory: SecurityEvent[] = [];
  private readonly MAX_HISTORY_SIZE = 10000;
  private sessionInvalidations = new Map<string, {
    userId?: string;
    ip?: string;
    reason: string;
    timestamp: Date;
  }>();
  private readonly ALERT_THRESHOLDS = {
    // Authentication failures per IP per hour
    authFailuresPerIp: { threshold: 10, window: '1h' },
    // Rate limit violations per IP per hour
    rateLimitViolationsPerIp: { threshold: 20, window: '1h' },
    // Failed webhook signature verifications per hour
    webhookFailuresPerHour: { threshold: 50, window: '1h' },
    // Concurrent failed attempts from same IP
    concurrentFailuresPerIp: { threshold: 5, window: '5m' },
    // Unusual user agent patterns
    unusualUserAgents: { threshold: 3, window: '1h' }
  };
  private readonly SESSION_INVALIDATION_THRESHOLDS = {
    // Invalid authentication attempts (>5 failed logins per IP in 5 minutes)
    invalidAuthAttempts: {
      threshold: parseInt(process.env.SESSION_INVALIDATION_INVALID_AUTH_ATTEMPTS_THRESHOLD || '5'),
      window: '5m',
      enabled: process.env.SESSION_INVALIDATION_ENABLED !== 'false'
    },
    // Rate limit violations (excessive requests)
    rateLimitViolations: {
      threshold: parseInt(process.env.SESSION_INVALIDATION_RATE_LIMIT_THRESHOLD || '10'),
      window: '1h',
      enabled: process.env.SESSION_INVALIDATION_ENABLED !== 'false'
    },
    // Suspicious user agent patterns detected
    suspiciousUserAgents: {
      threshold: parseInt(process.env.SESSION_INVALIDATION_USER_AGENT_THRESHOLD || '3'),
      window: '1h',
      enabled: process.env.SESSION_INVALIDATION_ENABLED !== 'false'
    },
    // Geographic anomalies (user logging in from unusual locations)
    geographicAnomalies: {
      threshold: parseInt(process.env.SESSION_INVALIDATION_GEO_ANOMALY_THRESHOLD || '5'),
      window: '24h',
      enabled: process.env.SESSION_INVALIDATION_ENABLED !== 'false'
    },
    // Critical security alerts from other monitoring systems
    criticalSecurityAlerts: {
      enabled: process.env.SESSION_INVALIDATION_CRITICAL_ALERTS_ENABLED !== 'false'
    }
  };

  // Process and analyze security events
  async processSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      resolved: false
    };

    // Store in memory history
    this.addToHistory(securityEvent);

    // Log the event
    logger.security(event.description, {
      category: event.category,
      severity: event.severity,
      ip: event.ip,
      userAgent: event.userAgent,
      userId: event.userId,
      companyId: event.companyId,
      operation: event.type,
      ...event.metadata
    });

    // Check for threat patterns
    await this.detectThreatPatterns(securityEvent);

    // Update metrics
    this.updateSecurityMetrics(securityEvent);

    // Check if alert should be triggered
    await this.evaluateAlertConditions(securityEvent);
  }

  // Add event to history with size management
  private addToHistory(event: SecurityEvent): void {
    this.eventHistory.push(event);
    
    // Maintain history size
    if (this.eventHistory.length > this.MAX_HISTORY_SIZE) {
      this.eventHistory = this.eventHistory.slice(-this.MAX_HISTORY_SIZE);
    }
  }

  // Detect threat patterns using various algorithms
  private async detectThreatPatterns(event: SecurityEvent): Promise<void> {
    // Pattern 1: Brute force attacks
    if (event.category === 'authentication' && event.severity === 'high') {
      await this.detectBruteForceAttack(event.ip);
    }

    // Pattern 2: Distributed attacks
    if (event.category === 'rate_limit') {
      await this.detectDistributedAttack(event.type, event.ip);
    }

    // Pattern 3: Anomalous access patterns
    if (event.category === 'authorization') {
      await this.detectAnomalousAccess(event);
    }

    // Pattern 4: Data exfiltration attempts
    if (event.category === 'data_breach') {
      await this.detectDataExfiltration(event);
    }

    // Pattern 5: Webhook abuse
    if (event.endpoint?.includes('webhook')) {
      await this.detectWebhookAbuse(event);
    }
  }

  // Detect brute force attack patterns
  private async detectBruteForceAttack(ip?: string): Promise<void> {
    if (!ip) return;

    const recentFailures = this.eventHistory.filter(event =>
      event.ip === ip &&
      event.category === 'authentication' &&
      event.severity === 'high' &&
      (Date.now() - event.timestamp.getTime()) < 5 * 60 * 1000 // 5 minutes
    );

    if (recentFailures.length >= this.ALERT_THRESHOLDS.concurrentFailuresPerIp.threshold) {
      await this.triggerAlert({
        category: 'intrusion',
        severity: 'critical',
        type: 'brute_force_attack',
        description: `Brute force attack detected from IP: ${ip}`,
        ip,
        metadata: {
          failureCount: recentFailures.length,
          timeWindow: '5m',
          events: recentFailures.map(e => ({ id: e.id, timestamp: e.timestamp, type: e.type }))
        }
      });
    }
  }

  // Detect distributed attack patterns
  private async detectDistributedAttack(eventType: string, ip?: string): Promise<void> {
    const recentEvents = this.eventHistory.filter(event =>
      event.type === eventType &&
      event.category === 'rate_limit' &&
      (Date.now() - event.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
    );

    const uniqueIPs = new Set(recentEvents.map(e => e.ip).filter(Boolean));
    
    if (uniqueIPs.size >= 10) { // 10+ different IPs
      await this.triggerAlert({
        category: 'intrusion',
        severity: 'high',
        type: 'distributed_attack',
        description: `Distributed ${eventType} attack detected from ${uniqueIPs.size} unique IPs`,
        metadata: {
          uniqueIPCount: uniqueIPs.size,
          totalEvents: recentEvents.length,
          timeWindow: '1h'
        }
      });
    }
  }

  // Detect anomalous access patterns
  private async detectAnomalousAccess(event: SecurityEvent): Promise<void> {
    if (!event.userId) return;

    const userEvents = this.eventHistory.filter(e =>
      e.userId === event.userId &&
      e.category === 'authorization' &&
      (Date.now() - e.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
    );

    // Check for unusual access patterns
    const uniqueEndpoints = new Set(userEvents.map(e => e.endpoint).filter(Boolean));
    const failureRate = userEvents.filter(e => e.severity === 'high').length / userEvents.length;

    if (uniqueEndpoints.size >= 20 || failureRate > 0.5) {
      await this.triggerAlert({
        category: 'anomaly',
        severity: 'medium',
        type: 'unusual_access_pattern',
        description: `Unusual access pattern detected for user: ${event.userId}`,
        userId: event.userId,
        companyId: event.companyId,
        metadata: {
          uniqueEndpoints: uniqueEndpoints.size,
          failureRate: Math.round(failureRate * 100),
          totalEvents: userEvents.length
        }
      });
    }
  }

  // Detect potential data exfiltration
  private async detectDataExfiltration(event: SecurityEvent): Promise<void> {
    const recentDataEvents = this.eventHistory.filter(e =>
      e.category === 'data_breach' &&
      (e.userId === event.userId || e.ip === event.ip) &&
      (Date.now() - e.timestamp.getTime()) < 30 * 60 * 1000 // 30 minutes
    );

    if (recentDataEvents.length >= 3) {
      await this.triggerAlert({
        category: 'data_breach',
        severity: 'critical',
        type: 'potential_exfiltration',
        description: `Potential data exfiltration detected`,
        userId: event.userId,
        ip: event.ip,
        companyId: event.companyId,
        metadata: {
          eventCount: recentDataEvents.length,
          timeWindow: '30m'
        }
      });
    }
  }

  // Detect webhook abuse patterns
  private async detectWebhookAbuse(event: SecurityEvent): Promise<void> {
    const recentWebhookEvents = this.eventHistory.filter(e =>
      e.endpoint?.includes('webhook') &&
      (e.category === 'authentication' || e.category === 'rate_limit') &&
      (Date.now() - e.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
    );

    if (recentWebhookEvents.length >= this.ALERT_THRESHOLDS.webhookFailuresPerHour.threshold) {
      await this.triggerAlert({
        category: 'intrusion',
        severity: 'high',
        type: 'webhook_abuse',
        description: `Webhook abuse detected: ${recentWebhookEvents.length} failures in 1 hour`,
        metadata: {
          failureCount: recentWebhookEvents.length,
          timeWindow: '1h',
          uniqueIPs: new Set(recentWebhookEvents.map(e => e.ip).filter(Boolean)).size
        }
      });
    }
  }

  // Trigger security alert
  private async triggerAlert(alertData: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    const alert: SecurityEvent = {
      ...alertData,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      resolved: false
    };

    this.activeAlerts.set(alert.id, alert);

    // Log critical alert
    logger.security(`SECURITY ALERT: ${alert.description}`, {
      category: alert.category,
      severity: alert.severity,
      ip: alert.ip,
      userId: alert.userId,
      companyId: alert.companyId,
      operation: 'security_alert',
      alertId: alert.id,
      ...alert.metadata
    });

    // Store alert in database for persistence
    try {
      await sql.execute(`
        INSERT INTO security_alerts (
          id, category, severity, type, description, ip, user_agent, 
          user_id, company_id, endpoint, metadata, created_at, resolved
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), false)
      `, [
        alert.id,
        alert.category,
        alert.severity,
        alert.type,
        alert.description,
        alert.ip,
        alert.userAgent,
        alert.userId,
        alert.companyId,
        alert.endpoint,
        JSON.stringify(alert.metadata)
      ]);
    } catch (error) {
      logger.error('Failed to store security alert in database', {
        error: error instanceof Error ? error.message : String(error),
        alertId: alert.id
      });
    }
  }

  // Evaluate alert conditions based on thresholds
  private async evaluateAlertConditions(event: SecurityEvent): Promise<void> {
    const conditions = [
      this.checkAuthFailureThreshold(event),
      this.checkRateLimitThreshold(event),
      this.checkUnusualUserAgent(event),
      this.checkGeographicAnomalies(event),
      this.checkSessionInvalidationTriggers(event)
    ];

    await Promise.all(conditions);
  }

  // Check if session invalidation should be triggered based on security events
  private async checkSessionInvalidationTriggers(event: SecurityEvent): Promise<void> {
    // Check invalid authentication attempts (>5 failed logins per IP in 5 minutes)
    if (this.SESSION_INVALIDATION_THRESHOLDS.invalidAuthAttempts.enabled &&
        event.category === 'authentication' &&
        event.severity === 'high' &&
        event.ip) {

      const recentFailures = this.eventHistory.filter(e =>
        e.ip === event.ip &&
        e.category === 'authentication' &&
        e.severity === 'high' &&
        (Date.now() - e.timestamp.getTime()) < 5 * 60 * 1000 // 5 minutes
      );

      if (recentFailures.length >= this.SESSION_INVALIDATION_THRESHOLDS.invalidAuthAttempts.threshold) {
        // Find users associated with these failures and invalidate their sessions
        const affectedUsers = new Set(recentFailures.map(e => e.userId).filter(Boolean) as string[]);

        for (const userId of affectedUsers) {
          await this.invalidateUserSessions(userId, 'invalid_auth_attempts_threshold');
        }

        // Also invalidate based on IP
        await this.invalidateSessionsByIp(event.ip, 'invalid_auth_attempts_threshold');
      }
    }

    // Check rate limit violations (excessive requests)
    if (this.SESSION_INVALIDATION_THRESHOLDS.rateLimitViolations.enabled &&
        event.category === 'rate_limit' &&
        event.ip) {

      const recentViolations = this.eventHistory.filter(e =>
        e.ip === event.ip &&
        e.category === 'rate_limit' &&
        (Date.now() - e.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
      );

      if (recentViolations.length >= this.SESSION_INVALIDATION_THRESHOLDS.rateLimitViolations.threshold) {
        await this.invalidateSessionsByIp(event.ip, 'rate_limit_violations_threshold');
      }
    }

    // Check suspicious user agent patterns
    if (this.SESSION_INVALIDATION_THRESHOLDS.suspiciousUserAgents.enabled &&
        event.type === 'suspicious_user_agent' &&
        event.userId) {

      const recentSuspiciousAgents = this.eventHistory.filter(e =>
        e.type === 'suspicious_user_agent' &&
        (e.userId === event.userId || e.ip === event.ip) &&
        (Date.now() - e.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
      );

      if (recentSuspiciousAgents.length >= this.SESSION_INVALIDATION_THRESHOLDS.suspiciousUserAgents.threshold) {
        if (event.userId) {
          await this.invalidateUserSessions(event.userId, 'suspicious_user_agent_pattern');
        }
      }
    }

    // Check geographic anomalies (user logging in from unusual locations)
    if (this.SESSION_INVALIDATION_THRESHOLDS.geographicAnomalies.enabled &&
        event.type === 'geographic_anomaly' &&
        event.userId) {

      await this.invalidateUserSessions(event.userId, 'geographic_anomaly');
    }

    // Check critical security alerts from other monitoring systems
    if (this.SESSION_INVALIDATION_THRESHOLDS.criticalSecurityAlerts.enabled &&
        event.severity === 'critical') {

      if (event.userId) {
        await this.invalidateUserSessions(event.userId, 'critical_security_alert');
      }

      if (event.ip) {
        await this.invalidateSessionsByIp(event.ip, 'critical_security_alert');
      }
    }
  }

  // Check authentication failure thresholds
  private async checkAuthFailureThreshold(event: SecurityEvent): Promise<void> {
    if (event.category !== 'authentication' || !event.ip) return;

    const recentFailures = this.eventHistory.filter(e =>
      e.ip === event.ip &&
      e.category === 'authentication' &&
      e.severity === 'high' &&
      (Date.now() - e.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
    );

    if (recentFailures.length >= this.ALERT_THRESHOLDS.authFailuresPerIp.threshold) {
      await this.triggerAlert({
        category: 'intrusion',
        severity: 'high',
        type: 'auth_failure_threshold',
        description: `Authentication failure threshold exceeded for IP: ${event.ip}`,
        ip: event.ip,
        metadata: {
          failureCount: recentFailures.length,
          threshold: this.ALERT_THRESHOLDS.authFailuresPerIp.threshold,
          timeWindow: '1h'
        }
      });
    }
  }

  // Check rate limit violation thresholds
  private async checkRateLimitThreshold(event: SecurityEvent): Promise<void> {
    if (event.category !== 'rate_limit' || !event.ip) return;

    const recentViolations = this.eventHistory.filter(e =>
      e.ip === event.ip &&
      e.category === 'rate_limit' &&
      (Date.now() - e.timestamp.getTime()) < 60 * 60 * 1000 // 1 hour
    );

    if (recentViolations.length >= this.ALERT_THRESHOLDS.rateLimitViolationsPerIp.threshold) {
      await this.triggerAlert({
        category: 'intrusion',
        severity: 'medium',
        type: 'rate_limit_threshold',
        description: `Rate limit threshold exceeded for IP: ${event.ip}`,
        ip: event.ip,
        metadata: {
          violationCount: recentViolations.length,
          threshold: this.ALERT_THRESHOLDS.rateLimitViolationsPerIp.threshold,
          timeWindow: '1h'
        }
      });
    }
  }

  // Check for unusual user agents
  private async checkUnusualUserAgent(event: SecurityEvent): Promise<void> {
    if (!event.userAgent) return;

    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /scanner/i,
      /curl/i,
      /wget/i,
      /python/i,
      /perl/i,
      /java/i,
      /go-http/i
    ];

    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(event.userAgent!));

    if (isSuspicious) {
      await this.triggerAlert({
        category: 'anomaly',
        severity: 'low',
        type: 'suspicious_user_agent',
        description: `Suspicious user agent detected: ${event.userAgent}`,
        ip: event.ip,
        userAgent: event.userAgent,
        metadata: {
          userAgent: event.userAgent,
          matchedPattern: suspiciousPatterns.find(pattern => pattern.test(event.userAgent!))?.source
        }
      });
    }
  }

  // Check for geographic anomalies (simplified version)
  private async checkGeographicAnomalies(event: SecurityEvent): Promise<void> {
    if (!event.userId || !event.ip) return;

    const userLocations = this.eventHistory.filter(e =>
      e.userId === event.userId &&
      e.ip &&
      (Date.now() - e.timestamp.getTime()) < 24 * 60 * 60 * 1000 // 24 hours
    ).map(e => e.ip);

    const uniqueLocations = new Set(userLocations);

    // If user has more than 5 different IPs in 24 hours, flag as unusual
    if (uniqueLocations.size >= 5) {
      await this.triggerAlert({
        category: 'anomaly',
        severity: 'medium',
        type: 'geographic_anomaly',
        description: `Unusual geographic access pattern for user: ${event.userId}`,
        userId: event.userId,
        ip: event.ip,
        companyId: event.companyId,
        metadata: {
          uniqueIPCount: uniqueLocations.size,
          timeWindow: '24h',
          recentIPs: Array.from(uniqueLocations)
        }
      });
    }
  }

  // Update security metrics
  private updateSecurityMetrics(event: SecurityEvent): void {
    logger.metric('security.events.total', 1, {
      category: event.category,
      severity: event.severity,
      type: event.type
    });
  }

  // Get security metrics for dashboard
  async getSecurityMetrics(timeWindow: '1h' | '24h' | '7d' = '24h'): Promise<SecurityMetrics> {
    const now = new Date();
    let windowStart: Date;

    switch (timeWindow) {
      case '1h':
        windowStart = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '7d':
        windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default: // 24h
        windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const eventsInWindow = this.eventHistory.filter(event =>
      event.timestamp >= windowStart
    );

    const eventsByCategory = eventsInWindow.reduce((acc, event) => {
      acc[event.category] = (acc[event.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const eventsBySeverity = eventsInWindow.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topOffenders = Object.entries(
      eventsInWindow
        .filter(event => event.ip)
        .reduce((acc, event) => {
          const ip = event.ip!;
          acc[ip] = (acc[ip] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
    )
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, eventCount]) => ({ ip, eventCount }));

    const unusualPatterns = this.detectUnusualPatterns(eventsInWindow);
    const sessionInvalidations = this.getSessionInvalidationMetrics(timeWindow);

    return {
      timeWindow,
      totalEvents: eventsInWindow.length,
      eventsByCategory,
      eventsBySeverity,
      topOffenders,
      unusualPatterns,
      sessionInvalidations
    };
  }

  // Detect unusual patterns in events
  private detectUnusualPatterns(events: SecurityEvent[]): Array<{ pattern: string; count: number; description: string }> {
    const patterns: Array<{ pattern: string; count: number; description: string }> = [];

    // Pattern: Repeated failed operations from same IP
    const ipFailures = events
      .filter(e => e.ip && e.severity === 'high')
      .reduce((acc, event) => {
        const ip = event.ip!;
        acc[ip] = (acc[ip] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    Object.entries(ipFailures).forEach(([ip, count]) => {
      if (count >= 5) {
        patterns.push({
          pattern: 'repeated_failures',
          count,
          description: `${count} failed operations from IP ${ip}`
        });
      }
    });

    // Pattern: Unusual time-based activity
    const hourCounts = events.reduce((acc, event) => {
      const hour = event.timestamp.getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const nightHours = Object.entries(hourCounts)
      .filter(([hour]) => parseInt(hour) >= 22 || parseInt(hour) <= 6)
      .reduce((sum, [, count]) => sum + count, 0);

    if (nightHours > events.length * 0.3) {
      patterns.push({
        pattern: 'unusual_timing',
        count: nightHours,
        description: `${nightHours} events during unusual hours (10 PM - 6 AM)`
      });
    }

    return patterns;
  }

  // Get session invalidation metrics for dashboard
  private getSessionInvalidationMetrics(timeWindow: '1h' | '24h' | '7d'): SecurityMetrics['sessionInvalidations'] {
    const now = new Date();
    let windowStart: Date;

    switch (timeWindow) {
      case '1h':
        windowStart = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '7d':
        windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      default: // 24h
        windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const invalidationsInWindow = Array.from(this.sessionInvalidations.values())
      .filter(invalidation => invalidation.timestamp >= windowStart);

    const byReason = invalidationsInWindow.reduce((acc, invalidation) => {
      acc[invalidation.reason] = (acc[invalidation.reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byUser = invalidationsInWindow
      .filter(invalidation => invalidation.userId)
      .reduce((acc, invalidation) => {
        const userId = invalidation.userId!;
        acc[userId] = (acc[userId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return {
      total: invalidationsInWindow.length,
      byReason,
      byUser
    };
  }

  // Get active alerts
  getActiveAlerts(): SecurityEvent[] {
    return Array.from(this.activeAlerts.values());
  }

  // Resolve alert
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return;

    alert.resolved = true;
    this.activeAlerts.delete(alertId);

    // Update database
    try {
      await sql.execute(`
        UPDATE security_alerts
        SET resolved = true, resolved_at = NOW(), resolved_by = $1
        WHERE id = $2
      `, [resolvedBy, alertId]);
    } catch (error) {
      logger.error('Failed to resolve security alert in database', {
        error: error instanceof Error ? error.message : String(error),
        alertId
      });
    }

    logger.security(`Security alert resolved: ${alert.description}`, {
      category: 'security_management',
      severity: 'info',
      operation: 'alert_resolved',
      alertId,
      resolvedBy
    });
  }

  // Invalidate sessions for a user when security events are detected
  async invalidateUserSessions(userId: string, reason: string): Promise<void> {
    try {
      const authService = await getWhopAuthService();
      if (!authService) {
        logger.warn('Cannot invalidate sessions in Edge Runtime', { userId, reason });
        return;
      }
      await authService.revokeAllUserSessions(userId);

      // Track session invalidation
      this.sessionInvalidations.set(userId, {
        userId,
        reason,
        timestamp: new Date()
      });

      logger.security('User sessions invalidated due to security event', {
        category: 'security',
        severity: 'high',
        operation: 'session_invalidation',
        userId,
        reason,
        invalidationType: 'user_sessions'
      });

      logger.metric('security.session_invalidations', 1, {
        reason,
        invalidationType: 'user_sessions',
        userId
      });

    } catch (error) {
      logger.error('Failed to invalidate user sessions', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        reason
      });
    }
  }

  // Invalidate sessions for a specific IP address
  async invalidateSessionsByIp(ip: string, reason: string): Promise<void> {
    try {
      // Find all users with sessions from this IP and invalidate their sessions
      // This is a simplified approach - in practice, you'd need to track IP-to-session mappings
      const usersWithIpSessions = new Set<string>();

      // For now, we'll invalidate sessions based on recent events from this IP
      const recentEventsFromIp = this.eventHistory.filter(event =>
        event.ip === ip &&
        event.userId &&
        (Date.now() - event.timestamp.getTime()) < 24 * 60 * 60 * 1000 // Last 24 hours
      );

      for (const event of recentEventsFromIp) {
        if (event.userId) {
          usersWithIpSessions.add(event.userId);
        }
      }

      // Invalidate sessions for each user found
      for (const userId of usersWithIpSessions) {
        await this.invalidateUserSessions(userId, `${reason}_ip_based`);
      }

      // Track IP-based session invalidation
      this.sessionInvalidations.set(`ip_${ip}`, {
        ip,
        reason,
        timestamp: new Date()
      });

      logger.security('Sessions invalidated for IP address due to security event', {
        category: 'security',
        severity: 'high',
        operation: 'session_invalidation',
        ip,
        reason,
        invalidationType: 'ip_based',
        affectedUsersCount: usersWithIpSessions.size
      });

      logger.metric('security.session_invalidations', usersWithIpSessions.size, {
        reason,
        invalidationType: 'ip_based',
        ip
      });

    } catch (error) {
      logger.error('Failed to invalidate sessions by IP', {
        error: error instanceof Error ? error.message : String(error),
        ip,
        reason
      });
    }
  }
}

// Singleton instance
export const securityMonitor = new SecurityMonitor();