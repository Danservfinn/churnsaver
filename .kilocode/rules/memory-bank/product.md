# Product: ChurnSaver

Purpose
- ChurnSaver is a production‑grade, multi‑tenant retention automation platform that ingests events, detects churn risk, and orchestrates targeted incentives and recovery workflows to preserve revenue.
- Anchored to the brief and repository implementation.

Target personas
- Merchant admins and operators who need reliable recovery of failing subscriptions and visibility into outcomes.
- Engineering/ops who require safe integrations, observability, and compliance-by-default.

Core problems solved
- Secure event ingestion with signature validation, replay protection, idempotency, and rate limiting.
- Accurate risk detection and case creation across tenants with strict isolation.
- Automated incentives, reminders, and notifications with A/B testing to maximize recovery.
- Resilient processing pipeline with retries, circuit breakers, dead-letter queue, and metrics.
- Privacy by design: encryption at the app layer, consent, data export/deletion, and minimal retention of sensitive payloads.
- End‑to‑end observability and production readiness.

How it works (high level)
1) Event ingestion
   - Whop sends webhooks to the Next.js API route [apps/web/src/app/api/webhooks/whop/route.ts](apps/web/src/app/api/webhooks/whop/route.ts).
   - The handler [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9) enforces rate limiting and delegates to the webhook handler.
   - Signatures, timestamp skew, and payload shape are validated by [parseSignatureHeader()](apps/web/src/lib/whop/webhookValidator.ts:124), [validateTimestamp()](apps/web/src/lib/whop/webhookValidator.ts:200), [validateWebhookSignature()](apps/web/src/lib/whop/webhookValidator.ts:154), and [WebhookValidator.validateWebhook()](apps/web/src/lib/whop/webhookValidator.ts:339).
   - Idempotency is enforced using the events table key [whop_event_id] defined in [infra/migrations/001_init.sql](infra/migrations/001_init.sql).

2) Queueing and processing
   - Validated events are enqueued via [EnhancedJobQueueService.enqueueWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:222) and processed by [EnhancedJobQueueService.processEnhancedWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:312).
   - Retries use exponential backoff [calculateRetryDelay()](apps/web/src/server/services/enhancedJobQueue.ts:598), with circuit breakers [getCircuitBreaker()](apps/web/src/server/services/enhancedJobQueue.ts:566), metrics [recordJobMetrics()](apps/web/src/server/services/enhancedJobQueue.ts:797), and a dead‑letter queue [apps/web/src/lib/deadLetterQueue.ts](apps/web/src/lib/deadLetterQueue.ts).
   - Business logic for event attribution and recovery flows executes in services like [apps/web/src/server/services/eventProcessor.ts](apps/web/src/server/services/eventProcessor.ts), [apps/web/src/server/services/cases.ts](apps/web/src/server/services/cases.ts), [apps/web/src/server/services/incentives.ts](apps/web/src/server/services/incentives.ts).

3) Tenant isolation and data access
   - PostgreSQL Row‑Level Security (RLS) is enabled and enforced by policies in [infra/migrations/002_enable_rls_policies.sql](infra/migrations/002_enable_rls_policies.sql).
   - Application requests set company context using middleware [withRLSProtection()](apps/web/src/lib/rls-middleware.ts:124) and related helpers to ensure tenant‑scoped queries.

4) Incentives, reminders, and scheduling
   - Reminder processing via cron [apps/web/src/server/cron/processReminders.ts](apps/web/src/server/cron/processReminders.ts) and queue orchestration.
   - A/B testing data model and metrics in [infra/migrations/004_add_ab_testing.sql](infra/migrations/004_add_ab_testing.sql); service logic in [apps/web/src/server/services/abTesting.ts](apps/web/src/server/services/abTesting.ts).

5) Security, privacy, and compliance
   - Request size limits and rate limiting: [apps/web/src/middleware/requestSizeLimit.ts](apps/web/src/middleware/requestSizeLimit.ts) and [apps/web/src/server/middleware/rateLimit.ts](apps/web/src/server/middleware/rateLimit.ts); enforced in [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9).
   - Application‑level encryption utilities [encrypt()](apps/web/src/lib/encryption.ts:91) and [decrypt()](apps/web/src/lib/encryption.ts:131).
   - Minimal payload storage and timestamp integrity: [infra/migrations/005_secure_events.sql](infra/migrations/005_secure_events.sql) and [infra/migrations/006_backfill_occurred_at.sql](infra/migrations/006_backfill_occurred_at.sql).
   - Data export and deletion flows: [apps/web/src/server/services/dataExport.ts](apps/web/src/server/services/dataExport.ts), [apps/web/src/server/services/userDeletion.ts](apps/web/src/server/services/userDeletion.ts), and maintenance script [apps/web/scripts/data-privacy-maintenance.ts](apps/web/scripts/data-privacy-maintenance.ts).

6) Observability and operations
   - Structured logs, redaction, and categorization: [apps/web/src/lib/logger.ts](apps/web/src/lib/logger.ts), [apps/web/src/lib/errorCategorization.ts](apps/web/src/lib/errorCategorization.ts).
   - Metrics and telemetry: [apps/web/src/lib/metrics.ts](apps/web/src/lib/metrics.ts), [apps/web/src/lib/telemetry.ts](apps/web/src/lib/telemetry.ts), [apps/web/src/lib/queryMonitor.ts](apps/web/src/lib/queryMonitor.ts), [apps/web/src/lib/errorMonitoringIntegration.ts](apps/web/src/lib/errorMonitoringIntegration.ts).
   - Production guides and runbooks: [apps/web/production/README.md](apps/web/production/README.md), [apps/web/docs/whop-production-runbook.md](apps/web/docs/whop-production-runbook.md).

User experience goals
- Reliability: near‑real‑time processing with resilient retries and DLQ to avoid lost events.
- Safety: strict RLS, strong webhook validation, rate limiting, and request‑size controls.
- Privacy: encryption, data minimization, export and deletion pathways.
- Observability: actionable logs, fine‑grained metrics, and telemetry for rapid incident response.
- Production readiness: migrations, rollbacks, runbooks, and comprehensive automated tests.

Key references
- Web app surfaces: [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx), [apps/web/src/app/layout.tsx](apps/web/src/app/layout.tsx)
- Webhooks: [apps/web/src/app/api/webhooks/whop/route.ts](apps/web/src/app/api/webhooks/whop/route.ts), [apps/web/src/lib/whop/webhookValidator.ts](apps/web/src/lib/whop/webhookValidator.ts)
- Job processing: [apps/web/src/server/services/enhancedJobQueue.ts](apps/web/src/server/services/enhancedJobQueue.ts), [apps/web/src/server/services/eventProcessor.ts](apps/web/src/server/services/eventProcessor.ts)
- Rate limiting and request controls: [apps/web/src/server/middleware/rateLimit.ts](apps/web/src/server/middleware/rateLimit.ts), [apps/web/src/middleware/requestSizeLimit.ts](apps/web/src/middleware/requestSizeLimit.ts)
- RLS and DB access: [apps/web/src/lib/rls-middleware.ts](apps/web/src/lib/rls-middleware.ts), [apps/web/src/lib/db-rls.ts](apps/web/src/lib/db-rls.ts), [infra/migrations/002_enable_rls_policies.sql](infra/migrations/002_enable_rls_policies.sql)
- Security and privacy: [apps/web/src/lib/encryption.ts](apps/web/src/lib/encryption.ts), [apps/web/src/lib/security-monitoring.ts](apps/web/src/lib/security-monitoring.ts)
- Documentation: [apps/web/docs/development/README.md](apps/web/docs/development/README.md), [apps/web/docs/development/installation.md](apps/web/docs/development/installation.md), [apps/web/docs/whop-sdk-integration-guide.md](apps/web/docs/whop-sdk-integration-guide.md)
- Tests: [apps/web/test/webhooks.test.js](apps/web/test/webhooks.test.js), [apps/web/test/idempotency.test.ts](apps/web/test/idempotency.test.ts), [apps/web/test/rls-integration.test.ts](apps/web/test/rls-integration.test.ts), [apps/web/test/enhancedJobQueue.test.ts](apps/web/test/enhancedJobQueue.test.ts)