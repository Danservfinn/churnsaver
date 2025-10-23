// Integration of error handling system with existing monitoring and security systems
// Provides seamless integration with metrics, alerting, and security monitoring

import { AppError, ErrorCategory, ErrorSeverity, ErrorCode } from '@/lib/apiResponse';
import { CategorizedError } from '@/lib/errorCategorization';
import { logger } from '@/lib/logger';
import { securityMonitor } from '@/lib/security-monitoring';
import { metrics, Alert } from '@/lib/metrics';
import { alerting } from '@/lib/alerting';
import { MonitoringContext, RecoveryContext } from '@/lib/types/observability';

// Monitoring integration configuration
export interface MonitoringIntegrationConfig {
  enableMetrics: boolean;
  enableAlerting: boolean;
  enableSecurityMonitoring: boolean;
  enablePerformanceTracking: boolean;
  metricsPrefix: string;
  alertThresholds: AlertThresholds;
  alertDedupeEnabled: boolean;
  windowedSecurityRateEnabled: boolean;
  securityReportDedupeEnabled: boolean;
}

// Alert thresholds configuration
export interface AlertThresholds {
  errorRate: number; // Percentage
  criticalErrorRate: number; // Percentage
  responseTime: number; // Milliseconds
  securityEventRate: number; // Per minute
  circuitBreakerOpenRate: number; // Percentage
}

// Alert descriptors
interface AlertDescriptor {
  severity: (data: any, config: AlertThresholds) => 'P0' | 'P1' | 'P2' | 'P3';
  title: (data: any) => string;
  message: (data: any) => string;
}

const ALERTS: Record<string, AlertDescriptor> = {
  high_error_rate: {
    severity: (data, config) => data.currentRate >= config.criticalErrorRate ? 'P0' : 'P1',
    title: (data) => `High Error Rate: ${data.currentRate.toFixed(2)}%`,
    message: (data) => `Error rate has exceeded ${data.threshold}% threshold. Current rate: ${data.currentRate.toFixed(2)}%. Category: ${data.errorCategory}, Endpoint: ${data.endpoint}`
  },
  critical_error_rate: {
    severity: () => 'P0',
    title: (data) => `CRITICAL Error Rate: ${data.currentRate.toFixed(2)}%`,
    message: (data) => `CRITICAL: Error rate has exceeded ${data.threshold}% threshold. Current rate: ${data.currentRate.toFixed(2)}%. Immediate attention required.`
  },
  error_pattern: {
    severity: (data) => data.severity === ErrorSeverity.CRITICAL ? 'P0' :
                        data.severity === ErrorSeverity.HIGH ? 'P1' : 'P2',
    title: (data) => `Error Pattern Detected: ${data.errorCode}`,
    message: (data) => `Error pattern detected: ${data.errorCode} (${data.errorCategory}) - ${data.message}. Endpoint: ${data.endpoint}`
  },
  slow_response: {
    severity: (data, config) => data.responseTime >= config.responseTime * 2 ? 'P1' : 'P2',
    title: (data) => `Slow Response Time: ${data.responseTime}ms`,
    message: (data) => `Slow response time detected: ${data.responseTime}ms (threshold: ${data.threshold}ms). Endpoint: ${data.endpoint}`
  }
};

// Default configuration
const DEFAULT_CONFIG: MonitoringIntegrationConfig = {
  enableMetrics: true,
  enableAlerting: true,
  enableSecurityMonitoring: true,
  enablePerformanceTracking: true,
  metricsPrefix: 'churnsaver',
  alertThresholds: {
    errorRate: 5, // 5% error rate triggers alert
    criticalErrorRate: 10, // 10% triggers critical alert
    responseTime: 5000, // 5 seconds
    securityEventRate: 10, // 10 per minute
    circuitBreakerOpenRate: 20 // 20% of circuit breakers open
  },
  alertDedupeEnabled: false,
  windowedSecurityRateEnabled: false,
  securityReportDedupeEnabled: false
};

// Error metrics data
export interface ErrorMetrics {
  timestamp: string;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByCode: Record<ErrorCode, number>;
  averageResponseTime: number;
  securityEvents: number;
  circuitBreakerStatus: Record<string, string>;
}

// Monitoring integration class
export class ErrorMonitoringIntegration {
  private config: MonitoringIntegrationConfig;
  private categoryCounts: Map<ErrorCategory, number> = new Map();
  private severityCounts: Map<ErrorSeverity, number> = new Map();
  private codeCounts: Map<ErrorCode, number> = new Map();
  private responseTimeSum: number = 0;
  private responseTimeCount: number = 0;
  private securityEventCounts: Map<string, number> = new Map();
  private lastAlertTime: Map<string, number> = new Map();
  private metricsWindow: number = 300000; // 5 minutes

  // Helper to get safe endpoint from context
  private getSafeEndpoint(context: MonitoringContext): string {
    return context.endpoint || 'unknown';
  }

  // Helper to get safe method from context
  private getSafeMethod(context: MonitoringContext): string {
    return context.method || 'unknown';
  }

  // Helper to get metrics prefix
  private getMetricsPrefix(): string {
    return this.config.metricsPrefix;
  }

  constructor(config: Partial<MonitoringIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeMetrics();
  }

  // Initialize metrics collection
  private initializeMetrics(): void {
    if (!this.config.enableMetrics) return;

    // Initialize error counters
    Object.values(ErrorCategory).forEach(category => {
      this.categoryCounts.set(category, 0);
    });
    Object.values(ErrorSeverity).forEach(severity => {
      this.severityCounts.set(severity, 0);
    });
    Object.values(ErrorCode).forEach(code => {
      this.codeCounts.set(code, 0);
    });

    // Initialize security event counters
    Object.values(ErrorSeverity).forEach(severity => {
      const key = `${this.config.metricsPrefix}.security.${severity}`;
      this.securityEventCounts.set(key, 0);
    });
  }

  // Process error for monitoring
  async processError(
    categorizedError: CategorizedError,
    context: MonitoringContext = {}
  ): Promise<void> {
    const { categorizedError: error } = categorizedError;
    const timestamp = new Date().toISOString();

    // Update error counters
    this.updateErrorCounts(error);

    // Record metrics
    if (this.config.enableMetrics) {
      this.recordErrorMetrics(error, context);
    }

    // Check for alert conditions
    if (this.config.enableAlerting) {
      await this.checkAlertConditions(error, context);
    }

    // Security monitoring
    if (this.config.enableSecurityMonitoring && this.isSecurityRelevant(error)) {
      await this.processSecurityAlert(error, categorizedError.context, context);
    }

    // Performance tracking
    if (this.config.enablePerformanceTracking && context.responseTime) {
      this.trackPerformance(error, context.responseTime, context);
    }
  }

  // Update error counts
  private updateErrorCounts(error: AppError): void {
    this.categoryCounts.set(error.category, (this.categoryCounts.get(error.category) || 0) + 1);
    this.severityCounts.set(error.severity, (this.severityCounts.get(error.severity) || 0) + 1);
    this.codeCounts.set(error.code, (this.codeCounts.get(error.code) || 0) + 1);
  }

  // Record error metrics
  private recordErrorMetrics(error: AppError, context: MonitoringContext): void {
    const metricsPrefix = this.getMetricsPrefix();
    const safeEndpoint = this.getSafeEndpoint(context);
    const safeMethod = this.getSafeMethod(context);

    // Record to metrics system
    metrics.recordCounter(`${metricsPrefix}.errors.total`, 1, {
      category: error.category,
      severity: error.severity,
      code: error.code,
      endpoint: safeEndpoint,
      method: safeMethod
    });

    // Record to logger
    logger.metric('error.occurred', 1, {
      error_category: error.category,
      error_severity: error.severity,
      error_code: error.code,
      endpoint: safeEndpoint,
      retryable: error.retryable.toString()
    });
  }

  // Check alert conditions
  private async checkAlertConditions(error: AppError, context: MonitoringContext): Promise<void> {
    const currentMetrics = this.getCurrentMetrics();

    // Check error rate threshold
    if (currentMetrics.errorRate >= this.config.alertThresholds.errorRate) {
      await this.triggerAlert('high_error_rate', {
        currentRate: currentMetrics.errorRate,
        threshold: this.config.alertThresholds.errorRate,
        errorCategory: error.category,
        endpoint: context.endpoint
      });
    }

    // Check critical error rate - with deduplication if enabled
    if (currentMetrics.errorRate >= this.config.alertThresholds.criticalErrorRate) {
      if (this.config.alertDedupeEnabled) {
        // Only emit critical alert if high_error_rate was not already triggered
        const highErrorTriggered = currentMetrics.errorRate >= this.config.alertThresholds.errorRate;
        if (!highErrorTriggered) {
          await this.triggerAlert('critical_error_rate', {
            currentRate: currentMetrics.errorRate,
            threshold: this.config.alertThresholds.criticalErrorRate,
            errorCategory: error.category,
            endpoint: context.endpoint
          });
        }
      } else {
        // Default behavior - emit both alerts
        await this.triggerAlert('critical_error_rate', {
          currentRate: currentMetrics.errorRate,
          threshold: this.config.alertThresholds.criticalErrorRate,
          errorCategory: error.category,
          endpoint: context.endpoint
        });
      }
    }

    // Check response time
    if (context.responseTime && context.responseTime >= this.config.alertThresholds.responseTime) {
      await this.triggerAlert('slow_response', {
        responseTime: context.responseTime,
        threshold: this.config.alertThresholds.responseTime,
        endpoint: context.endpoint
      });
    }

    // Check for specific error patterns
    if (this.shouldAlertForError(error)) {
      await this.triggerAlert('error_pattern', {
        errorCode: error.code,
        errorCategory: error.category,
        severity: error.severity,
        message: error.message,
        endpoint: context.endpoint
      });
    }
  }

  // Process security alerts
  private async processSecurityAlert(
    error: AppError,
    errorContext: any,
    context: MonitoringContext
  ): Promise<void> {
    // Check for deduplication if enabled
    if (this.config.securityReportDedupeEnabled && errorContext.securityReported) {
      return; // Skip reporting if already reported
    }

    try {
      await securityMonitor.processSecurityEvent({
        category: error.category === ErrorCategory.SECURITY ? 'intrusion' : 'anomaly',
        severity: error.severity === ErrorSeverity.CRITICAL ? 'critical' :
                  error.severity === ErrorSeverity.HIGH ? 'high' : 'medium',
        type: error.code.toLowerCase(),
        description: error.message,
        ip: errorContext.ip || context.ip,
        userAgent: errorContext.userAgent || context.userAgent,
        endpoint: context.endpoint,
        userId: context.userId,
        companyId: context.companyId,
        metadata: {
          requestId: errorContext.requestId,
          errorCode: error.code,
          errorCategory: error.category,
          method: context.method,
          timestamp: new Date().toISOString()
        }
      });

      // Update security event counts
      const severityKey = `${this.config.metricsPrefix}.security.${error.severity}`;
      this.securityEventCounts.set(
        severityKey,
        (this.securityEventCounts.get(severityKey) || 0) + 1
      );

      // Mark as reported if deduplication is enabled
      if (this.config.securityReportDedupeEnabled) {
        errorContext.securityReported = true;
      }

    } catch (securityError) {
      logger.error('Failed to process security alert', {
        error: securityError instanceof Error ? securityError.message : String(securityError),
        originalError: error.message
      });
    }
  }

  // Track performance metrics
  private trackPerformance(error: AppError, responseTime: number, context: MonitoringContext): void {
    this.responseTimeSum += responseTime;
    this.responseTimeCount += 1;

    const metricsPrefix = this.getMetricsPrefix();
    const safeEndpoint = this.getSafeEndpoint(context);
    const safeMethod = this.getSafeMethod(context);

    // Record performance metrics
    metrics.recordHistogram(`${metricsPrefix}.response_time`, responseTime, {
      endpoint: safeEndpoint,
      method: safeMethod,
      error_category: error.category
    });

    // Record slow responses
    if (responseTime > this.config.alertThresholds.responseTime) {
      metrics.recordCounter(`${metricsPrefix}.slow_responses`, 1, {
        endpoint: safeEndpoint
      });
    }
  }

  // Determine if error should trigger alert
  private shouldAlertForError(error: AppError): boolean {
    // Always alert for critical and high severity errors
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      return true;
    }

    // Alert for security errors
    if (error.category === ErrorCategory.SECURITY) {
      return true;
    }

    // Alert for database and external service errors
    if (error.category === ErrorCategory.DATABASE || error.category === ErrorCategory.EXTERNAL_SERVICE) {
      return true;
    }

    return false;
  }

  // Determine if error is security relevant
  private isSecurityRelevant(error: AppError): boolean {
    return error.category === ErrorCategory.SECURITY ||
           error.category === ErrorCategory.AUTHENTICATION ||
           error.category === ErrorCategory.AUTHORIZATION ||
           error.code === ErrorCode.SECURITY_VIOLATION ||
           error.code === ErrorCode.SUSPICIOUS_ACTIVITY;
  }

  // Trigger alert
  private async triggerAlert(alertType: string, data: any): Promise<void> {
    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(alertType) || 0;
    
    // Rate limit alerts (don't spam)
    if (now - lastAlert < 60000) { // 1 minute cooldown
      return;
    }

    this.lastAlertTime.set(alertType, now);

    try {
      // Create a custom alert for the error handling system
      const alert: Alert = {
        id: `error_${alertType}_${Date.now()}`,
        ruleName: this.getAlertTitle(alertType, data),
        metricName: `error.${alertType}`,
        currentValue: data.currentRate || 1,
        threshold: this.config.alertThresholds.errorRate,
        severity: this.getAlertSeverity(alertType, data) as 'P0' | 'P1' | 'P2' | 'P3',
        message: this.getAlertMessage(alertType, data),
        timestamp: new Date(),
        resolved: false
      };

      await alerting.processAlert(alert);

      logger.warn('Alert triggered', {
        alertType,
        severity: this.getAlertSeverity(alertType, data),
        data
      });

    } catch (alertError) {
      logger.error('Failed to send alert', {
        alertType,
        error: alertError instanceof Error ? alertError.message : String(alertError)
      });
    }
  }

  // Get alert severity
  private getAlertSeverity(alertType: string, data: any): 'P0' | 'P1' | 'P2' | 'P3' {
    const descriptor = ALERTS[alertType];
    return descriptor ? descriptor.severity(data, this.config.alertThresholds) : 'P2';
  }

  // Get alert title
  private getAlertTitle(alertType: string, data: any): string {
    const descriptor = ALERTS[alertType];
    return descriptor ? descriptor.title(data) : 'Alert';
  }

  // Get alert message
  private getAlertMessage(alertType: string, data: any): string {
    const descriptor = ALERTS[alertType];
    return descriptor ? descriptor.message(data) : `Alert triggered: ${alertType}`;
  }

  // Get current metrics
  getCurrentMetrics(): ErrorMetrics {
    const totalErrors = Array.from(this.categoryCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalRequests = totalErrors + 100; // Estimate (would be tracked separately)
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    const errorsByCategory: Record<ErrorCategory, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;
    const errorsByCode: Record<ErrorCode, number> = {} as any;

    // Aggregate counts directly from the maps
    this.categoryCounts.forEach((count, category) => {
      errorsByCategory[category] = count;
    });
    this.severityCounts.forEach((count, severity) => {
      errorsBySeverity[severity] = count;
    });
    this.codeCounts.forEach((count, code) => {
      errorsByCode[code] = count;
    });

    const averageResponseTime = this.responseTimeCount > 0 ? this.responseTimeSum / this.responseTimeCount : 0;

    const securityEvents = Array.from(this.securityEventCounts.values())
      .reduce((sum, count) => sum + count, 0);

    return {
      timestamp: new Date().toISOString(),
      totalRequests,
      totalErrors,
      errorRate,
      errorsByCategory,
      errorsBySeverity,
      errorsByCode,
      averageResponseTime,
      securityEvents,
      circuitBreakerStatus: {} // Would be populated by circuit breaker monitoring
    };
  }

  // Reset metrics
  resetMetrics(): void {
    this.categoryCounts.clear();
    this.severityCounts.clear();
    this.codeCounts.clear();
    this.responseTimeSum = 0;
    this.responseTimeCount = 0;
    this.securityEventCounts.clear();
    this.lastAlertTime.clear();
  }

  // Get health status
  getHealthStatus(): {
    healthy: boolean;
    metrics: ErrorMetrics;
    alerts: string[];
    recommendations: string[];
  } {
    const metrics = this.getCurrentMetrics();
    const alerts: string[] = [];
    const recommendations: string[] = [];

    // Check error rate
    if (metrics.errorRate >= this.config.alertThresholds.criticalErrorRate) {
      alerts.push('Critical error rate detected');
      recommendations.push('Investigate root cause immediately');
    } else if (metrics.errorRate >= this.config.alertThresholds.errorRate) {
      alerts.push('High error rate detected');
      recommendations.push('Monitor closely and investigate if persists');
    }

    // Check response time
    if (metrics.averageResponseTime >= this.config.alertThresholds.responseTime) {
      alerts.push('Slow response times detected');
      recommendations.push('Check for performance bottlenecks');
    }

    // Check security events - with windowed calculation if enabled
    let securityEventRate = metrics.securityEvents;
    if (this.config.windowedSecurityRateEnabled) {
      // Calculate events per minute over metricsWindow
      const now = Date.now();
      const windowStart = now - this.metricsWindow;
      let windowedSecurityEvents = 0;

      // Count security events within the window (simplified - in real implementation would track timestamps)
      // For now, use a simple approximation based on recent events
      this.securityEventCounts.forEach((count, key) => {
        if (key.includes('security')) {
          windowedSecurityEvents += count;
        }
      });

      securityEventRate = (windowedSecurityEvents / (this.metricsWindow / 60000)); // events per minute
    }

    if (securityEventRate >= this.config.alertThresholds.securityEventRate) {
      alerts.push('High security event rate');
      recommendations.push('Review security logs and investigate suspicious activity');
    }

    const healthy = alerts.length === 0;

    return {
      healthy,
      metrics,
      alerts,
      recommendations
    };
  }
}

// Default monitoring integration instance
export const errorMonitoringIntegration = new ErrorMonitoringIntegration();

// Export convenience functions
export function processErrorForMonitoring(
  categorizedError: CategorizedError,
  context?: any
): Promise<void> {
  return errorMonitoringIntegration.processError(categorizedError, context);
}

export function getCurrentErrorMetrics(): ErrorMetrics {
  return errorMonitoringIntegration.getCurrentMetrics();
}

export function getErrorMonitoringHealth(): {
  healthy: boolean;
  metrics: ErrorMetrics;
  alerts: string[];
  recommendations: string[];
} {
  return errorMonitoringIntegration.getHealthStatus();
}

export function resetErrorMonitoringMetrics(): void {
  errorMonitoringIntegration.resetMetrics();
}