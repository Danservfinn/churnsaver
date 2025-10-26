# Whop SDK API Reference

This document provides a comprehensive API reference for the Whop SDK integration in the Churn Saver application.

## Table of Contents

1. [Configuration API](#configuration-api)
2. [Authentication API](#authentication-api)
3. [API Client API](#api-client-api)
4. [Webhook API](#webhook-api)
5. [Resilience API](#resilience-api)
6. [Observability API](#observability-api)
7. [Data Transformers](#data-transformers)
8. [Type Definitions](#type-definitions)
9. [Error Handling](#error-handling)
10. [Migration Guide](#migration-guide)

## Configuration API

### `buildWhopSdkConfig(): ConfigValidationResult`

Builds and validates Whop SDK configuration from environment variables.

**Returns**: `ConfigValidationResult`

```typescript
interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: WhopSdkConfig;
}
```

**Example**:
```typescript
import { buildWhopSdkConfig } from '@/lib/whop/sdkConfig';

const result = buildWhopSdkConfig();
if (!result.isValid) {
  console.error('Configuration errors:', result.errors);
} else {
  console.log('Configuration loaded:', result.config);
}
```

### `getWhopSdkConfig(): WhopSdkConfig`

Gets validated Whop SDK configuration, throws on validation failure.

**Returns**: `WhopSdkConfig`

**Throws**: `Error` if configuration is invalid

```typescript
import { getWhopSdkConfig } from '@/lib/whop/sdkConfig';

try {
  const config = getWhopSdkConfig();
  console.log('App ID:', config.appId);
} catch (error) {
  console.error('Configuration error:', error.message);
}
```

### `validateWhopSdkConfig(): ConfigValidationResult`

Validates configuration without throwing errors.

**Returns**: `ConfigValidationResult`

```typescript
import { validateWhopSdkConfig } from '@/lib/whop/sdkConfig';

const validation = validateWhopSdkConfig();
console.log('Valid:', validation.isValid);
console.log('Errors:', validation.errors.length);
console.log('Warnings:', validation.warnings.length);
```

### `whopConfig` Object

Convenience object with configuration helpers.

```typescript
import { whopConfig } from '@/lib/whop/sdkConfig';

// Get configuration
const config = whopConfig.get();

// Validate configuration
const validation = whopConfig.validate();

// Environment helpers
const isDev = whopConfig.isDevelopment();
const isProd = whopConfig.isProduction();
const currentEnv = whopConfig.getCurrentEnvironment();
```

## Authentication API

### `WhopAuthService` Class

Main authentication service class.

#### Constructor

```typescript
constructor(
  config?: WhopSdkConfig,
  tokenStorage?: TokenStorage,
  sessionTimeout: number = 3600
)
```

#### Methods

##### `verifyToken(token: string): Promise<TokenInfo>`

Verifies JWT token and returns token information.

**Parameters**:
- `token`: JWT token string

**Returns**: `Promise<TokenInfo>`

**Throws**: `AppError` on verification failure

```typescript
const tokenInfo = await whopAuthService.verifyToken('jwt_token_here');
console.log('User ID:', tokenInfo.userId);
console.log('Expires:', new Date(tokenInfo.expiresAt));
```

##### `authenticate(request, options?): Promise<AuthContext>`

Authenticates a request and returns authentication context.

**Parameters**:
- `request`: Request object with headers
- `options`: Optional authentication options

**Returns**: `Promise<AuthContext>`

```typescript
const context = await whopAuthService.authenticate(request, {
  checkPermissions: ['read', 'write'],
  validateSession: true
});

if (context.isAuthenticated) {
  console.log('User:', context.userId);
  console.log('Permissions:', context.permissions);
}
```

##### `createSession(userId, companyId?, ttl?): Promise<SessionInfo>`

Creates a new session for a user.

**Parameters**:
- `userId`: User identifier
- `companyId`: Optional company identifier
- `ttl`: Session timeout in seconds (default: 3600)

**Returns**: `Promise<SessionInfo>`

```typescript
const session = await whopAuthService.createSession(
  'user_123',
  'company_456',
  7200 // 2 hours
);
console.log('Session ID:', session.sessionId);
```

##### `validateSession(userId, sessionId?): Promise<SessionInfo | undefined>`

Validates an existing session.

**Parameters**:
- `userId`: User identifier
- `sessionId`: Optional session identifier

**Returns**: `Promise<SessionInfo | undefined>`

```typescript
const session = await whopAuthService.validateSession('user_123', 'session_456');
if (session && session.isActive) {
  console.log('Session valid until:', new Date(session.expiresAt));
}
```

##### `revokeSession(sessionId): Promise<void>`

Revokes a specific session.

**Parameters**:
- `sessionId`: Session identifier to revoke

**Returns**: `Promise<void>`

```typescript
await whopAuthService.revokeSession('session_456');
console.log('Session revoked');
```

##### `revokeAllUserSessions(userId): Promise<void>`

Revokes all sessions for a user.

**Parameters**:
- `userId`: User identifier

**Returns**: `Promise<void>`

```typescript
await whopAuthService.revokeAllUserSessions('user_123');
console.log('All user sessions revoked');
```

##### `refreshToken(refreshToken): Promise<TokenInfo>`

Refreshes an authentication token.

**Parameters**:
- `refreshToken`: Refresh token string

**Returns**: `Promise<TokenInfo>`

```typescript
const newToken = await whopAuthService.refreshToken('refresh_token_here');
console.log('New token expires:', new Date(newToken.expiresAt));
```

### Authentication Middleware

#### `requireAuth(options?)`

Middleware that requires authentication.

```typescript
export const GET = requireAuth(async (request, context) => {
  // User is authenticated
  return NextResponse.json({ userId: context.auth.userId });
});
```

#### `requirePermissions(permissions)`

Middleware that requires specific permissions.

```typescript
export const POST = requirePermissions(['admin'], async (request, context) => {
  // User has admin permissions
  return NextResponse.json({ success: true });
});
```

#### `createAuthMiddleware(options)`

Creates custom authentication middleware.

```typescript
const customAuth = createAuthMiddleware({
  checkPermissions: ['read'],
  validateSession: true,
  timeout: 30000
});
```

### Default Instance

```typescript
import { whopAuthService } from '@/lib/whop';

// Pre-configured authentication service
const tokenInfo = await whopAuthService.verifyToken(token);
```

## API Client API

### `WhopApiClient` Class

HTTP client for Whop API with middleware support.

#### Constructor

```typescript
constructor(config?: WhopSdkConfig)
```

#### Methods

##### `use(middleware): void`

Adds middleware to the request pipeline.

**Parameters**:
- `middleware`: Middleware object

```typescript
client.use({
  name: 'logging',
  beforeRequest: async (options) => {
    console.log('Request:', options.method, options.endpoint);
    return options;
  },
  afterResponse: async (response) => {
    console.log('Response:', response.status);
    return response;
  }
});
```

##### `request<T>(endpoint, options?): Promise<ApiResponse<T>>`

Makes an HTTP request with full middleware support.

**Parameters**:
- `endpoint`: API endpoint (e.g., '/users/123')
- `options`: Request options

**Returns**: `Promise<ApiResponse<T>>`

```typescript
const response = await client.request('/users/123', {
  method: 'GET',
  headers: { 'Custom-Header': 'value' }
});
console.log('User data:', response.data);
```

##### `get<T>(endpoint, options?): Promise<ApiResponse<T>>`

Convenience method for GET requests.

##### `post<T>(endpoint, data?, options?): Promise<ApiResponse<T>>`

Convenience method for POST requests.

##### `put<T>(endpoint, data?, options?): Promise<ApiResponse<T>>`

Convenience method for PUT requests.

##### `delete<T>(endpoint, options?): Promise<ApiResponse<T>>`

Convenience method for DELETE requests.

##### `getMembership(membershipId): Promise<ApiResponse>`

Gets membership details.

##### `addMembershipFreeDays(membershipId, days): Promise<ApiResponse>`

Adds free days to a membership.

##### `cancelMembership(membershipId): Promise<ApiResponse>`

Cancels a membership at period end.

##### `getCompany(companyId): Promise<ApiResponse>`

Gets company information.

##### `getUser(userId): Promise<ApiResponse>`

Gets user information.

### Built-in Middleware

#### `middleware.retry(options?)`

Adds retry logic with exponential backoff.

```typescript
client.use(middleware.retry({
  maxRetries: 3,
  baseDelay: 1000
}));
```

#### `middleware.rateLimit()`

Monitors and logs rate limit usage.

```typescript
client.use(middleware.rateLimit());
```

#### `middleware.logging()`

Logs request/response details.

```typescript
client.use(middleware.logging());
```

### Default Instance

```typescript
import { whopApiClient } from '@/lib/whop';

// Pre-configured API client
const users = await whopApiClient.get('/users');
```

## Webhook API

### `WebhookValidator` Class

Validates webhook signatures and payloads.

#### Constructor

```typescript
constructor(config?: WhopSdkConfig)
```

#### Methods

##### `validateWebhook(body, signature, timestamp?, payload?): Promise<WebhookValidationResult>`

Comprehensive webhook validation.

**Parameters**:
- `body`: Raw request body
- `signature`: Webhook signature header
- `timestamp`: Optional timestamp header
- `payload`: Optional parsed payload

**Returns**: `Promise<WebhookValidationResult>`

```typescript
const validation = await webhookValidator.validateWebhook(
  rawBody,
  request.headers.get('x-whop-signature'),
  request.headers.get('x-whop-timestamp'),
  JSON.parse(rawBody)
);

if (validation.isValid) {
  console.log('Event type:', validation.eventType);
} else {
  console.error('Validation errors:', validation.errors);
}
```

##### `validateSignature(body, signature): SignatureValidationResult`

Validates only the signature.

##### `validateEventType(eventType): EventTypeValidationResult`

Validates only the event type.

##### `getSupportedEvents(): Record<string, string>`

Returns all supported webhook event types.

##### `isEventSupported(eventType): boolean`

Checks if an event type is supported.

### Utility Functions

#### `validateWebhookSignature(body, signature, secret): SignatureValidationResult`

Validates webhook signature.

#### `validateTimestamp(timestamp?, tolerance?): { valid: boolean; error?: string; timestamp?: number }`

Validates webhook timestamp for replay attack protection.

#### `validateEventType(eventType): EventTypeValidationResult`

Validates webhook event type.

#### `validateWebhookPayload(payload): WebhookValidationResult`

Validates webhook payload structure.

#### `parseSignatureHeader(signature): string | null`

Parses webhook signature header.

#### `timingSafeEqualHex(a, b): boolean`

Timing-safe hex string comparison.

### Default Instance

```typescript
import { webhookValidator } from '@/lib/whop';

// Pre-configured webhook validator
const validation = await webhookValidator.validateWebhook(body, signature);
```

## Resilience API

### `ResilienceService` Class

Provides resilience patterns for API operations.

#### Constructor

```typescript
constructor(config?: Partial<ResilienceConfig>)
```

#### Methods

##### `execute<T>(operation, context): Promise<T>`

Executes operation with full resilience stack.

**Parameters**:
- `operation`: Async function to execute
- `context`: Request context for telemetry

**Returns**: `Promise<T>`

```typescript
const result = await resilienceService.execute(
  async () => await whopApiClient.get('/unreliable-endpoint'),
  {
    operation: 'get_data',
    service: 'whop_api',
    requestId: 'req_123'
  }
);
```

##### `getCircuitBreakerState(): CircuitState`

Gets current circuit breaker state.

##### `getCircuitBreakerMetrics(): CircuitBreakerMetrics`

Gets circuit breaker metrics.

##### `resetCircuitBreaker(): void`

Manually resets the circuit breaker.

##### `updateRetryPolicy(config): void`

Updates retry policy configuration.

### `RetryPolicyExecutor` Class

Implements retry logic with exponential backoff.

#### Constructor

```typescript
constructor(config?: Partial<RetryPolicy>)
```

#### Methods

##### `execute<T>(operation, context, hooks?): Promise<T>`

Executes operation with retry logic.

### `CircuitBreaker` Class

Implements circuit breaker pattern.

#### Constructor

```typescript
constructor(config?: Partial<CircuitBreakerConfig>, hooks?: TelemetryHooks)
```

#### Methods

##### `execute<T>(operation, context): Promise<T>`

Executes operation through circuit breaker.

##### `getState(): CircuitState`

Gets current state.

##### `getMetrics(): CircuitBreakerMetrics`

Gets metrics.

##### `reset(): void`

Resets circuit breaker.

### Utility Functions

#### `executeResiliently<T>(operation, context, config?): Promise<T>`

Convenience function for resilient execution.

```typescript
const data = await executeResiliently(
  () => fetchUserData(userId),
  {
    operation: 'get_user_data',
    service: 'whop_api',
    userId
  },
  {
    retryPolicy: { maxRetries: 5 },
    circuitBreaker: { failureThreshold: 10 }
  }
);
```

### Default Instance

```typescript
import { resilienceService } from '@/lib/whop';

// Pre-configured resilience service
const result = await resilienceService.execute(operation, context);
```

## Observability API

### `TelemetryCollector` Class

Collects telemetry data for operations.

#### Constructor

```typescript
constructor(hooks?: TelemetryHooks, config?: WhopSdkConfig)
```

#### Methods

##### `onRequestStart(context): void`

Tracks request start.

##### `onRequestSuccess(context, response, duration): void`

Tracks successful requests.

##### `onRequestError(context, error, duration): void`

Tracks failed requests.

### Helper Functions

#### `categorizeAndLogError(error, context?): CategorizedError`

Categorizes and logs errors with context.

```typescript
import { categorizeAndLogError } from '@/lib/errorCategorization';

try {
  await riskyOperation();
} catch (error) {
  const categorized = categorizeAndLogError(error, {
    endpoint: '/api/users',
    method: 'POST',
    userId: 'user_123'
  });

  console.log('Error category:', categorized.category);
  console.log('Suggested actions:', categorized.suggestedActions);
}
```

## Data Transformers

### Data Transformation Functions

#### `transformMembershipData(rawData): MembershipData`

Transforms raw Whop membership data.

#### `transformPaymentData(rawData): PaymentData`

Transforms raw Whop payment data.

#### `transformUserData(rawData): UserData`

Transforms raw Whop user data.

#### `transformCompanyData(rawData): CompanyData`

Transforms raw Whop company data.

### Validation Functions

#### `validateMembershipData(data): ValidationResult`

Validates membership data structure.

#### `validatePaymentData(data): ValidationResult`

Validates payment data structure.

#### `validateUserData(data): ValidationResult`

Validates user data structure.

## Type Definitions

### Configuration Types

```typescript
interface WhopSdkConfig {
  appId: string;
  apiKey?: string;
  webhookSecret?: string;
  apiBaseUrl: string;
  requestTimeout: number;
  maxRetries: number;
  retryDelay: number;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableRetry: boolean;
  environment: 'development' | 'staging' | 'production';
  debugMode: boolean;
}

interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  config?: WhopSdkConfig;
}
```

### Authentication Types

```typescript
interface TokenInfo {
  token: string;
  payload: JWTPayload;
  expiresAt: number;
  issuedAt: number;
  userId?: string;
  companyId?: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

interface AuthContext {
  isAuthenticated: boolean;
  userId?: string;
  companyId?: string;
  tokenInfo?: TokenInfo;
  sessionInfo?: SessionInfo;
  permissions?: string[];
  metadata?: Record<string, any>;
}

interface SessionInfo {
  sessionId: string;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  isActive: boolean;
  userId?: string;
  companyId?: string;
}

interface AuthOptions {
  token?: string;
  sessionId?: string;
  validateSession?: boolean;
  checkPermissions?: string[];
  timeout?: number;
  skipCache?: boolean;
}

interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

### API Client Types

```typescript
interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  signal?: AbortSignal;
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  requestId?: string;
  rateLimit?: {
    remaining: number;
    reset: number;
    limit: number;
  };
}

interface ApiMiddleware {
  name: string;
  beforeRequest?: (options: ApiRequestOptions) => ApiRequestOptions | Promise<ApiRequestOptions>;
  afterResponse?: (response: ApiResponse, options: ApiRequestOptions) => ApiResponse | Promise<ApiResponse>;
  onError?: (error: Error, options: ApiRequestOptions) => Error | Promise<Error>;
}

interface RequestContext {
  requestId: string;
  method: string;
  endpoint: string;
  startTime: number;
  attempt: number;
}
```

### Webhook Types

```typescript
interface WebhookValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  eventType?: string;
  eventId?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

interface SignatureValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  computedSignature?: string;
  providedSignature?: string;
}

interface EventTypeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  eventType?: string;
  isKnownEvent: boolean;
  schemaCompliant: boolean;
}

interface WebhookPayload {
  id?: string;
  whop_event_id?: string;
  type: string;
  data: Record<string, unknown> | any;
  created_at?: string;
  [key: string]: any;
}

type WhopWebhookEventType = keyof typeof WHOP_WEBHOOK_EVENTS;
```

### Resilience Types

```typescript
interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: (error: Error) => boolean;
}

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  successThreshold: number;
  monitoringWindow: number;
  name: string;
}

interface CircuitBreakerMetrics {
  requests: number;
  failures: number;
  successes: number;
  timeouts: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

interface TelemetryHooks {
  onRequestStart?: (context: RequestContext) => void;
  onRequestSuccess?: (context: RequestContext, response: any, duration: number) => void;
  onRequestError?: (context: RequestContext, error: Error, duration: number) => void;
  onRetryAttempt?: (context: RequestContext, attempt: number, delay: number) => void;
  onCircuitBreakerOpen?: (name: string, metrics: CircuitBreakerMetrics) => void;
  onCircuitBreakerClose?: (name: string, metrics: CircuitBreakerMetrics) => void;
  onCircuitBreakerHalfOpen?: (name: string, metrics: CircuitBreakerMetrics) => void;
}

interface RequestContext {
  operation: string;
  service: string;
  requestId: string;
  startTime: number;
  endpoint?: string;
  method?: string;
  userId?: string;
  companyId?: string;
  additionalData?: Record<string, any>;
}

interface ResilienceConfig {
  retryPolicy: Partial<RetryPolicy>;
  circuitBreaker: Partial<CircuitBreakerConfig>;
  telemetry: TelemetryHooks;
  enableMetrics: boolean;
  enableLogging: boolean;
}
```

## Error Handling

### Error Classes

#### `AppError`

Application error with categorization.

```typescript
class AppError extends Error {
  constructor(
    message: string,
    code: ErrorCode,
    category: ErrorCategory,
    severity: ErrorSeverity,
    statusCode: number,
    retryable: boolean = false,
    details?: Record<string, any>,
    metadata?: Record<string, any>
  )
}
```

#### Usage

```typescript
import { AppError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/apiResponse';

throw new AppError(
  'User not found',
  ErrorCode.NOT_FOUND,
  ErrorCategory.DATABASE,
  ErrorSeverity.MEDIUM,
  404,
  false,
  { userId: 'user_123' }
);
```

### Error Factory Functions

#### `errors.badRequest(message, details?)`

Creates a bad request error.

#### `errors.unauthorized(message, details?)`

Creates an unauthorized error.

#### `errors.forbidden(message, details?)`

Creates a forbidden error.

#### `errors.notFound(message, details?)`

Creates a not found error.

#### `errors.conflict(message, details?)`

Creates a conflict error.

#### `errors.rateLimited(retryAfter, details?)`

Creates a rate limited error.

#### `errors.internalServerError(message, details?)`

Creates an internal server error.

### Error Middleware

#### `withErrorHandler(handler)`

Wraps route handlers with error handling.

```typescript
export const GET = withErrorHandler(async (request, context) => {
  // Handler logic - errors are automatically caught and formatted
  return createSuccessResponse(data, context);
});
```

#### `createSuccessResponse(data, context, status?)`

Creates a standardized success response.

## Migration Guide

### Upgrading from Manual Implementation

#### Before (Manual HTTP calls)

```typescript
// Old way
const response = await fetch('https://api.whop.com/api/v5/app/users/123', {
  headers: {
    'Authorization': `Bearer ${process.env.WHOP_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

if (!response.ok) {
  throw new Error(`Whop API error: ${response.status}`);
}

const user = await response.json();
```

#### After (SDK usage)

```typescript
// New way
import { whopApiClient } from '@/lib/whop';

const response = await whopApiClient.get('/users/123');
const user = response.data;
```

#### Authentication Migration

**Before**:
```typescript
const token = request.headers.get('authorization')?.replace('Bearer ', '');
// Manual JWT verification...
```

**After**:
```typescript
import { requireAuth } from '@/lib/whop';

export const GET = requireAuth(async (request, context) => {
  const { userId } = context.auth;
  // User is authenticated
});
```

#### Webhook Migration

**Before**:
```typescript
const signature = request.headers.get('x-whop-signature');
// Manual signature verification...
```

**After**:
```typescript
import { webhookValidator } from '@/lib/whop';

const validation = await webhookValidator.validateWebhook(body, signature);
if (!validation.isValid) {
  return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
}
```

#### Error Handling Migration

**Before**:
```typescript
export async function GET(request: NextRequest) {
  try {
    const data = await someOperation();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
```

**After**:
```typescript
import { withErrorHandler, createSuccessResponse } from '@/server/middleware/errorHandler';

export const GET = withErrorHandler(async (request, context) => {
  const data = await someOperation();
  return createSuccessResponse(data, context);
});
```

### Configuration Migration

Update environment variables:

```bash
# Old variables (still supported)
export WHOP_APP_ID=your_app_id

# New recommended variables
export NEXT_PUBLIC_WHOP_APP_ID=your_app_id
export WHOP_API_KEY=your_api_key
export WHOP_WEBHOOK_SECRET=your_webhook_secret
```

### Breaking Changes

1. **Configuration validation**: SDK now throws on invalid configuration in production
2. **Error response format**: All errors now follow standardized format
3. **Authentication middleware**: Requires new function signature with context
4. **Webhook validation**: Stricter validation rules for security

### Compatibility

- **Backward compatibility**: Maintained for existing API contracts
- **Gradual migration**: Can migrate endpoints individually
- **Feature flags**: New features can be enabled incrementally

---

This API reference provides comprehensive documentation for all Whop SDK components. For additional examples and usage patterns, refer to the integration guide and code examples.