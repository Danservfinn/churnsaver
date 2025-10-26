# API Authentication Guide

Secure access to the Churn Saver API requires proper authentication and authorization. This guide covers all authentication methods and security best practices.

## Authentication Methods

### API Key Authentication

#### Generating API Keys

1. **Access Admin Dashboard**
   - Navigate to **Settings** → **API Keys**
   - Click **"Generate New Key"**

2. **Configure Key Permissions**
   ```json
   {
     "name": "Production Integration",
     "permissions": [
       "cases:read",
       "cases:write",
       "incentives:read",
       "analytics:read"
     ],
     "expires_at": "2026-10-25T00:00:00Z",
     "rate_limit": 1000
   }
   ```

3. **Store Securely**
   - Never commit API keys to version control
   - Use environment variables or secure key management systems
   - Rotate keys regularly (recommended: quarterly)

#### Using API Keys

Include the API key in the `Authorization` header:

```http
Authorization: Bearer sk_live_1234567890abcdef
```

**Example Request:**
```bash
curl -X GET "https://api.churnsaver.com/v1/cases" \
  -H "Authorization: Bearer sk_live_1234567890abcdef" \
  -H "Content-Type: application/json"
```

### OAuth 2.0 Integration (Enterprise)

For enterprise customers requiring advanced access controls:

#### Authorization Code Flow

```typescript
// 1. Redirect user to authorization endpoint
const authUrl = `https://api.churnsaver.com/oauth/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${REDIRECT_URI}&` +
  `scope=cases:read analytics:read&` +
  `response_type=code&` +
  `state=${STATE_TOKEN}`;

window.location.href = authUrl;
```

```typescript
// 2. Exchange code for access token
const tokenResponse = await fetch('https://api.churnsaver.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: authorizationCode,
    redirect_uri: REDIRECT_URI
  })
});

const { access_token, refresh_token } = await tokenResponse.json();
```

#### Token Usage

```typescript
// Use access token for API requests
const apiResponse = await fetch('https://api.churnsaver.com/v1/cases', {
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  }
});
```

#### Token Refresh

```typescript
// Refresh expired access token
const refreshResponse = await fetch('https://api.churnsaver.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: storedRefreshToken
  })
});

const { access_token: newAccessToken } = await refreshResponse.json();
```

## Permission System

### Available Permissions

| Permission | Description | Access Level |
|------------|-------------|--------------|
| `cases:read` | View recovery cases | Read |
| `cases:write` | Create/update cases | Write |
| `incentives:read` | View incentives | Read |
| `incentives:write` | Create/update incentives | Write |
| `analytics:read` | Access analytics data | Read |
| `webhooks:read` | View webhook configurations | Read |
| `webhooks:write` | Manage webhooks | Write |
| `admin:read` | Administrative data access | Admin |
| `admin:write` | Administrative operations | Admin |

### Role-Based Access

#### Predefined Roles

**Viewer Role:**
```json
{
  "name": "Viewer",
  "permissions": [
    "cases:read",
    "incentives:read",
    "analytics:read"
  ],
  "description": "Read-only access to cases and analytics"
}
```

**Operator Role:**
```json
{
  "name": "Operator",
  "permissions": [
    "cases:read",
    "cases:write",
    "incentives:read",
    "incentives:write",
    "analytics:read"
  ],
  "description": "Full case and incentive management"
}
```

**Administrator Role:**
```json
{
  "name": "Administrator",
  "permissions": [
    "cases:read",
    "cases:write",
    "incentives:read",
    "incentives:write",
    "analytics:read",
    "webhooks:read",
    "webhooks:write",
    "admin:read",
    "admin:write"
  ],
  "description": "Full system access including admin functions"
}
```

## Security Best Practices

### API Key Security

#### Key Storage

**Environment Variables (Recommended):**
```bash
# .env file
CHURN_SAVER_API_KEY=sk_live_1234567890abcdef
```

**Secure Key Management:**
```typescript
// Using AWS Secrets Manager
import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const secretsManager = new SecretsManager({ region: 'us-east-1' });

async function getApiKey() {
  const secret = await secretsManager.getSecretValue({
    SecretId: 'churn-saver/api-key'
  });
  return secret.SecretString;
}
```

#### Key Rotation

**Automated Rotation:**
```typescript
class ApiKeyManager {
  private currentKey: string;
  private rotationInterval: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(initialKey: string) {
    this.currentKey = initialKey;
    this.scheduleRotation();
  }

  private scheduleRotation() {
    setInterval(async () => {
      try {
        const newKey = await this.generateNewKey();
        this.currentKey = newKey;
        await this.updateStoredKey(newKey);
      } catch (error) {
        console.error('Failed to rotate API key:', error);
      }
    }, this.rotationInterval);
  }

  async generateNewKey(): Promise<string> {
    // Call Churn Saver API to generate new key
    const response = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.currentKey}` },
      body: JSON.stringify({ name: 'Rotated Key' })
    });
    const { key } = await response.json();
    return key;
  }
}
```

### Request Security

#### HTTPS Only

All API requests must use HTTPS:

```typescript
// ❌ Never use HTTP in production
const response = await fetch('http://api.churnsaver.com/v1/cases');

// ✅ Always use HTTPS
const response = await fetch('https://api.churnsaver.com/v1/cases');
```

#### Request Signing (Enterprise)

For additional security, sign requests with your private key:

```typescript
import crypto from 'crypto';

function signRequest(method: string, url: string, body: string, timestamp: string, secret: string): string {
  const message = `${method}${url}${body}${timestamp}`;
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}

// Usage
const timestamp = Date.now().toString();
const signature = signRequest('POST', '/v1/cases', requestBody, timestamp, secretKey);

const response = await fetch('https://api.churnsaver.com/v1/cases', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json'
  },
  body: requestBody
});
```

## Rate Limiting

### Rate Limit Headers

All API responses include rate limiting information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1635182400
X-RateLimit-Retry-After: 60
```

### Handling Rate Limits

```typescript
class ApiClient {
  private retryAfter: number = 0;

  async request(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (this.retryAfter > 0) {
      await this.delay(this.retryAfter * 1000);
    }

    const response = await fetch(`https://api.churnsaver.com/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers
      }
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('X-RateLimit-Retry-After');
      this.retryAfter = parseInt(retryAfter || '60');

      // Retry the request
      return this.request(endpoint, options);
    }

    // Reset retry delay on successful request
    this.retryAfter = 0;
    return response;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Rate Limit Tiers

| Plan | Requests/Hour | Requests/Minute | Burst Limit |
|------|----------------|-----------------|-------------|
| Starter | 1,000 | 50 | 100 |
| Professional | 10,000 | 500 | 1,000 |
| Enterprise | 100,000 | 5,000 | 10,000 |

## Error Handling

### Authentication Errors

```typescript
try {
  const response = await api.cases.list();
} catch (error) {
  if (error.status === 401) {
    // Token expired or invalid
    await refreshToken();
    // Retry request
  } else if (error.status === 403) {
    // Insufficient permissions
    showPermissionError();
  } else if (error.status === 429) {
    // Rate limited
    await handleRateLimit(error);
  }
}
```

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid API key provided",
    "details": {
      "reason": "key_not_found",
      "suggestion": "Check your API key is correct and active"
    },
    "timestamp": "2025-10-25T10:30:00Z"
  }
}
```

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `INVALID_API_KEY` | 401 | API key is invalid or expired |
| `INSUFFICIENT_PERMISSIONS` | 403 | API key lacks required permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `TOKEN_EXPIRED` | 401 | OAuth token has expired |
| `INVALID_SIGNATURE` | 401 | Request signature verification failed |

## Testing Authentication

### Development Environment

Use test API keys for development:

```typescript
// Development configuration
const config = {
  baseUrl: process.env.NODE_ENV === 'production'
    ? 'https://api.churnsaver.com/v1'
    : 'https://api-dev.churnsaver.com/v1',
  apiKey: process.env.CHURN_SAVER_API_KEY
};
```

### Mock Authentication for Testing

```typescript
// Mock authentication for unit tests
const mockApiClient = {
  authenticate: jest.fn().mockResolvedValue({
    access_token: 'mock_token',
    token_type: 'Bearer',
    expires_in: 3600
  }),

  request: jest.fn().mockImplementation((endpoint) => {
    // Mock API responses based on endpoint
    if (endpoint.includes('/cases')) {
      return Promise.resolve({
        id: 'case_mock_123',
        status: 'active',
        risk_level: 'high'
      });
    }
  })
};
```

## SDK Authentication

### JavaScript SDK

```typescript
import { ChurnSaver } from '@churn-saver/sdk';

// API Key authentication
const client = new ChurnSaver({
  apiKey: process.env.CHURN_SAVER_API_KEY
});

// OAuth authentication
const client = new ChurnSaver({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

// Authenticate user
await client.authenticate();

// Make authenticated requests
const cases = await client.cases.list();
```

### Python SDK

```python
from churn_saver import ChurnSaver

# API Key authentication
client = ChurnSaver(api_key=os.environ['CHURN_SAVER_API_KEY'])

# OAuth authentication
client = ChurnSaver(
    client_id=os.environ['CLIENT_ID'],
    client_secret=os.environ['CLIENT_SECRET'],
    redirect_uri=os.environ['REDIRECT_URI']
)

# Authenticate
client.authenticate()

# Use client
cases = client.cases.list()
```

## Monitoring & Auditing

### Authentication Logs

Track authentication events for security monitoring:

```typescript
// Log successful authentications
logger.info('API authentication successful', {
  user_id: user.id,
  ip_address: request.ip,
  user_agent: request.headers['user-agent'],
  timestamp: new Date().toISOString()
});

// Log failed attempts
logger.warn('API authentication failed', {
  reason: 'invalid_api_key',
  ip_address: request.ip,
  attempted_key_prefix: apiKey.substring(0, 8) + '...',
  timestamp: new Date().toISOString()
});
```

### Security Monitoring

Set up alerts for suspicious authentication patterns:

- Multiple failed authentication attempts from same IP
- Authentication from unusual geographic locations
- Sudden spikes in API usage
- API key usage outside normal business hours

## Support

- **Authentication Issues**: Check [Troubleshooting Guide](../troubleshooting/common-issues.md#authentication)
- **Permission Questions**: Contact support@churnsaver.com
- **Enterprise Security**: Schedule consultation with security team