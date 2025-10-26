// Logger utility for Whop authentication and API operations

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

class Logger {
  private logLevel: LogLevel;
  private requestId?: string;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
  }

  setRequestId(requestId: string): void {
    this.requestId = requestId;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(entry: Partial<LogEntry>): string {
    const timestamp = entry.timestamp || new Date().toISOString();
    const requestId = entry.requestId || this.requestId || '';
    const userId = entry.userId || '';
    const companyId = entry.companyId || '';
    
    let prefix = '';
    if (requestId) prefix += `[${requestId}] `;
    if (userId) prefix += `[user:${userId}] `;
    if (companyId) prefix += `[company:${companyId}] `;
    
    return `${prefix}${entry.message}`;
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry: LogEntry = {
      level: LogLevel.DEBUG,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata
    };
    
    console.debug(this.formatMessage(entry));
  }

  info(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata
    };
    
    console.info(this.formatMessage(entry));
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry: LogEntry = {
      level: LogLevel.WARN,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata
    };
    
    console.warn(this.formatMessage(entry));
  }

  error(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry: LogEntry = {
      level: LogLevel.ERROR,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata
    };
    
    console.error(this.formatMessage(entry));
  }

  security(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.SECURITY)) return;
    
    const entry: LogEntry = {
      level: LogLevel.SECURITY,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata: {
        category: 'security',
        ...metadata
      }
    };
    
    console.warn(this.formatMessage(entry));
  }

  api(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata: {
        category: 'api',
        ...metadata
      }
    };
    
    console.info(this.formatMessage(entry));
  }

  metric(name: string, value: number, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message: `Metric: ${name}=${value}`,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata: {
        category: 'metrics',
        metricName: name,
        metricValue: value,
        ...metadata
      }
    };
    
    console.info(this.formatMessage(entry));
  }

  /**
   * Reminder logging
   */
  reminder(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata: {
        category: 'reminder',
        ...metadata
      }
    };
    
    console.info(this.formatMessage(entry));
  }

  /**
   * Scheduler logging
   */
  scheduler(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata: {
        category: 'scheduler',
        ...metadata
      }
    };
    
    console.info(this.formatMessage(entry));
  }

  /**
   * Webhook logging
   */
  webhook(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry: LogEntry = {
      level: LogLevel.INFO,
      message,
      timestamp: new Date().toISOString(),
      requestId: this.requestId,
      metadata: {
        category: 'webhook',
        ...metadata
      }
    };
    
    console.info(this.formatMessage(entry));
  }
}

export const logger = new Logger();

export default logger;