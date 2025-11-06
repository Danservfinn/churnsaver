# ChurnSaver — Project Brief

ChurnSaver is a production‑grade, multi‑tenant retention automation platform for subscription and membership businesses (initially focused on Whop merchants). It securely ingests events, detects churn risk, and orchestrates targeted incentives and recovery workflows to preserve revenue.

## Key features
- Secure webhooks with idempotency, rate limiting, and request‑size controls
- Strict tenant isolation with PostgreSQL Row‑Level Security
- Incentives and case workflows with A/B testing and scheduling
- Resilient job processing (PG Boss), retries, circuit breakers, and metrics
- Privacy by design: encryption, consent, data export/deletion (GDPR‑ready)
- End‑to‑end observability: structured logs, telemetry, error monitoring, and slow‑query tracking
- Production readiness: migration tracking, rollbacks, incident response, and comprehensive tests

## Tech stack
Next.js + React, TypeScript, Node.js; PostgreSQL (Supabase), PG Boss, Redis; deployed on Vercel.

## Significance
Proactively increases LTV and safeguards revenue with enterprise‑grade security, reliability, and compliance.