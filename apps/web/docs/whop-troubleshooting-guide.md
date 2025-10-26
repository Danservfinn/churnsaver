# Whop SDK Troubleshooting Guide

This guide provides solutions for common issues encountered when integrating and operating the Whop SDK within the Churn Saver application.

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Configuration Issues](#configuration-issues)
3. [Authentication Problems](#authentication-problems)
4. [API Communication Errors](#api-communication-errors)
5. [Webhook Processing Issues](#webhook-processing-issues)
6. [Resilience & Circuit Breaker](#resilience--circuit-breaker)
7. [Performance Problems](#performance-problems)
8. [Security & Compliance](#security--compliance)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Testing & Development](#testing--development)
11. [Emergency Procedures](#emergency-procedures)

## Quick Reference

### Status Check Endpoints

```bash
# Health check
curl https://your-app.com/api/health

# Whop integration health
curl https://your-app.com/api/health/external

# Database connectivity
curl https://your-app.com/api/health/db
```

### Common Commands

```bash
# Test configuration
npm run test:whop:config

# Test authentication
npm run test:whop:auth

# Test webhooks
npm run test:whop:webhooks

# Check circuit breaker status
npm run monitor:circuit-breaker
```

### Log Queries

```sql
-- Recent errors
SELECT timestamp, level, message, error_code
FROM logs
WHERE service = 'whop'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Circuit breaker status
SELECT state, failure_count, last_failure_time
FROM circuit_breaker_metrics
WHERE service_name = 'whop_api';

-- Webhook processing stats
SELECT event_type, COUNT(*) as count,
       AVG(processing_time_ms) as avg_time
FROM webhook_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type;
```

## Configuration Issues

### Invalid Configuration Errors

**Error Message**: `Whop SDK configuration is invalid`

**Symptoms**:
- Application fails to start
- Configuration validation errors in logs
- SDK initialization failures

**Solutions**:

1. **Check Environment Variables**
   ```bash
   # Required variables
   echo "NEXT_PUBLIC_WHOP_APP_ID: $NEXT_PUBLIC_WHOP_APP_ID"
   echo "WHOP_API_KEY: ${WHOP_API_KEY:0:10}..."  # Mask for security
   echo "WHOP_WEBHOOK_SECRET: ${WHOP_WEBHOOK_SECRET:0:10}..."
   ```

2. **Validate Variable Format**
   ```bash
   # App ID should start with 'app_'
   [[ "$NEXT_PUBLIC_WHOP_APP_ID" =~ ^app_ ]] || echo "Invalid app ID format"

   # API key should be at least 16 characters
   [[ ${#WHOP_API_KEY} -ge 16 ]] || echo "API key too short"

   # Webhook secret should be at least 16 characters
   [[ ${#WHOP_WEBHOOK_SECRET} -ge 16 ]] || echo "Webhook secret too short"
   ```

3. **Environment-Specific Requirements**
   ```typescript
   // In production, these are required
   if (process.env.NODE_ENV === 'production') {
     if (!process.env.WHOP_API_KEY) {
       throw new Error('WHOP_API_KEY required in production');
     }
     if (!process.env.WHOP_WEBHOOK_SECRET) {
       throw new Error('WHOP_WEBHOOK_SECRET required in production');
     }
   }
   ```

### Configuration Validation Warnings

**Warning**: `API key appears to use a weak pattern`

**Solutions**:
- Use strong, randomly generated API keys
- Avoid common patterns like `test`, `demo`, `123456`
- Ensure sufficient entropy (avoid repeated characters)
- Rotate keys regularly in production

## Authentication Problems

### Token Verification Failures

**Error Message**: `Invalid authentication token`

**Symptoms**:
- API requests failing with 401 status
- Token validation errors in logs
- Users unable to access protected resources

**Troubleshooting Steps**:

1. **Check Token Format**
   ```typescript
   // Validate JWT structure
   const parts = token.split('.');
   if (parts.length !== 3) {
     console.error('Invalid JWT format');
   }

   // Check for proper encoding
   try {
     const header = JSON.parse(atob(parts[0]));
     const payload = JSON.parse(atob(parts[1]));
     console.log('Token structure valid');
   } catch (error) {
     console.error('Token parsing failed:', error);
   }
   ```

2. **Verify Token Expiration**
   ```typescript
   import { jwtVerify } from 'jose';

   try {
     const { payload } = await jwtVerify(token, publicKey);
     const now = Math.floor(Date.now() / 1000);

     if (payload.exp && payload.exp < now) {
       console.error('Token expired');
     }
     if (payload.nbf && payload.nbf > now) {
       console.error('Token not yet valid');
     }
   } catch (error) {
     console.error('Token verification failed:', error);
   }
   ```

3. **Check Issuer and Audience**
   ```typescript
   // Verify token claims
   const expectedIssuer = process.env.NEXT_PUBLIC_WHOP_APP_ID;
   const expectedAudience = process.env.NEXT_PUBLIC_WHOP_APP_ID;

   if (payload.iss !== expectedIssuer) {
     console.error('Invalid token issuer');
   }
   if (payload.aud !== expectedAudience) {
     console.error('Invalid token audience');
   }
   ```

### Session Management Issues

**Error Message**: `Session expired or invalid`

**Symptoms**:
- Users logged out unexpectedly
- Session validation failures
- Inconsistent authentication state

**Solutions**:

1. **Check Session Storage**
   ```typescript
   // Verify session exists
   const sessionKey = `session:${sessionId}`;
   const sessionData = await tokenStorage.get(sessionKey);

   if (!sessionData) {
     console.error('Session not found');
     return;
   }

   // Check session expiration
   const session = JSON.parse(decrypt(sessionData));
   if (Date.now() > session.expiresAt) {
     console.error('Session expired');
   }
   ```

2. **Monitor Session Cleanup**
   ```typescript
   // Check for orphaned sessions
   const userSessionsKey = `user_sessions:${userId}`;
   const userSessions = await getUserSessions(userId);

   console.log(`User has ${userSessions.length} active sessions`);
   ```

3. **Session Configuration**
   ```typescript
   // Adjust session timeout if needed
   const authService = new WhopAuthService(config, storage, 7200); // 2 hours
   ```

## API Communication Errors

### Rate Limiting Issues

**Error Message**: `API rate limit exceeded`

**Symptoms**:
- Requests failing with 429 status
- Circuit breaker tripping frequently
- Increased response times

**Solutions**:

1. **Monitor Rate Limits**
   ```typescript
   // Check rate limit headers
   const response = await whopApiClient.get('/endpoint');
   const remaining = response.headers['x-ratelimit-remaining'];
   const reset = response.headers['x-ratelimit-reset'];

   console.log(`Rate limit: ${remaining} requests remaining`);
   console.log(`Resets at: ${new Date(parseInt(reset) * 1000)}`);
   ```

2. **Implement Backoff Strategy**
   ```typescript
   import { executeResiliently } from '@/lib/whop';

   const result = await executeResiliently(
     () => whopApiClient.get('/rate-limited-endpoint'),
     {
       operation: 'rate_limited_request',
       service: 'whop_api',
       // Custom retry policy for rate limits
       retryPolicy: {
         maxRetries: 5,
         baseDelay: 2000,
         maxDelay: 60000
       }
     }
   );
   ```

3. **Circuit Breaker Configuration**
   ```typescript
   // Adjust circuit breaker for rate limits
   const resilience = new ResilienceService({
     circuitBreaker: {
       failureThreshold: 10, // Allow more failures for rate limits
       recoveryTimeout: 120000, // Longer recovery time
       name: 'whop_rate_limited_api'
     }
   });
   ```

### Network Connectivity Problems

**Error Message**: `Network request failed` or `Connection timeout`

**Symptoms**:
- Timeout errors in logs
- Connection refused errors
- DNS resolution failures

**Troubleshooting**:

1. **Test Network Connectivity**
   ```bash
   # Test basic connectivity
   curl -I https://api.whop.com/api/v5/app

   # Test DNS resolution
   nslookup api.whop.com

   # Test with specific timeout
   curl --connect-timeout 10 https://api.whop.com/api/v5/app
   ```

2. **Check Proxy Configuration**
   ```typescript
   // Verify proxy settings if applicable
   const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
   if (proxyUrl) {
     console.log('Using proxy:', proxyUrl);
   }
   ```

3. **DNS and Firewall Issues**
   ```bash
   # Check firewall rules
   sudo iptables -L | grep whop

   # Test from application server
   telnet api.whop.com 443
   ```

### API Response Errors

**Error Messages**: `Whop API error: 4xx` or `Whop API error: 5xx`

**Solutions**:

1. **Categorize Error Types**
   ```typescript
   // 4xx errors - client errors (don't retry)
   if (status >= 400 && status < 500) {
     console.error('Client error - check request parameters');
     // Don't retry these
   }

   // 5xx errors - server errors (retry with backoff)
   if (status >= 500) {
     console.error('Server error - retry with exponential backoff');
     // Implement retry logic
   }
   ```

2. **Handle Specific Error Codes**
   ```typescript
   switch (status) {
     case 400:
       console.error('Bad request - validate input data');
       break;
     case 401:
       console.error('Unauthorized - check API key');
       break;
     case 403:
       console.error('Forbidden - check permissions');
       break;
     case 404:
       console.error('Not found - check resource ID');
       break;
     case 429:
       console.error('Rate limited - implement backoff');
       break;
     case 500:
       console.error('Internal server error - retry later');
       break;
   }
   ```

## Webhook Processing Issues

### Signature Validation Failures

**Error Message**: `Webhook signature verification failed`

**Symptoms**:
- Webhooks rejected with 400 status
- Signature validation errors in logs
- Legitimate webhooks not processing

**Solutions**:

1. **Verify Signature Generation**
   ```typescript
   import { createHmac } from 'crypto';

   // Recreate signature for verification
   function generateSignature(body: string, secret: string): string {
     return createHmac('sha256', secret)
       .update(body, 'utf8')
       .digest('hex');
   }

   // Test signature generation
   const testBody = '{"type":"payment.succeeded"}';
   const expectedSig = generateSignature(testBody, webhookSecret);
   console.log('Expected signature:', expectedSig);
   ```

2. **Check Request Body Handling**
   ```typescript
   // Ensure raw body is used for signature
   export async function POST(request: NextRequest) {
     const body = await request.text(); // Use .text() not .json()
     const signature = request.headers.get('x-whop-signature');

     // Validate signature with raw body
     const isValid = validateWebhookSignature(body, signature, secret);
   }
   ```

3. **Validate Timestamp**
   ```typescript
   const timestamp = request.headers.get('x-whop-timestamp');
   const now = Math.floor(Date.now() / 1000);
   const tolerance = 300; // 5 minutes

   if (timestamp) {
     const ts = parseInt(timestamp);
     const skew = Math.abs(now - ts);

     if (skew > tolerance) {
       console.error(`Timestamp skew: ${skew}s > ${tolerance}s`);
     }
   }
   ```

### Event Processing Errors

**Error Message**: `Webhook event processing failed`

**Symptoms**:
- Webhook received but not processed
- Event handler errors in logs
- Inconsistent application state

**Solutions**:

1. **Check Event Type Handling**
   ```typescript
   // Verify event type is supported
   const supportedEvents = webhookValidator.getSupportedEvents();
   console.log('Supported events:', Object.keys(supportedEvents));

   if (!(eventType in supportedEvents)) {
     console.warn('Unknown event type:', eventType);
   }
   ```

2. **Validate Event Payload**
   ```typescript
   // Check required fields
   const requiredFields = ['id', 'type', 'data'];
   const missingFields = requiredFields.filter(field => !(field in payload));

   if (missingFields.length > 0) {
     console.error('Missing required fields:', missingFields);
   }
   ```

3. **Handle Idempotency**
   ```typescript
   // Check for duplicate events
   const eventId = payload.id || payload.whop_event_id;
   const existingEvent = await checkEventProcessed(eventId);

   if (existingEvent) {
     console.log('Event already processed:', eventId);
     return NextResponse.json({ received: true });
   }
   ```

### Webhook Delivery Issues

**Symptoms**:
- Webhooks not arriving
- Delayed webhook processing
- Missing webhook events

**Troubleshooting**:

1. **Check Webhook Configuration**
   ```bash
   # Verify webhook URL in Whop dashboard
   echo "Webhook URL: https://your-app.com/api/webhooks/whop"

   # Test webhook endpoint
   curl -X POST https://your-app.com/api/webhooks/whop \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

2. **Monitor Webhook Logs**
   ```sql
   SELECT created_at, event_type, status, error_message
   FROM webhook_delivery_logs
   WHERE created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC;
   ```

3. **Test Webhook Delivery**
   ```typescript
   // Send test webhook from Whop dashboard
   // Or use webhook testing tools
   const testPayload = {
     id: 'test_event_123',
     type: 'payment.succeeded',
     data: { amount: 29.99 }
   };
   ```

## Resilience & Circuit Breaker

### Circuit Breaker Tripped

**Error Message**: `Circuit breaker is OPEN for whop_api`

**Symptoms**:
- All API calls failing immediately
- High error rates in monitoring
- Application unable to communicate with Whop

**Recovery Steps**:

1. **Check Circuit Breaker Status**
   ```typescript
   import { resilienceService } from '@/lib/whop';

   const state = resilienceService.getCircuitBreakerState();
   const metrics = resilienceService.getCircuitBreakerMetrics();

   console.log('Circuit breaker state:', state);
   console.log('Failure count:', metrics.failures);
   console.log('Last failure:', new Date(metrics.lastFailureTime));
   ```

2. **Manual Recovery**
   ```typescript
   // Force circuit breaker reset (use with caution)
   if (state === 'open') {
     resilienceService.resetCircuitBreaker();
     console.log('Circuit breaker manually reset');
   }
   ```

3. **Adjust Circuit Breaker Settings**
   ```typescript
   // Increase failure threshold for temporary issues
   const customResilience = new ResilienceService({
     circuitBreaker: {
       failureThreshold: 20, // Allow more failures
       recoveryTimeout: 300000, // 5 minutes recovery time
       successThreshold: 3 // Require 3 successes to close
     }
   });
   ```

### Retry Exhaustion

**Error Message**: `Operation failed after maximum retries`

**Symptoms**:
- Operations failing despite retries
- High retry attempt counts in logs
- Performance degradation

**Solutions**:

1. **Analyze Retry Patterns**
   ```sql
   SELECT operation, COUNT(*) as attempts,
          AVG(delay_ms) as avg_delay,
          MAX(attempt) as max_attempts
   FROM retry_logs
   WHERE timestamp > NOW() - INTERVAL '1 hour'
   GROUP BY operation;
   ```

2. **Adjust Retry Policy**
   ```typescript
   const result = await executeResiliently(operation, context, {
     retryPolicy: {
       maxRetries: 3, // Reduce for faster failure
       baseDelay: 1000,
       maxDelay: 10000,
       retryableErrors: (error) => {
         // More selective retry logic
         return error.message.includes('timeout') ||
                error.message.includes('500');
       }
     }
   });
   ```

3. **Implement Fallbacks**
   ```typescript
   const result = await executeResiliently(
     () => primaryOperation(),
     {
       operation: 'critical_operation',
       service: 'whop_api',
       fallback: async () => {
         console.log('Using fallback operation');
         return await fallbackOperation();
       }
     }
   );
   ```

## Performance Problems

### High Latency Issues

**Symptoms**:
- Slow API response times
- Increased processing times
- User-facing performance degradation

**Solutions**:

1. **Monitor Response Times**
   ```sql
   SELECT operation, service,
          AVG(duration_ms) as avg_time,
          MAX(duration_ms) as max_time,
          COUNT(*) as request_count
   FROM api_request_logs
   WHERE service = 'whop_api'
     AND timestamp > NOW() - INTERVAL '1 hour'
   GROUP BY operation, service;
   ```

2. **Optimize Request Patterns**
   ```typescript
   // Batch requests where possible
   const userIds = ['user1', 'user2', 'user3'];
   const userPromises = userIds.map(id =>
     whopApiClient.get(`/users/${id}`)
   );
   const users = await Promise.all(userPromises);
   ```

3. **Connection Pooling**
   ```typescript
   // Ensure connection reuse
   const client = createWhopApiClient({
     // Connection pooling settings
     keepAlive: true,
     timeout: 30000
   });
   ```

### Memory Leaks

**Symptoms**:
- Increasing memory usage
- Application restarts
- Performance degradation over time

**Troubleshooting**:

1. **Check Token Cache**
   ```typescript
   // Monitor token cache size
   const cacheSize = whopAuthService.getTokenCacheSize();
   console.log('Token cache size:', cacheSize);

   // Clear expired tokens
   whopAuthService.clearExpiredTokens();
   ```

2. **Session Cleanup**
   ```typescript
   // Run session cleanup
   await whopAuthService.cleanupExpiredSessions();

   // Check session storage usage
   const sessionCount = await getTotalSessionCount();
   console.log('Active sessions:', sessionCount);
   ```

3. **Circuit Breaker Metrics**
   ```typescript
   // Monitor circuit breaker memory usage
   const metrics = resilienceService.getCircuitBreakerMetrics();
   console.log('Circuit breaker metrics size:', JSON.stringify(metrics).length);
   ```

## Security & Compliance

### Security Event Monitoring

**Error Messages**: `Security violation detected` or `Suspicious activity detected`

**Response Procedures**:

1. **Immediate Actions**
   ```typescript
   // Log security event
   logger.security('Security violation detected', {
     category: 'authentication',
     severity: 'high',
     type: 'invalid_token',
     description: 'Multiple failed authentication attempts'
   });

   // Alert security team
   await securityMonitor.alertSecurityTeam({
     event: 'multiple_auth_failures',
     severity: 'high',
     details: { ip: clientIP, userAgent, attempts: 5 }
   });
   ```

2. **Investigation Steps**
   ```sql
   -- Check recent security events
   SELECT timestamp, category, severity, type, description
   FROM security_events
   WHERE timestamp > NOW() - INTERVAL '1 hour'
   ORDER BY timestamp DESC;

   -- Analyze suspicious patterns
   SELECT ip_address, COUNT(*) as attempts,
          MIN(timestamp) as first_attempt,
          MAX(timestamp) as last_attempt
   FROM failed_auth_attempts
   WHERE timestamp > NOW() - INTERVAL '24 hours'
   GROUP BY ip_address
   HAVING COUNT(*) > 3;
   ```

3. **Remediation**
   - Block suspicious IP addresses
   - Rotate compromised credentials
   - Review access patterns
   - Update security policies

### Data Privacy Issues

**Symptoms**:
- Sensitive data in logs
- Privacy regulation violations
- Data exposure incidents

**Solutions**:

1. **Log Sanitization**
   ```typescript
   // Ensure sensitive data is sanitized
   const sanitizedToken = sanitizeTokenForLogging(token);
   logger.info('Token validation', {
     tokenFingerprint: sanitizedToken.fingerprint,
     userId: sanitizedToken.userId
     // No sensitive token data
   });
   ```

2. **Data Retention**
   ```typescript
   // Implement data cleanup procedures
   await dataPrivacyService.cleanupOldData({
     retentionDays: 90,
     tables: ['webhook_logs', 'auth_logs']
   });
   ```

## Monitoring & Alerting

### Key Metrics to Monitor

```sql
-- API health metrics
SELECT
  service,
  COUNT(*) as total_requests,
  AVG(duration_ms) as avg_response_time,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as error_count,
  SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as server_errors
FROM api_request_logs
WHERE timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY service;

-- Circuit breaker status
SELECT
  service_name,
  state,
  failure_count,
  success_count,
  last_failure_time,
  last_success_time
FROM circuit_breaker_status;

-- Authentication metrics
SELECT
  event_type,
  COUNT(*) as count,
  AVG(processing_time_ms) as avg_time
FROM auth_logs
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

### Alert Configuration

```typescript
// Circuit breaker alerts
if (circuitBreakerState === 'open') {
  await alertingService.sendAlert({
    severity: 'critical',
    message: 'Whop API circuit breaker is OPEN',
    details: {
      service: 'whop_api',
      failureCount: metrics.failures,
      lastFailure: new Date(metrics.lastFailureTime)
    }
  });
}

// High error rate alerts
const errorRate = (errorCount / totalRequests) * 100;
if (errorRate > 5) { // 5% error rate threshold
  await alertingService.sendAlert({
    severity: 'warning',
    message: 'High Whop API error rate detected',
    details: { errorRate, timeWindow: '5 minutes' }
  });
}

// Authentication failure alerts
if (authFailures > 10) { // Threshold for suspicious activity
  await alertingService.sendAlert({
    severity: 'warning',
    message: 'Multiple authentication failures detected',
    details: { failureCount: authFailures, timeWindow: '1 hour' }
  });
}
```

## Testing & Development

### Local Development Setup

```bash
# Use test credentials for development
export NODE_ENV=development
export NEXT_PUBLIC_WHOP_APP_ID=app_test_123
# API key and webhook secret optional in development

# Enable debug logging
export DEBUG_WHOP_SDK=true

# Start development server
npm run dev
```

### Integration Testing

```typescript
import { setupWhopTestEnvironment } from '@/test/whop/testUtils';

describe('Whop Integration Tests', () => {
  beforeAll(async () => {
    await setupWhopTestEnvironment();
  });

  it('should handle authentication flow', async () => {
    // Test authentication
    const token = await generateTestToken();
    const authContext = await whopAuthService.authenticate({
      headers: { get: () => `Bearer ${token}` }
    });

    expect(authContext.isAuthenticated).toBe(true);
  });

  it('should process webhooks correctly', async () => {
    const payload = {
      id: 'test_webhook_123',
      type: 'payment.succeeded',
      data: { amount: 29.99 }
    };

    const signature = generateTestSignature(payload);
    const response = await fetch('/api/webhooks/whop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-whop-signature': signature
      },
      body: JSON.stringify(payload)
    });

    expect(response.status).toBe(200);
  });
});
```

### Load Testing

```bash
# Test API rate limits
npm run load-test:whop-api -- --requests 1000 --concurrency 10

# Test webhook processing
npm run load-test:webhooks -- --events 500 --batch-size 50

# Test authentication endpoints
npm run load-test:auth -- --users 100 --iterations 5
```

## Emergency Procedures

### Complete Service Outage

**Immediate Actions**:
1. Check Whop service status: https://status.whop.com
2. Enable fallback mechanisms
3. Notify affected users
4. Scale down non-critical operations

**Recovery Steps**:
```typescript
// Enable emergency mode
process.env.WHOP_EMERGENCY_MODE = 'true';

// Use cached data where possible
const userData = await getCachedUserData(userId) ||
                 await getLocalUserData(userId);

// Log emergency operations
logger.warn('Operating in emergency mode', {
  service: 'whop_api',
  fallbackActive: true
});
```

### Security Incident Response

**Immediate Actions**:
1. Rotate all API credentials
2. Block compromised accounts
3. Enable enhanced monitoring
4. Notify security team

**Investigation**:
```sql
-- Analyze security event timeline
SELECT timestamp, event_type, ip_address, user_agent, details
FROM security_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND severity = 'high'
ORDER BY timestamp DESC;

-- Check for data exposure
SELECT table_name, record_count, last_accessed
FROM data_access_audit
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND access_type = 'read'
  AND sensitive_data = true;
```

### Data Recovery

**Backup Recovery**:
```bash
# Restore from backup
pg_restore -d churnsaver_prod /path/to/backup.sql

# Verify data integrity
npm run db:verify-integrity

# Re-sync with Whop if needed
npm run sync:whop-data -- --since "$(date -d '1 hour ago' +%s)"
```

### Rollback Procedures

**Application Rollback**:
```bash
# Rollback to previous version
git checkout v1.2.3
npm run build
npm run deploy

# Verify rollback success
curl https://your-app.com/api/health
```

**Database Rollback**:
```bash
# Run rollback migration
npm run db:migrate:rollback

# Verify data consistency
npm run db:validate
```

---

This troubleshooting guide covers the most common issues and solutions for the Whop SDK integration. For additional support, please check the comprehensive integration guide or contact the development team.