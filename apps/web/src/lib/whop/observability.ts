// Whop Observability Service
// Provides comprehensive observability for Whop integration touchpoints
// including structured logging, metrics collection, and distributed tracing
import { logger } from '../logger';
import { metrics } from '../metrics';
import { getTelemetry } from '../telemetry';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { v4 as uuidv4 } from 'uuid';

// Types for Whop observability
export interface WhopObservabilityContext {
  requestId: string;
  userId?: string;
  companyId?: string;
  operation: string;
  startTime?: number;
  correlationId?: string;
  whopEventId?: string;
  whopUserId?: string;
  whopCompanyId?: string;
}

export interface WhopApiCallOptions {
  endpoint: string;
  method: string;
  body?: any;
  headers?: Record<string, string>;
}

export interface WhopWebhookEvent {
  eventType: string;
  eventId: string;
  userId?: string;
  companyId?: string;
  data: any;
}

export interface WhopAuthOperation {
  operation: 'login' | 'logout' | 'token_refresh' | 'token_validation';
  userId?: string;
  companyId?: string;
  success: boolean;
  duration: number;
}

class WhopObservabilityService {
  private telemetryEnabled: boolean;

  constructor() {
    try {
      getTelemetry();
      this.telemetryEnabled = true;
    } catch {
      this.telemetryEnabled = false;
    }
  }

  /**
   * Creates a new observability context for Whop operations
   */
  createContext(operation: string, existingContext?: Partial<WhopObservabilityContext>): WhopObservabilityContext {
    return {
      requestId: existingContext?.requestId || uuidv4(),
      userId: existingContext?.userId,
      companyId: existingContext?.companyId,
      operation,
      startTime: existingContext?.startTime || Date.now(),
      correlationId: existingContext?.correlationId || uuidv4(),
      whopEventId: existingContext?.whopEventId,
      whopUserId: existingContext?.whopUserId,
      whopCompanyId: existingContext?.whopCompanyId,
    };
  }

  /**
   * Records structured logging for Whop API calls
   */
  async logApiCall(
    context: WhopObservabilityContext,
    options: WhopApiCallOptions,
    response: { statusCode: number; duration: number; success: boolean; error?: any },
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    const metadata = {
      whop_operation: context.operation,
      whop_endpoint: options.endpoint,
      whop_method: options.method,
      whop_status_code: response.statusCode,
      whop_duration_ms: response.duration,
      whop_success: response.success,
      whop_request_id: context.requestId,
      whop_correlation_id: context.correlationId,
      whop_user_id: context.userId,
      whop_company_id: context.companyId,
      whop_event_id: context.whopEventId,
      ...additionalMetadata,
    };

    // Secure logging - redact sensitive data
    const safeBody = this.sanitizeLogData(options.body);
    const safeHeaders = this.sanitizeLogData(options.headers);

    if (response.success) {
      logger.api(`Whop API call completed: ${options.method} ${options.endpoint}`, {
        ...metadata,
        whop_request_body: safeBody,
        whop_request_headers: safeHeaders,
      });
    } else {
      logger.error(`Whop API call failed: ${options.method} ${options.endpoint}`, {
        ...metadata,
        whop_request_body: safeBody,
        whop_request_headers: safeHeaders,
        whop_error: this.sanitizeLogData(response.error),
      });
    }

    // Record metrics
    this.recordApiCallMetrics(context, options, response);
  }

  /**
   * Records metrics for Whop API calls
   */
  private recordApiCallMetrics(
    context: WhopObservabilityContext,
    options: WhopApiCallOptions,
    response: { statusCode: number; duration: number; success: boolean }
  ): void {
    try {
      // Use existing metrics service for Whop-specific metrics
      metrics.recordExternalApiCall(
        'whop',
        options.endpoint,
        response.statusCode,
        response.duration
      );

      // Record Whop-specific counters
      metrics.recordCounter('whop_api_calls_total', 1, {
        operation: context.operation,
        endpoint: options.endpoint,
        method: options.method,
        success: response.success.toString(),
        user_id: context.userId,
        company_id: context.companyId,
      });

      // Record duration histogram
      metrics.recordHistogram('whop_api_call_duration_ms', response.duration, {
        operation: context.operation,
        endpoint: options.endpoint,
        method: options.method,
      });

      // OpenTelemetry integration if available
      if (this.telemetryEnabled) {
        const telemetry = getTelemetry();
        telemetry.recordExternalApiCall(
          'whop',
          options.endpoint,
          response.statusCode,
          response.duration
        );
      }
    } catch (error) {
      logger.warn('Failed to record Whop API call metrics', { error: error.message });
    }
  }

  /**
   * Records logging and metrics for Whop webhook processing
   */
  async logWebhookProcessing(
    context: WhopObservabilityContext,
    event: WhopWebhookEvent,
    processing: { duration: number; success: boolean; error?: any },
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    const metadata = {
      whop_operation: context.operation,
      whop_event_type: event.eventType,
      whop_event_id: event.eventId,
      whop_duration_ms: processing.duration,
      whop_success: processing.success,
      whop_request_id: context.requestId,
      whop_correlation_id: context.correlationId,
      whop_user_id: context.userId || event.userId,
      whop_company_id: context.companyId || event.companyId,
      whop_event_user_id: event.userId,
      whop_event_company_id: event.companyId,
      ...additionalMetadata,
    };

    if (processing.success) {
      logger.webhook(`Whop webhook processed: ${event.eventType}`, {
        ...metadata,
        whop_event_data: this.sanitizeLogData(event.data),
      });
    } else {
      logger.error(`Whop webhook processing failed: ${event.eventType}`, {
        ...metadata,
        whop_event_data: this.sanitizeLogData(event.data),
        whop_error: this.sanitizeLogData(processing.error),
      });
    }

    // Record metrics
    this.recordWebhookMetrics(context, event, processing);
  }

  /**
   * Records metrics for Whop webhook processing
   */
  private recordWebhookMetrics(
    context: WhopObservabilityContext,
    event: WhopWebhookEvent,
    processing: { duration: number; success: boolean }
  ): void {
    try {
      // Use existing webhook metrics
      metrics.recordWebhookEvent(
        event.eventType,
        processing.success,
        processing.duration
      );

      // Additional Whop-specific webhook metrics
      metrics.recordCounter('whop_webhook_events_total', 1, {
        event_type: event.eventType,
        success: processing.success.toString(),
        user_id: context.userId,
        company_id: context.companyId,
      });

      metrics.recordHistogram('whop_webhook_processing_duration_ms', processing.duration, {
        event_type: event.eventType,
        success: processing.success.toString(),
      });

      // OpenTelemetry integration if available
      if (this.telemetryEnabled) {
        const telemetry = getTelemetry();
        telemetry.recordWebhookEvent(
          event.eventType,
          processing.success,
          processing.duration
        );
      }
    } catch (error) {
      logger.warn('Failed to record Whop webhook metrics', { error: error.message });
    }
  }

  /**
   * Records logging and metrics for Whop authentication operations
   */
  async logAuthOperation(
    context: WhopObservabilityContext,
    auth: WhopAuthOperation,
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    const metadata = {
      whop_operation: context.operation,
      whop_auth_operation: auth.operation,
      whop_auth_success: auth.success,
      whop_auth_duration_ms: auth.duration,
      whop_request_id: context.requestId,
      whop_correlation_id: context.correlationId,
      whop_user_id: context.userId || auth.userId,
      whop_company_id: context.companyId || auth.companyId,
      ...additionalMetadata,
    };

    if (auth.success) {
      logger.api(`Whop auth operation completed: ${auth.operation}`, metadata);
    } else {
      logger.error(`Whop auth operation failed: ${auth.operation}`, metadata);
    }

    // Record metrics
    this.recordAuthMetrics(context, auth);
  }

  /**
   * Records metrics for Whop authentication operations
   */
  private recordAuthMetrics(
    context: WhopObservabilityContext,
    auth: WhopAuthOperation
  ): void {
    try {
      // Custom auth metrics
      metrics.recordCounter('whop_auth_operations_total', 1, {
        operation: auth.operation,
        success: auth.success.toString(),
        user_id: context.userId,
        company_id: context.companyId,
      });

      metrics.recordHistogram('whop_auth_operation_duration_ms', auth.duration, {
        operation: auth.operation,
        success: auth.success.toString(),
      });

      // OpenTelemetry integration if available
      if (this.telemetryEnabled) {
        const telemetry = getTelemetry();
        // Map to existing telemetry methods where possible
        telemetry.recordExternalApiCall(
          'whop_auth',
          auth.operation,
          auth.success ? 200 : 401,
          auth.duration
        );
      }
    } catch (error) {
      logger.warn('Failed to record Whop auth metrics', { error: error.message });
    }
  }

  /**
   * Creates a distributed trace span for Whop operations
   */
  async withTracing<T>(
    context: WhopObservabilityContext,
    spanName: string,
    operation: () => Promise<T>,
    attributes?: Record<string, string>
  ): Promise<T> {
    if (!this.telemetryEnabled) {
      return operation();
    }

    const telemetry = getTelemetry();
    const spanAttributes = {
      'whop.operation': context.operation,
      'whop.request_id': context.requestId,
      'whop.correlation_id': context.correlationId,
      'whop.user_id': context.userId,
      'whop.company_id': context.companyId,
      'whop.event_id': context.whopEventId,
      ...attributes,
    };

    return telemetry.withSpan(
      spanName,
      async (span) => {
        span.setAttributes(spanAttributes);

        try {
          const result = await operation();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      },
      spanAttributes,
      SpanKind.INTERNAL
    );
  }

  /**
   * Records security-related events for Whop operations
   */
  logSecurityEvent(
    context: WhopObservabilityContext,
    event: string,
    details: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): void {
    logger.security(`Whop security event: ${event}`, {
      whop_operation: context.operation,
      whop_request_id: context.requestId,
      whop_correlation_id: context.correlationId,
      whop_user_id: context.userId,
      whop_company_id: context.companyId,
      security_event: event,
      security_severity: severity,
      ...this.sanitizeLogData(details),
    });
  }

  /**
   * Sanitizes sensitive data from logs to prevent leakage
   */
  private sanitizeLogData(data: any): any {
    if (!data) return data;

    if (typeof data === 'string') {
      // Redact potential secrets, tokens, keys
      if (data.length > 50) {
        return '[REDACTED - Large String]';
      }
      // Check for common secret patterns
      if (/^(sk_|pk_|bearer|token|key|secret|password|api_key)/i.test(data)) {
        return '[REDACTED - Potential Secret]';
      }
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeLogData(item));
    }

    if (typeof data === 'object') {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive keys entirely or redact values
        if (/^(password|secret|token|key|api_key|private|auth)/i.test(key)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeLogData(value);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Sets the correlation ID for the current request context
   */
  setCorrelationId(correlationId: string): void {
    logger.setRequestId(correlationId);
  }

  /**
   * Gets current metrics snapshot for Whop operations
   */
  getMetrics(): {
    apiCalls: any;
    webhooks: any;
    auth: any;
  } {
    return {
      apiCalls: metrics.getMetric('whop_api_calls_total'),
      webhooks: metrics.getMetric('whop_webhook_events_total'),
      auth: metrics.getMetric('whop_auth_operations_total'),
    };
  }
}

// Singleton instance
export const whopObservability = new WhopObservabilityService();
export default whopObservability;</code>
