# Cases Management API

## Overview

The Cases Management API provides endpoints for managing churn recovery cases, including case creation, status updates, and recovery actions. These endpoints are the core of the churn recovery system.

## Table of Contents

1. [List Cases](#list-cases)
2. [Get Case Details](#get-case-details)
3. [Cancel Case](#cancel-case)
4. [Cancel Membership](#cancel-membership)
5. [Send Nudge](#send-nudge)
6. [Terminate Case](#terminate-case)
7. [Export Cases](#export-cases)

## List Cases

### GET /api/cases

Retrieves a paginated list of recovery cases with optional filtering.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:read`

#### Rate Limiting

- **Limit**: 30 requests/minute per company
- **Key**: `case_action:dashboard_{companyId}`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number (1-based) |
| `limit` | integer | No | 50 | Results per page (1-1000) |
| `status` | string | No | - | Filter by status (`open`, `recovered`, `closed_no_recovery`) |
| `startDate` | string | No | - | Filter by first failure date (ISO 8601) |
| `endDate` | string | No | - | Filter by first failure date (ISO 8601) |

#### Request Example

```http
GET /api/cases?page=1&limit=50&status=open&startDate=2025-10-01T00:00:00Z
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "cases": [
      {
        "id": "case_123456",
        "membership_id": "membership_789",
        "user_id": "user_456",
        "company_id": "company_123",
        "status": "open",
        "attempts": 2,
        "incentive_days": 3,
        "recovered_amount_cents": 0,
        "failure_reason": "payment_failed",
        "first_failure_at": "2025-10-25T19:50:00.000Z",
        "last_nudge_at": "2025-10-25T18:00:00.000Z",
        "created_at": "2025-10-24T19:50:00.000Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3,
    "filters": {
      "status": "open",
      "startDate": "2025-10-01T00:00:00Z"
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 45
  }
}
```

#### Error Responses

| Status | Code | Description |
|---------|-------|-------------|
| 401 | UNAUTHORIZED | Authentication required |
| 422 | RATE_LIMIT_EXCEEDED | Too many requests |
| 500 | INTERNAL_SERVER_ERROR | Database query failed |

## Get Case Details

### GET /api/cases/[caseId]

Retrieves detailed information about a specific recovery case.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:read`

#### Rate Limiting

- **Limit**: 30 requests/minute per company
- **Key**: `case_action:dashboard_{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `caseId` | string | Yes | Case identifier |

#### Request Example

```http
GET /api/cases/case_123456
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "id": "case_123456",
    "membership_id": "membership_789",
    "user_id": "user_456",
    "company_id": "company_123",
    "status": "open",
    "attempts": 2,
    "incentive_days": 3,
    "recovered_amount_cents": 0,
    "failure_reason": "payment_failed",
    "first_failure_at": "2025-10-25T19:50:00.000Z",
    "last_nudge_at": "2025-10-25T18:00:00.000Z",
    "created_at": "2025-10-24T19:50:00.000Z",
    "updated_at": "2025-10-25T19:50:00.000Z",
    "actions": [
      {
        "id": "action_123",
        "type": "nudge_push",
        "channel": "push",
        "created_at": "2025-10-25T18:00:00.000Z",
        "metadata": {
          "attempt": 1,
          "success": true
        }
      }
    ]
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 35
  }
}
```

## Cancel Case

### POST /api/cases/[caseId]/cancel

Cancels a recovery case and marks it as closed without recovery.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:write`

#### Rate Limiting

- **Limit**: 30 requests/minute per company
- **Key**: `case_action:dashboard_{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `caseId` | string | Yes | Case identifier |

#### Request Body

```json
{
  "reason": "user_requested_cancellation",
  "notes": "User requested to cancel recovery efforts"
}
```

#### Request Example

```http
POST /api/cases/case_123456/cancel
Authorization: Bearer <token>
X-Company-ID: company_123
Content-Type: application/json

{
  "reason": "user_requested_cancellation",
  "notes": "User requested to cancel recovery efforts"
}
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "id": "case_123456",
    "status": "closed_no_recovery",
    "updated_at": "2025-10-25T19:50:00.000Z",
    "cancellation": {
      "reason": "user_requested_cancellation",
      "notes": "User requested to cancel recovery efforts",
      "cancelled_at": "2025-10-25T19:50:00.000Z"
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 25
  }
}
```

## Cancel Membership

### POST /api/cases/[caseId]/cancel-membership

Cancels the associated membership for a recovery case.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:write`, `memberships:cancel`

#### Rate Limiting

- **Limit**: 30 requests/minute per company
- **Key**: `case_action:dashboard_{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `caseId` | string | Yes | Case identifier |

#### Request Body

```json
{
  "reason": "payment_method_expired",
  "refund_policy": "partial_refund",
  "notes": "Payment method expired, user notified"
}
```

#### Request Example

```http
POST /api/cases/case_123456/cancel-membership
Authorization: Bearer <token>
X-Company-ID: company_123
Content-Type: application/json

{
  "reason": "payment_method_expired",
  "refund_policy": "partial_refund",
  "notes": "Payment method expired, user notified"
}
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "case_id": "case_123456",
    "membership_id": "membership_789",
    "status": "cancelled",
    "cancelled_at": "2025-10-25T19:50:00.000Z",
    "cancellation_details": {
      "reason": "payment_method_expired",
      "refund_policy": "partial_refund",
      "refund_amount_cents": 1500,
      "notes": "Payment method expired, user notified"
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 45
  }
}
```

## Send Nudge

### POST /api/cases/[caseId]/nudge

Sends a nudge notification (push or DM) to the user for a recovery case.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:write`

#### Rate Limiting

- **Limit**: 30 requests/minute per company
- **Key**: `case_action:dashboard_{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `caseId` | string | Yes | Case identifier |

#### Request Body

```json
{
  "channel": "push",
  "message": "Your subscription is about to expire! Renew now to continue enjoying our service.",
  "incentive_days": 2,
  "custom_data": {
    "button_text": "Renew Now",
    "deep_link": "/renew"
  }
}
```

#### Request Example

```http
POST /api/cases/case_123456/nudge
Authorization: Bearer <token>
X-Company-ID: company_123
Content-Type: application/json

{
  "channel": "push",
  "message": "Your subscription is about to expire! Renew now to continue enjoying our service.",
  "incentive_days": 2,
  "custom_data": {
    "button_text": "Renew Now",
    "deep_link": "/renew"
  }
}
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "case_id": "case_123456",
    "nudge_id": "nudge_456",
    "channel": "push",
    "status": "sent",
    "sent_at": "2025-10-25T19:50:00.000Z",
    "incentive_applied": true,
    "incentive_days": 2,
    "delivery_details": {
      "delivery_status": "delivered",
      "delivered_at": "2025-10-25T19:50:05.000Z",
      "device_token": "device_token_123"
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 120
  }
}
```

## Terminate Case

### POST /api/cases/[caseId]/terminate

Terminates a recovery case and optionally the associated membership.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:write`

#### Rate Limiting

- **Limit**: 30 requests/minute per company
- **Key**: `case_action:dashboard_{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `caseId` | string | Yes | Case identifier |

#### Request Body

```json
{
  "terminate_membership": true,
  "reason": "fraud_detected",
  "notes": "Suspicious activity detected, terminating immediately",
  "refund_policy": "no_refund"
}
```

#### Request Example

```http
POST /api/cases/case_123456/terminate
Authorization: Bearer <token>
X-Company-ID: company_123
Content-Type: application/json

{
  "terminate_membership": true,
  "reason": "fraud_detected",
  "notes": "Suspicious activity detected, terminating immediately",
  "refund_policy": "no_refund"
}
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "case_id": "case_123456",
    "status": "terminated",
    "terminated_at": "2025-10-25T19:50:00.000Z",
    "termination_details": {
      "reason": "fraud_detected",
      "notes": "Suspicious activity detected, terminating immediately",
      "refund_policy": "no_refund",
      "membership_terminated": true
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 35
  }
}
```

## Export Cases

### GET /api/cases/export

Exports recovery cases data in various formats.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `cases:read`, `data:export`

#### Rate Limiting

- **Limit**: 5 requests/hour per user
- **Key**: `data_export:{userId}:{companyId}`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `format` | string | No | `json` | Export format (`json`, `csv`, `xlsx`) |
| `status` | string | No | - | Filter by status |
| `startDate` | string | No | - | Filter by date (ISO 8601) |
| `endDate` | string | No | - | Filter by date (ISO 8601) |
| `include_actions` | boolean | No | `false` | Include case actions |

#### Request Example

```http
GET /api/cases/export?format=csv&status=open&include_actions=true
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "export_id": "export_123456",
    "status": "processing",
    "format": "csv",
    "estimated_records": 150,
    "download_url": null,
    "created_at": "2025-10-25T19:50:00.000Z",
    "expires_at": "2025-10-26T19:50:00.000Z"
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 25
  }
}
```

## Data Types

### RecoveryCase

```typescript
interface RecoveryCase {
  id: string;
  membership_id: string;
  user_id: string;
  company_id: string;
  status: 'open' | 'recovered' | 'closed_no_recovery';
  attempts: number;
  incentive_days: number;
  recovered_amount_cents: number;
  failure_reason: string | null;
  first_failure_at: string;
  last_nudge_at: string | null;
  created_at: string;
  updated_at: string;
}
```

### RecoveryAction

```typescript
interface RecoveryAction {
  id: string;
  case_id: string;
  membership_id: string;
  user_id: string;
  type: 'nudge_push' | 'nudge_dm' | 'incentive_applied' | 'case_cancelled' | 'membership_terminated';
  channel?: 'push' | 'dm';
  metadata: Record<string, any>;
  created_at: string;
}
```

## Error Handling

### Common Error Codes

| Code | Description | Resolution |
|-------|-------------|------------|
| `CASE_NOT_FOUND` | Case does not exist | Verify case ID |
| `INVALID_STATUS` | Invalid status transition | Check current case status |
| `ALREADY_CANCELLED` | Case already cancelled | Use different action |
| `INSUFFICIENT_PERMISSIONS` | Missing required permissions | Request appropriate permissions |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry |

### Troubleshooting

1. **Case Not Found**
   - Verify the case ID is correct
   - Check that you have access to the company's cases
   - Ensure the case hasn't been deleted

2. **Invalid Status Transitions**
   - Review the current case status
   - Check allowed status transitions in the documentation
   - Use the appropriate endpoint for the desired action

3. **Permission Issues**
   - Verify your API token has the required permissions
   - Check that the company ID is correct
   - Contact administrator for additional permissions

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0