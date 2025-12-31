---
title: Subscription Tiers
link: subscription-tiers
type: metadata
created_at: 2025-12-31
uuid: a1b2c3d4-tier-0001
tags: [billing, tiers, limits, pricing]
---

# Subscription Tiers

## Overview

ChurnSaver offers three subscription tiers with different recovery limits and features.

## Tier Comparison

| Feature | Free | Pro | Max |
|---------|------|-----|-----|
| Monthly Price | $0 | $49 | $99 |
| Recovery Limit | 10/month | 100/month | Unlimited |
| Revenue Cap | $1,000 | $10,000 | Unlimited |
| Push Notifications | ✅ | ✅ | ✅ |
| Direct Messages | ❌ | ✅ | ✅ |
| Custom Templates | ❌ | ❌ | ✅ |
| Priority Support | ❌ | ❌ | ✅ |

## Database Schema

```sql
CREATE TABLE subscriptions (
  company_id TEXT PRIMARY KEY,
  tier TEXT CHECK (tier IN ('free', 'pro', 'max')),
  total_recoveries_used INTEGER DEFAULT 0,
  monthly_recovered_revenue_cents INTEGER DEFAULT 0,
  month_start_date TIMESTAMP
);
```

## Limit Enforcement

Checked via `src/services/subscriptions.ts`:

```typescript
interface SubscriptionLimits {
  tier: 'free' | 'pro' | 'max';
  max_monthly_recovered_revenue_cents: number | null;
  max_total_recoveries: number | null;
  price_cents: number;
  name: string;
}
```

## API Endpoint

`GET /api/subscription?companyId=xxx`

Returns current tier and usage:

```json
{
  "subscription": {
    "tier": "pro",
    "total_recoveries_used": 45,
    "monthly_recovered_revenue_cents": 523400
  },
  "limits": {
    "max_total_recoveries": 100,
    "max_monthly_recovered_revenue_cents": 1000000
  }
}
```

## Related Files

| File | Purpose |
|------|---------|
| `src/app/api/subscription/route.ts` | API endpoint |
| `src/services/subscriptions.ts` | Business logic |
| `src/app/pricing/page.tsx` | Pricing UI |
