# Tasks: ChurnSaver

The following repetitive, high‑value tasks capture established patterns in this repository. Each task lists concrete files to modify, exact steps, important notes, and a short example reference with clickable constructs including line numbers.

## 1) Add a new migration and update RLS policies
Files to modify
- Create: infra/migrations/NNN_new_feature.sql
- Reference policies: [infra/migrations/002_enable_rls_policies.sql](infra/migrations/002_enable_rls_policies.sql)
  - Helper session functions: [set_company_context()](infra/migrations/002_enable_rls_policies.sql:13), [get_current_company_id()](infra/migrations/002_enable_rls_policies.sql:22)
- If adding A/B testing schema, reference: [infra/migrations/004_add_ab_testing.sql](infra/migrations/004_add_ab_testing.sql)

Steps
1. Define new table with primary key, tenant key, timestamps; include company_id for RLS.
2. Enable RLS on the new table: ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
3. Add policies using get_current_company_id(): e.g., SELECT/INSERT/UPDATE/DELETE policies.
4. If needed, add SECURITY DEFINER triggers to set updated_at and enforce company checks (see examples in [update_recovery_cases_updated_at()](infra/migrations/002_enable_rls_policies.sql:101)).
5. Add indexes to support common queries.
6. Test in psql:
   - SET app.current_company_id = 'company_123';
   - Verify access control as in the “SECURITY VALIDATION QUERIES” examples at [142–152](infra/migrations/002_enable_rls_policies.sql:142).

Important notes
- Keep session variable name consistent with application: app.current_company_id (see [set_company_context()](infra/migrations/002_enable_rls_policies.sql:13)).
- Ensure policies do not leak cross‑tenant data.
- Add idempotent CREATE INDEX IF NOT EXISTS statements.

Example reference
- RLS helper: [get_current_company_id()](infra/migrations/002_enable_rls_policies.sql:22)

---

## 2) Add a new webhook endpoint with secure validation and idempotency
Files to modify
- Create: apps/web/src/app/api/webhooks/{provider}/route.ts
- Use rate limiting middleware: [apps/web/src/app/api/webhooks/whop/route.ts](apps/web/src/app/api/webhooks/whop/route.ts) with [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9)
- Validator utilities: [parseSignatureHeader()](apps/web/src/lib/whop/webhookValidator.ts:124), [validateWebhookSignature()](apps/web/src/lib/whop/webhookValidator.ts:154), [validateTimestamp()](apps/web/src/lib/whop/webhookValidator.ts:200), [WebhookValidator.validateWebhook()](apps/web/src/lib/whop/webhookValidator.ts:339)
- Job enqueue: [enqueueWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:222) with singleton key at [234–235](apps/web/src/server/services/enhancedJobQueue.ts:234)

Steps
1. Implement POST handler with rate limit check before any processing using the pattern at [11–13](apps/web/src/app/api/webhooks/whop/route.ts:11).
2. Read raw body and headers; validate timestamp and signature via validator functions.
3. Construct minimal event payload and ensure idempotency field (eventId) is captured.
4. Enqueue for async processing via [enqueueWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:222) which sets [singletonKey](apps/web/src/server/services/enhancedJobQueue.ts:234).
5. Respond quickly (≤1s) with 200 on accepted enqueue; log structured security events on failures.

Important notes
- Use raw request body for HMAC (avoid JSON mutation before signature verification).
- Fail‑closed in production if rate limiting/validation service errors occur (see [39–56](apps/web/src/app/api/webhooks/whop/route.ts:39)).
- Minimize stored payload; prefer payload_min/payload_encrypted if applicable (see [infra/migrations/005_secure_events.sql](infra/migrations/005_secure_events.sql)).

Example reference
- Rate limit pattern: [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9)
- Signature validation: [validateWebhookSignature()](apps/web/src/lib/whop/webhookValidator.ts:154)

---

## 3) Add a new PG Boss job with retries, circuit breaker, metrics, and DLQ
Files to modify
- Enhanced queue: [apps/web/src/server/services/enhancedJobQueue.ts](apps/web/src/server/services/enhancedJobQueue.ts)
  - Processors pattern: [processEnhancedWebhookJob()](apps/web/src/server/services/enhancedJobQueue.ts:312), [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461)
  - Circuit breaker: [getCircuitBreaker()](apps/web/src/server/services/enhancedJobQueue.ts:566)
  - Backoff math: [calculateRetryDelay()](apps/web/src/server/services/enhancedJobQueue.ts:598)
  - DLQ transition: [moveToDeadLetterQueue()](apps/web/src/server/services/enhancedJobQueue.ts:749)
  - Metrics: [recordJobMetrics()](apps/web/src/server/services/enhancedJobQueue.ts:797)

Steps
1. Define job type constant and add to initializeDefaultProcessors() similar to reminder/webhook.
2. Register boss.work for the new job type in init(), following webhook/reminder examples.
3. Implement handler with assertCompanyContext and robust error handling.
4. Ensure retries with exponential backoff via [calculateRetryDelay()](apps/web/src/server/services/enhancedJobQueue.ts:598).
5. Record execution/queue metrics via [recordJobMetrics()](apps/web/src/server/services/enhancedJobQueue.ts:797); send categorized errors to monitoring.
6. On max attempts, call [moveToDeadLetterQueue()](apps/web/src/server/services/enhancedJobQueue.ts:749).

Important notes
- Keep job metadata small; include eventId/companyId to enable tenant scoping.
- Respect memory pressure controls (see [345–363](apps/web/src/server/services/enhancedJobQueue.ts:345)).

Example reference
- Processing template: [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461)

---

## 4) Add a new A/B test experiment and performance analysis
Files to modify
- DB schema/view reference: [infra/migrations/004_add_ab_testing.sql](infra/migrations/004_add_ab_testing.sql)
  - View: [ab_test_performance](infra/migrations/004_add_ab_testing.sql:62)
- Service logic: [apps/web/src/server/services/abTesting.ts](apps/web/src/server/services/abTesting.ts)

Steps
1. Insert variant(s) into ab_test_variants; activate by setting active = true.
2. When sending messages, insert ab_test_usage records for chosen variant.
3. Record clicks/conversions in ab_test_conversions.
4. Query [ab_test_performance](infra/migrations/004_add_ab_testing.sql:62) to compute CTR and conversion rates.
5. Optionally use [get_best_ab_variant()](infra/migrations/004_add_ab_testing.sql:86) per company to pick top variant.

Important notes
- Ensure company_id is set consistently for RLS (see RLS at [47–59](infra/migrations/004_add_ab_testing.sql:47)).
- Maintain appropriate weights for traffic distribution.

Example reference
- Performance view definition: [ab_test_performance](infra/migrations/004_add_ab_testing.sql:62)

---

## 5) Add a new data export or deletion flow (privacy compliance)
Files to modify
- Export: [apps/web/src/server/services/dataExport.ts](apps/web/src/server/services/dataExport.ts)
- Deletion: [apps/web/src/server/services/userDeletion.ts](apps/web/src/server/services/userDeletion.ts)
- RLS boundary: [withRLSProtection()](apps/web/src/lib/rls-middleware.ts:124) or [withSystemRLSContext()](apps/web/src/lib/rls-middleware.ts:198)
- Encryption helpers: [encrypt()](apps/web/src/lib/encryption.ts:91), [decrypt()](apps/web/src/lib/encryption.ts:131)

Steps
1. Define API endpoint or internal service function protected by [withRLSProtection()](apps/web/src/lib/rls-middleware.ts:124).
2. For scheduled/system operations, wrap with [withSystemRLSContext()](apps/web/src/lib/rls-middleware.ts:198).
3. Retrieve only tenant‑scoped rows; stream for export; decrypt fields via [decrypt()](apps/web/src/lib/encryption.ts:131) when required.
4. For deletion, soft‑delete or purge rows per retention policy; log audit via recovery_actions if needed.
5. Add tests under apps/web/test to validate RLS and correctness.

Important notes
- Never export raw secrets; ensure redaction in logs.
- Validate RLS context using [validateRLSContext()](apps/web/src/lib/rls-middleware.ts:263) when appropriate.

Example reference
- Encryption utility: [decrypt()](apps/web/src/lib/encryption.ts:131)

---

## 6) Adjust rate limiting and request‑size controls
Files to modify
- Rate limit middleware: [apps/web/src/server/middleware/rateLimit.ts](apps/web/src/server/middleware/rateLimit.ts)
- Request size limit: [apps/web/src/middleware/requestSizeLimit.ts](apps/web/src/middleware/requestSizeLimit.ts)
- Endpoint entrypoint pattern: [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9) with pre‑check at [11–13](apps/web/src/app/api/webhooks/whop/route.ts:11)
- Tests: [apps/web/test/requestSizeLimit.test.ts](apps/web/test/requestSizeLimit.test.ts), [apps/web/test/rate-limiter-cleanup.test.ts](apps/web/test/rate-limiter-cleanup.test.ts)

Steps
1. Tune RATE_LIMIT_CONFIGS.webhooks and relevant keys to desired thresholds.
2. Ensure endpoints call checkRateLimit prior to processing (see [11–13](apps/web/src/app/api/webhooks/whop/route.ts:11)).
3. Update requestSizeLimit thresholds to prevent abuse on large payloads.
4. Validate with automated tests and manual traffic simulation.

Important notes
- In production, fail‑closed on limiter errors (see [39–56](apps/web/src/app/api/webhooks/whop/route.ts:39)).
- Log structured metadata for security monitoring.

Example reference
- Rate limit usage: [POST()](apps/web/src/app/api/webhooks/whop/route.ts:9)

---

## 7) Add a new scheduled reminder/cron workflow
Files to modify
- Cron processor: [apps/web/src/server/cron/processReminders.ts](apps/web/src/server/cron/processReminders.ts)
- Queue integration: [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461)
- Runner script: [apps/web/scripts/run-scheduler.ts](apps/web/scripts/run-scheduler.ts)

Steps
1. Add schedule trigger in the scheduler script to enqueue reminder jobs per company.
2. Implement processing logic in cron module; ensure tenant context validation and idempotency.
3. Emit metrics and logs; respect circuit breaker and DLQ paths via EnhancedJobQueue.

Important notes
- Keep operations bounded with timeouts; monitor with job metrics.
- Ensure company discovery is accurate and RLS compliant.

Example reference
- Reminder job entry: [processEnhancedReminderJob()](apps/web/src/server/services/enhancedJobQueue.ts:461)

---

## 8) Enhance error monitoring categorization and alerts
Files to modify
- Categorization: [apps/web/src/lib/errorCategorization.ts](apps/web/src/lib/errorCategorization.ts)
- Monitoring pipeline: [apps/web/src/lib/errorMonitoringIntegration.ts](apps/web/src/lib/errorMonitoringIntegration.ts)
- Queue integration points:
  - Processing error path: [717–744](apps/web/src/server/services/enhancedJobQueue.ts:717)
  - Enqueue error path: [696–711](apps/web/src/server/services/enhancedJobQueue.ts:696)

Steps
1. Add or refine error categories and mapping in errorCategorization.ts.
2. Ensure EnhancedJobQueue sends categorized errors to monitoring integration in both enqueue and processing paths.
3. Add metrics for error counts by type; create alerts in monitoring backend.
4. Validate with synthetic failures and verify dashboards.

Important notes
- Include contextual fields: jobType, companyId, attempts, duration.
- Avoid logging sensitive data; rely on redaction.

Example reference
- Error processing hook: [handleJobProcessingError()](apps/web/src/server/services/enhancedJobQueue.ts:717)
