---
name: Whop Launch Readiness
overview: Address multi-tenant provisioning, webhook/job processing, RLS safety, and restore critical tests to ship on Whop.
todos:
  - id: provision-companies
    content: Implement auto-provisioned companies and strict validation
    status: pending
  - id: webhook-hardening
    content: Enforce company match + idempotent webhook handling
    status: pending
  - id: pgboss-rls
    content: Run pg-boss workers with RLS-safe company context
    status: pending
  - id: rls-audit
    content: Replace plain sql with sqlWithRLS on tenant tables
    status: pending
  - id: recovery-invariants
    content: Validate one-open-case and recovery usage transaction paths
    status: pending
  - id: tests-unskip
    content: Unskip/fix RLS/webhook/KPI integration suites
    status: pending
---

# Whop Launch Readiness Plan

1) Tenant provisioning + company validation

- Add trusted auto-provision flow on webhook/OAuth path to insert `companies` rows (requires RLS-safe insert) before any processing; fail closed otherwise.
- Ensure company resolution uses both verified token context and payload/header, but must match an existing tenant; reject mismatches.
- Harden `validateCompanyContext` to use non-RLS bootstrap for provisioning and RLS path post-provision.

2) Webhook pipeline hardening

- In [`apps/web/src/app/api/webhooks/whop/route.ts`](apps/web/src/app/api/webhooks/whop/route.ts) and [`apps/web/src/server/webhooks/whop.ts`](apps/web/src/server/webhooks/whop.ts): enforce company lookup against provisioned tenants, keep HMAC+timestamp, and return 4xx on unresolved tenants; remove any fallback to default company. Ensure idempotent insert uses `(company_id, whop_event_id)` and advisory locks.
- Add explicit pending-resolution path only if provisioning can’t occur safely; otherwise fail closed.

3) Job queue readiness (pg-boss)

- Configure pg-boss workers to run under RLS: set company context before queries and validate via RLS-aware client; ensure the worker uses the provisioning-aware company check. Confirm singleton keys and advisory locks guard duplicates.

4) Data layer + RLS consistency

- Ensure all tenant tables (`events`, `recovery_cases`, `creator_settings`, `company_subscriptions`, attribution tables) are accessed via `sqlWithRLS` with `companyId`; remove/replace plain `sql` where tenant data is touched. Verify migrations: companies RLS policies allow bootstrap insert, and no default company fallback remains.

5) Money/recovery invariants

- Re-confirm partial unique index `idx_recovery_cases_one_open_per_membership` and `idx_cases_recovery_source_event_id_unique` usage in code paths: creation merges duplicates; recovery + usage accounting remain in a single transaction; late successes outside expiry marked organic.
- Add defensive checks so failures in usage recording roll back recovery status.

6) Tests and CI

- Unskip/fix critical integration suites (RLS cross-tenant, webhook idempotency/concurrency, KPI windows, expiry/late success, recovery usage transaction) under Supabase RLS. Ensure pg-boss path covered or feature-flagged. Keep unit coverage for signature/timestamp validation and company provisioning.

7) Observability and safety checks

- Standardize structured logs with companyId/membershipId/eventId; ensure no full payloads in prod logs. Add alerting for unresolved company, signature failure, and pg-boss worker errors.