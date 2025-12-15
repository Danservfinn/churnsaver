# Churn Saver - Production Readiness Plan

**Version**: 2.0 (Updated)  
**Created**: December 14, 2025  
**Last Updated**: December 14, 2025  
**Target Launch**: Q1 2026  
**Status**: In Progress - Verification Phase

---

## Executive Summary

This plan addresses all blocking and important issues identified in the security review to bring Churn Saver to production readiness for the Whop App Store marketplace.

### Current Status: Significant Progress Made

| Track | Status | Completion |
|-------|--------|------------|
| **A** Database Schema | ✅ Migrations exist | ~80% |
| **B** Concurrent Processing | 🔶 Needs verification | ~40% |
| **C** Security Hardening | 🔶 Needs verification | ~50% |
| **D** E2E Test Suite | ✅ Tests exist | ~70% |
| **E** Performance Testing | ❌ Not started | ~10% |
| **F** Observability & Docs | 🔶 Partial | ~30% |

### Remaining Effort: ~8-10 engineering days

---

## How to Use This Plan with Claude Code

```bash
cd ~/churnsaver
claude
```

Then use prompts like:
```
Read PRODUCTION_READINESS_PLAN.md and execute the next incomplete task. 
Follow AGENTS.md conventions for commits and testing.
```

### Conventions (from AGENTS.md)
- **Commits**: `fix: handle 429 retry-after` or `feat: add advisory locks`
- **Branch names**: `feature/web-advisory-locks`, `fix/web-security-hardening`
- **PR titles**: `[web] Add event-level advisory locks`
- **Before committing**: Always run `pnpm lint && pnpm test`
- **Test commands**: `pnpm turbo run test --filter web`

---

## Track A: Database Schema & Constraints

**Status**: ✅ MOSTLY COMPLETE  
**Remaining Effort**: 0.5 days (verification only)

### A1: One-Open-Case Constraint ✅ COMPLETE

**File exists**: `infra/migrations/011_one_open_case_constraint.sql`

**Verification needed**:
- [ ] Confirm migration has been applied to staging
- [ ] Confirm migration has been applied to production
- [ ] Run verification query:
```sql
-- Check if constraint exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'recovery_cases' 
AND indexname = 'idx_one_open_case_per_membership';
```

### A2: Event Idempotency Constraint ✅ COMPLETE

**File exists**: `infra/migrations/012_event_idempotency_constraint.sql`

**Verification needed**:
- [ ] Confirm migration has been applied to staging
- [ ] Confirm migration has been applied to production
- [ ] Run verification query:
```sql
-- Check if constraint exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'events' 
AND indexname = 'idx_events_company_whop_event_id';
```

### A3: Transaction Atomicity Verification 🔶 NEEDS VERIFICATION

**Tasks**:
- [ ] Audit `apps/web/src/server/services/cases.ts` for transaction usage
- [ ] Verify `createOrUpdateRecoveryCase` uses `sqlWithRLS.transaction()`
- [ ] Verify `markCaseRecovered` uses atomic transactions
- [ ] Add rollback test if missing: `apps/web/test/unit/services/cases-transaction.test.ts`

**Verification command**:
```bash
# Search for transaction usage in case services
grep -r "transaction" apps/web/src/server/services/cases.ts
grep -r "sqlWithRLS.transaction" apps/web/src/server/services/
```

---

## Track B: Concurrent Processing Protection

**Status**: 🔶 NEEDS VERIFICATION AND POSSIBLE IMPLEMENTATION  
**Remaining Effort**: 1-2 days

### B1: Event-Level Advisory Locks 🔶 VERIFY/IMPLEMENT

**Check if exists**:
```bash
# Search for advisory lock implementation
grep -r "advisory" apps/web/src/server/
ls apps/web/src/server/services/shared/
```

**If missing, create** `apps/web/src/server/services/shared/advisoryLock.ts`:
```typescript
import { createHash } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Generate a consistent 64-bit lock key from company + event IDs
 */
function generateEventLockKey(companyId: string, eventId: string): bigint {
  const keyString = `event:${companyId}:${eventId}`;
  const hash = createHash('sha256').update(keyString).digest('hex');
  return BigInt('0x' + hash.substring(0, 16));
}

/**
 * Acquire transaction-scoped advisory lock for event processing
 */
export async function acquireEventLock(
  client: any,
  companyId: string,
  eventId: string
): Promise<boolean> {
  const lockKey = generateEventLockKey(companyId, eventId);
  
  try {
    const result = await client.query<{ pg_try_advisory_xact_lock: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1)',
      [lockKey]
    );
    
    const acquired = result.rows[0]?.pg_try_advisory_xact_lock ?? false;
    
    logger.debug('Event advisory lock attempt', {
      companyId,
      eventId,
      lockKey: lockKey.toString(),
      acquired
    });
    
    return acquired;
  } catch (error) {
    logger.error('Failed to acquire event advisory lock', {
      companyId,
      eventId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
```

### B2: Integrate Advisory Locks into Webhook Handler 🔶 VERIFY/IMPLEMENT

**Check current implementation**:
```bash
# Check webhook handler for lock usage
grep -r "acquireEventLock\|advisory" apps/web/src/server/webhooks/
cat apps/web/src/server/webhooks/whop.ts | head -100
```

**If not integrated**, update `apps/web/src/server/webhooks/whop.ts` to use `processWebhookWithLock()`.

### B3: Concurrent Processing Integration Test 🔶 VERIFY/CREATE

**Check if exists**:
```bash
ls apps/web/test/integration/ | grep -i concurrent
```

**If missing, create** `apps/web/test/integration/concurrent-webhook.test.ts`

---

## Track C: Security Hardening

**Status**: 🔶 NEEDS VERIFICATION  
**Remaining Effort**: 1 day

### C1: Remove Production Escape Hatches 🔶 VERIFY

**Check for ALLOW_INSECURE_DEV**:
```bash
grep -r "ALLOW_INSECURE_DEV" apps/web/src/
```

**If found**, remove from production code paths in `apps/web/src/lib/db-rls.ts`.

**Verification**:
- [ ] No `ALLOW_INSECURE_DEV` in production code
- [ ] Security test exists: `apps/web/test/security/rls-bypass-prevention.test.ts`

### C2: Webhook Company Resolution Hardening 🔶 VERIFY

**Check current implementation**:
```bash
grep -r "resolveCompany\|WHOP_APP_ID" apps/web/src/server/webhooks/
```

**Verify**:
- [ ] No fallback to `process.env.WHOP_APP_ID` for company resolution
- [ ] Webhooks without resolvable company return 422
- [ ] Security logging for unresolvable webhooks

### C3: Timestamp Window Configuration 🔶 VERIFY

**Check configuration**:
```bash
grep -r "WEBHOOK_MAX_AGE\|timestampWindow\|300000" apps/web/src/lib/whop/
cat apps/web/src/lib/whop/webhookValidator.ts | head -50
```

**Verify**:
- [ ] Timestamp window is configurable
- [ ] Production uses tighter window (3 minutes recommended)

---

## Track D: E2E Test Suite

**Status**: ✅ MOSTLY COMPLETE  
**Remaining Effort**: 1 day (verification and gap filling)

### D1: E2E Infrastructure ✅ COMPLETE

**Existing files**:
- `apps/web/playwright.config.ts` ✅
- `apps/web/test/e2e/utils/` ✅
- `apps/web/test/e2e/helpers/` ✅

### D2: Critical User Journey Tests ✅ MOSTLY COMPLETE

**Existing test files**:
| File | Purpose | Status |
|------|---------|--------|
| `webhook-to-recovery.spec.ts` | Payment failure → case → recovery | ✅ Exists |
| `case-management.spec.ts` | Full case lifecycle | ✅ Exists |
| `multi-tenant-isolation.spec.ts` | Company A can't see Company B | ✅ Exists |
| `settings-configuration.spec.ts` | Configuration persistence | ✅ Exists |
| `authenticated-flows.spec.ts` | Auth flows | ✅ Exists |
| `critical-flows.spec.ts` | Critical paths | ✅ Exists |
| `accessibility.spec.ts` | A11y testing | ✅ Exists |

**Verification needed**:
```bash
# Run E2E tests to verify they pass
cd apps/web && pnpm exec playwright test --list

# Run actual tests
pnpm exec playwright test
```

**Tasks**:
- [ ] Verify all E2E tests pass
- [ ] Check test coverage meets 80% of critical journeys
- [ ] Fix any failing tests

### D3: CI Integration 🔶 VERIFY

**Check CI workflow**:
```bash
ls .github/workflows/ | grep -i e2e
cat .github/workflows/ci.yml 2>/dev/null || cat .github/workflows/test.yml 2>/dev/null
```

**Verify**:
- [ ] E2E tests run in CI
- [ ] Test reports uploaded as artifacts
- [ ] PR checks require E2E tests to pass

---

## Track E: Performance Testing

**Status**: ❌ NOT STARTED  
**Remaining Effort**: 2-3 days

### E1: Load Testing Infrastructure ❌ CREATE

**Check if exists**:
```bash
ls apps/web/test/performance/
```

**Create** `apps/web/test/performance/webhook-load.js`:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const webhookSuccess = new Rate('webhook_success');
const webhookDuration = new Trend('webhook_duration');

export const options = {
  scenarios: {
    steady_load: {
      executor: 'constant-arrival-rate',
      rate: 17, // ~1000/min
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    webhook_success: ['rate>0.99'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.WEBHOOK_SECRET || 'test_secret';

function generateWebhookPayload() {
  return {
    id: `evt_load_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'payment_failed',
    data: {
      membership: {
        id: `mem_load_${Math.random().toString(36).substr(2, 9)}`,
        user_id: `user_${Math.random().toString(36).substr(2, 9)}`,
        company_id: 'load-test-company'
      },
      payment: { failure_reason: 'insufficient_funds', amount: 2999 }
    },
    created_at: new Date().toISOString()
  };
}

function signPayload(payload) {
  const body = JSON.stringify(payload);
  const signature = crypto.hmac('sha256', WEBHOOK_SECRET, body, 'hex');
  return { body, signature: `sha256=${signature}` };
}

export default function() {
  const payload = generateWebhookPayload();
  const { body, signature } = signPayload(payload);
  
  const response = http.post(`${BASE_URL}/api/webhooks/whop`, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Whop-Signature': signature,
      'X-Whop-Timestamp': Math.floor(Date.now() / 1000).toString(),
    },
  });
  
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
  });
  
  webhookSuccess.add(success);
  webhookDuration.add(response.timings.duration);
  sleep(0.1);
}
```

### E2: Performance Baseline ❌ TODO

**Tasks**:
- [ ] Install k6: `brew install k6` (macOS) or download from k6.io
- [ ] Run baseline test against staging
- [ ] Document results in `apps/web/docs/performance/baseline.md`

**Performance Targets**:
| Metric | Target |
|--------|--------|
| Webhook throughput | 1000 req/min |
| Webhook p95 latency | <500ms |
| API p95 latency | <200ms |

---

## Track F: Observability & Documentation

**Status**: 🔶 PARTIAL  
**Remaining Effort**: 1 day

### F1: Structured Logging Audit 🔶 VERIFY

**Check logging consistency**:
```bash
# Find all logger.error calls and check context
grep -r "logger.error" apps/web/src/ | head -20
grep -r "logger.security" apps/web/src/
```

**Tasks**:
- [ ] Verify all error logs include: companyId, requestId, eventId (where applicable)
- [ ] Verify security events use `logger.security()`

### F2: Production Documentation 🔶 UPDATE

**Tasks**:
- [ ] Update `apps/web/docs/deployment/` with constraint verification steps
- [ ] Create/update runbook for common issues
- [ ] Update deployment checklist

---

## Execution Checklist for Claude Code

### Phase 1: Verification (Day 1)
```
1. Run all existing tests to establish baseline
2. Verify database migrations are applied
3. Check advisory lock implementation exists
4. Check security hardening status
5. Run E2E tests and report coverage
```

**Claude Code prompt**:
```
Verify the current state of PRODUCTION_READINESS_PLAN.md:
1. Run `pnpm turbo run test --filter web` and report results
2. Check if advisory locks exist in apps/web/src/server/services/shared/
3. Check if ALLOW_INSECURE_DEV exists anywhere in the codebase
4. Run `pnpm exec playwright test --list` to see E2E test count
Report status for each track.
```

### Phase 2: Gap Filling (Day 2-3)
```
1. Implement missing advisory locks (Track B)
2. Fix any security issues found (Track C)
3. Fix any failing E2E tests (Track D)
```

**Claude Code prompt**:
```
Based on the verification results, implement the first missing item from Track B.
Follow AGENTS.md conventions:
- Create feature branch: feature/web-advisory-locks
- Run tests after changes: pnpm turbo run test --filter web
- Commit format: feat: add event-level advisory locks
```

### Phase 3: Performance Testing (Day 4-5)
```
1. Create k6 load test script
2. Run baseline tests
3. Document results
```

### Phase 4: Final Verification (Day 6)
```
1. Run full test suite
2. Verify all checklist items complete
3. Update documentation
```

---

## Quick Reference: Test Commands

```bash
# All tests (from repo root)
pnpm turbo run test

# Web package only
pnpm turbo run test --filter web

# Single test file
pnpm turbo run test --filter web -- --run apps/web/test/webhooks.test.js

# E2E tests
cd apps/web && pnpm exec playwright test

# E2E with UI
cd apps/web && pnpm exec playwright test --ui

# Lint
pnpm turbo run lint

# Type check
pnpm turbo run typecheck --filter web
```

---

## Definition of Done

### Launch Readiness Checklist

- [ ] **Track A**: All database constraints verified on staging AND production
- [ ] **Track B**: Advisory locks implemented and tested with concurrent requests
- [ ] **Track C**: No security escape hatches, webhook hardening verified
- [ ] **Track D**: E2E tests pass, coverage ≥80% critical journeys
- [ ] **Track E**: Performance baseline documented, targets met
- [ ] **Track F**: Runbook complete, documentation updated

### Pre-Commit Checklist (every change)
- [ ] `pnpm lint` passes
- [ ] `pnpm turbo run test --filter web` passes
- [ ] Commit message follows convention: `type: description`

---

**Document Version**: 2.0  
**Last Updated**: December 14, 2025  
**Next Review**: After verification phase complete
