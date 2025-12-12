# Security Audit Checklist

## Scope
- API routes: `/api/webhooks/whop`, `/api/health`, `/api/monitoring/**`, `/api/cron/**`
- Authentication: Whop auth middleware, JWT validation, RLS enforcement
- Storage: events, recovery_cases, job_queue tables with RLS

## Preconditions
- Ensure required env vars are set (run `pnpm validate:env`).
- Production mode with `ALLOW_INSECURE_DEV=false`.

## Tests to Run
- Unit/Integration: `pnpm test`
- Security suites: `pnpm test:security` and `pnpm test:webhooks`
- E2E critical flows: `pnpm test:e2e` (with `E2E_BASE_URL`)

## OWASP Top 10 Quick Pass
- A01 Broken Access: RLS enabled; verify per-company queries.
- A02 Cryptographic Failures: AES-256-GCM with 16-byte auth tag.
- A03 Injection: Parameterized queries; validate payloads via Zod.
- A04 Insecure Design: Webhook signature + timestamp validation.
- A05 SSRF/Requests: Outbound calls constrained to Whop client.
- A06 Vulnerable Components: `pnpm audit`/Trivy in CI.
- A07 AuthZ: Rate limiting and session invalidation.
- A08 Data Integrity: Encrypted payload storage for webhooks.
- A09 Logging/Monitoring: Structured JSON + log drain + metrics.
- A10 SSRF/RCE: No dynamic eval; external calls are fixed.

## Pen Test Ideas
- Replay webhook with stale timestamp (> skew window) → expect 401.
- Tamper webhook signature → expect 401 with security event.
- RLS bypass attempt (wrong company id) → expect no data / 403.
- Rate limit overrun on `/api/` endpoints → expect 429 + metrics.

## Runbook
- Incident log: include requestId, companyId, endpoint.
- Containment: rotate `WHOP_WEBHOOK_SECRET` and `ENCRYPTION_KEY` if compromise suspected.
- Recovery: replay DLQ jobs after restoring service.

