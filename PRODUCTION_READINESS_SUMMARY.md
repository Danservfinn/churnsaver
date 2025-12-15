# Churn Saver - Production Readiness Summary

## Quick Reference Card

### 🚨 Blocking Issues (Must Fix Before Launch)

| # | Issue | Track | Effort | Owner |
|---|-------|-------|--------|-------|
| 1 | Missing one-open-case database constraint | A | 1 day | Backend |
| 2 | Missing event idempotency constraint | A | 1 day | Backend |
| 3 | No advisory lock for concurrent event processing | B | 1 day | Backend |
| 4 | E2E test suite non-existent (~5% coverage) | D | 5 days | QA/Full-stack |
| 5 | Company context fallback bypass risk | C | 1 day | Security |
| 6 | Transaction atomicity not verified | A | 1 day | Backend |

### ⚠️ Important Issues (Fix Soon After Launch)

| # | Issue | Track | Effort |
|---|-------|-------|--------|
| 7 | Performance testing missing (~10%) | E | 3 days |
| 8 | XSS/CSRF tests missing | C | 1 day |
| 9 | Timestamp window could be tighter | C | 0.5 day |
| 10 | Structured logging inconsistent | F | 1 day |

---

## Timeline Overview (2 Weeks)

```
WEEK 1: Foundation
═══════════════════════════════════════════════════════════════════════

Day 1    Day 2    Day 3    Day 4    Day 5
──────   ──────   ──────   ──────   ──────
┌─────────────────────────────────────────┐
│  TRACK A: Database Constraints          │ ← P0 BLOCKING
│  A1: One-open-case constraint           │
│  A2: Event idempotency                  │
│  A3: Transaction atomicity              │
└─────────────────────────────────────────┘
         ┌─────────────────────────┐
         │  TRACK B: Concurrency   │ ← P0 BLOCKING  
         │  B1: Event locks        │
         │  B2: Integration tests  │
         └─────────────────────────┘
┌─────────────────────────────────┐
│  TRACK C: Security Hardening    │ ← P0 BLOCKING
│  C1: Remove escape hatches      │
│  C2: Company resolution         │
│  C3: Timestamp tightening       │
└─────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  TRACK D: E2E Test Suite                            │ ← P0 BLOCKING
│  D1: Infrastructure setup                           │
│  D2: Critical user journey tests (starts Day 2)    │
└─────────────────────────────────────────────────────┘
                              ┌─────────────────┐
                              │  TRACK E: Perf  │ ← P1
                              │  E1: k6 setup   │
                              └─────────────────┘


WEEK 2: Testing & Launch
═══════════════════════════════════════════════════════════════════════

Day 6    Day 7    Day 8    Day 9    Day 10
──────   ──────   ──────   ──────   ──────
┌─────────────────────────────────────────────────────────────────┐
│  STAGING VALIDATION (All Tracks)                                │
└─────────────────────────────────────────────────────────────────┘
         ┌─────────────────────────────────────────┐
         │  TRACK D: E2E cont'd + CI integration   │
         └─────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  TRACK E: Performance baseline & optimization       │
└─────────────────────────────────────────────────────┘
                   ┌───────────────────────┐
                   │  TRACK F: Docs & Obs  │ ← P2
                   └───────────────────────┘
                                        ┌─────────────────────┐
                                        │ 🚀 PRODUCTION DEPLOY│
                                        └─────────────────────┘
```

---

## Execution Commands for Claude Code

### Track A: Database Migrations

```bash
# Create migration files
cd /Users/kurultai/churnsaver/infra/migrations

# Run migrations on staging
cd /Users/kurultai/churnsaver/apps/web
pnpm db:migrate
```

### Track B: Advisory Locks

```bash
# Edit the advisory lock file
code /Users/kurultai/churnsaver/apps/web/src/server/services/shared/advisoryLock.ts

# Edit the webhook handler
code /Users/kurultai/churnsaver/apps/web/src/server/webhooks/whop.ts
```

### Track C: Security Hardening

```bash
# Edit RLS file
code /Users/kurultai/churnsaver/apps/web/src/lib/db-rls.ts

# Edit webhook validator
code /Users/kurultai/churnsaver/apps/web/src/lib/whop/webhookValidator.ts
```

### Track D: E2E Tests

```bash
# Install Playwright
cd /Users/kurultai/churnsaver/apps/web
pnpm add -D @playwright/test
npx playwright install

# Run E2E tests
pnpm test:e2e
```

### Track E: Performance Tests

```bash
# Install k6
brew install k6

# Run load tests
k6 run test/performance/webhook-load.js
```

---

## Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Database constraints | All verified | `\d+ recovery_cases` |
| E2E coverage | ≥80% critical paths | Playwright report |
| Webhook throughput | 1000/min | k6 results |
| Webhook p95 latency | <500ms | k6 results |
| Security findings | 0 critical/high | Audit report |
| Concurrent test | 100 iterations pass | Integration test |

---

## Launch Readiness Checklist

### Week 1 Exit Criteria
- [ ] Migrations 011, 012 merged and tested on staging
- [ ] Advisory lock code merged
- [ ] Security hardening complete
- [ ] E2E infrastructure ready
- [ ] k6 test script ready

### Week 2 Exit Criteria (Launch Gate)
- [ ] All staging validations pass
- [ ] E2E tests green in CI
- [ ] Performance targets met
- [ ] Documentation updated
- [ ] Team trained on runbook

---

**Ready to execute?** Start with Track A (database constraints) and Track C (security hardening) in parallel.
