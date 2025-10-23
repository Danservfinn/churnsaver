<!-- 724e4ce0-8106-4517-bd3d-55563e9685a0 fc8ae1b6-55dc-46fd-8bc6-a37dfcb71bcb -->
# Churn Saver v2 — Supabase + Local Scheduler Implementation Plan

### Overview

Build a Next.js (app router) app with a small server layer, Supabase Postgres for data, and a local-only scheduler for T+0/T+2/T+4 reminders. Focus on secure webhook ingestion, idempotent event handling, recovery case lifecycle, nudging services, KPI dashboard, and settings.

### Architecture & Directories

- apps/web
  - public
  - src/app (pages, API routes)
  - src/server (webhooks, services, cron)
  - src/server/webhooks
  - src/server/services
  - src/server/cron
  - src/components
  - src/lib (db, logger, env)
- infra (migrations, docs)
- tasks (agent-generated task files)

### Environment & Config (local-only)

- `.env.local` keys: `WHOP_APP_ID`, `WHOP_APP_SECRET`, `WHOP_WEBHOOK_SECRET`, `DATABASE_URL`, `ENCRYPTION_KEY`.
- Feature flags (defaults): `enable_push=true`, `enable_dm=true`, `default_incentive_days=3`, `reminder_offsets_days=[0,2,4]`, `kpi_attribution_window_days=14`.

### Database (Supabase Postgres)

- Migrations in `infra/migrations/001_init.sql` (+ indexes):
  - `recovery_cases` and `events` per §3
  - Add `creator_settings(company_id text pk, enable_push bool, enable_dm bool, incentive_days int, reminder_offsets_days int[], updated_at timestamptz)` to support T-016
  - Indexes: `events(whop_event_id unique)`, `recovery_cases(company_id, status)`, `recovery_cases(first_failure_at)`
```sql
-- core constraints
alter table events add constraint events_whop_event_id_unique unique (whop_event_id);
create index if not exists idx_cases_company_status on recovery_cases(company_id, status);
create index if not exists idx_cases_first_failure_at on recovery_cases(first_failure_at);
```


### Backend: Core Modules

- `src/lib/db.ts`: Postgres pool using `pg`, safe query helpers.
- `src/lib/env.ts`: validate required envs.
- `src/lib/logger.ts`: minimal structured logger.
- `src/server/webhooks/whop.ts` (POST):
  - Verify `WHOP_WEBHOOK_SECRET` signature
  - Upsert into `events` by `whop_event_id` (ignore dupes)
  - Lightweight ack (200 < 1s)
  - Hand off to processor (in-process) with retry-on-failure log
- `src/server/services/cases.ts`: open/merge cases on `payment_failed`, update attempts, last_nudge_at.
- `src/server/services/memberships.ts`: fetch manage URL; wrappers to Whop membership ops.
- `src/server/services/push.ts`: push helper with error logging + minimal retry guidance.
- `src/server/services/dm.ts`: DM helper (sanitized markdown).
- `src/server/services/incentives.ts`: add N free days once per case; track `incentive_days`.
- `src/server/services/schedule.ts`: compute due reminders based on `first_failure_at`, `attempts`, offsets.

### Local-only Reminder Scheduler

- `src/server/cron/processReminders.ts`: node-cron (every minute)
  - Query open cases where next offset is due and no success event since
  - Send push/DM with manage URL; update `attempts`, `last_nudge_at`
  - Cancel future reminders upon success/valid event
- `package.json` scripts: `dev`, `cron` (runs the scheduler alongside dev server)
```bash
# run in two terminals
pnpm dev
pnpm cron
```


### API Endpoints (App Router)

- `src/app/api/dashboard/kpis/route.ts`: compute KPIs per §3 (window param; default 14d)
- `src/app/api/dashboard/cases/route.ts`: list cases with pagination, filters
- `src/app/api/cases/export.csv/route.ts`: CSV export
- Server actions for case buttons (nudge again, cancel, terminate)

### UI (Minimal, iFrame-ready)

- Pages: `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/settings/page.tsx`
- Components: `KpiTiles`, `CasesTable`, `CaseActions`, `SettingsForm`
- Token placeholder to accept `x-whop-user-token` in iframe requests (log/validate only)

### Security & Idempotency

- Webhooks: HMAC signature validation; reject on mismatch
- Event store: dedupe by `whop_event_id`
- Case merge: within 14-day window treat failures as same case
- PII minimization; never store tokens or secrets in logs

### QA & Testing

- Simulated webhook events (fixtures) for failure/success paths
- Tests: webhook signature + idempotency; case open + T+0 nudge; success → recovered; reminders cancel on success; CSV shape

### Local Run

- Supabase Postgres database provisioned; set `DATABASE_URL`
- `pnpm install && pnpm dev` (Next.js) + `pnpm cron` (scheduler)
- Use curl to post test webhooks; verify cases and KPIs

### Deployment (future)

- Keep code serverless-friendly; cron worker can be moved to hosted cron or Supabase pg_cron later

### To-dos

- [ ] Initialize Next.js app and monorepo scaffolding under apps/web
- [ ] Configure Whop dev proxy notes and iframe boot placeholder
- [ ] Add DB migrations for events, recovery_cases, creator_settings; wire DATABASE_URL
- [ ] Implement webhook endpoint with signature validation and idempotent event upsert
- [ ] Build event processor mapping payment_failed to open/merge case
- [ ] Membership retrieval helper to get manage URL
- [ ] Push notification service wrapper
- [ ] Direct message service wrapper
- [ ] Incentive service to add N free days once per case
- [ ] Local scheduler (node-cron) for T+0/T+2/T+4 reminders
- [ ] Success handler to close/recover cases and attribute amounts
- [ ] Dashboard API for KPIs and cases list with pagination
- [ ] Dashboard UI (tiles, table, actions)
- [ ] Case actions (cancel/terminate) server actions + UI
- [ ] CSV export endpoint for cases
- [ ] Settings UI (channels, incentive days, reminder presets)
- [ ] QA tests for webhooks, idempotency, reminders, recovery attribution
- [ ] Prepare deployment plan + env secrets (post-local)
- [ ] Draft App Store listing and onboarding docs
- [ ] Pilot setup and metrics review