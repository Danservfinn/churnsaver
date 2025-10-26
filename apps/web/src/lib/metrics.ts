// Simple metrics collection system for monitoring
// Provides in-memory metrics collection with optional export to external systems

import { logger } from './logger';

export interface MetricValue {
  value: number;
  timestamp: Date;
  labels?: Record<string, string>;
}

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  description: string;
  unit: string;
  values: MetricValue[];
  aggregation?: {
    sum: number;
    count: number;
    min: number;
    max: number;
    avg: number;
  };
}

export interface AlertRule {
  name: string;
  metricName: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  duration: number; // seconds
  enabled: boolean;
  lastTriggered?: Date;
}

export interface Alert {
  id: string;
  ruleName: string;
  metricName: string;
  currentValue: number;
  threshold: number;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

class MetricsService {
  private metrics: Map<string, Metric> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private maxValues = 1000; // Keep last 1000 values per metric

  constructor() {
    this.initializeDefaultMetrics();
    this.startAlertEvaluation();
  }

  private initializeDefaultMetrics() {
    // HTTP Metrics
    this.createMetric('http_requests_total', 'counter', 'Total HTTP requests', 'requests');
    this.createMetric('http_request_duration_ms', 'histogram', 'HTTP request duration', 'ms');

    // Web Vitals Metrics
    this.createMetric('web_vitals_cls', 'gauge', 'Cumulative Layout Shift', '');
    this.createMetric('web_vitals_fid', 'gauge', 'First Input Delay', 'ms');
    this.createMetric('web_vitals_fcp', 'gauge', 'First Contentful Paint', 'ms');
    this.createMetric('web_vitals_lcp', 'gauge', 'Largest Contentful Paint', 'ms');
    this.createMetric('web_vitals_ttfb', 'gauge', 'Time to First Byte', 'ms');

    // Webhook Metrics
    this.createMetric('webhook_events_processed_total', 'counter', 'Webhook events processed', 'events');
    this.createMetric('webhook_processing_duration_ms', 'histogram', 'Webhook processing duration', 'ms');
    this.createMetric('webhook_success_rate', 'gauge', 'Webhook success rate', '%');

    // Database Metrics
    this.createMetric('database_connections_active', 'gauge', 'Active database connections', 'connections');
    this.createMetric('database_query_duration_ms', 'histogram', 'Database query duration', 'ms');
    this.createMetric('database_slow_queries_total', 'counter', 'Slow database queries', 'queries');

    // Business Metrics
    this.createMetric('recovery_cases_created_total', 'counter', 'Recovery cases created', 'cases');
    this.createMetric('reminders_sent_total', 'counter', 'Reminders sent', 'reminders');
    this.createMetric('reminder_success_rate', 'gauge', 'Reminder delivery success rate', '%');
    this.createMetric('active_companies', 'gauge', 'Active companies', 'companies');

    // CTR and Recovery Metrics
    this.createMetric('nudge_actions_total', 'counter', 'Nudge actions tracked', 'actions');
    this.createMetric('nudge_ctr_rate', 'gauge', 'Nudge click-through rate', '%');
    this.createMetric('time_to_recovery_ms', 'histogram', 'Time to recovery', 'ms');
    this.createMetric('avg_time_to_recovery_ms', 'gauge', 'Average time to recovery', 'ms');

    // Job Queue Metrics
    this.createMetric('job_queue_depth', 'gauge', 'Job queue depth', 'jobs');
    this.createMetric('job_processing_duration_ms', 'histogram', 'Job processing duration', 'ms');

    // External Service Metrics
    this.createMetric('external_api_calls_total', 'counter', 'External API calls', 'calls');
    this.createMetric('external_api_success_rate', 'gauge', 'External API success rate', '%');
    this.createMetric('external_api_duration_ms', 'histogram', 'External API duration', 'ms');

    // Initialize default alert rules
    this.initializeDefaultAlertRules();
  }

  private initializeDefaultAlertRules() {
    // P0 Alerts
    this.createAlertRule({
      name: 'application_down',
      metricName: 'http_requests_total',
      condition: 'lt',
      threshold: 1,
      severity: 'P0',
      duration: 300, // 5 minutes
      enabled: true
    });

    this.createAlertRule({
      name: 'webhook_processing_stopped',
      metricName: 'webhook_events_processed_total',
      condition: 'lt',
      threshold: 1,
      severity: 'P0',
      duration: 600, // 10 minutes
      enabled: true
    });

    // P1 Alerts
    // Performance Alerts - Web Vitals
    this.createAlertRule({
      name: 'poor_lcp',
      metricName: 'web_vitals_lcp',
      condition: 'gt',
      threshold: 2500, // 2.5 seconds
      severity: 'P1',
      duration: 300,
      enabled: true
    });

    this.createAlertRule({
      name: 'poor_cls',
      metricName: 'web_vitals_cls',
      condition: 'gt',
      threshold: 0.1, // 0.1 CLS score
      severity: 'P1',
      duration: 300,
      enabled: true
    });

    this.createAlertRule({
      name: 'high_error_rate',
      metricName: 'webhook_success_rate',
      condition: 'lt',
      threshold: 90,
      severity: 'P1',
      duration: 300, // 5 minutes
      enabled: true
    });

    this.createAlertRule({
      name: 'slow_response_time',
      metricName: 'http_request_duration_ms',
      condition: 'gt',
      threshold: 10000, // 10 seconds
      severity: 'P1',
      duration: 300,
      enabled: true
    });

    this.createAlertRule({
      name: 'database_connection_exhaustion',
      metricName: 'database_connections_active',
      condition: 'gt',
      threshold: 80,
      severity: 'P1',
      duration: 60,
      enabled: true
    });

    // Business Metrics Alerts
    this.createAlertRule({
      name: 'low_recovery_rate',
      metricName: 'reminder_success_rate',
      condition: 'lt',
      threshold: 20, // 20% success rate
      severity: 'P1',
      duration: 3600, // 1 hour
      enabled: true
    });

    this.createAlertRule({
      name: 'long_recovery_time',
      metricName: 'avg_time_to_recovery_ms',
      condition: 'gt',
      threshold: 604800000, // 7 days in milliseconds
      severity: 'P1',
      duration: 3600,
      enabled: true
    });

    // P2 Alerts
    this.createAlertRule({
      name: 'queue_backlog',
      metricName: 'job_queue_depth',
      condition: 'gt',
      threshold: 1000,
      severity: 'P2',
      duration: 300,
      enabled: true
    });

    this.createAlertRule({
      name: 'external_service_degradation',
      metricName: 'external_api_success_rate',
      condition: 'lt',
      threshold: 95,
      severity: 'P2',
      duration: 300,
      enabled: true
    });
  }

  createMetric(name: string, type: 'counter' | 'gauge' | 'histogram', description: string, unit: string) {
    this.metrics.set(name, {
      name,
      type,
      description,
      unit,
      values: []
    });
  }

  recordCounter(name: string, value: number = 1, labels?: Record<string, string>) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') {
      logger.warn('Invalid counter metric', { name, type: metric?.type });
      return;
    }

    const existingValue = metric.values.length > 0 ? metric.values[metric.values.length - 1].value : 0;
    const newValue = existingValue + value;

    this.addMetricValue(metric, newValue, labels);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') {
      logger.warn('Invalid gauge metric', { name, type: metric?.type });
      return;
    }

    this.addMetricValue(metric, value, labels);
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') {
      logger.warn('Invalid histogram metric', { name, type: metric?.type });
      return;
    }

    this.addMetricValue(metric, value, labels);
  }

  private addMetricValue(metric: Metric, value: number, labels?: Record<string, string>) {
    const metricValue: MetricValue = {
      value,
      timestamp: new Date(),
      labels
    };

    metric.values.push(metricValue);

    // Keep only the last N values
    if (metric.values.length > this.maxValues) {
      metric.values = metric.values.slice(-this.maxValues);
    }

    // Update aggregation
    this.updateAggregation(metric);

    // Check alerts
    this.checkAlerts(metric.name, value);
  }

  private updateAggregation(metric: Metric) {
    if (metric.values.length === 0) return;

    const values = metric.values.map(v => v.value);
    metric.aggregation = {
      sum: values.reduce((a, b) => a + b, 0),
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length
    };
  }

  createAlertRule(rule: AlertRule) {
    this.alertRules.set(rule.name, rule);
    logger.info('Alert rule created', { ruleName: rule.name, metricName: rule.metricName });
  }

  private checkAlerts(metricName: string, currentValue: number) {
    for (const [ruleName, rule] of this.alertRules) {
      if (rule.metricName !== metricName || !rule.enabled) continue;

      const shouldAlert = this.evaluateCondition(currentValue, rule.condition, rule.threshold);
      const alertId = `${ruleName}_${metricName}`;
      const existingAlert = this.activeAlerts.get(alertId);

      if (shouldAlert && !existingAlert) {
        // New alert
        const alert: Alert = {
          id: alertId,
          ruleName: rule.name,
          metricName,
          currentValue,
          threshold: rule.threshold,
          severity: rule.severity,
          message: this.generateAlertMessage(rule, currentValue),
          timestamp: new Date(),
          resolved: false
        };

        this.activeAlerts.set(alertId, alert);
        this.triggerAlert(alert);
      } else if (!shouldAlert && existingAlert && !existingAlert.resolved) {
        // Resolve alert
        existingAlert.resolved = true;
        existingAlert.resolvedAt = new Date();
        this.resolveAlert(existingAlert);
      }
    }
  }

  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  private generateAlertMessage(rule: AlertRule, currentValue: number): string {
    const operator = this.getOperatorSymbol(rule.condition);
    return `Alert: ${rule.name} - ${rule.metricName} is ${currentValue}${this.getMetricUnit(rule.metricName)}, threshold: ${operator}${rule.threshold}${this.getMetricUnit(rule.metricName)}`;
  }

  private getOperatorSymbol(condition: string): string {
    switch (condition) {
      case 'gt': return '>';
      case 'gte': return '>=';
      case 'lt': return '<';
      case 'lte': return '<=';
      case 'eq': return '=';
      default: return '?';
    }
  }

  private getMetricUnit(metricName: string): string {
    const metric = this.metrics.get(metricName);
    return metric ? ` ${metric.unit}` : '';
  }

  private triggerAlert(alert: Alert) {
    logger.error('Alert triggered', {
      alertId: alert.id,
      ruleName: alert.ruleName,
      metricName: alert.metricName,
      severity: alert.severity,
      currentValue: alert.currentValue,
      threshold: alert.threshold,
      message: alert.message
    });

    // Here you would integrate with external alerting systems
    // For now, we'll just log the alert
    this.sendNotification(alert);
  }

  private resolveAlert(alert: Alert) {
    logger.info('Alert resolved', {
      alertId: alert.id,
      ruleName: alert.ruleName,
      metricName: alert.metricName,
      duration: alert.resolvedAt ? alert.resolvedAt.getTime() - alert.timestamp.getTime() : 0
    });

    this.sendNotification(alert);
  }

  private sendNotification(alert: Alert) {
    // Placeholder for notification integration
    // This would integrate with Slack, PagerDuty, etc.
    logger.info('Alert notification', {
      type: alert.resolved ? 'resolved' : 'triggered',
      alertId: alert.id,
      severity: alert.severity,
      message: alert.message
    });
  }

  private startAlertEvaluation() {
    // Evaluate alerts every 30 seconds
    setInterval(() => {
      this.evaluateAllAlerts();
    }, 30000);
  }

  private evaluateAllAlerts() {
    for (const [metricName, metric] of this.metrics) {
      if (metric.values.length === 0) continue;

      const latestValue = metric.values[metric.values.length - 1].value;
      this.checkAlerts(metricName, latestValue);
    }
  }

  // Public API methods
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  updateAlertRule(name: string, updates: Partial<AlertRule>) {
    const rule = this.alertRules.get(name);
    if (rule) {
      Object.assign(rule, updates);
      logger.info('Alert rule updated', { ruleName: name, updates });
    }
  }

  // HTTP request tracking
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.recordCounter('http_requests_total', 1, { method, route, status_code: statusCode.toString() });
    this.recordHistogram('http_request_duration_ms', duration, { method, route });
  }

  // Webhook tracking
  recordWebhookEvent(eventType: string, success: boolean, duration: number) {
    this.recordCounter('webhook_events_processed_total', 1, { event_type: eventType, success: success.toString() });
    this.recordHistogram('webhook_processing_duration_ms', duration, { event_type: eventType });
    
    // Update success rate
    this.updateSuccessRate('webhook_success_rate', 'webhook_events_processed_total', { event_type: eventType });
  }

  // Database tracking
  recordDatabaseQuery(operation: string, table: string, duration: number, success: boolean) {
    this.recordHistogram('database_query_duration_ms', duration, { operation, table, success: success.toString() });
    
    if (duration > 2000) {
      this.recordCounter('database_slow_queries_total', 1, { operation, table });
    }
  }

  // CTR tracking for nudges
  trackNudgeCTR(nudgeId: string, userId: string, action: 'clicked' | 'dismissed') {
    this.recordCounter('nudge_actions_total', 1, {
      nudge_id: nudgeId,
      user_id: userId,
      action: action,
      type: 'ctr_tracking'
    });

    // Calculate CTR rate
    this.updateCTRRate(nudgeId);
  }

  // Time to recovery tracking
  recordTimeToRecovery(caseId: string, companyId: string, timeToRecovery: number, successful: boolean) {
    this.recordHistogram('time_to_recovery_ms', timeToRecovery, {
      case_id: caseId,
      company_id: companyId,
      successful: successful.toString()
    });

    // Update average time to recovery
    this.updateAverageTimeToRecovery(companyId);
  }

  // Business metrics
  recordRecoveryCase(companyId: string, caseType: string) {
    this.recordCounter('recovery_cases_created_total', 1, { company_id: companyId, case_type: caseType });
  }

  recordReminder(channel: string, success: boolean, duration: number) {
    this.recordCounter('reminders_sent_total', 1, { channel, success: success.toString() });
    this.recordHistogram('reminder_delivery_duration_ms', duration, { channel });
    
    // Update success rate
    this.updateSuccessRate('reminder_success_rate', 'reminders_sent_total', { channel });
  }

  // Job queue tracking
  setJobQueueDepth(queueName: string, depth: number) {
    this.setGauge('job_queue_depth', depth, { queue_name: queueName });
  }

  recordJobProcessing(queueName: string, duration: number, success: boolean) {
    this.recordHistogram('job_processing_duration_ms', duration, { queue_name: queueName, success: success.toString() });
  }

  // External API tracking
  recordExternalApiCall(service: string, endpoint: string, statusCode: number, duration: number) {
    this.recordCounter('external_api_calls_total', 1, { service, endpoint, status_code: statusCode.toString() });
    this.recordHistogram('external_api_duration_ms', duration, { service, endpoint });

    // Update success rate
    this.updateSuccessRate('external_api_success_rate', 'external_api_calls_total', { service });
  }

  // Web Vitals tracking
  recordWebVitals(metric: string, value: number, labels?: Record<string, string>) {
    const metricName = `web_vitals_${metric.toLowerCase()}`;
    this.setGauge(metricName, value, labels);

    logger.info('Web Vitals recorded', { metric, value, labels });
  }

  private updateSuccessRate(rateMetricName: string, totalMetricName: string, labels: Record<string, string>) {
    const totalMetric = this.metrics.get(totalMetricName);
    if (!totalMetric) return;

    // Calculate success rate from recent values
    const recentValues = totalMetric.values.slice(-100); // Last 100 values
    const successCount = recentValues.filter(v => v.labels?.success === 'true').length;
    const totalCount = recentValues.length;

    if (totalCount > 0) {
      const successRate = (successCount / totalCount) * 100;
      this.setGauge(rateMetricName, successRate, labels);
    }
  }

  private updateCTRRate(nudgeId: string) {
    const nudgeMetric = this.metrics.get('nudge_actions_total');
    if (!nudgeMetric) return;

    // Calculate CTR from recent nudge actions
    const recentValues = nudgeMetric.values.slice(-100); // Last 100 values
    const clickCount = recentValues.filter(v =>
      v.labels?.nudge_id === nudgeId && v.labels?.action === 'clicked'
    ).length;
    const totalCount = recentValues.filter(v => v.labels?.nudge_id === nudgeId).length;

    if (totalCount > 0) {
      const ctr = (clickCount / totalCount) * 100;
      this.setGauge('nudge_ctr_rate', ctr, { nudge_id: nudgeId });
    }
  }

  private updateAverageTimeToRecovery(companyId: string) {
    const recoveryMetric = this.metrics.get('time_to_recovery_ms');
    if (!recoveryMetric) return;

    // Calculate average time to recovery for the company
    const companyValues = recoveryMetric.values.filter(v =>
      v.labels?.company_id === companyId && v.labels?.successful === 'true'
    );

    if (companyValues.length > 0) {
      const avgTime = companyValues.reduce((sum, v) => sum + v.value, 0) / companyValues.length;
      this.setGauge('avg_time_to_recovery_ms', avgTime, { company_id: companyId });
    }
  }
}

// Singleton instance
export const metrics = new MetricsService();
export default metrics;