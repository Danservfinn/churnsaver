# REST API Reference

The Churn Saver REST API provides comprehensive access to recovery cases, incentives, analytics, and system management.

## Base URL

```
https://api.churnsaver.com/v1
```

## Authentication

All API requests require authentication using Bearer tokens.

### Headers

```http
Authorization: Bearer <your_api_key>
Content-Type: application/json
```

### API Key Management

API keys can be generated and managed through the admin dashboard:

1. Navigate to Settings → API Keys
2. Click "Generate New Key"
3. Set appropriate permissions and expiration
4. Store the key securely

## Core Resources

### Recovery Cases

#### List Recovery Cases

Retrieve a paginated list of recovery cases.

```http
GET /api/cases
```

**Query Parameters**:
- `status` (optional): Filter by case status (`pending`, `active`, `recovered`, `lost`)
- `risk_level` (optional): Filter by risk level (`low`, `medium`, `high`, `critical`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)
- `sort_by` (optional): Sort field (`created_at`, `risk_level`, `status`)
- `sort_order` (optional): Sort order (`asc`, `desc`)

**Response**:
```json
{
  "success": true,
  "data": {
    "cases": [
      {
        "id": "case_12345",
        "user_id": "user_67890",
        "status": "active",
        "risk_level": "high",
        "trigger_event": {
          "type": "payment_failed",
          "timestamp": "2025-10-25T10:30:00Z",
          "amount": 29.99
        },
        "recovery_strategy": {
          "priority": 8,
          "channels": ["email", "sms"],
          "timeline": [...]
        },
        "created_at": "2025-10-25T10:30:00Z",
        "updated_at": "2025-10-25T14:45:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 1247,
      "total_pages": 25
    }
  }
}
```

#### Get Recovery Case

Retrieve detailed information about a specific recovery case.

```http
GET /api/cases/{case_id}
```

**Path Parameters**:
- `case_id`: The unique identifier of the recovery case

**Response**:
```json
{
  "success": true,
  "data": {
    "case": {
      "id": "case_12345",
      "user_id": "user_67890",
      "status": "active",
      "risk_level": "high",
      "trigger_event": { ... },
      "recovery_strategy": { ... },
      "incentives": [
        {
          "id": "inc_123",
          "type": "discount",
          "value": 25,
          "status": "applied",
          "applied_at": "2025-10-25T11:00:00Z"
        }
      ],
      "timeline": [
        {
          "timestamp": "2025-10-25T10:30:00Z",
          "event": "case_created",
          "details": "Payment failure detected"
        },
        {
          "timestamp": "2025-10-25T11:00:00Z",
          "event": "incentive_applied",
          "details": "25% discount applied"
        }
      ],
      "metrics": {
        "created_at": "2025-10-25T10:30:00Z",
        "first_contact_at": "2025-10-25T11:00:00Z",
        "estimated_value": 299.99,
        "incentive_cost": 75.00
      }
    }
  }
}
```

#### Update Recovery Case

Update the status or details of a recovery case.

```http
PATCH /api/cases/{case_id}
```

**Path Parameters**:
- `case_id`: The unique identifier of the recovery case

**Request Body**:
```json
{
  "status": "recovered",
  "notes": "Customer confirmed they want to continue subscription",
  "recovery_details": {
    "recovered_at": "2025-10-25T15:30:00Z",
    "recovery_method": "email_response"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "case": { ... }
  }
}
```

#### Delete Recovery Case

Permanently delete a recovery case (admin only).

```http
DELETE /api/cases/{case_id}
```

### Incentives

#### List Incentives

Retrieve all incentives for a specific case or customer.

```http
GET /api/incentives
```

**Query Parameters**:
- `case_id` (optional): Filter by recovery case
- `user_id` (optional): Filter by customer
- `status` (optional): Filter by status (`active`, `applied`, `expired`, `cancelled`)
- `type` (optional): Filter by type (`discount`, `credit`, `feature`)

#### Create Incentive

Create a new incentive for a recovery case.

```http
POST /api/incentives
```

**Request Body**:
```json
{
  "case_id": "case_12345",
  "type": "discount",
  "config": {
    "discount_type": "percentage",
    "value": 30,
    "duration": "one_time",
    "applicable_to": "next_billing"
  },
  "expiration_days": 30
}
```

#### Update Incentive

Modify an existing incentive.

```http
PATCH /api/incentives/{incentive_id}
```

**Request Body**:
```json
{
  "status": "cancelled",
  "notes": "Customer requested different incentive type"
}
```

### Analytics

#### Get Dashboard Summary

Retrieve high-level dashboard metrics.

```http
GET /api/analytics/summary
```

**Query Parameters**:
- `period` (optional): Time period (`7d`, `30d`, `90d`, `1y`)

**Response**:
```json
{
  "success": true,
  "data": {
    "recovery_rate": {
      "current": 28.5,
      "previous": 24.1,
      "change": 4.4
    },
    "revenue_impact": {
      "recovered": 45250.00,
      "cost": 12500.00,
      "net": 32750.00,
      "roi": 162.0
    },
    "active_cases": {
      "total": 156,
      "critical": 23,
      "aging": 12
    },
    "period": "30d"
  }
}
```

#### Get Recovery Performance

Detailed recovery performance metrics.

```http
GET /api/analytics/recovery-performance
```

**Query Parameters**:
- `start_date`: Start date (ISO 8601)
- `end_date`: End date (ISO 8601)
- `group_by` (optional): Grouping (`day`, `week`, `month`)

#### Get Incentive Analytics

Incentive performance and ROI analysis.

```http
GET /api/analytics/incentives
```

**Query Parameters**:
- `period`: Analysis period
- `type` (optional): Filter by incentive type

### Customers

#### Get Customer Profile

Retrieve customer information and recovery history.

```http
GET /api/customers/{customer_id}
```

#### Update Customer Risk Profile

Update customer risk assessment manually.

```http
PATCH /api/customers/{customer_id}/risk
```

**Request Body**:
```json
{
  "risk_level": "high",
  "risk_factors": ["payment_history", "usage_decline"],
  "notes": "Manual risk assessment override"
}
```

### Webhooks

#### List Webhook Configurations

Get all configured webhooks.

```http
GET /api/webhooks
```

#### Create Webhook

Configure a new webhook endpoint.

```http
POST /api/webhooks
```

**Request Body**:
```json
{
  "url": "https://your-app.com/webhooks/churn-saver",
  "secret": "your_webhook_secret",
  "events": ["case.created", "case.recovered", "incentive.applied"],
  "active": true
}
```

#### Test Webhook

Send a test event to a webhook endpoint.

```http
POST /api/webhooks/{webhook_id}/test
```

### System Management

#### Health Check

Check system health and connectivity.

```http
GET /api/health
```

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.2.3",
    "uptime": 86400,
    "services": {
      "database": "healthy",
      "redis": "healthy",
      "email": "healthy",
      "webhooks": "healthy"
    }
  }
}
```

#### System Statistics

Get detailed system performance metrics.

```http
GET /api/system/stats
```

## Error Handling

All API responses follow a consistent error format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": {
      "field": "email",
      "issue": "must be a valid email address"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Rate Limiting

API requests are rate limited to prevent abuse:

- **Authenticated requests**: 1000 requests per hour
- **Anonymous requests**: 100 requests per hour
- **Burst limit**: 50 requests per minute

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1635182400
```

## Pagination

List endpoints support cursor-based pagination:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1247,
    "total_pages": 25,
    "has_next": true,
    "has_prev": false,
    "next_cursor": "eyJwYWdlIjoxfQ==",
    "prev_cursor": null
  }
}
```

## Webhooks

### Supported Events

| Event | Description | Payload |
|-------|-------------|---------|
| `case.created` | New recovery case created | Case object |
| `case.updated` | Case status changed | Case object + changes |
| `case.recovered` | Customer successfully recovered | Case object |
| `case.lost` | Recovery case marked as lost | Case object |
| `incentive.applied` | Incentive applied to customer | Incentive object |
| `incentive.expired` | Incentive expired unused | Incentive object |

### Webhook Payload Structure

```json
{
  "event": "case.created",
  "id": "evt_12345",
  "timestamp": "2025-10-25T10:30:00Z",
  "data": {
    "case": { ... }
  },
  "webhook_id": "wh_67890"
}
```

### Webhook Security

- All webhooks include an `X-Webhook-Signature` header
- Signatures use HMAC-SHA256 with your webhook secret
- Always verify signatures to prevent spoofing

```typescript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

## SDKs and Libraries

### JavaScript/TypeScript SDK

```bash
npm install @churn-saver/sdk
```

```typescript
import { ChurnSaver } from '@churn-saver/sdk';

const client = new ChurnSaver({
  apiKey: 'your_api_key'
});

// List recovery cases
const cases = await client.cases.list({
  status: 'active',
  limit: 50
});

// Create incentive
const incentive = await client.incentives.create({
  case_id: 'case_123',
  type: 'discount',
  config: { value: 25 }
});
```

### Python SDK

```bash
pip install churn-saver
```

```python
from churn_saver import ChurnSaver

client = ChurnSaver(api_key='your_api_key')

# Get case details
case = client.cases.get('case_123')

# Update case status
client.cases.update('case_123', status='recovered')
```

## Best Practices

### Error Handling

Always implement proper error handling:

```typescript
try {
  const cases = await api.cases.list();
  // Process cases
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // Wait and retry
    await delay(error.retry_after);
    return retryRequest();
  }
  throw error;
}
```

### Request Optimization

- Use appropriate pagination limits
- Cache frequently accessed data
- Implement request deduplication
- Use webhooks for real-time updates

### Security

- Store API keys securely
- Rotate keys regularly
- Use HTTPS for all requests
- Validate webhook signatures
- Implement proper access controls

## Support

- **API Status**: [status.churnsaver.com](https://status.churnsaver.com)
- **Documentation**: [docs.churnsaver.com](https://docs.churnsaver.com)
- **Developer Community**: [community.churnsaver.com](https://community.churnsaver.com)
- **Support**: support@churnsaver.com