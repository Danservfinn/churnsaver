# Integration Documentation

## Overview

This guide covers integration patterns for connecting external systems with Churn Saver. It includes Whop SDK integration, webhook handling, authentication flows, and error handling procedures.

## Table of Contents

1. [Whop SDK Integration](#whop-sdk-integration)
2. [Webhook Integration](#webhook-integration)
3. [Authentication Flows](#authentication-flows)
4. [API Integration](#api-integration)
5. [Error Handling](#error-handling)
6. [Testing Integration](#testing-integration)

## Whop SDK Integration

### SDK Overview

The Whop SDK provides a comprehensive interface for integrating with the Whop platform, handling authentication, API calls, and webhook validation.

### Installation

```bash
# Install Whop SDK
pnpm add @whop/sdk @whop/react @whop/api

# Install peer dependencies
pnpm add jose zod
```

### Basic Setup

```typescript
// src/lib/whop/index.ts
import { WhopSDK } from '@whop/sdk';

// Initialize SDK with configuration
const whopSDK = new WhopSDK({
  appId: process.env.NEXT_PUBLIC_WHOP_APP_ID,
  apiKey: process.env.WHOP_API_KEY,
  webhookSecret: process.env.WHOP_WEBHOOK_SECRET,
  environment: process.env.NODE_ENV || 'development',
  debugMode: process.env.NODE_ENV === 'development'
});

export default whopSDK;
```

### Configuration

```typescript
// src/lib/whop/sdkConfig.ts
export interface WhopConfig {
  appId: string;
  apiKey?: string;
  webhookSecret?: string;
  environment?: 'development' | 'staging' | 'production';
  debugMode?: boolean;
  apiBaseUrl?: string;
  webhookUrl?: string;
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}

// Default configuration
export const defaultConfig: WhopConfig = {
  environment: 'development',
  debugMode: false,
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000
  }
};
```

### Authentication

#### Client-Side Authentication

```typescript
// src/components/auth/WhopAuthProvider.tsx
import { WhopAuthProvider } from '@whop/react';

function App() {
  return (
    <WhopAuthProvider 
      config={{
        appId: process.env.NEXT_PUBLIC_WHOP_APP_ID,
        oauthRedirectUri: `${window.location.origin}/auth/callback`
      }}
    >
      <AppContent />
    </WhopAuthProvider>
  );
}

// Use authentication hook
import { useWhopAuth } from '@whop/react';

function LoginComponent() {
  const { user, isLoading, signIn, signOut } = useWhopAuth();

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  return (
    <div>
      {user ? (
        <div>
          <p>Welcome, {user.username}!</p>
          <button onClick={signOut}>Sign Out</button>
        </div>
      ) : (
        <button onClick={handleSignIn} disabled={isLoading}>
          {isLoading ? 'Signing in...' : 'Sign In with Whop'}
        </button>
      )}
    </div>
  );
}
```

#### Server-Side Authentication

```typescript
// src/lib/whop/auth.ts
import { whopSDK } from '@/lib/whop';

export async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return null;
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const user = await whopSDK.auth.verifyToken(token);
    
    return {
      user,
      token,
      companyId: user.companyId,
      userId: user.id
    };
  } catch (error) {
    console.error('Authentication failed:', error);
    return null;
  }
}

// Middleware usage
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/whop/auth';

export async function middleware(request: NextRequest) {
  const auth = await authenticateRequest(request);
  
  if (!auth) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Add auth context to request headers
  const response = NextResponse.next();
  response.headers.set('x-user-id', auth.userId);
  response.headers.set('x-company-id', auth.companyId);
  response.headers.set('x-authenticated', 'true');
  
  return response;
}
```

### API Client Usage

```typescript
// src/lib/whop/client.ts
import { whopSDK } from '@/lib/whop';

// Get user information
export async function getUserInfo(userId: string) {
  try {
    const user = await whopSDK.client.users.get(userId);
    return user;
  } catch (error) {
    console.error('Failed to get user info:', error);
    throw error;
  }
}

// Get membership information
export async function getMembershipInfo(membershipId: string) {
  try {
    const membership = await whopSDK.client.memberships.get(membershipId);
    return membership;
  } catch (error) {
    console.error('Failed to get membership info:', error);
    throw error;
  }
}

// Create recovery case
export async function createRecoveryCase(caseData: RecoveryCaseData) {
  try {
    const recoveryCase = await whopSDK.client.recovery.create(caseData);
    return recoveryCase;
  } catch (error) {
    console.error('Failed to create recovery case:', error);
    throw error;
  }
}
```

## Webhook Integration

### Webhook Handler Setup

```typescript
// src/server/webhooks/whop.ts
import { whopSDK } from '@/lib/whop';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function handleWhopWebhook(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    // Verify webhook signature
    const isValid = await whopSDK.webhooks.verify(request);
    if (!isValid) {
      logger.security('Invalid webhook signature', {
        ip: request.ip,
        userAgent: request.headers.get('user-agent')
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse webhook event
    const event = await whopSDK.webhooks.parse(request);
    logger.info('Webhook event received', {
      type: event.type,
      id: event.id
    });

    // Process event based on type
    await processWebhookEvent(event);

    const processingTime = Date.now() - startTime;
    logger.info('Webhook processed successfully', {
      eventId: event.id,
      processingTime
    });

    return NextResponse.json({
      success: true,
      event_id: event.id,
      processing_time: processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : String(error),
      processingTime
    });

    return NextResponse.json(
      { 
        error: 'Webhook processing failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
```

### Event Processing

```typescript
// src/server/webhooks/eventProcessor.ts
import { WebhookEvent } from '@whop/sdk';
import { createRecoveryCase } from '@/server/services/cases';
import { updateMembershipStatus } from '@/server/services/memberships';

export async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  switch (event.type) {
    case 'payment.failed':
      await handlePaymentFailed(event.data);
      break;
      
    case 'payment.succeeded':
      await handlePaymentSucceeded(event.data);
      break;
      
    case 'membership.cancelled':
      await handleMembershipCancelled(event.data);
      break;
      
    case 'membership.expired':
      await handleMembershipExpired(event.data);
      break;
      
    default:
      logger.warn('Unknown webhook event type', {
        type: event.type,
        eventId: event.id
      });
  }
}

async function handlePaymentFailed(data: PaymentFailedData): Promise<void> {
  // Check if recovery case already exists
  const existingCase = await findRecoveryCase(data.membershipId);
  
  if (!existingCase) {
    // Create new recovery case
    await createRecoveryCase({
      membershipId: data.membershipId,
      userId: data.userId,
      companyId: data.companyId,
      failureReason: data.failureReason,
      firstFailureAt: data.timestamp
    });
  } else {
    // Update existing case
    await updateRecoveryCase(existingCase.id, {
      attempts: existingCase.attempts + 1,
      lastNudgeAt: new Date()
    });
  }
}
```

### Webhook Security

```typescript
// src/lib/whop/webhookValidator.ts
import { createHmac } from 'crypto';

export class WebhookValidator {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  async verify(request: NextRequest): Promise<boolean> {
    const signature = request.headers.get('x-whop-signature');
    const body = await request.text();
    
    if (!signature || !body) {
      return false;
    }

    const expectedSignature = createHmac('sha256', this.secret)
      .update(body, 'utf8')
      .digest('hex');
    
    return `sha256=${expectedSignature}` === signature;
  }

  async parse(request: NextRequest): Promise<WebhookEvent> {
    const body = await request.text();
    
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new Error('Invalid webhook payload');
    }
  }
}
```

## Authentication Flows

### OAuth Integration

```typescript
// src/app/auth/oauth/route.ts
import { whopSDK } from '@/lib/whop';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code required' },
      { status: 400 }
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokens = await whopSDK.auth.exchangeCodeForTokens(code);
    
    // Get user information
    const user = await whopSDK.auth.getUserInfo(tokens.accessToken);
    
    // Create session
    const session = await createUserSession({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt
    });

    // Redirect to application
    const redirectUrl = searchParams.get('redirect_uri') || '/dashboard';
    
    return NextResponse.redirect(new URL(redirectUrl, request.url));

  } catch (error) {
    logger.error('OAuth callback failed', { error });
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
```

### Token Management

```typescript
// src/lib/whop/tokenUtils.ts
export class TokenManager {
  private static readonly TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  static async getValidToken(userId: string): Promise<string> {
    const session = await getUserSession(userId);
    
    if (!session) {
      throw new Error('No session found');
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken(session)) {
      const newTokens = await this.refreshToken(session.refreshToken);
      
      await updateUserSession(userId, {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt
      });
      
      return newTokens.accessToken;
    }

    return session.accessToken;
  }

  private static shouldRefreshToken(session: UserSession): boolean {
    const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
    return timeUntilExpiry < this.TOKEN_REFRESH_THRESHOLD;
  }

  private static async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch('https://api.whop.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }
}
```

## API Integration

### HTTP Client Configuration

```typescript
// src/lib/whop/client.ts
import { whopSDK } from '@/lib/whop';

class WhopAPIClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = whopSDK.getConfig().apiBaseUrl || 'https://api.whop.com';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Churn-Saver/1.0.0'
    };
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      ...this.defaultHeaders,
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new APIError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          await response.text()
        );
      }

      return response.json();
    } catch (error) {
      logger.error('API request failed', {
        endpoint,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // API methods
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
```

### Rate Limiting

```typescript
// src/lib/whop/rateLimiter.ts
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number = 60000; // 1 minute
  private readonly maxRequests: number = 100;

  async checkLimit(key: string): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const requestTimes = this.requests.get(key)!;
    const recentRequests = requestTimes.filter(time => time > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      throw new RateLimitError(
        `Rate limit exceeded. Wait ${waitTime}ms before retrying.`,
        waitTime
      );
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return true;
  }

  resetLimit(key: string): void {
    this.requests.delete(key);
  }
}

// Usage in API calls
const rateLimiter = new RateLimiter();

export async function makeAPIRequest(endpoint: string) {
  await rateLimiter.checkLimit('whop-api');
  
  // Make API request
  return await whopClient.get(endpoint);
}
```

## Error Handling

### Error Types

```typescript
// src/lib/whop/errors.ts
export class WhopError extends Error {
  constructor(
    message: string,
    public code: string,
    public category: 'authentication' | 'api' | 'webhook' | 'validation',
    public retryable: boolean = false,
    public details?: any
  ) {
    super(message);
    this.name = 'WhopError';
  }
}

export class AuthenticationError extends WhopError {
  constructor(message: string, details?: any) {
    super(message, 'AUTHENTICATION_ERROR', 'authentication', false, details);
  }
}

export class APIError extends WhopError {
  constructor(message: string, public status: number, responseText?: string) {
    super(message, 'API_ERROR', 'api', status >= 500 && status < 600, {
      status,
      responseText
    });
  }
}

export class WebhookError extends WhopError {
  constructor(message: string, public eventId?: string) {
    super(message, 'WEBHOOK_ERROR', 'webhook', false, { eventId });
  }
}

export class RateLimitError extends WhopError {
  constructor(message: string, public retryAfter: number) {
    super(message, 'RATE_LIMIT_ERROR', 'api', true, { retryAfter });
  }
}
```

### Error Recovery

```typescript
// src/lib/whop/resilience.ts
export class ResilienceManager {
  private static readonly maxRetries = 3;
  private static readonly baseDelay = 1000;

  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === this.maxRetries || !this.isRetryableError(lastError)) {
          throw lastError;
        }

        const delay = this.baseDelay * Math.pow(2, attempt);
        logger.warn(`${context} failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          error: lastError.message
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private static isRetryableError(error: Error): boolean {
    if (error instanceof APIError) {
      return error.status >= 500 || error.status === 429;
    }
    
    if (error instanceof WebhookError) {
      return true; // Most webhook errors are retryable
    }

    return false;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Testing Integration

### Test Environment Setup

```typescript
// test/setup/whopTestSetup.ts
import { whopSDK } from '@/lib/whop';

export function setupTestEnvironment() {
  // Configure SDK for testing
  whopSDK.configure({
    environment: 'test',
    debugMode: true,
    apiBaseUrl: 'http://localhost:3001/mock-api',
    webhookSecret: 'test-webhook-secret'
  });

  // Mock API responses
  setupMockResponses();
}

function setupMockResponses() {
  // Mock authentication
  whopSDK.auth.verifyToken = jest.fn().mockResolvedValue({
    id: 'test-user-id',
    username: 'testuser',
    companyId: 'test-company-id'
  });

  // Mock API calls
  whopSDK.client.users.get = jest.fn().mockResolvedValue({
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com'
  });
}
```

### Integration Tests

```typescript
// test/integration/whopIntegration.test.ts
import { setupTestEnvironment } from '../setup/whopTestSetup';
import { handleWhopWebhook } from '@/server/webhooks/whop';
import { NextRequest } from 'next/server';

describe('Whop Integration', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  test('processes payment failed webhook', async () => {
    const webhookPayload = {
      id: 'evt_test_payment_failed',
      type: 'payment.failed',
      data: {
        membershipId: 'membership_test',
        userId: 'user_test',
        companyId: 'company_test',
        failureReason: 'insufficient_funds'
      }
    };

    const request = new NextRequest('http://localhost:3000/api/webhooks/whop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-whop-signature': 'test-signature'
      },
      body: JSON.stringify(webhookPayload)
    });

    const response = await handleWhopWebhook(request);

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
  });

  test('handles authentication errors', async () => {
    // Configure SDK to reject authentication
    whopSDK.auth.verifyToken = jest.fn().mockRejectedValue(
      new Error('Invalid token')
    );

    const request = new NextRequest('http://localhost:3000/api/protected', {
      headers: {
        'authorization': 'Bearer invalid-token'
      }
    });

    const response = await authenticateRequest(request);

    expect(response).toBeNull();
  });
});
```

### End-to-End Tests

```typescript
// test/e2e/whopFlow.test.ts
import { test, expect } from '@playwright/test';

test.describe('Whop Integration Flow', () => {
  test('complete authentication and webhook flow', async ({ page }) => {
    // Navigate to application
    await page.goto('http://localhost:3000');

    // Click sign in with Whop
    await page.click('[data-testid="whop-sign-in"]');

    // Should redirect to Whop OAuth
    await expect(page).toHaveURL(/whop\.com/oauth/authorize/);

    // Mock OAuth callback
    await page.goto('http://localhost:3000/auth/oauth?code=test_code&state=test_state');

    // Should be authenticated and redirected to dashboard
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('webhook creates recovery case', async ({ page, request }) => {
    // Set up webhook listener
    const webhookPromise = page.waitForRequest('**/api/webhooks/whop');

    // Trigger payment failure in Whop
    await page.goto('https://api.whop.com/test/trigger-payment-failed');

    // Wait for webhook to be processed
    const webhookRequest = await webhookPromise;
    
    // Verify webhook payload
    const webhookData = webhookRequest.postDataJSON();
    expect(webhookData.type).toBe('payment.failed');

    // Verify recovery case was created
    await page.goto('http://localhost:3000/dashboard/cases');
    await expect(page.locator('text=Payment Failed')).toBeVisible();
  });
});
```

## Monitoring and Logging

### Integration Metrics

```typescript
// src/lib/whop/observability.ts
export class WhopObservability {
  static logAPICall(endpoint: string, duration: number, success: boolean): void {
    logger.info('Whop API call', {
      endpoint,
      duration,
      success,
      timestamp: new Date().toISOString()
    });

    // Record metrics
    metrics.record('whop_api_call', {
      endpoint,
      duration,
      success
    });
  }

  static logWebhookProcessing(eventType: string, duration: number, success: boolean): void {
    logger.info('Webhook processed', {
      eventType,
      duration,
      success,
      timestamp: new Date().toISOString()
    });

    metrics.record('whop_webhook_processed', {
      eventType,
      duration,
      success
    });
  }

  static logAuthenticationAttempt(success: boolean, method: string): void {
    logger.info('Authentication attempt', {
      method,
      success,
      timestamp: new Date().toISOString()
    });

    metrics.record('whop_auth_attempt', {
      method,
      success
    });
  }
}
```

### Health Checks

```typescript
// src/app/api/integration/health/route.ts
import { whopSDK } from '@/lib/whop';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const healthChecks = await Promise.allSettled([
    checkWhopAPIHealth(),
    checkWhopAuthHealth(),
    checkWhopWebhookHealth()
  ]);

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      whop_api: healthChecks[0].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      whop_auth: healthChecks[1].status === 'fulfilled' ? 'healthy' : 'unhealthy',
      whop_webhook: healthChecks[2].status === 'fulfilled' ? 'healthy' : 'unhealthy'
    }
  };

  return NextResponse.json(health);
}

async function checkWhopAPIHealth(): Promise<{ status: string }> {
  try {
    const response = await whopSDK.client.health.check();
    return { status: 'healthy', response };
  } catch (error) {
    return { status: 'unhealthy', error };
  }
}
```

## Troubleshooting

### Common Integration Issues

1. **Authentication Failures**
   - Verify API keys and secrets
   - Check token expiration
   - Review OAuth configuration

2. **Webhook Processing Errors**
   - Verify webhook signature
   - Check payload format
   - Review event handling logic

3. **API Rate Limiting**
   - Implement exponential backoff
   - Monitor request frequency
   - Use connection pooling

4. **Configuration Issues**
   - Validate environment variables
   - Check SDK configuration
   - Review network settings

### Debug Mode

```typescript
// Enable comprehensive debug logging
whopSDK.configure({
  debugMode: true,
  logLevel: 'debug',
  interceptRequests: true,
  interceptResponses: true
});

// Debug webhook processing
const debugWebhookHandler = async (request: NextRequest) => {
  console.log('Webhook request:', {
    headers: Object.fromEntries(request.headers.entries()),
    body: await request.text()
  });

  return await handleWhopWebhook(request);
};
```

### Performance Optimization

```typescript
// Optimize API calls with caching
const apiCache = new Map<string, { data: any; expires: number }>();

export async function cachedAPICall<T>(key: string, apiCall: () => Promise<T>): Promise<T> {
  const cached = apiCache.get(key);
  const now = Date.now();

  if (cached && cached.expires > now) {
    return cached.data;
  }

  const result = await apiCall();
  apiCache.set(key, {
    data: result,
    expires: now + 5 * 60 * 1000 // 5 minutes
  });

  return result;
}

// Batch webhook processing
export async function batchProcessEvents(events: WebhookEvent[]): Promise<void> {
  const batchSize = 10;
  
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    await Promise.all(batch.map(processWebhookEvent));
  }
}
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0