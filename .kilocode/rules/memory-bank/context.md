# Context: ChurnSaver

Current focus
- Memory Bank initialization completed with high-signal references across ingestion, RLS, jobs, and observability.
- Webhook security and guardrails active at the edge:
  - Endpoint: [apps/web/src/app/api/webhooks/whop/route.ts](apps/web/src/app/api/webhooks/whop/route.ts) with global rate limiting enforced before processing [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9) and limit check at [11–13](apps/web/src/app/api/webhooks/whop/route.ts:11).
  - Signature, timestamp skew, and payload validation centralized in validator utilities:
    - [parseSignatureHeader()](apps/web/src/lib/whop/webhookValidator.ts:124)
    - [validateWebhookSignature()](apps/web/src/lib/whop/webhookValidator.ts:154)
    - [validateTimestamp()](apps/web/src/lib/whop/webhookValidator.ts:200)
    - [WebhookValidator.validateWebhook()](apps/web/src/lib/whop/webhookValidator.ts:339)
- Queue orchestration with resilience patterns (singleton idempotency key, backoff, DLQ, circuit breaker):
  - Enqueue webhook job [enqueueWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:222) using singletonKey to prevent duplicates at [234–235](apps/web/src/server/services/enhancedJobQueue.ts:234).
  - Webhook worker entry [processEnhancedWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:312).
  - Reminder worker entry [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461).
  - Circuit breaker provider [getCircuitBreaker()](apps/web/src/server/services/enhancedJobQueue.ts:566).
  - Backoff math [calculateRetryDelay()](apps/web/src/server/services/enhancedJobQueue.ts:598).
  - Dead letter transition [moveToDeadLetterQueue()](apps/web/src/server/services/enhancedJobQueue.ts:749).
  - Metrics emission [recordJobMetrics()](apps/web/src/server/services/enhancedJobQueue.ts:797).
- Tenant isolation enforced via RLS:
  - Policies and helpers: [infra/migrations/002_enable_rls_policies.sql](infra/migrations/002_enable_rls_policies.sql)
  - Middleware boundary: [withRLSProtection()](apps/web/src/lib/rls-middleware.ts:124), [validateRLSContext()](apps/web/src/lib/rls-middleware.ts:263)
- Security and privacy posture:
  - Application-layer encryption: [encrypt()](apps/web/src/lib/encryption.ts:91), [decrypt()](apps/web/src/lib/encryption.ts:131).
  - Timestamp integrity and minimal retention fields: [infra/migrations/005_secure_events.sql](infra/migrations/005_secure_events.sql), [infra/migrations/006_backfill_occurred_at.sql](infra/migrations/006_backfill_occurred_at.sql).

Recent changes and confirmations (from schema and services)
- Idempotent events and indices are present in base schema [infra/migrations/001_init.sql](infra/migrations/001_init.sql).
- RLS formally enabled with per-table policies and session helpers in [infra/migrations/002_enable_rls_policies.sql](infra/migrations/002_enable_rls_policies.sql).
- A/B testing schema and performance view created in [infra/migrations/004_add_ab_testing.sql](infra/migrations/004_add_ab_testing.sql) with company-scoped variants and usage/conversion tracking.
- Security and timestamp integrity improvements:
  - Secure event fields and occurred_at indexing in [infra/migrations/005_secure_events.sql](infra/migrations/005_secure_events.sql).
  - Historical backfill of occurred_at in [infra/migrations/006_backfill_occurred_at.sql](infra/migrations/006_backfill_occurred_at.sql).
- Enhanced Job Queue capabilities shipped with resilience and metrics in [apps/web/src/server/services/enhancedJobQueue.ts](apps/web/src/server/services/enhancedJobQueue.ts).
- Test coverage touching key surfaces indicates active validation of controls:
  - Webhooks and invalid payloads: [apps/web/test/webhooks.test.js](apps/web/test/webhooks.test.js), [apps/web/test/webhook-invalid.test.ts](apps/web/test/webhook-invalid.test.ts)
  - Idempotency: [apps/web/test/idempotency.test.ts](apps/web/test/idempotency.test.ts)
  - RLS isolation and validation: [apps/web/test/rls-integration.test.ts](apps/web/test/rls-integration.test.ts), [apps/web/test/rls-validation.test.ts](apps/web/test/rls-validation.test.ts)
  - Request size/rate limit: [apps/web/test/requestSizeLimit.test.ts](apps/web/test/requestSizeLimit.test.ts), [apps/web/test/rate-limiter-cleanup.test.ts](apps/web/test/rate-limiter-cleanup.test.ts)
  - Queue resilience and recovery: [apps/web/test/enhancedJobQueue.test.ts](apps/web/test/enhancedJobQueue.test.ts), [apps/web/test/enhancedErrorRecovery.test.ts](apps/web/test/enhancedErrorRecovery.test.ts)
  - Encryption: [apps/web/test/encryption.test.ts](apps/web/test/encryption.test.ts)

Open items and next steps
- End-to-end verification and runbook hardening
  - Execute staging rehearsals per [apps/web/production/staging-rehearsal-checklist.md](apps/web/production/staging-rehearsal-checklist.md) and capture outcomes in [apps/web/production/staging-rehearsal-report-template.md](apps/web/production/staging-rehearsal-report-template.md).
  - Validate production guardrails documented in [apps/web/production/README.md](apps/web/production/README.md) and [apps/web/production/security-configuration.md](apps/web/production/security-configuration.md).
- RLS and policy drift checks
  - Re-run comprehensive RLS tests and policy validation in [apps/web/docs/development/rls-implementation-guide.md](apps/web/docs/development/rls-implementation-guide.md).
- Observability review
  - Confirm metrics, logs, and telemetry dashboards reflect webhook and job signals; ensure error monitoring hooks are wired via [apps/web/src/lib/errorMonitoringIntegration.ts](apps/web/src/lib/errorMonitoringIntegration.ts).
- Privacy workflows
  - Periodically run data privacy maintenance script [apps/web/scripts/data-privacy-maintenance.ts](apps/web/scripts/data-privacy-maintenance.ts) and review export/deletion flows [apps/web/src/server/services/dataExport.ts](apps/web/src/server/services/dataExport.ts), [apps/web/src/server/services/userDeletion.ts](apps/web/src/server/services/userDeletion.ts).
- Performance and reliability
  - Validate backoff settings and circuit breaker thresholds in production-like traffic; confirm DLQ analytics via [apps/web/src/lib/deadLetterQueue.ts](apps/web/src/lib/deadLetterQueue.ts) and job metrics [apps/web/src/lib/jobQueueMetrics.ts](apps/web/src/lib/jobQueueMetrics.ts).