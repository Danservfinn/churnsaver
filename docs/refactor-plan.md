# Strategic Refactoring Plan — Notification & Recovery Services

## 1. Context Snapshot

- The recovery workflow is split across `cases.ts`, `processReminders.ts`, `push.ts`, `dm.ts`, and `scheduler.ts`, creating duplicated orchestration and retry logic.
- Notification channel implementations (push/DM) replicate scaffolding (metrics, retries, logging) with only payload differences.
- `jobQueue.ts` introduces redundant handler layers (`handleWebhookJobs` + `processWebhookJob`, etc.) which increases complexity without adding resilience.
- The A/B testing service maintains an in-memory cache with ad-hoc reload semantics and repeated SQL parsing that can be simplified.

## 2. Key Opportunities & Estimated Impact

| # | Opportunity | Primary Files | Current Issue | Optimization Strategy | Est. Bundle Reduction | Complexity / Risk |
|---|-------------|---------------|---------------|------------------------|------------------------|--------------------|
| 1 | **Unify reminder notification orchestration** | `apps/web/src/server/services/cases.ts`, `apps/web/src/server/cron/processReminders.ts` | `sendImmediateRecoveryNudge` and `sendReminderForCase` duplicate channel dispatch, incentive application, and logging. Manual nudge path reimplements the same pieces. | Extract a shared `ReminderNotifier` utility (pure functions + channel hooks) consumed by T+0, scheduled, and manual flows. Centralize channel toggles, manage URL fetching, incentive checks, and audit logging. | ~220 LOC and ~9 cyclomatic points | Medium (requires thorough regression of nudges, incentives) |
| 2 | **Consolidate push/DM delivery scaffolding** | `apps/web/src/server/services/push.ts`, `apps/web/src/server/services/dm.ts`, `notifications/whop.ts` | Both services maintain nearly identical retry loops, metrics bookkeeping, sampling logic, and logging. | Introduce a generic `NotificationChannel` wrapper with pluggable providers (Whop/local mock). Share retry/backoff policy, metrics counter map, and result logging. Retain channel-specific payload transformers only. | ~180 LOC and ~6 cyclomatic points | Medium-low (well-covered by scheduler + dm/push tests) |
| 3 | **Simplify job queue handlers** | `apps/web/src/server/services/jobQueue.ts` | Dual layers (`handleWebhookJobs` → `processWebhookJob`) and loops around already-batched pg-boss handlers add indirection, error paths duplicated. | Replace with single `boss.work` handlers invoking consolidated processors. Share validation (company context, idempotency) and reuse typed result logging. | ~110 LOC and reduced stack depth | Low (logic already isolated) |
| 4 | **Normalize reminder scheduling between local & serverless modes** | `scheduler.ts`, `processReminders.ts` | Local cron and serverless scheduler both perform company enumeration and orchestration. Divergent paths risk drift. | Extract shared `collectReminderCandidates` helper and reuse new `ReminderNotifier`. Keep local cron as thin wrapper over shared core. | ~80 LOC, lower drift risk | Medium (ensure dev ergonomics preserved) |
| 5 | **Streamline A/B testing service caching** | `apps/web/src/server/services/abTesting.ts` | In-memory cache with manual `isLoaded` flag and un-awaited cold load in `selectVariant`. Several helper functions can be pure utilities. | Convert load to memoized async call with hydration guard; consolidate default content builders; reduce logging duplication. | ~60 LOC and safer async flow | Low-medium (needs concurrency guard tests) |

_Total projected reduction: ~650 lines & notable drop in average function complexity across hotspot services._

## 3. Prioritized Refactoring Backlog

1. **Reminder orchestration unification**  
   - Create `apps/web/src/server/services/reminders/ReminderNotifier.ts` (shared channels, incentive handling, audit logging).  
   - Update `sendImmediateRecoveryNudge`, scheduled reminders, and manual nudges to consume the helper.  
   - Deprecate redundant inline logging blocks.

2. **Shared notification delivery core**  
   - Introduce `NotificationDispatcher` with channel adapters (`push`, `dm`).  
   - Collapse duplicated metrics classes into reusable counter helper.  
   - Ensure both mock and Whop providers implement the same interface for parity.

3. **Job queue handler simplification**  
   - Flatten pg-boss worker definitions to single call sites.  
   - Extract reusable `assertCompanyContext` + `updateEventProcessingStatus`.  
   - Add structured return type for processing metrics.

4. **Scheduler alignment (serverless/local)**  
   - Move company discovery + reminder iteration into shared module.  
  - Ensure local cron just invokes shared runner with dev-only logging.  
   - Document production vs. local entrypoints.

5. **A/B testing cache cleanup**  
   - Replace `isLoaded` flag with `loadVariantsForCompany` memoization keyed by company ID and `updated_at`.  
   - Pull default message builders into pure helpers to reuse across channels.  
   - Clarify error logging (reduce duplication, add context constants).

## 4. Validation & Risk Mitigation

- Maintain existing contract tests: `scheduler-test.js`, `comprehensive-qa.js`, push/DM tests, webhook processor suites.
- Add targeted unit tests for new shared helpers (mock channel provider, reminder orchestrator).
- Use feature flags or environment toggles to fall back to existing behaviour during rollout if necessary.
- Monitor logging volume and ensure structured metadata remains unchanged for downstream consumers.

## 5. Next Steps

1. Stakeholder review & sign-off on consolidation scope.  
2. Begin implementation following backlog order, committing helper modules first to reduce rebase surface.  
3. Execute full automated test suite and targeted manual verification (nudges, incentives, job queue replay).  
4. Update documentation (`tasks/PR-READINESS.md`, runbooks) to reflect new shared modules.
