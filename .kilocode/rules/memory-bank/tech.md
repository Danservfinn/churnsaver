# Tech: ChurnSaver

## Technologies
- Web: Next.js App Router, React, TypeScript
- Backend runtime: Node.js
- Database: PostgreSQL (managed via Supabase)
- Queue: PG Boss (Postgres-backed)
- Cache/rate limiting: Redis
- Deployment: Vercel
- Repo surfaces and docs: [apps/web/README.md](apps/web/README.md), [apps/web/vercel.json](apps/web/vercel.json), [apps/web/production/vercel.json](apps/web/production/vercel.json)

## Architecture components (key references)
- Webhook API route: [apps/web/src/app/api/webhooks/whop/route.ts](apps/web/src/app/api/webhooks/whop/route.ts) with [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9) and rate limit check at [11–13](apps/web/src/app/api/webhooks/whop/route.ts:11)
- Webhook validation utilities:
  - [parseSignatureHeader()](apps/web/src/lib/whop/webhookValidator.ts:124)
  - [validateWebhookSignature()](apps/web/src/lib/whop/webhookValidator.ts:154)
  - [validateTimestamp()](apps/web/src/lib/whop/webhookValidator.ts:200)
  - [WebhookValidator.validateWebhook()](apps/web/src/lib/whop/webhookValidator.ts:339)
- Enhanced job queue (PG Boss):
  - [enqueueWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:222)
  - [processEnhancedWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:312)
  - [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461)
  - [getCircuitBreaker()](apps/web/src/server/services/enhancedJobQueue.ts:566)
  - [calculateRetryDelay()](apps/web/src/server/services/enhancedJobQueue.ts:598)
  - [moveToDeadLetterQueue()](apps/web/src/server/services/enhancedJobQueue.ts:749)
  - [recordJobMetrics()](apps/web/src/server/services/enhancedJobQueue.ts:797)
- RLS middleware and helpers:
  - [withRLSProtection()](apps/web/src/lib/rls-middleware.ts:124), [validateRLSContext()](apps/web/src/lib/rls-middleware.ts:263)
- Encryption utilities:
  - [encrypt()](apps/web/src/lib/encryption.ts:91), [decrypt()](apps/web/src/lib/encryption.ts:131), [generateEncryptionKey()](apps/web/src/lib/encryption.ts:268)

## Local development setup
- Prerequisites
  - Node.js LTS, Postgres, Redis
  - Whop credentials (app id, API key, webhook secret)
  - See [apps/web/docs/development/prerequisites.md](apps/web/docs/development/prerequisites.md) and [apps/web/docs/development/installation.md](apps/web/docs/development/installation.md)
- Install
  - At repo root: install dependencies (npm or pnpm supported in this repo)
  - See [apps/web/package.json](apps/web/package.json)
- Environment variables
  - Use [apps/web/production/env.production.template](apps/web/production/env.production.template) as reference
  - Common keys:
    - NEXT_PUBLIC_WHOP_APP_ID: Whop application id
    - WHOP_API_KEY: Whop API key (keep secret)
    - WHOP_WEBHOOK_SECRET: HMAC secret for webhook validation
    - DATABASE_URL: Postgres connection string (SSL in production)
    - ENCRYPTION_KEY: 32‑byte key (base64 recommended). Generate via [generateEncryptionKey()](apps/web/src/lib/encryption.ts:268)
- Database and migrations
  - Base schema: [infra/migrations/001_init.sql](infra/migrations/001_init.sql)
  - RLS enablement: [infra/migrations/002_enable_rls_policies.sql](infra/migrations/002_enable_rls_policies.sql)
  - A/B testing: [infra/migrations/004_add_ab_testing.sql](infra/migrations/004_add_ab_testing.sql)
  - Security/timestamps: [infra/migrations/005_secure_events.sql](infra/migrations/005_secure_events.sql), [infra/migrations/006_backfill_occurred_at.sql](infra/migrations/006_backfill_occurred_at.sql)
  - Performance and keys: [infra/migrations/008_performance_indexes.sql](infra/migrations/008_performance_indexes.sql), [infra/migrations/009_foreign_keys.sql](infra/migrations/009_foreign_keys.sql)
  - Initial setup helper: [apps/web/scripts/init-db.ts](apps/web/scripts/init-db.ts)
  - Database docs: [apps/web/docs/database/README.md](apps/web/docs/database/README.md)
- Running the app
  - Development server from apps/web (see [apps/web/README.md](apps/web/README.md))
  - API endpoints served via Next.js App Router
- Tests
  - See [apps/web/docs/development/testing.md](apps/web/docs/development/testing.md)
  - Test harness: [apps/web/test/test-framework.ts](apps/web/test/test-framework.ts)
  - Representative suites:
    - Webhooks: [apps/web/test/webhooks.test.js](apps/web/test/webhooks.test.js), [apps/web/test/webhook-invalid.test.ts](apps/web/test/webhook-invalid.test.ts)
    - Idempotency: [apps/web/test/idempotency.test.ts](apps/web/test/idempotency.test.ts)
    - RLS: [apps/web/test/rls-integration.test.ts](apps/web/test/rls-integration.test.ts), [apps/web/test/cross-tenant-isolation.test.ts](apps/web/test/cross-tenant-isolation.test.ts)
    - Rate/size limits: [apps/web/test/requestSizeLimit.test.ts](apps/web/test/requestSizeLimit.test.ts), [apps/web/test/rate-limiter-cleanup.test.ts](apps/web/test/rate-limiter-cleanup.test.ts)
    - Queue resiliency: [apps/web/test/enhancedJobQueue.test.ts](apps/web/test/enhancedJobQueue.test.ts), [apps/web/test/enhancedErrorRecovery.test.ts](apps/web/test/enhancedErrorRecovery.test.ts)
    - Crypto: [apps/web/test/encryption.test.ts](apps/web/test/encryption.test.ts)

## Configuration and environment
- Production config and guardrails
  - Next.js production config: [apps/web/production/next.config.production.js](apps/web/production/next.config.production.js)
  - Security configuration: [apps/web/production/security-configuration.md](apps/web/production/security-configuration.md)
  - Monitoring guardrails: [apps/web/production/monitoring-guardrails.md](apps/web/production/monitoring-guardrails.md)
  - Production readiness: [apps/web/production/production-readiness-checklist.md](apps/web/production/production-readiness-checklist.md)
- Rate limiting and request size
  - Middleware: [apps/web/src/server/middleware/rateLimit.ts](apps/web/src/server/middleware/rateLimit.ts), [apps/web/src/middleware/requestSizeLimit.ts](apps/web/src/middleware/requestSizeLimit.ts)
  - Redis utilities: [apps/web/src/lib/rateLimitRedis.ts](apps/web/src/lib/rateLimitRedis.ts)
  - Example enforcement point in Whop route [11–13](apps/web/src/app/api/webhooks/whop/route.ts:11)
- Webhook security
  - HMAC‑SHA256 with timing‑safe compare: [validateWebhookSignature()](apps/web/src/lib/whop/webhookValidator.ts:154)
  - Timestamp skew and replay protection: [validateTimestamp()](apps/web/src/lib/whop/webhookValidator.ts:200)
  - Signature parsing robustness: [parseSignatureHeader()](apps/web/src/lib/whop/webhookValidator.ts:124)
- Encryption and secrets
  - AES‑256‑GCM utilities: [encrypt()](apps/web/src/lib/encryption.ts:91), [decrypt()](apps/web/src/lib/encryption.ts:131)
  - Key generation helper: [generateEncryptionKey()](apps/web/src/lib/encryption.ts:268)
  - Never log raw secrets; logger redaction documented in production runbooks

## Queue and background jobs
- Service lifecycle
  - Enhanced queue initializes PgBoss in [init()](apps/web/src/server/services/enhancedJobQueue.ts:173) using DATABASE_URL at [178](apps/web/src/server/services/enhancedJobQueue.ts:178)
  - Workers registered for:
    - Webhooks: [processEnhancedWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:312)
    - Reminders: [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461)
- Idempotency and scheduling
  - Singleton by eventId during enqueue: [singletonKey](apps/web/src/server/services/enhancedJobQueue.ts:234)
  - Backoff with jitter: [calculateRetryDelay()](apps/web/src/server/services/enhancedJobQueue.ts:598)
- Resilience and DLQ
  - Circuit breaker per job type: [getCircuitBreaker()](apps/web/src/server/services/enhancedJobQueue.ts:566)
  - Dead‑letter transition: [moveToDeadLetterQueue()](apps/web/src/server/services/enhancedJobQueue.ts:749)
  - Job metrics emission: [recordJobMetrics()](apps/web/src/server/services/enhancedJobQueue.ts:797)
- Operational scripts
  - Scheduler runner: [apps/web/scripts/run-scheduler.ts](apps/web/scripts/run-scheduler.ts)
  - Data privacy maintenance: [apps/web/scripts/data-privacy-maintenance.ts](apps/web/scripts/data-privacy-maintenance.ts)
  - Cleanup events: [apps/web/scripts/cleanup-events.ts](apps/web/scripts/cleanup-events.ts)

## Observability
- Logging and categorization: [apps/web/src/lib/logger.ts](apps/web/src/lib/logger.ts), [apps/web/src/lib/errorCategorization.ts](apps/web/src/lib/errorCategorization.ts)
- Metrics: [apps/web/src/lib/metrics.ts](apps/web/src/lib/metrics.ts), [apps/web/src/lib/jobQueueMetrics.ts](apps/web/src/lib/jobQueueMetrics.ts)
- Telemetry and query monitoring: [apps/web/src/lib/telemetry.ts](apps/web/src/lib/telemetry.ts), [apps/web/src/lib/queryMonitor.ts](apps/web/src/lib/queryMonitor.ts)
- Error monitoring integration: [apps/web/src/lib/errorMonitoringIntegration.ts](apps/web/src/lib/errorMonitoringIntegration.ts)

## Deployment
- Vercel configuration: [apps/web/vercel.json](apps/web/vercel.json), [apps/web/production/vercel.json](apps/web/production/vercel.json)
- Production deployment runbooks and checklists:
  - [apps/web/production/README.md](apps/web/production/README.md)
  - [apps/web/production/deploy-checklist.md](apps/web/production/deploy-checklist.md)
  - [apps/web/production/staging-rehearsal-checklist.md](apps/web/production/staging-rehearsal-checklist.md)
  - [apps/web/production/post-deployment-validation.md](apps/web/production/post-deployment-validation.md)

## CI/CD
- Migration‑aware pipeline: [.github/workflows/prd-deploy-migration.yml](.github/workflows/prd-deploy-migration.yml)

## Testing strategy (summary)
- Unit and integration tests under [apps/web/test](apps/web/test)
- Focus areas:
  - Webhooks and idempotency
  - RLS isolation and validation
  - Rate limiting and request size
  - Queue resilience, retries, DLQ
  - Security monitoring and encryption
- See detailed guidance: [apps/web/docs/development/testing.md](apps/web/docs/development/testing.md)