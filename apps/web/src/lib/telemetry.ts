// OpenTelemetry configuration and metrics collection system
// Provides comprehensive observability for the Churn Saver application

import { trace, metrics, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { logger } from './logger';

// Global telemetry instance
let telemetry: TelemetryService | null = null;

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otelExporterEndpoint?: string;
  enabled: boolean;
}

export class TelemetryService {
  private sdk: NodeSDK | null = null;
  private meterProvider: MeterProvider | null = null;
  private config: TelemetryConfig;
  private tracer = trace.getTracer('churn-saver');
  private meter = metrics.getMeter('churn-saver');

  // Metrics
  private httpRequestsTotal: any;
  private httpRequestDuration: any;
  private webhookEventsProcessed: any;
  private webhookProcessingDuration: any;
  private reminderSent: any;
  private reminderDeliveryDuration: any;
  private databaseQueryDuration: any;
  private activeUsers: any;
  private recoveryCasesCreated: any;
  private jobQueueDepth: any;
  private externalApiCalls: any;
  private externalApiDuration: any;

  constructor(config: TelemetryConfig) {
    this.config = config;
    this.initializeMetrics();
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled || this.sdk) {
      return;
    }

    try {
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.environment,
      });

      // Configure exporters based on environment
      const exporters = this.configureExporters();

      this.sdk = new NodeSDK({
        resource,
        traceExporter: exporters.traceExporter,
        metricExporter: exporters.metricExporter,
        instrumentations: [
          new HttpInstrumentation(),
          new FetchInstrumentation(),
        ],
      });

      this.sdk.start();
      
      logger.info('OpenTelemetry initialized', {
        serviceName: this.config.serviceName,
        environment: this.config.environment,
        exporterEndpoint: this.config.otelExporterEndpoint
      });

    } catch (error) {
      logger.error('Failed to initialize OpenTelemetry', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private configureExporters() {
    if (this.config.otelExporterEndpoint) {
      return {
        traceExporter: new OTLPTraceExporter({
          url: `${this.config.otelExporterEndpoint}/v1/traces`,
        }),
        metricExporter: new OTLPMetricExporter({
          url: `${this.config.otelExporterEndpoint}/v1/metrics`,
        }),
      };
    }

    // Default to console exporters for development
    return {
      traceExporter: undefined,
      metricExporter: undefined,
    };
  }

  private initializeMetrics() {
    // HTTP Metrics
    this.httpRequestsTotal = this.meter.createCounter(
      'http_requests_total',
      {
        description: 'Total number of HTTP requests',
        unit: '1',
      }
    );

    this.httpRequestDuration = this.meter.createHistogram(
      'http_request_duration_ms',
      {
        description: 'HTTP request duration in milliseconds',
        unit: 'ms',
      }
    );

    // Webhook Metrics
    this.webhookEventsProcessed = this.meter.createCounter(
      'webhook_events_processed_total',
      {
        description: 'Total number of webhook events processed',
        unit: '1',
      }
    );

    this.webhookProcessingDuration = this.meter.createHistogram(
      'webhook_processing_duration_ms',
      {
        description: 'Webhook processing duration in milliseconds',
        unit: 'ms',
      }
    );

    // Reminder Metrics
    this.reminderSent = this.meter.createCounter(
      'reminders_sent_total',
      {
        description: 'Total number of reminders sent',
        unit: '1',
      }
    );

    this.reminderDeliveryDuration = this.meter.createHistogram(
      'reminder_delivery_duration_ms',
      {
        description: 'Reminder delivery duration in milliseconds',
        unit: 'ms',
      }
    );

    // Database Metrics
    this.databaseQueryDuration = this.meter.createHistogram(
      'database_query_duration_ms',
      {
        description: 'Database query duration in milliseconds',
        unit: 'ms',
      }
    );

    // Business Metrics
    this.activeUsers = this.meter.createUpDownCounter(
      'active_users',
      {
        description: 'Number of active users',
        unit: '1',
      }
    );

    this.recoveryCasesCreated = this.meter.createCounter(
      'recovery_cases_created_total',
      {
        description: 'Total number of recovery cases created',
        unit: '1',
      }
    );

    // Job Queue Metrics
    this.jobQueueDepth = this.meter.createUpDownCounter(
      'job_queue_depth',
      {
        description: 'Number of jobs in the queue',
        unit: '1',
      }
    );

    // External API Metrics
    this.externalApiCalls = this.meter.createCounter(
      'external_api_calls_total',
      {
        description: 'Total number of external API calls',
        unit: '1',
      }
    );

    this.externalApiDuration = this.meter.createHistogram(
      'external_api_duration_ms',
      {
        description: 'External API call duration in milliseconds',
        unit: 'ms',
      }
    );
  }

  // Tracing methods
  startSpan(name: string, kind?: SpanKind) {
    return this.tracer.startSpan(name, { kind });
  }

  recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
    this.httpRequestsTotal.add(1, {
      method,
      route,
      status_code: statusCode.toString(),
      status_class: statusCode < 400 ? 'success' : 'error',
    });

    this.httpRequestDuration.record(duration, {
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  recordWebhookEvent(eventType: string, success: boolean, duration: number) {
    this.webhookEventsProcessed.add(1, {
      event_type: eventType,
      success: success.toString(),
    });

    this.webhookProcessingDuration.record(duration, {
      event_type: eventType,
      success: success.toString(),
    });
  }

  recordReminder(channel: string, success: boolean, duration: number) {
    this.reminderSent.add(1, {
      channel,
      success: success.toString(),
    });

    this.reminderDeliveryDuration.record(duration, {
      channel,
      success: success.toString(),
    });
  }

  recordDatabaseQuery(operation: string, table: string, duration: number, success: boolean) {
    this.databaseQueryDuration.record(duration, {
      operation,
      table,
      success: success.toString(),
    });
  }

  recordActiveUsers(count: number) {
    this.activeUsers.add(count);
  }

  recordRecoveryCase(companyId: string, caseType: string) {
    this.recoveryCasesCreated.add(1, {
      company_id: companyId,
      case_type: caseType,
    });
  }

  recordJobQueueDepth(queueName: string, depth: number) {
    this.jobQueueDepth.add(depth, {
      queue_name: queueName,
    });
  }

  recordExternalApiCall(service: string, endpoint: string, statusCode: number, duration: number) {
    this.externalApiCalls.add(1, {
      service,
      endpoint,
      status_code: statusCode.toString(),
      success: (statusCode < 400).toString(),
    });

    this.externalApiDuration.record(duration, {
      service,
      endpoint,
      status_code: statusCode.toString(),
    });
  }

  // Utility method to create spans with automatic error handling
  async withSpan<T>(
    name: string,
    fn: (span: any) => Promise<T>,
    attributes?: Record<string, string>,
    kind?: SpanKind
  ): Promise<T> {
    const span = this.startSpan(name, kind);
    
    if (attributes) {
      span.setAttributes(attributes);
    }

    const ctx = trace.setSpan(context.active(), span);
    
    try {
      const result = await context.with(ctx, () => fn(span));
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      span.end();
    }
  }

  async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
      logger.info('OpenTelemetry shut down');
    }
  }
}

// Singleton instance
export function initializeTelemetry(config: TelemetryConfig): TelemetryService {
  if (!telemetry) {
    telemetry = new TelemetryService(config);
  }
  return telemetry;
}

export function getTelemetry(): TelemetryService {
  if (!telemetry) {
    throw new Error('Telemetry not initialized. Call initializeTelemetry() first.');
  }
  return telemetry;
}

// Middleware helper for Next.js
export function withTelemetry(handler: (req: any, res: any) => Promise<any>) {
  return async (req: any, res: any) => {
    const telemetry = getTelemetry();
    const startTime = Date.now();
    
    try {
      const result = await telemetry.withSpan(
        `http_${req.method}_${req.url}`,
        async (span) => {
          span.setAttributes({
            'http.method': req.method,
            'http.url': req.url,
            'http.user_agent': req.headers['user-agent'] || '',
            'http.remote_addr': req.ip || '',
          });
          
          const result = await handler(req, res);
          
          span.setAttributes({
            'http.status_code': res.statusCode,
          });
          
          return result;
        }
      );
      
      const duration = Date.now() - startTime;
      telemetry.recordHttpRequest(
        req.method,
        new URL(req.url).pathname,
        res.statusCode,
        duration
      );
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      telemetry.recordHttpRequest(
        req.method,
        new URL(req.url).pathname,
        500,
        duration
      );
      throw error;
    }
  };
}