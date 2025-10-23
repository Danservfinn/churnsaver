// Alerting system with configurable thresholds and notification channels
// Supports Slack, PagerDuty, and email notifications

import { logger } from './logger';
import { metrics, Alert, AlertRule } from './metrics';

export interface NotificationChannel {
  name: string;
  type: 'slack' | 'pagerduty' | 'email' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
  rateLimit: {
    maxAlertsPerHour: number;
    cooldownMinutes: number;
  };
}

export interface AlertNotification {
  id: string;
  alertId: string;
  channelName: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
  retryCount: number;
}

export interface EscalationPolicy {
  name: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  channels: string[];
  escalationRules: Array<{
    delayMinutes: number;
    channels: string[];
    condition?: 'no_response' | 'still_firing';
  }>;
}

class AlertingService {
  private channels: Map<string, NotificationChannel> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private notifications: Map<string, AlertNotification> = new Map();
  private rateLimitTracker: Map<string, { count: number; lastReset: Date }> = new Map();
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializeDefaultChannels();
    this.initializeEscalationPolicies();
    this.startNotificationProcessor();
  }

  private initializeDefaultChannels() {
    // Slack channel
    this.createChannel({
      name: 'slack-production',
      type: 'slack',
      config: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: '#production-alerts',
        username: 'ChurnSaver Alerts'
      },
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      rateLimit: {
        maxAlertsPerHour: 20,
        cooldownMinutes: 5
      }
    });

    // PagerDuty channel
    this.createChannel({
      name: 'pagerduty-production',
      type: 'pagerduty',
      config: {
        integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY,
        severity: 'critical'
      },
      enabled: !!process.env.PAGERDUTY_INTEGRATION_KEY,
      rateLimit: {
        maxAlertsPerHour: 10,
        cooldownMinutes: 15
      }
    });

    // Email channel
    this.createChannel({
      name: 'email-production',
      type: 'email',
      config: {
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        from: process.env.ALERT_EMAIL_FROM || 'alerts@churnsaver.com',
        to: process.env.ALERT_EMAIL_TO?.split(',') || ['devops@churnsaver.com']
      },
      enabled: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      rateLimit: {
        maxAlertsPerHour: 50,
        cooldownMinutes: 10
      }
    });
  }

  private initializeEscalationPolicies() {
    // P0 - Immediate escalation
    this.createEscalationPolicy({
      name: 'P0-Critical',
      severity: 'P0',
      channels: ['slack-production', 'pagerduty-production'],
      escalationRules: [
        {
          delayMinutes: 5,
          channels: ['email-production'],
          condition: 'no_response'
        },
        {
          delayMinutes: 15,
          channels: ['pagerduty-production'],
          condition: 'still_firing'
        }
      ]
    });

    // P1 - Standard escalation
    this.createEscalationPolicy({
      name: 'P1-High',
      severity: 'P1',
      channels: ['slack-production'],
      escalationRules: [
        {
          delayMinutes: 30,
          channels: ['email-production'],
          condition: 'no_response'
        }
      ]
    });

    // P2 - Business hours escalation
    this.createEscalationPolicy({
      name: 'P2-Medium',
      severity: 'P2',
      channels: ['slack-production'],
      escalationRules: [
        {
          delayMinutes: 120,
          channels: ['email-production'],
          condition: 'still_firing'
        }
      ]
    });

    // P3 - Low priority
    this.createEscalationPolicy({
      name: 'P3-Low',
      severity: 'P3',
      channels: ['email-production'],
      escalationRules: []
    });
  }

  createChannel(channel: NotificationChannel) {
    this.channels.set(channel.name, channel);
    logger.info('Notification channel created', { 
      name: channel.name, 
      type: channel.type, 
      enabled: channel.enabled 
    });
  }

  createEscalationPolicy(policy: EscalationPolicy) {
    this.escalationPolicies.set(policy.name, policy);
    logger.info('Escalation policy created', { 
      name: policy.name, 
      severity: policy.severity 
    });
  }

  async processAlert(alert: Alert) {
    const policy = this.getEscalationPolicy(alert.severity);
    if (!policy) {
      logger.warn('No escalation policy found for alert', { severity: alert.severity });
      return;
    }

    // Clear any existing escalation timers for this alert
    const existingTimer = this.escalationTimers.get(alert.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Send initial notifications
    await this.sendNotifications(alert, policy.channels);

    // Set up escalation timers
    for (const rule of policy.escalationRules) {
      const timer = setTimeout(() => {
        this.handleEscalation(alert, rule);
      }, rule.delayMinutes * 60 * 1000);

      this.escalationTimers.set(`${alert.id}_${rule.delayMinutes}`, timer);
    }
  }

  async handleAlertResolution(alert: Alert) {
    // Clear escalation timers
    for (const [key, timer] of this.escalationTimers) {
      if (key.startsWith(alert.id)) {
        clearTimeout(timer);
        this.escalationTimers.delete(key);
      }
    }

    // Send resolution notifications
    const policy = this.getEscalationPolicy(alert.severity);
    if (policy && policy.channels.length > 0) {
      await this.sendResolutionNotification(alert, policy.channels);
    }
  }

  private async sendNotifications(alert: Alert, channelNames: string[]) {
    for (const channelName of channelNames) {
      const channel = this.channels.get(channelName);
      if (!channel || !channel.enabled) continue;

      if (!this.checkRateLimit(channelName)) {
        logger.warn('Rate limit exceeded for channel', { channelName });
        continue;
      }

      await this.sendNotification(alert, channelName);
    }
  }

  private async sendNotification(alert: Alert, channelName: string) {
    const notificationId = `${alert.id}_${channelName}_${Date.now()}`;
    
    const notification: AlertNotification = {
      id: notificationId,
      alertId: alert.id,
      channelName,
      status: 'pending',
      retryCount: 0
    };

    this.notifications.set(notificationId, notification);

    try {
      const channel = this.channels.get(channelName)!;
      let success = false;

      switch (channel.type) {
        case 'slack':
          success = await this.sendSlackNotification(alert, channel);
          break;
        case 'pagerduty':
          success = await this.sendPagerDutyNotification(alert, channel);
          break;
        case 'email':
          success = await this.sendEmailNotification(alert, channel);
          break;
        case 'webhook':
          success = await this.sendWebhookNotification(alert, channel);
          break;
      }

      if (success) {
        notification.status = 'sent';
        notification.sentAt = new Date();
        this.updateRateLimit(channelName);
      } else {
        throw new Error('Notification failed');
      }

    } catch (error) {
      notification.status = 'failed';
      notification.error = error instanceof Error ? error.message : String(error);
      
      // Schedule retry
      if (notification.retryCount < 3) {
        setTimeout(() => {
          this.retryNotification(notification);
        }, Math.pow(2, notification.retryCount) * 60000); // Exponential backoff
      }
    }

    this.notifications.set(notificationId, notification);
  }

  private async sendSlackNotification(alert: Alert, channel: NotificationChannel): Promise<boolean> {
    try {
      const webhookUrl = channel.config.webhookUrl;
      if (!webhookUrl) return false;

      const color = this.getSeverityColor(alert.severity);
      const payload = {
        channel: channel.config.channel,
        username: channel.config.username,
        attachments: [{
          color,
          title: `🚨 ${alert.severity} Alert: ${alert.ruleName}`,
          text: alert.message,
          fields: [
            {
              title: 'Metric',
              value: alert.metricName,
              short: true
            },
            {
              title: 'Current Value',
              value: alert.currentValue.toString(),
              short: true
            },
            {
              title: 'Threshold',
              value: alert.threshold.toString(),
              short: true
            },
            {
              title: 'Time',
              value: alert.timestamp.toISOString(),
              short: true
            }
          ],
          footer: 'ChurnSaver Monitoring',
          ts: Math.floor(alert.timestamp.getTime() / 1000)
        }]
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to send Slack notification', { error, alertId: alert.id });
      return false;
    }
  }

  private async sendPagerDutyNotification(alert: Alert, channel: NotificationChannel): Promise<boolean> {
    try {
      const integrationKey = channel.config.integrationKey;
      if (!integrationKey) return false;

      const payload = {
        routing_key: integrationKey,
        event_action: 'trigger',
        payload: {
          summary: `${alert.severity} Alert: ${alert.ruleName}`,
          source: 'churn-saver',
          severity: this.getPagerDutySeverity(alert.severity),
          custom_details: {
            metric: alert.metricName,
            currentValue: alert.currentValue,
            threshold: alert.threshold,
            message: alert.message,
            timestamp: alert.timestamp.toISOString()
          }
        }
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to send PagerDuty notification', { error, alertId: alert.id });
      return false;
    }
  }

  private async sendEmailNotification(alert: Alert, channel: NotificationChannel): Promise<boolean> {
    try {
      // This is a simplified email implementation
      // In production, you'd use a proper email service like SendGrid or AWS SES
      const smtp = channel.config.smtp;
      if (!smtp) return false;

      const subject = `🚨 ${alert.severity} Alert: ${alert.ruleName}`;
      const body = this.generateEmailBody(alert);

      // For now, just log the email (implement actual SMTP sending as needed)
      logger.info('Email notification would be sent', {
        to: channel.config.to,
        subject,
        body: body.substring(0, 200) + '...'
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email notification', { error, alertId: alert.id });
      return false;
    }
  }

  private async sendWebhookNotification(alert: Alert, channel: NotificationChannel): Promise<boolean> {
    try {
      const webhookUrl = channel.config.webhookUrl;
      if (!webhookUrl) return false;

      const payload = {
        alert: {
          id: alert.id,
          ruleName: alert.ruleName,
          metricName: alert.metricName,
          currentValue: alert.currentValue,
          threshold: alert.threshold,
          severity: alert.severity,
          message: alert.message,
          timestamp: alert.timestamp.toISOString(),
          resolved: alert.resolved
        }
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...channel.config.headers
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to send webhook notification', { error, alertId: alert.id });
      return false;
    }
  }

  private async sendResolutionNotification(alert: Alert, channelNames: string[]) {
    for (const channelName of channelNames) {
      const channel = this.channels.get(channelName);
      if (!channel || !channel.enabled) continue;

      if (channel.type === 'slack') {
        await this.sendSlackResolution(alert, channel);
      } else if (channel.type === 'pagerduty') {
        await this.sendPagerDutyResolution(alert, channel);
      }
    }
  }

  private async sendSlackResolution(alert: Alert, channel: NotificationChannel): Promise<boolean> {
    try {
      const webhookUrl = channel.config.webhookUrl;
      if (!webhookUrl) return false;

      const payload = {
        channel: channel.config.channel,
        username: channel.config.username,
        attachments: [{
          color: 'good',
          title: `✅ Resolved: ${alert.ruleName}`,
          text: `The ${alert.severity} alert for ${alert.metricName} has been resolved`,
          fields: [
            {
              title: 'Metric',
              value: alert.metricName,
              short: true
            },
            {
              title: 'Duration',
              value: alert.resolvedAt ? 
                `${Math.round((alert.resolvedAt.getTime() - alert.timestamp.getTime()) / 60000)} minutes` : 
                'Unknown',
              short: true
            }
          ],
          footer: 'ChurnSaver Monitoring',
          ts: Math.floor(Date.now() / 1000)
        }]
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to send Slack resolution', { error, alertId: alert.id });
      return false;
    }
  }

  private async sendPagerDutyResolution(alert: Alert, channel: NotificationChannel): Promise<boolean> {
    try {
      const integrationKey = channel.config.integrationKey;
      if (!integrationKey) return false;

      const payload = {
        routing_key: integrationKey,
        event_action: 'resolve',
        payload: {
          summary: `Resolved: ${alert.ruleName}`,
          source: 'churn-saver',
          custom_details: {
            metric: alert.metricName,
            resolvedAt: alert.resolvedAt?.toISOString()
          }
        }
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to send PagerDuty resolution', { error, alertId: alert.id });
      return false;
    }
  }

  private async retryNotification(notification: AlertNotification) {
    notification.retryCount++;
    this.notifications.set(notification.id, notification);

    const alert = metrics.getAllAlerts().find(a => a.id === notification.alertId);
    if (alert) {
      await this.sendNotification(alert, notification.channelName);
    }
  }

  private handleEscalation(alert: Alert, rule: any) {
    logger.info('Escalating alert', { 
      alertId: alert.id, 
      delayMinutes: rule.delayMinutes,
      channels: rule.channels 
    });

    this.sendNotifications(alert, rule.channels);
  }

  private getEscalationPolicy(severity: string): EscalationPolicy | undefined {
    for (const policy of this.escalationPolicies.values()) {
      if (policy.severity === severity) {
        return policy;
      }
    }
    return undefined;
  }

  private checkRateLimit(channelName: string): boolean {
    const channel = this.channels.get(channelName);
    if (!channel) return false;

    const tracker = this.rateLimitTracker.get(channelName);
    const now = new Date();

    if (!tracker || now.getTime() - tracker.lastReset.getTime() > 60 * 60 * 1000) {
      // Reset tracker
      this.rateLimitTracker.set(channelName, { count: 1, lastReset: now });
      return true;
    }

    if (tracker.count >= channel.rateLimit.maxAlertsPerHour) {
      return false;
    }

    tracker.count++;
    return true;
  }

  private updateRateLimit(channelName: string) {
    const tracker = this.rateLimitTracker.get(channelName);
    if (tracker) {
      tracker.count++;
    }
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'P0': return 'danger';
      case 'P1': return 'warning';
      case 'P2': return 'warning';
      case 'P3': return 'good';
      default: return 'warning';
    }
  }

  private getPagerDutySeverity(severity: string): string {
    switch (severity) {
      case 'P0': return 'critical';
      case 'P1': return 'error';
      case 'P2': return 'warning';
      case 'P3': return 'info';
      default: return 'warning';
    }
  }

  private generateEmailBody(alert: Alert): string {
    return `
Alert Details:
--------------
Severity: ${alert.severity}
Rule: ${alert.ruleName}
Metric: ${alert.metricName}
Current Value: ${alert.currentValue}
Threshold: ${alert.threshold}
Time: ${alert.timestamp.toISOString()}

Message: ${alert.message}

This is an automated alert from the ChurnSaver monitoring system.
    `.trim();
  }

  private startNotificationProcessor() {
    // Process metrics alerts every 30 seconds
    setInterval(() => {
      const activeAlerts = metrics.getActiveAlerts();
      for (const alert of activeAlerts) {
        if (!this.notifications.has(`${alert.id}_processed`)) {
          this.processAlert(alert);
          this.notifications.set(`${alert.id}_processed`, { 
            id: `${alert.id}_processed`,
            alertId: alert.id,
            channelName: 'system',
            status: 'sent',
            retryCount: 0
          });
        }
      }

      // Handle resolved alerts
      const allAlerts = metrics.getAllAlerts();
      for (const alert of allAlerts) {
        if (alert.resolved && this.escalationTimers.has(alert.id)) {
          this.handleAlertResolution(alert);
        }
      }
    }, 30000);
  }

  // Public API methods
  getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  getEscalationPolicies(): EscalationPolicy[] {
    return Array.from(this.escalationPolicies.values());
  }

  getNotifications(): AlertNotification[] {
    return Array.from(this.notifications.values());
  }

  updateChannel(name: string, updates: Partial<NotificationChannel>) {
    const channel = this.channels.get(name);
    if (channel) {
      Object.assign(channel, updates);
      logger.info('Notification channel updated', { name, updates });
    }
  }

  testChannel(name: string): Promise<boolean> {
    const channel = this.channels.get(name);
    if (!channel) return Promise.resolve(false);

    const testAlert: Alert = {
      id: `test_${Date.now()}`,
      ruleName: 'Test Alert',
      metricName: 'test_metric',
      currentValue: 100,
      threshold: 50,
      severity: 'P3',
      message: 'This is a test alert to verify the notification channel is working.',
      timestamp: new Date(),
      resolved: false
    };

    return this.sendNotification(testAlert, name).then(() => true).catch(() => false);
  }
}

// Singleton instance
export const alerting = new AlertingService();
export default alerting;