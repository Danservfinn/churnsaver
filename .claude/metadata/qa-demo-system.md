---
title: QA Demo System
link: qa-demo-system
type: metadata
created_at: 2025-12-31
uuid: a1b2c3d4-demo-0001
tags: [testing, demo, bypass, development]
---

# QA Demo System

## Overview

The QA Demo system allows testing the application without real Whop authentication or Stripe subscriptions. It provides mock data for all major features.

## Activation Methods

### Server-Side (`isQaDemoBypassEnabled`)

1. **Environment Variables**
   ```bash
   QA_DEMO_BYPASS=true
   NEXT_PUBLIC_QA_DEMO_BYPASS=true
   ```

2. **Query Parameters**
   ```
   ?qa_demo=true
   ?demo=true
   ```

3. **Request Headers**
   ```
   X-QA-Demo-Bypass: true
   ```

### Client-Side (`isQaDemoClient`)

Checks env vars, localStorage, and query params:
```typescript
localStorage.setItem('qa_demo_bypass', 'true');
```

## Security

**CRITICAL**: QA bypass is DISABLED in production:

```typescript
if (isProductionLikeEnvironment() || process.env.NODE_ENV === 'production') {
  return false;
}
```

## Mock Data Functions

| Function | Returns |
|----------|---------|
| `getQaDemoContext()` | Company/user IDs |
| `getQaDemoDashboardKpis()` | Dashboard metrics |
| `getQaDemoDashboardCases()` | Sample recovery cases |
| `getQaDemoSettings()` | Configuration settings |
| `getQaDemoSubscription()` | Max tier subscription |

## Demo Subscription (Max Tier)

```typescript
{
  tier: 'max',
  max_monthly_recovered_revenue_cents: null, // Unlimited
  max_total_recoveries: null, // Unlimited
  price_cents: 9900,
  name: 'Max'
}
```

## Usage

```bash
# Local development
pnpm dev
open http://localhost:3000/dashboard?qa_demo=true
```

## Related Files

| File | Purpose |
|------|---------|
| `src/lib/qaDemo.ts` | Core implementation |
| `src/lib/env.ts` | Environment detection |
| `test/unit/qa-demo-bypass.test.ts` | Tests |
