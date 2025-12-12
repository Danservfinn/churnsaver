// Logger utility for Whop authentication and API operations
import { sendToLogDrain } from './log-drain';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SECURITY = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  companyId?: string;
  metadata?: Record<string, any>;
}

const REDACT_KEYS = [
  'email',
  'password',
  'token',
  'secret',
  'authorization',
  'auth',
  'payload',
  'body'
] as const;

function redactValue(key: string, value: unknown): unknown {
  const lowerKey = key.toLowerCase();
  const shouldRedactKey = REDACT_KEYS.some((sensitive) => lowerKey.includes(sensitive));

  if (shouldRedactKey) {
    return '[REDACTED]';
  }

  if (typeof value === 'string' && value.length > 200) {
    return '[REDACTED]';
  }

  return value;
}

function redactObject(input: unknown, depth = 0): unknown {
  if (depth > 4) {
    return '[TRUNCATED]';
  }

  if (Array.isArray(input)) {
    return input.map((v) => redactObject(v, depth + 1));
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(([k, v]) => [
      k,
      redactObject(redactValue(k, v), depth + 1)
    ]);
    return Object.fromEntries(entries);
  }

  return input;
}

class Logger {
  private logLevel: LogLevel;
  private requestId?: string;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = this.getEnvLogLevel() ?? logLevel;
  }

  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  private getEnvLogLevel(): LogLevel | undefined {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (!envLevel) return undefined;

    const map: Record<string, LogLevel> = {
      DEBUG: LogLevel.DEBUG,
      INFO: LogLevel.INFO,
      WARN: LogLevel.WARN,
      ERROR: LogLevel.ERROR,
      SECURITY: LogLevel.SECURITY
    };

    return map[envLevel];
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private emit(level: LogLevel, levelLabel: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const payload = {
      level: levelLabel,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      ...(metadata || {})
    };

    // Redact sensitive data before serialization and sending to log drain
    const redactedPayload = redactObject(payload) as Record<string, unknown>;
    const serialized = JSON.stringify(redactedPayload);

    // Fire-and-forget delivery to optional log drain endpoint (with redacted payload)
    void sendToLogDrain(redactedPayload);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(serialized);
        break;
      case LogLevel.INFO:
        console.info(serialized);
        break;
      case LogLevel.WARN:
      case LogLevel.SECURITY:
        console.warn(serialized);
        break;
      case LogLevel.ERROR:
      default:
        console.error(serialized);
        break;
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.DEBUG, 'debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.INFO, 'info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.WARN, 'warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.ERROR, 'error', message, metadata);
  }

  security(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.SECURITY, 'security', message, { category: 'security', ...(metadata || {}) });
  }

  api(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.INFO, 'info', message, { category: 'api', ...(metadata || {}) });
  }

  metric(name: string, value: number, metadata?: Record<string, any>): void {
    this.emit(LogLevel.INFO, 'info', `Metric: ${name}=${value}`, {
      category: 'metrics',
      metricName: name,
      metricValue: value,
      ...(metadata || {})
    });
  }

  /**
   * Reminder logging
   */
  reminder(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.INFO, 'info', message, { category: 'reminder', ...(metadata || {}) });
  }

  /**
   * Scheduler logging
   */
  scheduler(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.INFO, 'info', message, { category: 'scheduler', ...(metadata || {}) });
  }

  /**
   * Webhook logging
   */
  webhook(message: string, metadata?: Record<string, any>): void {
    this.emit(LogLevel.INFO, 'info', message, { category: 'webhook', ...(metadata || {}) });
  }
}

export const logger = new Logger();

export default logger;