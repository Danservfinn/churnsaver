---
title: Webhook Processing
link: webhook-processing
type: metadata
created_at: 2025-12-31
uuid: a1b2c3d4-hook-0001
tags: [webhooks, whop, events, processing]
---

# Webhook Processing

## Overview

ChurnSaver receives webhooks from Whop to track subscription events and trigger recovery workflows.

## Webhook Endpoint

`POST /api/webhooks/whop` - Main webhook handler

### Security

- HMAC signature validation via `WHOP_WEBHOOK_SECRET`
- Timestamp replay attack prevention (5 min window)
- Idempotency keys prevent duplicate processing

## Event Types

| Event | Action |
|-------|--------|
| `membership.went_valid` | Close recovery case |
| `membership.went_invalid` | Open recovery case |
| `membership.updated` | Update case status |
| `payment.succeeded` | Mark as recovered |
| `payment.failed` | Trigger recovery flow |

## Processing Flow

```
Webhook → Validate Signature → Parse Event
       → Check Idempotency → Process Event
       → Update Database → Trigger Actions
```

## Recovery Case Lifecycle

1. `payment.failed` → Create case (status: `open`)
2. Send notifications (push, DM)
3. Track click-through via `/api/r/[token]`
4. `payment.succeeded` → Close case (status: `recovered`)

## Related Files

| File | Purpose |
|------|---------|
| `src/app/api/webhooks/whop/route.ts` | Handler |
| `src/lib/whop/webhookValidator.ts` | Validation |
| `src/services/eventProcessor.ts` | Processing |
| `src/services/cases.ts` | Case management |
