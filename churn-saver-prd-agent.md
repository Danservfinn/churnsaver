
# Churn Saver — Agent-Oriented PRD (v2)

**Project ID:** churn-saver  
**Version:** 2.0  
**Date:** 2025-10-20  
**Owner:** You (Creator)  
**Primary Consumer:** AI agent that generates task `.md` files from this PRD  
**Goal:** Increase recovery of involuntary churn on Whop by adding push/DM nudges with deep links to the Billing Portal, an optional “free days” incentive, and a recovery dashboard attributing Recovered $ to interventions.

---

## 0) Execution Contract (Machine-Readable)

```yaml
project:
  id: churn-saver
  repo_suggested_structure:
    - /apps/web
    - /apps/web/public
    - /apps/web/src/app
    - /apps/web/src/server
    - /apps/web/src/server/webhooks
    - /apps/web/src/server/services
    - /apps/web/src/components
    - /apps/web/src/lib
    - /infra
    - /tasks
  tech_stack:
    web: Next.js (app router), TypeScript
    datastore: Postgres (Supabase/Neon)
    queue: In-memory first; upgrade to a job queue if needed
    platform: Whop iFrame App
  environments:
    - local
    - production
  environment_variables:
    - WHOP_APP_ID
    - WHOP_APP_SECRET
    - WHOP_WEBHOOK_SECRET
    - DATABASE_URL
    - ENCRYPTION_KEY
  non_goals:
    - Email dunning replacement
    - Retry cadence modification
    - Replacing Whop auto-cancel
  pricing_model:
    plan: 29-usd-monthly-per-creator
```

---

## 1) Scope

**In-Scope**
- Push + DM nudges with Billing Portal deep link on payment failure
- Optional incentive: add N free days (default 3) on first failure
- Deadline-aware reminders (T+0, T+2, T+4 relative to first failure)
- Recovery Dashboard (Failures, Recoveries, Recovery Rate, Recovered $)
- Optional early actions: Cancel at period end, Terminate immediately
- CSV export of recovery cases

**Out-of-Scope (MVP)**
- Email sending/dunning
- Changing Whop retry schedules or auto-cancel behavior
- Multi-platform (non-Whop) processors

**Assumptions**
- Whop provides membership manage URL (Billing Portal) and webhook events for payment/membership state.
- Auto-cancel occurs around day 5 if still unpaid.
- DM and Push APIs are callable by the app server.

---

## 2) Success Metrics (Targets for first 30 days)
- Recovery rate ≥ 10% of failure cases
- CTR from nudges to Billing Portal ≥ 35%
- Time to first recovery ≤ 7 days post-install

---

## 3) Entities & Data Model (Logical)

```sql
-- recovery cases (one per membership failure episode)
recovery_cases(
  id uuid pk,
  company_id text not null,
  membership_id text not null,
  user_id text not null,
  first_failure_at timestamptz not null,
  last_nudge_at timestamptz,
  attempts int default 0,
  incentive_days int default 0,
  status text check (status in ('open','recovered','closed_no_recovery')) not null default 'open',
  failure_reason text,
  recovered_amount_cents int default 0,
  created_at timestamptz default now()
);

events(
  id uuid pk,
  whop_event_id text unique,
  type text,
  membership_id text,
  payload jsonb,
  processed_at timestamptz
);
```

**KPI Definitions**
- **Failures:** Count of distinct open cases in window
- **Recoveries:** Count of cases where a payment success event arrives within 14 days of first_failure_at
- **Recovery Rate:** Recoveries / Failures
- **Recovered $:** Sum(recovered_amount_cents)/100 over window

---

## 4) External Interfaces (Whop)

**Event Subscriptions (webhooks)**
- `payment_failed`
- `payment_succeeded`
- `membership_went_valid`
- `membership_went_invalid`
- (optional) `payment_pending`, `invoice_past_due`

**Operations (server)**
- Send Push: `notifications.sendPushNotification(...)`
- Send DM: `messages.sendDirectMessageToUser(...)`
- Add free days: `POST /v5/app/memberships/{id}/add_free_days` (body: `{"days": N}`)
- Cancel: `POST /v5/app/memberships/{id}/cancel` (query/body: `at_period_end: true|false`)
- Terminate: `POST /v5/app/memberships/{id}/terminate`
- Retrieve membership (for manage URL): `GET /v5/app/memberships/{id}`

**Security**
- Validate webhook signature; store event idempotently (ignore duplicates)
- Authenticate iframe calls via Whop user token/header
- Store minimal PII (ids + reason code only)

---

## 5) User Stories (Acceptance Criteria)

1. **Creator sees at-risk cases**: Within 60s of `payment_failed`, a case appears with member, reason, and T−until auto-cancel.
2. **Instant nudges with deep link**: On first failure, send Push and/or DM with “Manage billing” button deep-linking to Billing Portal.
3. **Incentive toggle**: If enabled and first failure, add N free days; record incentive_days.
4. **Deadline-aware reminders**: Schedule nudges for T+2 and T+4 unless a success/valid event arrives.
5. **Recovery attribution**: When `payment_succeeded`/`membership_went_valid` arrives within 14 days, mark as Recovered and sum amount into Recovered $.
6. **Optional early actions**: Creator can Cancel at period end or Terminate now from a case panel.
7. **Dashboard**: Tiles (Failures, Recoveries, Recovery Rate, Recovered $) + table + CSV export.

---

## 6) Non-Functional Requirements
- Webhook handler p95 < 1s; dashboard p95 < 2s on 4G
- Idempotent processing; retry with backoff on transient errors
- Logging and minimal audit trail of actions (nudges sent, incentive granted)
- Privacy: No card data stored

---

## 7) Environment & Config

```yaml
env:
  local:
    url: http://localhost:3000
    db: postgres://...
  production:
    url: https://YOUR_APP_DOMAIN
    db: postgres://...
feature_flags:
  enable_push: true
  enable_dm: true
  default_incentive_days: 3
  reminder_offsets_days: [0,2,4]
kpi_attribution_window_days: 14
```

---

## 8) Task Graph (IDs & Dependencies)

> The agent should create one `tasks/<ID>.md` file per task using the template in Section 9.

```yaml
tasks:
  - id: T-001
    title: Initialize Repo & App Template
    depends_on: []
  - id: T-002
    title: Configure Whop Dev Proxy & iFrame Boot
    depends_on: [T-001]
  - id: T-003
    title: Database Schema Migration
    depends_on: [T-001]
  - id: T-004
    title: Webhook Endpoint + Signature Validation + Idempotency
    depends_on: [T-003]
  - id: T-005
    title: Event Processor (payment_failed → open case)
    depends_on: [T-004]
  - id: T-006
    title: Membership Retrieval & Manage URL helper
    depends_on: [T-004]
  - id: T-007
    title: Push Notification Service
    depends_on: [T-004]
  - id: T-008
    title: Direct Message Service
    depends_on: [T-004]
  - id: T-009
    title: Incentive Service (add_free_days) + Toggle
    depends_on: [T-005]
  - id: T-010
    title: Reminder Scheduler (T+0/T+2/T+4)
    depends_on: [T-005, T-007, T-008]
  - id: T-011
    title: Success Handler (payment_succeeded → attribution)
    depends_on: [T-004, T-005]
  - id: T-012
    title: Dashboard API (KPIs + cases list)
    depends_on: [T-011, T-005]
  - id: T-013
    title: Dashboard UI (Tiles, Table, Actions)
    depends_on: [T-012]
  - id: T-014
    title: Case Actions: Cancel / Terminate
    depends_on: [T-005]
  - id: T-015
    title: CSV Export
    depends_on: [T-012]
  - id: T-016
    title: Settings UI (channels, incentive, reminders)
    depends_on: [T-007, T-008, T-009, T-010]
  - id: T-017
    title: QA: Test Webhook Scenarios & Idempotency
    depends_on: [T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-015, T-016]
  - id: T-018
    title: Deployment (prod) + Env Secrets
    depends_on: [T-017]
  - id: T-019
    title: App Store Listing & Onboarding Checklist
    depends_on: [T-013, T-016]
  - id: T-020
    title: Pilot Setup & Success Metrics Review
    depends_on: [T-018, T-019]
```

---

## 9) Task File Template (for agent)

Each task file path: `tasks/<ID>.md`

```markdown
# <ID>: <Title>

## Goal
<One-sentence outcome>

## Inputs
- Code modules to touch
- Config/ENV needed
- External API contracts (if any)

## Deliverables
- [ ] Code artifacts (files/dirs)
- [ ] Tests
- [ ] Docs/Notes

## Steps
1. ...
2. ...
3. ...

## Acceptance Criteria
- [ ] Functional checks
- [ ] Error/idempotency checks
- [ ] Logging/metrics

## Dependencies
- Blocked by: <IDs>
- Unblocks: <IDs>

## Estimate
S: ~2h | M: ~4h | L: ~8h

## Labels
backend | frontend | infra | qa | release

```

---

## 10) Task Specifications

### T-001: Initialize Repo & App Template
**Goal:** Create Next.js app with TypeScript, set up monorepo scaffolding.  
**Inputs:** None  
**Deliverables:** `/apps/web` with app router, TS config, lint, prettier.  
**Steps:**
1. Create repo and Next.js app (`/apps/web`).
2. Add base pages: `/`, `/dashboard`, `/settings`.
3. Add shared libs dir: `/src/lib/`.
4. Add basic auth placeholder for iFrame token (no real auth yet).
**Acceptance:**
- [ ] App builds & runs locally
- [ ] Lint passes
**Labels:** backend, frontend

### T-002: Configure Whop Dev Proxy & iFrame Boot
**Goal:** Run locally inside Whop iFrame for realistic context.  
**Inputs:** WHOP_APP_ID/SECRET, Dev Proxy config.  
**Deliverables:** Boot script + docs in `/infra/dev-proxy.md`.  
**Steps:**
1. Configure dev proxy for iframe origin.
2. Verify `x-whop-user-token` is present on iframe requests.
3. Document local run instructions.  
**Acceptance:**
- [ ] App renders in Whop iframe locally
- [ ] Token logged/validated

### T-003: Database Schema Migration
**Goal:** Create Postgres tables for cases + events.  
**Inputs:** DATABASE_URL  
**Deliverables:** `/infra/migrations/001_init.sql` (tables from §3).  
**Acceptance:**
- [ ] Tables created; RLS optional for MVP
- [ ] DB URL wired to app

### T-004: Webhook Endpoint + Signature Validation + Idempotency
**Goal:** Receive Whop webhooks securely.  
**Inputs:** WHOP_WEBHOOK_SECRET  
**Deliverables:** `/src/server/webhooks/whop.ts` + test.  
**Steps:**
1. Verify signature.
2. Upsert to `events` by `whop_event_id`.
3. Ack quickly; enqueue processing.  
**Acceptance:**
- [ ] Duplicate events ignored
- [ ] 200 response within 1s

### T-005: Event Processor (payment_failed → open case)
**Goal:** Translate webhook to `recovery_cases` row.  
**Inputs:** Event payload contract.  
**Deliverables:** `/src/server/services/cases.ts`.  
**Acceptance:**
- [ ] New case created within 60s of event
- [ ] Reason captured

### T-006: Membership Retrieval & Manage URL helper
**Goal:** Retrieve membership & extract manage URL.  
**Deliverables:** `/src/server/services/memberships.ts`.  
**Acceptance:**
- [ ] Helper returns manage URL or structured error

### T-007: Push Notification Service
**Goal:** Server helper to send push.  
**Deliverables:** `/src/server/services/push.ts`.  
**Acceptance:**
- [ ] Push API called with correct payload
- [ ] Errors logged; retry policy documented

### T-008: Direct Message Service
**Goal:** Server helper to DM a user.  
**Deliverables:** `/src/server/services/dm.ts`.  
**Acceptance:**
- [ ] DM API called; sanitized markdown allowed

### T-009: Incentive Service (add_free_days) + Toggle
**Goal:** Add N free days on first failure if enabled.  
**Deliverables:** `/src/server/services/incentives.ts`, settings flag.  
**Acceptance:**
- [ ] Adds days once per case
- [ ] Records incentive_days

### T-010: Reminder Scheduler (T+0/T+2/T+4)
**Goal:** Schedule nudges relative to first failure.  
**Deliverables:** `/src/server/services/schedule.ts`.  
**Acceptance:**
- [ ] T+0 immediate nudge
- [ ] T+2 and T+4 queued; canceled on success

### T-011: Success Handler (payment_succeeded → attribution)
**Goal:** Close case as recovered and attribute amount.  
**Deliverables:** Update `recovery_cases`, attribution logic.  
**Acceptance:**
- [ ] Recovered within 14 days closes case
- [ ] Amount summed into recovered_amount_cents

### T-012: Dashboard API (KPIs + cases list)
**Goal:** Serve KPIs and cases for UI.  
**Deliverables:** `/src/app/api/dashboard/*.ts`.  
**Acceptance:**
- [ ] KPI math matches §3
- [ ] Pagination for cases

### T-013: Dashboard UI (Tiles, Table, Actions)
**Goal:** Visualize KPIs & cases; action buttons.  
**Deliverables:** `/src/app/dashboard/page.tsx` + components.  
**Acceptance:**
- [ ] Tiles show correct numbers
- [ ] Table includes actions (Nudge again, Cancel, Terminate)

### T-014: Case Actions: Cancel / Terminate
**Goal:** Invoke membership cancel/terminate from UI.  
**Deliverables:** Server actions + UI buttons.  
**Acceptance:**
- [ ] Confirmations required
- [ ] Success/error toast

### T-015: CSV Export
**Goal:** Export cases to CSV.  
**Deliverables:** `/src/app/api/cases/export.csv`.  
**Acceptance:**
- [ ] CSV opens in Excel/Sheets
- [ ] Contains key columns

### T-016: Settings UI (channels, incentive, reminders)
**Goal:** Creator controls for channels & timing.  
**Deliverables:** `/src/app/settings/page.tsx`.  
**Acceptance:**
- [ ] Toggle push/DM
- [ ] Slider for incentive days
- [ ] Preset for reminders

### T-017: QA: Test Webhook Scenarios & Idempotency
**Goal:** Validate flows end-to-end with simulated events.  
**Deliverables:** `/tests/webhooks.test.ts` + checklist.  
**Acceptance:**
- [ ] payment_failed → case open → T+0 nudge
- [ ] payment_succeeded → recovered
- [ ] Duplicate events ignored

### T-018: Deployment (prod) + Env Secrets
**Goal:** Deploy and secure environment.  
**Deliverables:** Production URL, env secrets set.  
**Acceptance:**
- [ ] Health check OK
- [ ] Webhook reachable

### T-019: App Store Listing & Onboarding Checklist
**Goal:** Publish listing & guide creators.  
**Deliverables:** `/docs/listing.md`, `/docs/onboarding.md`.  
**Acceptance:**
- [ ] Screenshots + copy
- [ ] Onboarding steps tested

### T-020: Pilot Setup & Success Metrics Review
**Goal:** Run 2-week pilot with 5 creators.  
**Deliverables:** `/docs/pilot-report.md`.  
**Acceptance:**
- [ ] ≥10% recovery achieved or iterate plan produced

---

## 11) QA Checklist (Global)

- [ ] Webhook signature verified; duplicates ignored
- [ ] Case merges multiple failures within 14-day window
- [ ] Push/DM messages include manage URL
- [ ] Incentive applied only once per case
- [ ] Reminders cancel on success
- [ ] Dashboard KPIs reconcile with raw events
- [ ] CSV exports valid
- [ ] PII minimized; secrets not logged

---

## 12) Risks & Mitigations

- **Low CTR:** Iterate copy and button prominence; A/B later.  
- **Webhook flakiness:** Queue + retries; idempotency keys.  
- **Creator confusion with native dunning:** Explain we add push/DM + incentives; do not alter emails/retries.

---

## 13) Release Plan (3 Days)

- **Day 1:** T-001..T-006  
- **Day 2:** T-007..T-013  
- **Day 3:** T-014..T-020

---

## 14) Glossary

- **Case:** A tracked failure episode tied to one membership.  
- **Recovered $:** Dollar value of successful payment attributed to nudges within 14 days.  
- **T+N:** N days after first failure event.
