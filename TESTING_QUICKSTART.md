# ChurnSaver Testing Quick Start Guide

## TL;DR - Get Testing in 5 Minutes

```bash
# 1. Run unit tests (no setup required)
cd apps/web && pnpm test

# 2. Run E2E tests locally
cd apps/web && pnpm test:e2e:local

# 3. Seed test data (requires DATABASE_URL)
pnpm tsx scripts/seed-test-data.ts > seed.sql
psql $DATABASE_URL < seed.sql

# 4. Run all user tests
pnpm tsx scripts/run-user-tests.ts --tier=all --suite=all
```

## Important: Vercel Deployment Protection

If E2E tests against Vercel URLs return 401, you need to either:

1. **Disable Protection** in Vercel Dashboard → Settings → Deployment Protection
2. **Deploy bypass config** - the vercel.json includes a protection bypass secret
3. **Run locally** - `pnpm test:e2e:local` runs against localhost

See `apps/web/docs/VERCEL_DEPLOYMENT_PROTECTION.md` for details.

---

## Test Data Overview

### Companies Created
| Tier | Count | Recovery Limit |
|------|-------|----------------|
| Free | 3 | 3/month |
| Pro Monthly | 3 | 100/month |
| Pro Annual | 3 | 100/month |
| Max Monthly | 3 | Unlimited |
| Max Annual | 3 | Unlimited |
| Edge Cases | 3 | Varies |

### Test Data Volumes
- **Memberships**: ~4,500 total
- **Recovery Cases**: ~1,500 total
- **Webhook Events**: ~8,000 total
- **Recovery Actions**: ~5,000 total

---

## Running Specific Tests

### By Tier
```bash
# Test only Free tier
pnpm tsx scripts/run-user-tests.ts --tier=free

# Test only Pro tier
pnpm tsx scripts/run-user-tests.ts --tier=pro

# Test only Max tier
pnpm tsx scripts/run-user-tests.ts --tier=max
```

### By Suite
```bash
# Webhook tests only
pnpm tsx scripts/run-user-tests.ts --suite=webhooks

# API tests only
pnpm tsx scripts/run-user-tests.ts --suite=api

# Tier limit tests
pnpm tsx scripts/run-user-tests.ts --suite=tierLimits

# Notification tests
pnpm tsx scripts/run-user-tests.ts --suite=notifications

# Security tests
pnpm tsx scripts/run-user-tests.ts --suite=security
```

---

## Mock Webhook Testing

### Generate Single Webhooks
```bash
# Payment failed
pnpm tsx scripts/mock-webhooks.ts --type=payment_failed

# Payment succeeded
pnpm tsx scripts/mock-webhooks.ts --type=payment_succeeded

# Generate 10 events
pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --count=10
```

### Fire Webhooks to Endpoint
```bash
# Fire to local dev
pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --fire

# Fire to specific URL
pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --fire --url=http://localhost:3000/api/webhooks/whop
```

### Run Test Scenarios
```bash
# List available scenarios
pnpm tsx scripts/mock-webhooks.ts --list-scenarios

# Run full recovery cycle
pnpm tsx scripts/mock-webhooks.ts --scenario=full_recovery_cycle --fire

# Run duplicate event test
pnpm tsx scripts/mock-webhooks.ts --scenario=duplicate_event --fire

# Run all scenarios
pnpm tsx scripts/mock-webhooks.ts --scenario=all --fire --verbose
```

---

## Critical Test Scenarios

### Tier Limits (Must Test!)

| Scenario | Test Command | Expected Result |
|----------|--------------|-----------------|
| Free 3 recovery limit | `--tier=free --suite=tierLimits` | 4th recovery not counted |
| Pro 100 recovery limit | `--tier=pro --suite=tierLimits` | 101st recovery not counted |
| Max unlimited | `--tier=max --suite=tierLimits` | All recoveries counted |

### Webhook Edge Cases

| Scenario | Test Command | Expected Result |
|----------|--------------|-----------------|
| Invalid signature | `--suite=webhooks` | 401 Unauthorized |
| Duplicate event | `--scenario=duplicate_event --fire` | Only 1 case created |
| Out-of-order events | `--scenario=full_recovery_cycle --fire` | Handled gracefully |
| Rapid fire (10/sec) | `--scenario=rapid_fire --fire` | No dropped events |

### Multi-Tenant Security

| Scenario | Test Command | Expected Result |
|----------|--------------|-----------------|
| Company isolation | `--suite=security` | Company A can't see B's data |
| RLS enforcement | `--suite=security` | DB-level isolation |
| Auth token validation | `--suite=security` | Invalid tokens rejected |

---

## Dashboard Testing Checklist

### Free Tier User
- [ ] Can view case list
- [ ] Can send manual nudge
- [ ] Cannot access Analytics (upgrade prompt)
- [ ] Cannot export CSV (upgrade prompt)
- [ ] Sees "3/3 recoveries" limit warning when hit

### Pro Tier User
- [ ] Can view case list + KPIs
- [ ] Can send manual nudge
- [ ] Can access Analytics
- [ ] Can export CSV
- [ ] Cannot create custom templates (upgrade prompt)
- [ ] Sees "100/100 recoveries" limit warning when hit

### Max Tier User
- [ ] Full dashboard access
- [ ] Can create custom templates (up to 10 per channel)
- [ ] A/B testing available
- [ ] No recovery limit warnings
- [ ] Priority support badge visible

---

## Notification Testing

### Test Push Notifications
```bash
# Verify push is sent on payment_failed
pnpm tsx scripts/mock-webhooks.ts --type=payment_failed --fire

# Check push notification in Whop API logs or mock
```

### Test DM Notifications
```bash
# Verify DM is sent
# Check DM delivery in Whop API logs or mock
```

### Test Incentive Application
```bash
# Verify 3 free days added on first failure
# Check membership extended by incentive_days
```

---

## Performance Testing

### Load Test with k6
```bash
# Install k6
brew install k6

# Run webhook load test
k6 run scripts/k6-webhook-load.js

# Run dashboard load test
k6 run scripts/k6-dashboard-load.js
```

### Expected Benchmarks
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Webhook processing | <1s p95 | k6 load test |
| Dashboard load | <2s on 4G | Lighthouse |
| API response | <200ms p95 | New Relic |
| CSV export (10k) | <60s | Manual test |

---

## Debugging Failed Tests

### Common Issues

**Webhook signature invalid**
```bash
# Check WHOP_WEBHOOK_SECRET matches
echo $WHOP_WEBHOOK_SECRET
```

**Cases not created**
```sql
-- Check events table
SELECT * FROM events WHERE processed = false;

-- Check for errors
SELECT * FROM events WHERE error IS NOT NULL;
```

**Multi-tenant leak**
```sql
-- Verify RLS is enabled
SELECT * FROM pg_policies WHERE tablename = 'recovery_cases';

-- Test isolation
SET app.current_company_id = 'company_a';
SELECT * FROM recovery_cases; -- Should only show company_a
```

---

## Test Data Reset

### Clear All Test Data
```sql
-- WARNING: Deletes ALL test data
TRUNCATE recovery_actions CASCADE;
TRUNCATE recovery_cases CASCADE;
TRUNCATE events CASCADE;
TRUNCATE creator_settings CASCADE;
DELETE FROM companies WHERE id LIKE 'company_%';
```

### Clear Specific Tier
```sql
-- Clear only Free tier test data
DELETE FROM recovery_cases WHERE company_id LIKE 'company_free%';
DELETE FROM events WHERE company_id LIKE 'company_free%';
DELETE FROM companies WHERE id LIKE 'company_free%';
```

---

## CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/user-tests.yml
name: User Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: pnpm install
      - run: pnpm tsx scripts/seed-test-data.ts > seed.sql
      - run: psql $DATABASE_URL < seed.sql
      - run: pnpm tsx scripts/run-user-tests.ts --tier=all

      - uses: actions/upload-artifact@v4
        with:
          name: test-report
          path: test-results/
```

---

## Full Testing Workflow

### Day 1-2: Foundation
1. [ ] Set up test environment
2. [ ] Seed test data
3. [ ] Run webhook signature tests
4. [ ] Run basic case creation tests

### Day 3-5: Core Features
1. [ ] Test all webhook event types
2. [ ] Test case lifecycle (open → recovered)
3. [ ] Test notifications (Push + DM)
4. [ ] Test incentive application
5. [ ] Test dashboard and KPIs

### Day 6-7: Tier Testing
1. [ ] Test Free tier (3 recovery limit)
2. [ ] Test Pro tier (100 recovery limit + features)
3. [ ] Test Max tier (unlimited + custom templates)
4. [ ] Test tier upgrades/downgrades

### Day 8-9: Edge Cases
1. [ ] Test duplicate events
2. [ ] Test concurrent processing
3. [ ] Test error recovery
4. [ ] Test data retention

### Day 10-11: Security & Performance
1. [ ] Test multi-tenant isolation
2. [ ] Test auth token validation
3. [ ] Run load tests
4. [ ] Run performance benchmarks

### Day 12: Final Validation
1. [ ] End-to-end user journeys
2. [ ] Accessibility audit
3. [ ] Generate final report
4. [ ] Document any issues

---

## Getting Help

- **Full documentation**: `COMPREHENSIVE_USER_TESTING_PLAN.md`
- **Seed data script**: `scripts/seed-test-data.ts`
- **Mock webhooks**: `scripts/mock-webhooks.ts`
- **Test runner**: `scripts/run-user-tests.ts`
- **Issues**: Create GitHub issue with test logs

---

*Happy testing!*
