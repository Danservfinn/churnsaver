# Error Handling Guide

This guide provides comprehensive documentation for the standardized error handling system implemented in the Churn Saver application.

## Table of Contents

1. [Overview](#overview)
2. [Error Response Format](#error-response-format)
3. [Error Categories and Codes](#error-categories-and-codes)
4. [Error Handling Middleware](#error-handling-middleware)
5. [Error Categorization System](#error-categorization-system)
6. [Error Recovery Mechanisms](#error-recovery-mechanisms)
7. [Best Practices](#best-practices)
8. [Migration Guide](#migration-guide)
9. [Examples](#examples)
10. [Troubleshooting](#troubleshooting)
11. [Internal Architecture Improvements](#internal-architecture-improvements)

## Overview

The Churn Saver application implements a comprehensive error handling system that provides:

- **Consistent error responses** across all API endpoints
- **Intelligent error categorization** with automatic pattern matching
- **Enhanced logging and monitoring** integration
- **Automated recovery mechanisms** for common failure scenarios
- **Security-aware error handling** that prevents information leakage

### Key Benefits

1. **Predictable Error Behavior**: All errors follow the same format and structure
2. **Better Debugging**: Rich error context and categorization
3. **Improved Reliability**: Automatic recovery and retry mechanisms
4. **Enhanced Security**: Sanitized error responses and security monitoring
5. **Better Monitoring**: Integrated logging and metrics collection

## Error Response Format

All API errors now follow a standardized JSON format:

```json
{
  "success": false,
  "error": {
    "error": "Human-readable error message",
    "code": "ERROR_CODE",
    "category": "error_category",
    "severity": "error_severity",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "uuid-v4",
    "retryable": true,
    "retryAfter": 30,
    "details": {
      "field": "additional context"
    }
  },
  "meta": {
    "requestId": "uuid-v4",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "1.0.0",
    "processingTimeMs": 150
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Always `false` for error responses |
| `error.error` | string | Human-readable error message |
| `error.code` | string | Machine-readable error code (see [Error Codes](#error-codes)) |
| `error.category` | string | Error category for classification |
| `error.severity` | string | Error severity level |
| `error.timestamp` | string | ISO 8601 timestamp |
| `error.requestId` | string | Unique request identifier |
| `error.retryable` | boolean | Whether the operation can be retried |
| `error.retryAfter` | number | Seconds to wait before retry (if applicable) |
| `error.details` | object | Additional error context |
| `meta.requestId` | string | Same as error.requestId for convenience |
| `meta.timestamp` | string | Response timestamp |
| `meta.version` | string | API version |
| `meta.processingTimeMs` | number | Request processing time |

## Error Categories and Codes

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
| `unknown` | Unclassified errors | 500 |

### Error Codes

#### Validation Errors (400)
- `BAD_REQUEST` - General validation error
- `INVALID_INPUT` - Invalid input format
- `MISSING_REQUIRED_FIELD` - Required field missing
- `INVALID_FORMAT` - Format validation failed

#### Authentication Errors (401)
- `UNAUTHORIZED` - Authentication required
- `INVALID_TOKEN` - Invalid authentication token
- `TOKEN_EXPIRED` - Token has expired
- `MISSING_TOKEN` - No token provided

#### Authorization Errors (403)
- `FORBIDDEN` - Access forbidden
- `INSUFFICIENT_PERMISSIONS` - Insufficient permissions

#### Not Found Errors (404)
- `NOT_FOUND` - Resource not found
- `RESOURCE_NOT_FOUND` - Specific resource not found

#### Method Errors (405)
- `METHOD_NOT_ALLOWED` - HTTP method not allowed

#### Conflict Errors (409)
- `CONFLICT` - Resource conflict
- `RESOURCE_ALREADY_EXISTS` - Resource already exists

#### Rate Limiting Errors (422)
- `RATE_LIMITED` - Rate limit exceeded
- `UNPROCESSABLE_ENTITY` - Cannot process request

#### Server Errors (500)
- `INTERNAL_SERVER_ERROR` - General server error
- `DATABASE_ERROR` - Database operation failed
- `EXTERNAL_SERVICE_ERROR` - External service error
- `NETWORK_ERROR` - Network connectivity error

#### Service Unavailable (503)
- `SERVICE_UNAVAILABLE` - Service temporarily unavailable
- `MAINTENANCE_MODE` - Service under maintenance

#### Security Errors
- `SECURITY_VIOLATION` - Security violation detected
- `SUSPICIOUS_ACTIVITY` - Suspicious activity detected

## Error Handling Middleware

### Using the Error Handler

The error handling middleware provides automatic error catching, categorization, and response formatting:

```typescript
import { withErrorHandler } from '@/server/middleware/errorHandler';
import { errors } from '@/lib/apiResponse';

export const GET = withErrorHandler(
  async (request: NextRequest, context) => {
    // Your API logic here
    if (!someCondition) {
      throw errors.badRequest('Invalid input', { field: 'example' });
    }
    
    return createSuccessResponse(data, context);
  }
);
```

### Error Handler Configuration

```typescript
import { ErrorHandler } from '@/server/middleware/errorHandler';

const customHandler = new ErrorHandler({
  enableSecurityMonitoring: true,
  enableDetailedLogging: true,
  enablePerformanceMonitoring: true,
  sanitizeErrors: true,
  retryConfig: {
    maxRetries: 3,
    retryableCategories: ['database', 'external_service', 'network'],
    baseDelay: 1000
  }
});
```

## Error Categorization System

### Automatic Categorization

The system automatically categorizes errors based on pattern matching:

```typescript
import { categorizeAndLogError } from '@/lib/errorCategorization';

try {
  await someOperation();
} catch (error) {
  const categorizedError = categorizeAndLogError(error, {
    endpoint: '/api/example',
    method: 'POST',
    userId: 'user-123'
  });
  
  // categorizedError contains:
  // - Original error
  // - Categorized error with proper classification
  // - Detected patterns
  // - Suggested actions
  // - Monitoring data
}
```

### Custom Error Patterns

Add custom error patterns for automatic categorization:

```typescript
import { errorCategorizer } from '@/lib/errorCategorization';

errorCategorizer.addPattern({
  pattern: /payment.*failed|card.*declined/i,
  category: ErrorCategory.EXTERNAL_SERVICE,
  severity: ErrorSeverity.HIGH,
  code: ErrorCode.EXTERNAL_SERVICE_ERROR,
  retryable: false,
  description: 'Payment processing error'
});
```

## Error Recovery Mechanisms

### Retry with Exponential Backoff

```typescript
import { executeWithRecovery } from '@/lib/errorRecovery';

const result = await executeWithRecovery(
  async () => {
    return await externalServiceCall();
  },
  {
    service: 'payment_processor',
    retry: true,
    circuitBreaker: true,
    fallback: true,
    context: { operation: 'process_payment' }
  }
);
```

### Circuit Breaker Pattern

```typescript
import { CircuitBreaker } from '@/lib/errorRecovery';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 60000,
  monitoringPeriod: 300000
});

const result = await circuitBreaker.execute(
  async () => await riskyOperation(),
  { operation: 'database_query' }
);
```

### Fallback Mechanisms

```typescript
import { FallbackHandler } from '@/lib/errorRecovery';

const fallback = new FallbackHandler({
  enabled: true,
  cacheEnabled: true,
  cacheTTL: 300000,
  fallbackData: { status: 'service_unavailable' }
});

const result = await fallback.execute(
  async () => await primaryOperation(),
  async () => await fallbackOperation(),
  'cache-key'
);
```

## Best Practices

### 1. Use Structured Error Handling

```typescript
// ✅ Good
export const POST = withErrorHandler(async (request: NextRequest, context) => {
  try {
    const result = await someOperation();
    return createSuccessResponse(result, context);
  } catch (error) {
    // Let the middleware handle the error
    throw errors.databaseError('Operation failed', { 
      operation: 'someOperation',
      userId: context.userId 
    });
  }
});

// ❌ Bad
export async function POST(request: NextRequest) {
  try {
    const result = await someOperation();
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Something went wrong' 
    }, { status: 500 });
  }
}
```

### 2. Provide Context in Errors

```typescript
// ✅ Good
throw errors.badRequest('Invalid input', {
  field: 'email',
  value: email,
  reason: 'Invalid email format',
  requestId: context.requestId
});

// ❌ Bad
throw new Error('Invalid input');
```

### 3. Use Appropriate Error Categories

```typescript
// ✅ Good
throw errors.unauthorized('Authentication required', {
  endpoint: '/api/sensitive-data',
  method: 'GET'
});

throw errors.rateLimited(60, {
  endpoint: '/api/public-data',
  limit: 100,
  window: '1 hour'
});

// ❌ Bad
throw new Error('Access denied');
```

### 4. Implement Recovery Mechanisms

```typescript
// ✅ Good
const result = await executeWithRecovery(
  async () => await databaseOperation(),
  {
    service: 'database',
    retry: true,
    circuitBreaker: true,
    fallback: async () => await getCachedData()
  }
);

// ❌ Bad
const result = await databaseOperation(); // No recovery
```

### 5. Log Errors Properly

```typescript
// ✅ Good - Let the system handle logging
throw errors.databaseError('Query failed', {
  query: 'SELECT * FROM users',
  table: 'users',
  operation: 'select'
});

// ❌ Bad - Manual logging
logger.error('Database error', { error: error.message });
throw error;
```

## Migration Guide

### Migrating Existing API Endpoints

#### Before (Old Pattern)

```typescript
export async function GET(request: NextRequest) {
  try {
    const data = await someOperation();
    return NextResponse.json({ data });
  } catch (error) {
    logger.error('Operation failed', { error: error.message });
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500 });
  }
}
```

#### After (New Pattern)

```typescript
import { withErrorHandler, createSuccessResponse } from '@/server/middleware/errorHandler';
import { errors } from '@/lib/apiResponse';

export const GET = withErrorHandler(
  async (request: NextRequest, context) => {
    const data = await someOperation();
    return createSuccessResponse(data, context);
  }
);
```

### Step-by-Step Migration

1. **Import the necessary modules**
   ```typescript
   import { withErrorHandler, createSuccessResponse } from '@/server/middleware/errorHandler';
   import { errors } from '@/lib/apiResponse';
   ```

2. **Wrap your handler with `withErrorHandler`**
   ```typescript
   export const GET = withErrorHandler(async (request, context) => {
     // Your logic here
   });
   ```

3. **Replace manual error handling with structured errors**
   ```typescript
   // Instead of: return NextResponse.json({ error: message }, { status })
   throw errors.badRequest(message, details);
   ```

4. **Use `createSuccessResponse` for success responses**
   ```typescript
   return createSuccessResponse(data, context);
   ```

5. **Add recovery mechanisms for external operations**
   ```typescript
   import { executeWithRecovery } from '@/lib/errorRecovery';
   
   const result = await executeWithRecovery(
     () => externalServiceCall(),
     { service: 'external_api', retry: true }
   );
   ```

## Examples

### Complete API Endpoint Example

```typescript
import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse } from '@/server/middleware/errorHandler';
import { errors } from '@/lib/apiResponse';
import { executeWithRecovery } from '@/lib/errorRecovery';
import { logger } from '@/lib/logger';

interface CreateUserRequest {
  email: string;
  name: string;
  companyId: string;
}

export const POST = withErrorHandler(
  async (request: NextRequest, context) => {
    // Parse and validate input
    const body = await request.json().catch(() => ({}));
    const { email, name, companyId } = body as CreateUserRequest;

    // Validate required fields
    if (!email) {
      throw errors.missingRequiredField('email', {
        providedFields: Object.keys(body)
      });
    }

    if (!name) {
      throw errors.missingRequiredField('name', {
        providedFields: Object.keys(body)
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw errors.invalidInput('Invalid email format', {
        field: 'email',
        value: email
      });
    }

    // Perform database operation with recovery
    const user = await executeWithRecovery(
      async () => {
        return await createUser({
          email,
          name,
          companyId,
          createdBy: context.userId
        });
      },
      {
        service: 'database',
        retry: true,
        circuitBreaker: true,
        context: {
          operation: 'create_user',
          email,
          companyId
        }
      }
    );

    logger.info('User created successfully', {
      userId: user.id,
      email,
      companyId,
      requestId: context.requestId
    });

    return createSuccessResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt
    }, context, 201);
  }
);
```

### Error Handling in Services

```typescript
import { errors } from '@/lib/apiResponse';
import { executeWithRecovery } from '@/lib/errorRecovery';

export class UserService {
  async createUser(userData: CreateUserDto): Promise<User> {
    return executeWithRecovery(
      async () => {
        // Check if user already exists
        const existingUser = await this.findByEmail(userData.email);
        if (existingUser) {
          throw errors.conflict('User with this email already exists', {
            field: 'email',
            value: userData.email,
            existingUserId: existingUser.id
          });
        }

        // Create user
        return await this.userRepository.create(userData);
      },
      {
        service: 'database',
        retry: true,
        context: { operation: 'create_user', email: userData.email }
      }
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    return executeWithRecovery(
      async () => {
        return await this.userRepository.findByEmail(email);
      },
      {
        service: 'database',
        retry: true,
        fallback: async () => null, // Return null if database is unavailable
        context: { operation: 'find_user_by_email', email }
      }
    );
  }
}
```

## Troubleshooting

### Common Issues

#### 1. TypeScript Errors with Error Handling

**Problem**: Type errors when using error handlers
```typescript
// Error: Type 'AppError' is not assignable to type 'NextResponse'
throw errors.badRequest('message');
```

**Solution**: Make sure you're using the `withErrorHandler` wrapper
```typescript
export const POST = withErrorHandler(async (request, context) => {
  throw errors.badRequest('message'); // This works inside wrapper
});
```

#### 2. Missing Request Context

**Problem**: `context` parameter is undefined
```typescript
export const GET = withErrorHandler(async (request, context) => {
  console.log(context.requestId); // undefined
});
```

**Solution**: Ensure you're using the correct function signature
```typescript
// Correct signature
export const GET = withErrorHandler(async (request: NextRequest, context: RequestContext) => {
  console.log(context.requestId); // Works!
});
```

#### 3. Recovery Mechanisms Not Working

**Problem**: Retry or circuit breaker not triggering
```typescript
const result = await executeWithRecovery(operation, { retry: true });
// No retry happening
```

**Solution**: Check if the error is retryable
```typescript
// Make sure the error is marked as retryable
throw errors.externalServiceError('service', 'API call failed', {
  retryable: true // This is automatic for external service errors
});
```

### Debugging Error Handling

#### Enable Detailed Logging

```typescript
import { ErrorHandler } from '@/server/middleware/errorHandler';

const debugHandler = new ErrorHandler({
  enableDetailedLogging: true,
  enableSecurityMonitoring: true,
  sanitizeErrors: false // Only in development
});
```

#### Check Error Categories

```typescript
import { categorizeAndLogError } from '@/lib/errorCategorization';

try {
  await riskyOperation();
} catch (error) {
  const categorized = categorizeAndLogError(error);
  console.log('Detected patterns:', categorized.detectedPatterns);
  console.log('Suggested actions:', categorized.suggestedActions);
}
```

#### Monitor Recovery Statistics

```typescript
import { recoveryManager } from '@/lib/errorRecovery';

const stats = recoveryManager.getStats();
console.log('Circuit breaker states:', stats.circuitBreakers);
console.log('Fallback cache stats:', stats.fallbacks);
```

### Performance Considerations

1. **Error Handling Overhead**: The error handling system adds minimal overhead (~1-2ms per request)
2. **Memory Usage**: Circuit breakers and fallback caches use minimal memory
3. **Logging Volume**: Enable detailed logging only in development or for debugging
4. **Recovery Attempts**: Configure appropriate retry limits to prevent excessive resource usage

### Security Considerations

1. **Information Leakage**: The system automatically sanitizes sensitive information
2. **Error Enumeration**: Use consistent error messages to prevent reconnaissance
3. **Rate Limiting**: Implement rate limiting on error-prone endpoints
4. **Monitoring**: Enable security monitoring for suspicious error patterns

## Internal Architecture Improvements

Recent internal refactoring has simplified the error handling system's architecture while maintaining full backward compatibility. These changes have no impact on external APIs or observable behavior.

### Key Improvements

- **Typed Metrics Storage**: Enhanced type safety for metrics collection and storage
- **Unified Action Catalogs**: Consolidated action definitions for better maintainability
- **Alert Descriptor Consolidation**: Streamlined alert configuration and management
- **Feature-Flagged Enhancements**: Gradual rollout of improvements with feature flags

All changes are internal and preserve existing functionality, APIs, and error handling behavior.

## Integration with Existing Systems

### Monitoring Integration

The error handling system integrates with existing monitoring:

```typescript
// Automatic metrics collection
logger.metric('error.categorized', 1, {
  error_category: 'database',
  error_severity: 'high',
  endpoint: '/api/users'
});

// Security monitoring integration
await securityMonitor.processSecurityEvent({
  category: 'authentication',
  severity: 'high',
  type: 'invalid_token',
  description: 'Invalid authentication token detected'
});
```

### Database Integration

```typescript
// Automatic database recovery
await executeWithRecovery(
  async () => await database.query(),
  {
    service: 'database',
    retry: true,
    circuitBreaker: true,
    context: { operation: 'user_query' }
  }
);
```

### External Service Integration

```typescript
// External service calls with fallback
const result = await executeWithRecovery(
  async () => await paymentProcessor.charge(amount),
  {
    service: 'payment_processor',
    retry: true,
    fallback: async () => await alternativeProcessor.charge(amount),
    context: { amount, currency: 'USD' }
  }
);
```

---

For more information or questions about the error handling system, please refer to the code documentation or contact the development team.