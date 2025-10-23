// Integration of monitoring systems with existing application components
// Connects metrics, alerting, and logging with the existing codebase

import { logger } from './logger';
import { metrics } from './metrics';
import { alerting } from './alerting';

// Initialize monitoring systems
export function initializeMonitoring() {
  logger.info('Initializing monitoring systems');
  
  try {
    // Metrics system is already initialized as singleton
    // Alerting system is already initialized as singleton
    
    logger.info('Monitoring systems initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize monitoring systems', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Enhanced logger with metrics integration
const monitoringLogger = {
  // Webhook logging with metrics
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
    // Log using existing logger
    logger.webhook(operation, data);
    
    // Record metrics
    if (operation === 'processed') {
      metrics.recordWebhookEvent(data.eventType, data.success || false, data.duration_ms || 0);
    }
  },

  // Reminder logging with metrics
  reminder(operation: 'sent' | 'failed' | 'skipped', data: {
    caseId: string;
    membershipId: string;
    companyId?: string;
    channel: string;
    attemptNumber: number;
    success?: boolean;
    error?: string;
    error_category?: string;
    duration_ms?: number;
    messageId?: string;
  }) {
    // Log using existing logger
    logger.reminder(operation, data);
    
    // Record metrics
    if (operation === 'sent' || operation === 'failed') {
      metrics.recordReminder(data.channel, data.success || false, data.duration_ms || 0);
    }
  },

  // Scheduler logging with metrics
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
    // Log using existing logger
    logger.scheduler(operation, data);
    
    // Record metrics
    if (operation === 'completed' || operation === 'failed') {
      metrics.recordJobProcessing('scheduler', data.duration_ms || 0, data.success || false);
    }
  },

  // API logging with metrics
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
    // Log using existing logger
    logger.api(operation, data);
    
    // Record metrics
    if (data.status_code && data.duration_ms) {
      metrics.recordHttpRequest(data.method, data.endpoint, data.status_code, data.duration_ms);
    }
  },

  // Database logging with metrics
  database(operation: string, table: string, duration: number, success: boolean, error?: string) {
    // Log database operation
    logger.info(`Database ${operation}`, {
      operation,
      table,
      duration_ms: duration,
      success,
      error
    });
    
    // Record metrics
    metrics.recordDatabaseQuery(operation, table, duration, success);
  },

  // Business metrics logging
  business(event: 'recovery_case_created' | 'company_active' | 'company_inactive', data: {
    companyId: string;
    caseType?: string;
    previousState?: string;
  }) {
    logger.info(`Business event: ${event}`, data);
    
    switch (event) {
      case 'recovery_case_created':
        metrics.recordRecoveryCase(data.companyId, data.caseType || 'unknown');
        break;
      case 'company_active':
        // This would be updated from a periodic job
        break;
    }
  }
};

// HTTP request middleware wrapper
export function withMonitoring(handler: (req: any, res: any) => Promise<any>) {
  return async (req: any, res: any) => {
    const startTime = Date.now();
    const url = req.url || req.path || 'unknown';
    const method = req.method || 'GET';
    
    try {
      // Log request start
      monitoringLogger.api('called', {
        endpoint: url,
        method,
        company_id: req.query.companyId || req.headers['x-company-id'],
        user_id: req.query.userId || req.headers['x-user-id']
      });
      
      // Execute handler
      const result = await handler(req, res);
      
      // Record metrics
      const duration = Date.now() - startTime;
      metrics.recordHttpRequest(method, url, res.statusCode || 200, duration);
      
      // Log successful response
      monitoringLogger.api('called', {
        endpoint: url,
        method,
        status_code: res.statusCode || 200,
        duration_ms: duration,
        company_id: req.query.companyId || req.headers['x-company-id'],
        user_id: req.query.userId || req.headers['x-user-id']
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      metrics.recordHttpRequest(method, url, 500, duration);
      
      // Log error
      monitoringLogger.api('error', {
        endpoint: url,
        method,
        status_code: 500,
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error),
        error_category: 'server_error'
      });
      
      throw error;
    }
  };
}

// Database query wrapper
export function withDatabaseMonitoring<T>(
  operation: string,
  table: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  return queryFn()
    .then(result => {
      const duration = Date.now() - startTime;
      monitoringLogger.database(operation, table, duration, true);
      return result;
    })
    .catch(error => {
      const duration = Date.now() - startTime;
      monitoringLogger.database(operation, table, duration, false, error instanceof Error ? error.message : String(error));
      throw error;
    });
}

// External API call wrapper
export async function withExternalApiMonitoring<T>(
  service: string,
  endpoint: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await apiCall();
    const duration = Date.now() - startTime;
    
    // Record successful API call
    metrics.recordExternalApiCall(service, endpoint, 200, duration);
    
    logger.info(`External API call successful`, {
      service,
      endpoint,
      duration_ms: duration,
      status_code: 200
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Record failed API call
    const statusCode = error instanceof Error && 'status' in error ? (error as any).status : 500;
    metrics.recordExternalApiCall(service, endpoint, statusCode, duration);
    
    logger.error(`External API call failed`, {
      service,
      endpoint,
      duration_ms: duration,
      status_code: statusCode,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
}

// Periodic metrics collection
export function startPeriodicMetricsCollection() {
  // Update active companies every 5 minutes
  setInterval(async () => {
    try {
      // This would typically query the database for active companies
      // For now, we'll use a placeholder
      const activeCompanies = 10; // Placeholder
      metrics.setGauge('active_companies', activeCompanies);
    } catch (error) {
      logger.error('Failed to update active companies metric', { error });
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Update queue depth every minute
  setInterval(async () => {
    try {
      // This would typically query the job queue
      // For now, we'll use a placeholder
      const queueDepth = 5; // Placeholder
      metrics.setJobQueueDepth('default', queueDepth);
    } catch (error) {
      logger.error('Failed to update queue depth metric', { error });
    }
  }, 60 * 1000); // 1 minute

  logger.info('Periodic metrics collection started');
}

// Health check integration
export async function getHealthMetrics() {
  return {
    metrics: metrics.getAllMetrics().length,
    activeAlerts: alerting.getNotifications().filter(n => n.status === 'sent').length,
    alertRules: alerting.getEscalationPolicies().length,
    notificationChannels: alerting.getChannels().filter(c => c.enabled).length,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
}

// Export monitoring utilities for use in other modules
export { metrics, alerting };
export { monitoringLogger };