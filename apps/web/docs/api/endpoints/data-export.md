# Data Export API

## Overview

The Data Export API provides secure, GDPR-compliant data export functionality. Users can request exports of their personal data, track export status, and download completed exports in various formats.

## Table of Contents

1. [Request Data Export](#request-data-export)
2. [List Export Requests](#list-export-requests)
3. [Get Export Details](#get-export-details)
4. [Download Export](#download-export)
5. [Delete Export](#delete-export)
6. [Export Formats](#export-formats)
7. [Data Types](#data-types)

## Request Data Export

### POST /api/data/export

Creates a new data export request with specified parameters.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `data:export`

#### Rate Limiting

- **Limit**: 5 requests/hour per user
- **Key**: `data_export:{userId}:{companyId}`
- **Scope**: User and company-specific

#### Request Body

```json
{
  "export_format": "json",
  "data_types": ["user_profile", "payment_history", "membership_data"],
  "date_range_start": "2025-01-01T00:00:00Z",
  "date_range_end": "2025-10-25T19:50:00Z",
  "metadata": {
    "purpose": "gdpr_request",
    "contact_email": "user@example.com"
  }
}
```

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `export_format` | string | Yes | Export format (`json`, `csv`, `xlsx`) |
| `data_types` | array | Yes | Data types to include |
| `date_range_start` | string | No | Start date for filtered data (ISO 8601) |
| `date_range_end` | string | No | End date for filtered data (ISO 8601) |
| `metadata` | object | No | Additional export metadata |

#### Request Example

```http
POST /api/data/export
Authorization: Bearer <token>
X-Company-ID: company_123
Content-Type: application/json

{
  "export_format": "json",
  "data_types": ["user_profile", "payment_history", "membership_data"],
  "date_range_start": "2025-01-01T00:00:00Z",
  "date_range_end": "2025-10-25T19:50:00Z",
  "metadata": {
    "purpose": "gdpr_request",
    "contact_email": "user@example.com"
  }
}
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "request_id": "export_123456789",
    "status": "pending",
    "export_format": "json",
    "data_types": ["user_profile", "payment_history", "membership_data"],
    "date_range": {
      "start": "2025-01-01T00:00:00Z",
      "end": "2025-10-25T19:50:00Z"
    },
    "estimated_records": 150,
    "estimated_size_mb": 2.5,
    "created_at": "2025-10-25T19:50:00.000Z",
    "expires_at": "2025-11-25T19:50:00.000Z",
    "metadata": {
      "purpose": "gdpr_request",
      "contact_email": "user@example.com"
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

#### Error Responses

| Status | Code | Description |
|---------|-------|-------------|
| 400 | INVALID_REQUEST | Malformed request body |
| 422 | VALIDATION_ERROR | Invalid export parameters |
| 429 | RATE_LIMIT_EXCEEDED | Too many export requests |
| 500 | CREATION_FAILED | Failed to create export |

## List Export Requests

### GET /api/data/export

Retrieves a list of data export requests for the authenticated user.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `data:export`

#### Rate Limiting

- **Limit**: 60 requests/minute per user
- **Key**: `data_export:{userId}:{companyId}`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | integer | No | 50 | Maximum results per page (1-100) |
| `offset` | integer | No | 0 | Number of results to skip |
| `status` | string | No | - | Filter by status (`pending`, `processing`, `completed`, `failed`, `expired`) |

#### Request Example

```http
GET /api/data/export?limit=20&offset=0&status=completed
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "request_id": "export_123456789",
        "status": "completed",
        "export_format": "json",
        "data_types": ["user_profile", "payment_history"],
        "created_at": "2025-10-25T19:50:00.000Z",
        "completed_at": "2025-10-25T19:55:00.000Z",
        "expires_at": "2025-11-25T19:50:00.000Z",
        "download_url": "/api/data/export/export_123456789/download",
        "file_size_mb": 1.8,
        "record_count": 75,
        "metadata": {
          "purpose": "gdpr_request"
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "hasMore": false
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 35
  }
}
```

## Get Export Details

### GET /api/data/export/[id]

Retrieves detailed information about a specific export request.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `data:export`

#### Rate Limiting

- **Limit**: 60 requests/minute per user
- **Key**: `data_export:{userId}:{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Export request ID |

#### Request Example

```http
GET /api/data/export/export_123456789
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "request_id": "export_123456789",
    "status": "processing",
    "export_format": "json",
    "data_types": ["user_profile", "payment_history", "membership_data"],
    "date_range": {
      "start": "2025-01-01T00:00:00Z",
      "end": "2025-10-25T19:50:00Z"
    },
    "progress": {
      "percentage": 65,
      "current_type": "membership_data",
      "records_processed": 98,
      "total_records": 150,
      "estimated_completion": "2025-10-25T20:05:00.000Z"
    },
    "created_at": "2025-10-25T19:50:00.000Z",
    "started_at": "2025-10-25T19:52:00.000Z",
    "estimated_completion": "2025-10-25T20:05:00.000Z",
    "expires_at": "2025-11-25T19:50:00.000Z",
    "metadata": {
      "purpose": "gdpr_request",
      "contact_email": "user@example.com"
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

## Download Export

### GET /api/data/export/[id]/download

Downloads the completed export file.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `data:export`

#### Rate Limiting

- **Limit**: 10 requests/minute per user
- **Key**: `data_export_download:{userId}:{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Export request ID |

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `format` | string | No | original | Download format (`original`, `json`, `csv`) |

#### Request Example

```http
GET /api/data/export/export_123456789/download
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response

**Successful Download**
- **Content-Type**: Varies by format
- **Content-Disposition**: `attachment; filename="export_123456789.json"`
- **File**: Binary file data

**Failed Download**
```json
{
  "success": false,
  "error": {
    "error": "Export not ready for download",
    "code": "EXPORT_NOT_READY",
    "category": "validation",
    "severity": "medium"
  }
}
```

## Delete Export

### DELETE /api/data/export/[id]

Deletes an export request and associated files.

#### Authentication

- **Required**: Yes (production), Optional (development)
- **Permissions**: `data:export`

#### Rate Limiting

- **Limit**: 20 requests/minute per user
- **Key**: `data_export_delete:{userId}:{companyId}`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Export request ID |

#### Request Example

```http
DELETE /api/data/export/export_123456789
Authorization: Bearer <token>
X-Company-ID: company_123
```

#### Response Example

```json
{
  "success": true,
  "data": {
    "request_id": "export_123456789",
    "deleted": true,
    "deleted_at": "2025-10-25T19:50:00.000Z"
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 15
  }
}
```

## Export Formats

### JSON Format

Default format with full data structure and metadata.

```json
{
  "export": {
    "request_id": "export_123456789",
    "generated_at": "2025-10-25T19:50:00.000Z",
    "data_types": ["user_profile", "payment_history"],
    "data": {
      "user_profile": [
        {
          "id": "user_456",
          "email": "user@example.com",
          "username": "username",
          "created_at": "2025-01-01T00:00:00Z"
        }
      ],
      "payment_history": [
        {
          "id": "payment_123",
          "amount_cents": 2999,
          "currency": "USD",
          "status": "succeeded",
          "created_at": "2025-10-24T19:50:00.000Z"
        }
      ]
    }
  },
  "metadata": {
    "total_records": 2,
    "export_version": "1.0",
    "compression": "gzip"
  }
}
```

### CSV Format

Flattened data structure with headers.

```csv
data_type,id,email,username,amount_cents,currency,status,created_at
user_profile,user_456,user@example.com,username,,,
payment_history,payment_123,,,,2999,USD,succeeded,2025-10-24T19:50:00.000Z
```

### Excel Format

Multi-sheet workbook with separate sheets for each data type.

- **Sheet 1**: Summary and metadata
- **Sheet 2+**: Individual data types
- **Formatting**: Auto-sized columns and filters

## Data Types

### user_profile

Basic user account information.

```json
{
  "id": "user_456",
  "email": "user@example.com",
  "username": "username",
  "display_name": "Display Name",
  "avatar_url": "https://example.com/avatar.jpg",
  "timezone": "America/New_York",
  "language": "en",
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-10-25T19:50:00.000Z"
}
```

### payment_history

All payment transactions and attempts.

```json
{
  "id": "payment_123",
  "user_id": "user_456",
  "membership_id": "membership_789",
  "amount_cents": 2999,
  "currency": "USD",
  "status": "succeeded",
  "payment_method": "credit_card",
  "failure_reason": null,
  "created_at": "2025-10-24T19:50:00.000Z"
}
```

### membership_data

Membership information and status changes.

```json
{
  "id": "membership_789",
  "user_id": "user_456",
  "company_id": "company_123",
  "plan_id": "plan_premium",
  "status": "active",
  "started_at": "2025-01-01T00:00:00Z",
  "cancelled_at": null,
  "expired_at": "2025-12-31T23:59:59.000Z",
  "recovery_cases": [
    {
      "id": "case_123",
      "status": "recovered",
      "created_at": "2025-10-20T19:50:00.000Z"
    }
  ]
}
```

### recovery_cases

Churn recovery case information.

```json
{
  "id": "case_123",
  "user_id": "user_456",
  "membership_id": "membership_789",
  "company_id": "company_123",
  "status": "recovered",
  "attempts": 2,
  "incentive_days": 3,
  "recovered_amount_cents": 2999,
  "failure_reason": "payment_failed",
  "first_failure_at": "2025-10-20T19:50:00.000Z",
  "recovered_at": "2025-10-24T19:50:00.000Z",
  "actions": [
    {
      "type": "nudge_push",
      "created_at": "2025-10-21T19:50:00.000Z"
    }
  ]
}
```

### consent_data

User consent and privacy preferences.

```json
{
  "user_id": "user_456",
  "consents": [
    {
      "type": "marketing_emails",
      "granted": true,
      "granted_at": "2025-01-01T00:00:00.000Z",
      "revoked_at": null
    },
    {
      "type": "data_processing",
      "granted": true,
      "granted_at": "2025-01-01T00:00:00.000Z",
      "revoked_at": null
    }
  ]
}
```

## Security and Compliance

### Data Privacy

- **Data Minimization**: Only exports requested data types
- **Encryption**: All exports are encrypted at rest
- **Access Control**: Users can only export their own data
- **Audit Logging**: All export requests are logged

### GDPR Compliance

- **Right to Access**: Users can request all personal data
- **Data Portability**: Multiple export formats available
- **Retention**: Exports expire after 30 days
- **Security**: Encrypted storage and transmission

### Data Encryption

```typescript
// Export files are encrypted using AES-256-GCM
const encryptedData = await encryptExportData(rawData, userKey);
const checksum = await calculateChecksum(encryptedData);
```

## Processing Workflow

### Export States

| State | Description | Duration |
|--------|-------------|-----------|
| `pending` | Request received, queued for processing | < 1 minute |
| `processing` | Currently generating export file | 1-10 minutes |
| `completed` | Export ready for download | 30 days |
| `failed` | Export generation failed | Permanent |
| `expired` | Export file deleted | After 30 days |

### Processing Steps

1. **Validation**
   - Validate request parameters
   - Check user permissions
   - Verify rate limits

2. **Data Collection**
   - Query database for requested data
   - Apply date filters
   - Sanitize sensitive information

3. **Format Generation**
   - Convert to requested format
   - Apply compression
   - Generate checksum

4. **Storage**
   - Encrypt export file
   - Store in secure location
   - Update request status

5. **Notification**
   - Send completion notification
   - Update user dashboard
   - Log for compliance

## Error Handling

### Common Error Codes

| Code | Description | Resolution |
|-------|-------------|------------|
| `INVALID_FORMAT` | Unsupported export format | Use supported format |
| `INVALID_DATA_TYPE` | Invalid data type requested | Check available types |
| `DATE_RANGE_INVALID` | Invalid date range | Verify date format |
| `QUOTA_EXCEEDED` | Export quota exceeded | Wait for quota reset |
| `FILE_TOO_LARGE` | Export exceeds size limit | Reduce date range |

### Retry Logic

- **Automatic Retry**: Failed exports are retried once
- **Manual Retry**: Users can retry failed exports
- **Partial Success**: Some data types may succeed while others fail

## Monitoring and Analytics

### Export Metrics

- **Request Volume**: Number of export requests per day
- **Processing Time**: Average time to complete exports
- **File Sizes**: Average export file sizes
- **Success Rate**: Percentage of successful exports

### Compliance Monitoring

- **Access Logs**: Who requested exports and when
- **Data Access**: What data was accessed
- **Retention Tracking**: Export file lifecycle
- **Audit Trail**: Complete export history

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0