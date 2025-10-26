# Webhooks API

## Overview

The Webhooks API handles incoming webhooks from external platforms, primarily Whop. This endpoint processes payment events, membership changes, and other platform notifications to trigger churn recovery workflows.

## Table of Contents

1. [Whop Webhook Handler](#whop-webhook-handler)
2. [Webhook Security](#webhook-security)
3. [Event Processing](#event-processing)
4. [Error Handling](#error-handling)
5. [Event Types](#event-types)

## Whop Webhook Handler

### POST /api/webhooks/whop

Processes incoming webhooks from the Whop platform.

#### Authentication

- **Required**: Yes (signature verification)
- **Method**: HMAC signature verification using webhook secret

#### Rate Limiting

- **Limit**: 100 requests/minute
- **Key**: `webhook:global`
- **Scope**: IP-based limiting

#### Security

- **Signature Verification**: Required for all requests
- **Replay Protection**: Prevents duplicate event processing
- **IP Whitelisting**: Optional additional security layer

#### Headers

```http
Content-Type: application/json
X-Whop-Signature: sha256=<hmac_signature>
X-Whop-Event: payment.succeeded
X-Whop-Delivery: delivery_123456789
```

#### Request Body

The webhook payload varies by event type. See [Event Types](#event-types) for detailed schemas.

#### Request Example

```http
POST /api/webhooks/whop
Content-Type: application/json
X-Whop-Signature: sha256=5d41402abc4b2a76b9719d911017c592
X-Whop-Event: payment.succeeded
X-Whop-Delivery: delivery_123456789

{
  "id": "evt_123456789",
  "type": "payment.succeeded",
  "data": {
    "membership": {
      "id": "membership_789",
      "user_id": "user_456",
      "company_id": "company_123",
      "status": "active"
    },
    "payment": {
      "id": "payment_123",
      "amount_cents": 2999,
      "currency": "USD"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

#### Response Examples

**Success Response**
```json
{
  "success": true,
  "data": {
    "event_id": "evt_123456789",
    "processed": true,
    "case_created": true,
    "case_id": "case_456789"
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 150
  }
}
```

**Rate Limited Response**
```json
{
  "success": false,
  "error": {
    "error": "Rate limit exceeded",
    "code": "RATE_LIMIT_EXCEEDED",
    "retryable": true,
    "retryAfter": 60,
    "resetAt": "2025-10-25T19:51:00.000Z"
  }
}
```

**Invalid Signature Response**
```json
{
  "success": false,
  "error": {
    "error": "Invalid webhook signature",
    "code": "INVALID_SIGNATURE",
    "category": "security",
    "severity": "high"
  }
}
```

## Webhook Security

### Signature Verification

All webhook requests must include a valid HMAC signature:

```typescript
import { createHmac } from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}
```

### Replay Protection

The system prevents duplicate event processing using:

1. **Event ID Tracking**: Stores processed event IDs
2. **Idempotency Keys**: Uses `whop_event_id` as unique identifier
3. **Time Window**: Rejects events older than 24 hours

### Security Headers

The webhook endpoint validates several security headers:

| Header | Required | Description |
|---------|-----------|-------------|
| `X-Whop-Signature` | Yes | HMAC signature of payload |
| `X-Whop-Event` | Yes | Event type identifier |
| `X-Whop-Delivery` | Yes | Unique delivery identifier |

## Event Processing

### Processing Flow

1. **Security Validation**
   - Verify HMAC signature
   - Check rate limits
   - Validate required headers

2. **Event Validation**
   - Parse and validate event structure
   - Check for required fields
   - Verify event timestamp

3. **Idempotency Check**
   - Check if event already processed
   - Skip duplicate events
   - Log duplicate attempts

4. **Business Logic Processing**
   - Create/update recovery cases
   - Trigger notifications
   - Update user records

5. **Response Generation**
   - Return processing status
   - Include relevant metadata
   - Log processing metrics

### Processing States

| State | Description | Action |
|--------|-------------|---------|
| `new` | Event received but not processed | Queue for processing |
| `processing` | Currently being processed | Lock to prevent duplicates |
| `processed` | Successfully processed | Store result |
| `failed` | Processing failed | Queue for retry |
| `skipped` | Duplicate or invalid | Log and skip |

## Error Handling

### Error Categories

| Category | Description | HTTP Status |
|-----------|-------------|--------------|
| `security` | Signature verification failed | 401 |
| `validation` | Invalid event structure | 400 |
| `rate_limit` | Too many requests | 429 |
| `processing` | Business logic error | 422 |
| `system` | Internal system error | 500 |

### Retry Logic

- **Automatic Retry**: Failed events are retried with exponential backoff
- **Max Attempts**: 3 retry attempts after initial failure
- **Backoff Strategy**: 1min, 5min, 15min intervals
- **Dead Letter Queue**: Events exceeding max attempts are moved to DLQ

### Error Response Format

```json
{
  "success": false,
  "error": {
    "error": "Event processing failed",
    "code": "PROCESSING_ERROR",
    "category": "processing",
    "severity": "medium",
    "retryable": true,
    "details": {
      "event_id": "evt_123456789",
      "error_type": "membership_not_found",
      "retry_after": 60
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0"
  }
}
```

## Event Types

### Payment Events

#### payment.succeeded

Fired when a payment is successfully processed.

```json
{
  "id": "evt_123456789",
  "type": "payment.succeeded",
  "data": {
    "payment": {
      "id": "payment_123",
      "amount_cents": 2999,
      "currency": "USD",
      "status": "succeeded"
    },
    "membership": {
      "id": "membership_789",
      "user_id": "user_456",
      "company_id": "company_123",
      "status": "active"
    },
    "user": {
      "id": "user_456",
      "email": "user@example.com",
      "username": "username"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

**Processing Actions**:
- Check for existing recovery case
- Close recovery case if payment recovered
- Update user payment status
- Send recovery success notification

#### payment.failed

Fired when a payment fails.

```json
{
  "id": "evt_123456789",
  "type": "payment.failed",
  "data": {
    "payment": {
      "id": "payment_123",
      "amount_cents": 2999,
      "currency": "USD",
      "status": "failed",
      "failure_reason": "insufficient_funds"
    },
    "membership": {
      "id": "membership_789",
      "user_id": "user_456",
      "company_id": "company_123",
      "status": "active"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

**Processing Actions**:
- Create new recovery case if none exists
- Update existing case with failure details
- Increment failure count
- Trigger initial nudge workflow

### Membership Events

#### membership.created

Fired when a new membership is created.

```json
{
  "id": "evt_123456789",
  "type": "membership.created",
  "data": {
    "membership": {
      "id": "membership_789",
      "user_id": "user_456",
      "company_id": "company_123",
      "status": "active",
      "plan_id": "plan_premium",
      "created_at": "2025-10-25T19:50:00.000Z"
    },
    "user": {
      "id": "user_456",
      "email": "user@example.com",
      "username": "username"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

**Processing Actions**:
- Initialize user profile
- Set up monitoring for membership
- Create baseline metrics

#### membership.cancelled

Fired when a membership is cancelled.

```json
{
  "id": "evt_123456789",
  "type": "membership.cancelled",
  "data": {
    "membership": {
      "id": "membership_789",
      "user_id": "user_456",
      "company_id": "company_123",
      "status": "cancelled",
      "cancelled_at": "2025-10-25T19:50:00.000Z",
      "cancellation_reason": "user_requested"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

**Processing Actions**:
- Close any active recovery cases
- Update user status
- Send cancellation confirmation
- Update analytics

#### membership.expired

Fired when a membership expires.

```json
{
  "id": "evt_123456789",
  "type": "membership.expired",
  "data": {
    "membership": {
      "id": "membership_789",
      "user_id": "user_456",
      "company_id": "company_123",
      "status": "expired",
      "expired_at": "2025-10-25T19:50:00.000Z"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

**Processing Actions**:
- Close recovery cases as not recovered
- Update final status
- Send expiration notification
- Calculate churn metrics

### User Events

#### user.updated

Fired when user information is updated.

```json
{
  "id": "evt_123456789",
  "type": "user.updated",
  "data": {
    "user": {
      "id": "user_456",
      "email": "newemail@example.com",
      "username": "newusername",
      "updated_at": "2025-10-25T19:50:00.000Z"
    },
    "changes": {
      "email": "oldemail@example.com -> newemail@example.com",
      "username": "oldusername -> newusername"
    }
  },
  "created_at": "2025-10-25T19:50:00.000Z"
}
```

**Processing Actions**:
- Update user records
- Sync with external systems
- Log changes for audit

## Testing Webhooks

### Test Payloads

Use these test payloads to verify webhook processing:

#### Test Payment Success

```bash
curl -X POST http://localhost:3000/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "X-Whop-Signature: sha256=$(echo -n '{"test": true}' | openssl dgst -sha256 -hmac 'your_webhook_secret' -hex | cut -d' ' -f2)" \
  -H "X-Whop-Event: payment.succeeded" \
  -H "X-Whop-Delivery: test_delivery_123" \
  -d '{
    "id": "test_evt_123",
    "type": "payment.succeeded",
    "data": {
      "payment": {"id": "test_payment", "amount_cents": 2999},
      "membership": {"id": "test_membership", "user_id": "test_user", "company_id": "test_company"}
    },
    "test": true
  }'
```

### Webhook Testing Tools

1. **ngrok**: Expose local endpoint to internet
   ```bash
   ngrok http 3000
   ```

2. **Webhook.site**: Temporary webhook endpoint for testing
3. **Whop Dashboard**: Test webhook delivery from platform

## Monitoring and Analytics

### Webhook Metrics

The system tracks these webhook metrics:

- **Delivery Rate**: Percentage of successful deliveries
- **Processing Time**: Average time to process events
- **Error Rate**: Percentage of failed processing
- **Duplicate Rate**: Percentage of duplicate events

### Health Monitoring

Monitor webhook health using:

```bash
# Check webhook processing health
curl http://localhost:3000/api/health/webhooks

# Check recent webhook events
curl "http://localhost:3000/api/monitoring/webhooks?hours=24"
```

## Troubleshooting

### Common Issues

1. **Signature Verification Failed**
   - Check webhook secret is correct
   - Verify payload is not modified
   - Ensure UTF-8 encoding

2. **Rate Limiting**
   - Implement exponential backoff
   - Check webhook delivery frequency
   - Contact support for rate limit increases

3. **Duplicate Events**
   - Verify idempotency handling
   - Check event ID tracking
   - Review processing logic

4. **Processing Failures**
   - Check event schema validation
   - Review business logic errors
   - Monitor system health

### Debug Mode

Enable debug logging for webhook processing:

```typescript
// Environment variable
DEBUG_WEBHOOKS=true

// Check debug logs
curl http://localhost:3000/api/webhooks/whop/debug
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0