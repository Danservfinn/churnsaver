# API Documentation

## Overview

The Churn Saver API provides a comprehensive RESTful interface for managing churn recovery operations, data exports, user consent, and system monitoring. This documentation covers all available endpoints, authentication requirements, request/response formats, and best practices.

## Table of Contents

1. [Authentication & Security](#authentication--security)
2. [API Response Format](#api-response-format)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [Available Endpoints](#available-endpoints)
6. [API Examples](#api-examples)
7. [Troubleshooting](#troubleshooting)

## Authentication & Security

### Authentication Methods

The API supports multiple authentication methods depending on the endpoint type:

#### Whop SDK Authentication (Recommended)
```typescript
import { getRequestContextSDK } from '@/lib/whop-sdk';

// Automatic authentication via Whop SDK
const context = await getRequestContextSDK(request);
// context.companyId, context.userId, context.isAuthenticated
```

#### Header-Based Authentication
```http
Authorization: Bearer <token>
X-Company-ID: <company_id>
X-User-ID: <user_id>
X-Authenticated: true
```

### Security Requirements

- **Production Environment**: All endpoints require valid authentication
- **Development Environment**: Some endpoints allow unauthenticated access for testing
- **Rate Limiting**: All endpoints are rate-limited to prevent abuse
- **CORS**: Configured for secure cross-origin requests

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data specific to endpoint
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 45
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "error": "Error message",
    "code": "ERROR_CODE",
    "category": "validation",
    "severity": "medium",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "requestId": "req_123456789",
    "retryable": false,
    "details": {
      // Additional error context
    }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2025-10-25T19:50:00.000Z",
    "version": "1.0.0"
  }
}
```

## Error Handling

### Error Categories

| Category | Description | Typical HTTP Status |
|----------|-------------|-------------------|
| `validation` | Input validation errors | 400 |
| `authentication` | Authentication failures | 401 |
| `authorization` | Permission errors | 403 |
| `rate_limit` | Rate limiting | 422 |
| `database` | Database operations | 500 |
| `external_service` | Third-party services | 500 |
| `network` | Network connectivity | 500 |
| `business_logic` | Application logic | 400/409 |
| `system` | System-level errors | 500 |
| `security` | Security violations | 403/500 |

### Common Error Codes

- `INVALID_REQUEST` - Malformed request data
- `UNAUTHORIZED` - Authentication required or failed
- `FORBIDDEN` - Insufficient permissions
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `INTERNAL_SERVER_ERROR` - Unexpected server error

## Rate Limiting

### Rate Limit Configuration

All API endpoints are rate-limited to ensure fair usage and system stability:

| Endpoint Type | Limit | Window | Key |
|---------------|-------|--------|-----|
| Webhooks | 100/minute | 1 minute | IP + endpoint |
| Case Actions | 30/minute | 1 minute | Company ID |
| Data Export | 5/hour | 1 hour | User ID + Company ID |
| Dashboard | 60/minute | 1 minute | Company ID |
| Health Checks | 1000/hour | 1 hour | IP |

### Rate Limit Response

When rate limits are exceeded, the API returns:
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

### Headers

Rate limit information is included in response headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1698253860
X-RateLimit-Retry-After: 60
```

## Available Endpoints

### Core API Endpoints

- [**Cases Management**](./endpoints/cases.md) - Manage recovery cases and actions
- [**Data Export**](./endpoints/data-export.md) - Request and manage data exports
- [**User Consent**](./endpoints/consent.md) - Manage user consent and preferences
- [**Dashboard**](./endpoints/dashboard.md) - Dashboard data and analytics
- [**Memberships**](./endpoints/memberships.md) - Membership management
- [**Settings**](./endpoints/settings.md) - Application settings

### Webhook Endpoints

- [**Whop Webhooks**](./endpoints/webhooks.md) - Process Whop platform webhooks

### System Endpoints

- [**Health Checks**](./endpoints/health.md) - System health monitoring
- [**Security Metrics**](./endpoints/security.md) - Security and monitoring metrics
- [**Monitoring**](./endpoints/monitoring.md) - System monitoring dashboard data

### Utility Endpoints

- [**Scheduler**](./endpoints/scheduler.md) - Job scheduling and management
- [**Cleanup**](./endpoints/cleanup.md) - Data cleanup operations

## API Examples

### Making Authenticated Requests

```typescript
// Using Whop SDK
import { getRequestContextSDK } from '@/lib/whop-sdk';

export async function GET(request: NextRequest) {
  const context = await getRequestContextSDK(request);
  
  if (!context.isAuthenticated) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  
  // Proceed with authenticated request
}
```

### Handling Rate Limits

```typescript
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';

export async function POST(request: NextRequest) {
  const rateLimitResult = await checkRateLimit(
    `endpoint:${context.companyId}`,
    RATE_LIMIT_CONFIGS.default
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { 
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter 
      },
      { status: 429 }
    );
  }

  // Process request
}
```

### Error Handling

```typescript
import { errors, createSuccessResponse } from '@/lib/apiResponse';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate input
    if (!data.requiredField) {
      throw errors.validationError('Required field missing');
    }
    
    return createSuccessResponse(result);
    
  } catch (error) {
    logger.error('Request failed', { error });
    throw error; // Will be handled by error middleware
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify API keys and tokens are correctly configured
   - Check that `X-Authenticated` header is set to `true`
   - Ensure company and user IDs are valid

2. **Rate Limiting**
   - Implement exponential backoff for retries
   - Check rate limit headers in responses
   - Use appropriate rate limit keys for different endpoints

3. **Validation Errors**
   - Ensure request bodies match expected schemas
   - Check that required fields are present
   - Verify data types and formats

4. **Database Connection Issues**
   - Check database connection string
   - Verify database is accessible
   - Review database health endpoint

### Debug Mode

Enable debug mode for detailed logging:

```typescript
// Environment variable
DEBUG_WHOP_SDK=true

// Or programmatically
process.env.NODE_ENV = 'development';
```

### Getting Help

- Check the [Error Handling Guide](../error-handling-guide.md)
- Review the [Troubleshooting Guide](../whop-troubleshooting-guide.md)
- Consult the [API Reference](../whop-api-reference.md)

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**API Version**: v1