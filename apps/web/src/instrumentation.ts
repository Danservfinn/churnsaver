import { initializeTelemetry } from '@/lib/telemetry';
import { env } from '@/lib/env';

const serviceName = 'churnsaver-web';
const serviceVersion = process.env.npm_package_version || '1.0.0';
const environment = process.env.VERCEL_ENV || env.NODE_ENV || 'development';
const otelExporterEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_ENDPOINT;

const telemetry = initializeTelemetry({
  serviceName,
  serviceVersion,
  environment,
  otelExporterEndpoint,
  enabled: environment !== 'test'
});

export function register() {
  // Fire-and-forget initialization; telemetry handles its own errors.
  void telemetry.initialize();
}

