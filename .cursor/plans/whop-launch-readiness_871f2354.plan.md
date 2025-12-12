---
name: whop-launch-readiness
overview: Bring ChurnSaver to Whop App Store launch readiness on Vercel + Supabase in Cron-only mode, fully aligned with apps/web/docs/architecture/ARCHITECTURE.md, with explicit step-by-step tasks and verification gates.
todos:
  - id: baseline-gates
    content: Create release branch; enforce lint/typecheck/test/build gates after each phase.
    status: completed
  - id: tenant-id-no-fallback
    content: Remove/disable production fallback companyId derivation; require trusted companyId for tenant-scoped routes.
    status: in_progress
  - id: whop-context-resolution
    content: Verify Whop token/webhook payload shapes; implement correct server-side companyId resolution.
    status: pending
  - id: rls-with-check
    content: Add/verify RLS UPDATE policies include WITH CHECK to prevent company_id reassignment across tenants.
    status: pending
  - id: webhook-security
    content: Verify webhook signature + timestamp validation; confirm correct retry semantics and size/rate limits.
    status: pending
  - id: cron-only-pipeline
    content: Validate cron-only event drain and reminder scheduling logic; ensure time-budgeting and locking.
    status: pending
  - id: recovery-money-correctness
    content: Re-verify recovery lifecycle and plan-limit behavior; ensure KPIs match semantics; add/extend integration tests.
    status: pending
  - id: admin-endpoints
    content: Standardize admin endpoint auth and IP allowlist env var naming; ensure no token leaks.
    status: pending
  - id: export-path-safety
    content: Implement EXPORT_DIR path containment + extension allowlist; add security tests.
    status: pending
  - id: ci-db-security-job
    content: Add DB-security Vitest config + run it in Postgres-backed CI job after migrations.
    status: pending
  - id: staging-deploy-smoke
    content: Deploy to staging; run health/webhook/case creation smoke tests; validate cron schedules.
    status: pending
  - id: whop-store-submission
    content: Prepare Whop app config and store listing assets; complete final go/no-go checklist.
    status: pending
---

# ChurnSaver Whop App Store Launch Plan (Cron-only • Vercel + Supabase)

## Goal / Definition of Done

This plan is complete only when **all** of the following are true:

- **Architecture compliance**: Runtime behavior matches `apps/web/docs/architecture/ARCHITECTURE.md` (serverless-first, event-driven, cron-only default, RLS tenant isolation, signature/timestamp verification, rate limiting, encryption, observability).
- **Correctness**: Recovery case lifecycle, reminder scheduling, plan limits, and KPIs are correct under concurrency.
- **Security**: No known cross-tenant data paths; webhook ingress is replay-safe; admin endpoints are locked down; exports cannot be abused for path traversal; secrets are not logged.
- **Operational readiness**: Vercel + Supabase configured correctly (pooler URL, cron schedules, function timeouts), health checks are reliable, and monitoring is in place.
- **CI green**: Unit + integration + DB-security + e2e checks pass (same or stricter than `.github/workflows/automated-testing.yml`).
- **Whop readiness**: Whop app configuration, webhook settings, OAuth/embedded UX, and store listing assets are prepared and verified end-to-end.

## Operating Mode (fixed)

- **Cron-only mode** (per architecture): `ENABLE_PG_BOSS=false` in production. Webhooks persist to `events` table; Vercel Cron drains via `/api/cron/process-queue`.
- **Hosting**: Vercel + Supabase with PgBouncer pooler URL (port 6543).

## Phase 0 — Release discipline + baseline gates

1. **Create a release branch** (example: `release/whop-launch`).
2. **Freeze scope**: only changes required to satisfy this plan.
3. **Baseline gates (must pass before and after each phase):**

- `pnpm --filter "./apps/web" lint`
- `pnpm --filter "./apps/web" exec tsc --noEmit`
- `pnpm --filter "./apps/web" test`
- `pnpm --filter "./apps/web" build`

> Guardrail: After every file edit, run your repo’s static analysis step(s) for that file (Codacy rule) and fix findings immediately.

## Phase 1 — Multi-tenant identity + auth correctness (highest risk)

### 1.1 Eliminate “fallback companyId” patterns (production)

**Goal:** In production-like environments, the system must never infer tenant identity from app-level constants (e.g., `WHOP_APP_ID`) or client-side heuristics.

Actions:

- Audit and fix any places that:
- Use `env.WHOP_APP_ID` / `env.NEXT_PUBLIC_WHOP_APP_ID` as a **companyId**.
- Accept missing `companyId` and proceed for tenant-scoped operations.
- Primary files to audit:
- `apps/web/src/lib/auth/requireAuth.ts`
- `apps/web/src/lib/whop-sdk.ts`
- `apps/web/src/lib/whop/auth.ts`
- `apps/web/src/lib/context/whop.tsx`
- `apps/web/src/middleware.ts`

Acceptance:

- All tenant-scoped API routes reject requests when `companyId` is missing or invalid (except explicit QA demo bypass mode).

### 1.2 Make `companyId` derivation align with real Whop primitives

**Goal:** `companyId` must be derived from trusted Whop data, not assumptions.

Actions:

- Verify (via Whop docs + real payload samples) what fields exist in:
- Webhook payloads (`company_id` / `business_id` / membership object fields)
- `@whop/sdk` `verifyUserToken` response
- Embedded app context headers (if any)
- Update `apps/web/src/lib/whop-sdk.ts` and/or `apps/web/src/lib/whop/auth.ts` so:
- `userId` comes from verified token.
- `companyId` comes from a trusted Whop signal (explicit claim/header or a server-side lookup).
- **No production fallback** to appId.

Suggested robust pattern (implementation detail):

- Treat `companyId` as the Whop “business/company installing the app”. If the user token doesn’t include it, resolve it server-side by querying Whop API using the verified `userId` + app install context (do not trust client).

Tests to add/update:

- Unit tests for `getRequestContextSDK` and `requireAuthContext`:
- denies when companyId missing (production-like)
- accepts when companyId present
- QA demo bypass is strictly gated

## Phase 2 — RLS + schema hardening (DB-level guarantees)

### 2.1 Prove tenant isolation at the database boundary

**Goal:** Even if app code is wrong, Postgres must prevent cross-tenant reads/writes on tenant tables.

Actions:

- Review migrations (especially `infra/migrations/031_force_rls_and_context.sql`) and verify:
- `FORCE ROW LEVEL SECURITY` is enabled on all tenant tables listed in architecture.
- Policies use `get_current_company_id()` / `current_setting('app.current_company_id', true)` consistently.
- Ensure update policies include `WITH CHECK` so `company_id` cannot be reassigned across tenants.
- Example: `events_company_update_policy` should have both:
- `USING (company_id = get_current_company_id())`
- `WITH CHECK (company_id = get_current_company_id())`

Deliverables:

- A migration (new file under `infra/migrations/`) to enforce missing `WITH CHECK` constraints where needed.

### 2.2 Align “company resolution” behavior with architecture

Architecture expects events are stored with known `company_id` (and `company_resolution_status` exists to prevent ambiguity).

Actions:

- Decide and implement one consistent rule:
- **Recommended for launch:** If companyId can’t be resolved at webhook ingest, **reject** (4xx) and do not insert.
- Alternative: If you must store unresolved events, redesign schema safely (this is larger; avoid for launch).
- Ensure `/api/events/resolve` (admin endpoint) does not allow cross-tenant retagging. If it’s not required for launch, disable it in production builds or restrict it to “reprocess within same tenant”.

## Phase 3 — Webhook ingress correctness (security + idempotency)

### 3.1 Signature + timestamp verification

**Goal:** Strict HMAC verification + replay prevention per architecture.

Files:

- `apps/web/src/app/api/webhooks/whop/route.ts`
- `apps/web/src/server/webhooks/whop.ts`
- `apps/web/src/lib/whop/webhookValidator.ts` (if used)

Actions:

- Confirm these are true:
- signature verified with timing-safe compare
- timestamp skew bounded (prod recommended: `WEBHOOK_TIMESTAMP_SKEW_SECONDS=300`)
- request size limits enforced for webhooks
- failure modes return correct status codes for Whop retry semantics (generally 5xx triggers retry)

### 3.2 Idempotency + concurrency

**Goal:** Duplicate webhook deliveries and concurrent processing never create duplicate cases or duplicate revenue attribution.

Actions:

- Ensure:
- Unique constraint/index: `(company_id, whop_event_id)` on `events`
- Advisory lock keyed on webhook event id (or deterministic lock key) in ingest
- Processing pipeline checks “already processed” before side effects

Tests:

- Integration tests that:
- send same webhook twice concurrently → only one event row and one case update
- simulate replay with old timestamp → rejected

## Phase 4 — Cron-only processing pipeline (launch mode)

### 4.1 `/api/cron/process-queue`

**Goal:** Time-budgeted drain with global lock, processes only `company_resolution_status='resolved'` and `processed=false`.

Files:

- `apps/web/src/app/api/cron/process-queue/route.ts`
- `apps/web/src/server/services/eventProcessor.ts`

Actions:

- Verify:
- `CRON_SECRET` auth is required
- global advisory lock prevents overlapping runs
- strict per-run budget (architecture recommends ~5s, max 15s)
- processing is tenant-safe (RLS context set correctly for each company)

### 4.2 `/api/cron/reminders`

**Goal:** Only reminders mutate `attempts/last_nudge_at/next_reminder_at`.

Files:

- `apps/web/src/app/api/cron/reminders/route.ts`
- `apps/web/src/server/services/cases.ts`
- `apps/web/src/server/services/scheduler.ts` (ensure not used in cron-only launch)

Actions:

- Ensure reminder selection uses:
- `status='open'`
- `next_reminder_at <= now()`
- respects `creator_settings.reminder_offsets_days`
- Ensure sending is best-effort and does not abort the whole run.

## Phase 5 — Recovery correctness + plan limits (money)

### 5.1 Case lifecycle invariants

**Goal:** For a `(company_id, membership_id)` there is at most one open case; transitions are atomic and idempotent.

Files:

- `apps/web/src/server/services/cases.ts`
- `apps/web/src/server/services/subscriptions.ts`

Actions:

- Re-verify:
- failure ingestion does not inflate reminder attempt counters
- recovered attribution uses correct click window
- plan limits never credit revenue when downgrade happens

Tests:

- Integration tests:
- concurrent payment_failed events → 1 open case
- payment_succeeded within window → recovered
- downgrade click-through due to plan limit → `recovery_type=ORGANIC` and `recovered_amount_cents=0`

### 5.2 KPI correctness

**Goal:** Dashboard KPIs reflect intended business semantics.

Files:

- `apps/web/src/app/api/dashboard/kpis/route.ts`

Actions:

- Validate that KPI queries:
- treat organic revenue correctly (should not include click-through amounts when downgraded)
- are company-scoped under RLS

## Phase 6 — Security hardening & privacy

### 6.1 Admin endpoints consistency

**Goal:** All admin-only routes use the same auth + allowlist convention.

Files to standardize:

- `apps/web/src/app/api/security/metrics/route.ts`
- `apps/web/src/app/api/monitoring/queries/route.ts`
- `apps/web/src/app/api/events/resolve/route.ts`

Actions:

- Standardize env var name for IP allowlist (pick one, update all routes + env templates).
- Ensure:
- token length >= 32
- timing-safe compare
- log attempts without leaking tokens

### 6.2 GDPR export path safety

**Goal:** Prevent path traversal even if DB content is malicious.

Files:

- `apps/web/src/server/services/dataExport.ts`
- `apps/web/src/app/api/data/export/[id]/download/route.ts` (and related routes)

Actions:

- Enforce:
- stored file paths must be relative
- resolved path must remain within `EXPORT_DIR`
- extension allowlist (`.json`, `.csv`, `.zip` etc)
- deny symlink escapes

Tests:

- Security tests that attempt traversal strings and ensure download fails.

## Phase 7 — CI alignment (unit vs integration vs db-security)

### 7.1 Make CI reflect reality

**Goal:** Unit tests should not require Postgres; DB-security and integration tests should run with Postgres.

Actions:

- Keep unit tests fast and Postgres-free.
- Add a dedicated Vitest config (example: `vitest.db-security.config.ts`) that includes RLS/security suites.
- Update `.github/workflows/automated-testing.yml` to run DB-security tests in the existing Postgres-backed job (after migrations).

Acceptance:

- GitHub Actions is green on PR and main.

## Phase 8 — Staging deployment + smoke verification

### 8.1 Supabase

- Create/confirm Supabase project.
- Apply all migrations in order.
- Verify required extensions (`pgcrypto`), RLS forced, indexes exist.
- Use pooler URL (port 6543) for Vercel.

### 8.2 Vercel

- Configure env vars (see architecture doc section “Environment Variables”).
- Ensure `vercel.json` cron schedule matches architecture:
- `/api/cron/process-queue` every minute
- `/api/cron/reminders` every 15 min
- `/api/cron/maintenance` hourly
- Deploy to staging.

### 8.3 Smoke tests (staging)

- Hit:
- `/api/health`
- `/api/health/db`
- `/api/health/webhooks`
- Send Whop dashboard test webhook.
- Send real sample `payment.failed` webhook (from Whop sandbox) and confirm:
- event row inserted
- cron drain processes it
- recovery case created

## Phase 9 — Whop App Store submission checklist

**App configuration:**

- OAuth redirect URLs match staging + prod.
- Webhook events enabled: `payment.failed`, `payment.succeeded`, `membership.went_valid`, `membership.went_invalid`.
- Webhook URL points to prod `/api/webhooks/whop`.

**Listing assets:**

- App description (what it does, how it uses data)
- Privacy policy + support contact
- Screenshots of embedded dashboard + settings

**Final go/no-go:**

- All CI green
- Staging smoke tests green
- Production env vars set
- Monitoring active (uptime check on `/api/health`)
- No QA bypass enabled