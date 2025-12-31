---
title: Dashboard System
link: dashboard-system
type: metadata
created_at: 2025-12-31
uuid: a1b2c3d4-dash-0001
tags: [dashboard, kpis, cases, ui]
---

# Dashboard System

## Overview

The dashboard displays recovery metrics, active cases, and performance KPIs for authenticated companies.

## Key Components

### Dashboard Page (`src/app/dashboard/[companyId]/`)

Dynamic route that loads company-specific data:
- `page.tsx` - Server component, handles auth
- `DashboardClient.tsx` - Client component, renders UI

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/dashboard/kpis?companyId=xxx` | Recovery metrics |
| `GET /api/dashboard/cases?companyId=xxx` | Case list with pagination |
| `GET /api/subscription?companyId=xxx` | Tier and limits |

### KPI Metrics

```typescript
interface DashboardKpis {
  activeCases: number;
  recoveries: number;
  organicRecoveries: number;
  recoveryRate: number;
  recoveredRevenueCents: number;
  organicRevenueCents: number;
  totalCases: number;
  windowDays: number;
  calculatedAt: string;
}
```

### Case Statuses

| Status | Description |
|--------|-------------|
| `open` | Active recovery in progress |
| `recovered` | Successfully recovered |
| `lost` | Recovery failed/expired |
| `cancelled` | Manually cancelled |

### Recovery Types

| Type | Description |
|------|-------------|
| `CLICK_THROUGH` | User clicked recovery link |
| `ORGANIC` | User recovered without link |
| `null` | Not yet recovered |

## Data Flow

```
User → /dashboard → Redirect to /dashboard/[companyId]
                  → Fetch KPIs via /api/dashboard/kpis
                  → Fetch Cases via /api/dashboard/cases
                  → Render DashboardClient
```

## Related Files

| File | Purpose |
|------|---------|
| `src/app/dashboard/[companyId]/DashboardClient.tsx` | Main UI |
| `src/app/api/dashboard/kpis/route.ts` | KPI endpoint |
| `src/app/api/dashboard/cases/route.ts` | Cases endpoint |
| `src/components/dashboard/` | UI components |
