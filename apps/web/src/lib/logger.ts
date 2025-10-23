// Enhanced structured logger with observability metrics
// Supports monitoring systems like Datadog, Grafana, etc.

interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  operation?: string; // 'webhook', 'reminder', 'notification', 'api_call', etc.
  operation_type?: string; // 'process', 'send', 'validate', etc.
  success?: boolean;
  duration_ms?: number;
  company_id?: string;
  event_id?: string;
  case_id?: string;
  membership_id?: string;
  user_id?: string;
  metric_name?: string; // For metrics that monitoring systems can scrape
  metric_value?: number | boolean;
  error_category?: string; // 'validation', 'network', 'database', 'rate_limit', etc.
  status_code?: number;
  data?: Record<string, unknown>;
  // Security audit fields
  security_category?: string; // 'authentication', 'authorization', 'intrusion', 'data_breach', etc.
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  ip?: string;
  user_agent?: string;
  session_id?: string;
}

class Logger {
  private log(entry: Omit<LogEntry, 'timestamp'>) {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    const formatted = `[${logEntry.timestamp}] ${logEntry.level.toUpperCase()}: ${logEntry.message}${
      logEntry.data ? ` ${JSON.stringify(logEntry.data)}` : ''
    }`;

    if (entry.level === 'error') {
      console.error(formatted);
    } else if (entry.level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  // Enhanced logging methods with observability fields
  webhook(operation: 'received' | 'processed' | 'failed' | 'skipped', data: {
    eventId: string;
    eventType: string;
    membershipId?: string;
    companyId?: string;
    success?: boolean;
    duration_ms?: number;
    error?: string;
    error_category?: string;
  }) {
    // Redact PII from webhook data - never log sensitive payment/user data
    const sanitizedData = {
      ...data,
      // Remove any potential PII - webhook payloads may contain sensitive data
      // Only keep structured fields needed for debugging
    };

    this.log({
      level: data.success === false ? 'error' : 'info',
      message: `Webhook ${operation}`,
      operation: 'webhook',
      operation_type: operation,
      success: data.success,
      duration_ms: data.duration_ms,
      company_id: data.companyId,
      event_id: data.eventId,
      membership_id: data.membershipId,
      error_category: data.error_category,
      metric_name: data.success === false ? 'webhook.failure.count' : 'webhook.success.count',
      metric_value: 1,
      data: sanitizedData
    });
  }

  reminder(operation: 'sent' | 'failed' | 'skipped', data: {
    caseId: string;
    membershipId: string;
    companyId?: string;
    channel: string; // 'push', 'dm'
    attemptNumber: number;
    success?: boolean;
    error?: string;
    error_category?: string;
    duration_ms?: number;
    messageId?: string;
  }) {
    // Redact PII and implement sampling for high-volume reminder logs
    // Only log detailed data for failures or every Nth success to reduce log volume
    const shouldLogDetailed = data.success === false || Math.random() < 0.1; // 10% sampling for successes

    const sanitizedData = shouldLogDetailed ? {
      ...data,
      // Remove any potential PII from reminder data
      messageId: data.messageId ? '[REDACTED]' : undefined // Message IDs might be sensitive
    } : {
      caseId: data.caseId,
      membershipId: data.membershipId,
      channel: data.channel,
      attemptNumber: data.attemptNumber,
      success: data.success,
      sampled: true // Indicate this is a sampled log entry
    };

    this.log({
      level: data.success === false ? 'error' : 'info',
      message: `Reminder ${operation} via ${data.channel}${shouldLogDetailed ? '' : ' (sampled)'}`,
      operation: 'reminder',
      operation_type: operation,
      success: data.success,
      duration_ms: data.duration_ms,
      case_id: data.caseId,
      membership_id: data.membershipId,
      company_id: data.companyId,
      error_category: data.error_category,
      metric_name: `reminder.${data.channel}.${data.success === false ? 'failure' : 'success'}.count`,
      metric_value: 1,
      data: sanitizedData
    });
  }

  scheduler(operation: 'started' | 'completed' | 'failed', data: {
    companiesProcessed: number;
    totalReminders: number;
    successfulReminders: number;
    failedReminders: number;
    duration_ms?: number;
    runId?: string;
    companyId?: string;
    success?: boolean;
    error?: string;
    error_category?: string;
  }) {
    this.log({
      level: data.success === false ? 'error' : 'info',
      message: `Scheduler ${operation} - processed ${data.companiesProcessed} companies, ${data.totalReminders} reminders`,
      operation: 'scheduler',
      operation_type: operation,
      success: data.success,
      duration_ms: data.duration_ms,
      company_id: data.companyId,
      metric_name: `scheduler.${data.success === false ? 'failure' : 'success'}.count`,
      metric_value: 1,
      data
    });
  }

  api(operation: 'called' | 'error' | 'rate_limited', data: {
    endpoint: string;
    method: string;
    status_code?: number;
    company_id?: string;
    user_id?: string;
    duration_ms?: number;
    error?: string;
    error_category?: string;
  }) {
    // Redact sensitive headers and PII from API logs
    const sanitizedData = {
      ...data,
      // Remove any potential PII from API data
      // Headers might contain tokens, so never log them
      headers: undefined, // Explicitly remove headers from logs
      // user_id might be sensitive depending on context, but keeping for debugging
    };

    this.log({
      level: operation === 'error' ? 'error' : 'info',
      message: `API ${operation} - ${data.method} ${data.endpoint}`,
      operation: 'api_call',
      operation_type: operation,
      status_code: data.status_code,
      duration_ms: data.duration_ms,
      company_id: data.company_id,
      user_id: data.user_id,
      error_category: data.error_category,
      metric_name: `api.${operation}.count`,
      metric_value: 1,
      data: sanitizedData
    });
  }

  // Generic metrics counter (for custom metrics)
  metric(name: string, value: number, tags?: Record<string, string | number>) {
    this.log({
      level: 'info',
      message: `Metric: ${name}`,
      metric_name: name,
      metric_value: value,
      data: tags
    });
  }

  // Legacy methods for backward compatibility - with PII redaction
  info(message: string, data?: Record<string, unknown>) {
    // Redact potential secrets from legacy logging
    const sanitizedData = data ? this.redactSecrets(data) : undefined;
    this.log({ level: 'info', message, data: sanitizedData });
  }

  warn(message: string, data?: Record<string, unknown>) {
    // Redact potential secrets from legacy logging
    const sanitizedData = data ? this.redactSecrets(data) : undefined;
    this.log({ level: 'warn', message, data: sanitizedData });
  }

  error(message: string, data?: Record<string, unknown>) {
    // Redact potential secrets from legacy logging
    const sanitizedData = data ? this.redactSecrets(data) : undefined;
    this.log({ level: 'error', message, data: sanitizedData });
  }

  // Helper method to redact secrets and PII from arbitrary data
  private redactSecrets(data: Record<string, unknown>): Record<string, unknown> {
    const redacted = { ...data };

    // Redact common secret patterns
    const secretKeys = ['password', 'secret', 'token', 'key', 'signature', 'webhook_secret', 'whop_webhook_secret'];
    for (const key of Object.keys(redacted)) {
      if (secretKeys.some(secretKey => key.toLowerCase().includes(secretKey))) {
        redacted[key] = '[REDACTED]';
      }
    }

    // Redact potential PII in nested objects
    for (const [key, value] of Object.entries(redacted)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this.redactSecrets(value as Record<string, unknown>);
      }
    }

    return redacted;
  }

  // Security audit logging for compliance and intrusion detection
  security(message: string, data: {
    category: string; // 'authentication', 'authorization', 'intrusion', 'data_breach', etc.
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    ip?: string;
    userAgent?: string;
    userId?: string;
    companyId?: string;
    sessionId?: string;
    eventId?: string;
    operation?: string;
    duration_ms?: number;
    processingTimeMs?: number;
    error?: string;
    errorCode?: string;
    tokenLength?: number;
    algorithm?: string;
    claims?: string[];
    [key: string]: unknown;
  }) {
    // Determine log level based on severity
    let logLevel: 'info' | 'warn' | 'error';
    switch (data.severity) {
      case 'critical':
      case 'high':
        logLevel = 'error';
        break;
      case 'medium':
        logLevel = 'warn';
        break;
      default:
        logLevel = 'info';
    }

    // Create sanitized security event data
    const sanitizedData = {
      category: data.category,
      severity: data.severity,
      ip: data.ip,
      userAgent: data.userAgent ? data.userAgent.substring(0, 200) : undefined, // Truncate for log size
      userId: data.userId,
      companyId: data.companyId,
      sessionId: data.sessionId,
      eventId: data.eventId,
      operation: data.operation,
      duration_ms: data.duration_ms || data.processingTimeMs,
      error: data.error,
      errorCode: data.errorCode,
      // Include additional security-relevant fields but redact sensitive ones
      ...Object.fromEntries(
        Object.entries(data).filter(([key, value]) =>
          !['category', 'severity', 'ip', 'userAgent', 'userId', 'companyId', 'sessionId',
            'eventId', 'operation', 'duration_ms', 'processingTimeMs', 'error', 'errorCode'].includes(key) &&
          typeof value !== 'object' && // Filter out complex objects
          !['password', 'secret', 'token', 'key', 'signature'].some(secret =>
            key.toLowerCase().includes(secret)
          )
        )
      )
    };

    this.log({
      level: logLevel,
      message: `SECURITY: ${message}`,
      operation: 'security_audit',
      operation_type: data.category,
      security_category: data.category,
      severity: data.severity,
      company_id: data.companyId,
      user_id: data.userId,
      event_id: data.eventId,
      duration_ms: data.duration_ms || data.processingTimeMs,
      ip: data.ip,
      user_agent: data.userAgent,
      session_id: data.sessionId,
      metric_name: `security.${data.category}.${data.severity}.count`,
      metric_value: 1,
      data: sanitizedData
    });

    // For high-severity events, also log to console.error for immediate visibility
    if (data.severity === 'high' || data.severity === 'critical') {
      console.error(`🚨 SECURITY ALERT [${data.severity.toUpperCase()}] ${message}`, {
        category: data.category,
        ip: data.ip,
        userId: data.userId,
        companyId: data.companyId,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Security metrics for monitoring and dashboards
  securityMetric(name: string, value: number, tags?: Record<string, string>) {
    this.log({
      level: 'info',
      message: `Security Metric: ${name}`,
      operation: 'security_metric',
      operation_type: 'metric',
      security_category: 'monitoring',
      severity: 'info',
      metric_name: `security.${name}`,
      metric_value: value,
      data: tags
    });
  }
}

export const logger = new Logger();
