---
title: API Endpoints
link: api-endpoints
type: code_index
created_at: 2025-12-31
uuid: a1b2c3d4-idx-0002
tags: [api, routes, endpoints]
---

# API Endpoints

## Dashboard APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dashboard/kpis` | Recovery metrics |
| GET | `/api/dashboard/cases` | Case list |
| GET | `/api/dashboard/security` | Security metrics |

### Query Parameters

```
?companyId=xxx      # Required
?page=1             # Pagination
?limit=10           # Page size
?status=open        # Filter by status
```

## Configuration APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/settings` | Get settings |
| PATCH | `/api/settings` | Update settings |
| GET | `/api/subscription` | Get subscription |

## Webhook APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/webhooks/whop` | Whop events |
| POST | `/api/lean/webhooks/whop` | Lean webhook handler |

## Health APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Basic health check |
| GET | `/api/health/context` | Auth validation |
| GET | `/api/health/db` | Database check |
| GET | `/api/health/external` | External services |
| GET | `/api/health/webhooks` | Webhook status |

## Cron APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cron/reminders` | Process reminders |
| GET | `/api/cron/process-queue` | Process job queue |
| GET | `/api/cron/maintenance` | Cleanup tasks |

## Case Actions

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/cases/[caseId]/nudge` | Send reminder |
| POST | `/api/cases/[caseId]/cancel` | Cancel case |
| POST | `/api/cases/[caseId]/reopen` | Reopen case |
| POST | `/api/cases/[caseId]/terminate` | Terminate case |

## Recovery Link

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/r/[token]` | Recovery redirect |

## Response Formats

### Success
```json
{
  "data": { ... },
  "meta": { "page": 1, "limit": 10, "total": 100 }
}
```

### Error
```json
{
  "error": "Error message",
  "status": 400
}
```
