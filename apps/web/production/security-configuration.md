# Security Configuration Guide

**Version:** 1.0  
**Date:** 2025-10-21  
**Document Owner:** Security Team  

## Overview

This document outlines the comprehensive security hardening implemented for the Churn Saver application in production deployment. It covers authentication, authorization, monitoring, intrusion detection, and compliance features.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Webhook Security](#webhook-security)
3. [Rate Limiting](#rate-limiting)
4. [Security Headers & CSP](#security-headers--csp)
5. [Security Monitoring](#security-monitoring)
6. [Environment Variable Security](#environment-variable-security)
7. [Audit Logging](#audit-logging)
8. [Database Security](#database-security)
9. [Incident Response](#incident-response)
10. [Compliance](#compliance)

## Authentication & Authorization

### Token Validation

**Implementation:** Enhanced JWT verification using jose library with timing-safe comparisons

**Features:**
- HMAC-SHA256 signature verification
- Strict algorithm validation (HS256 only)
- Issuer and audience validation
- Expiration and issued-at time checks
- Token format validation
- Clock skew tolerance (5 minutes)
- Near-expiry detection for proactive refresh

**Security Controls:**
```typescript
// Enhanced verification with comprehensive security checks
const verifyResult = await jwtVerify(token, symmetricKey, {
  issuer: env.WHOP_APP_ID,
  audience: env.WHOP_APP_ID,
  algorithms: ['HS256'],
  maxTokenAge: '1h',
});
```

**Fallback Mechanism:** Legacy token support with timing-safe signature verification for backward compatibility.

### Session Management

**Configuration:**
- Session timeout: 60 minutes (configurable)
- Maximum login attempts: 5 (configurable)
- Lockout duration: 15 minutes (configurable)
- Token near-expiry detection: 5 minutes

**Environment Variables:**
```bash
SESSION_TIMEOUT_MINUTES=60
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
```

## Webhook Security

### Signature Verification

**Implementation:** Timing-safe HMAC-SHA256 signature verification

**Security Features:**
- Constant-time comparison prevents timing attacks
- No early returns during validation
- Comprehensive error collection
- Support for multiple signature formats
- Timestamp validation with 5-minute skew window

**Code Implementation:**
```typescript
// Timing-safe verification without early returns
export function verifyWebhookSignature(
  body: string,
  signatureHeader: string,
  secret: string,
  timestampHeader?: string | null
): boolean {
  // Initialize all validation results to prevent timing attacks
  let isValid = true;
  const validationErrors: string[] = [];
  
  // Always compute expected signature
  const expectedSignature = createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('hex');
  
  // Perform timing-safe comparison
  return timingSafeEqual(expectedSignature, provided);
}
```

### Replay Protection

**Implementation:** Timestamp-based replay attack prevention

**Features:**
- Required timestamp header in production
- 5-minute skew window enforcement
- Malformed timestamp detection
- Production-only enforcement

## Rate Limiting

### Fail-Closed Behavior

**Implementation:** Production-hardened rate limiting with fail-closed behavior

**Security Features:**
- Database-backed token bucket algorithm
- Fail-closed in production, fail-open in development
- Per-company and per-endpoint limits
- Comprehensive security logging for violations

**Configuration:**
```typescript
// Production fail-closed rate limiting
if (process.env.NODE_ENV === 'production') {
  // Block request on error in production
  return {
    allowed: false,
    resetAt: new Date(Date.now() + config.windowMs),
    remaining: 0,
    retryAfter: Math.ceil(config.windowMs / 1000),
  };
}
```

**Rate Limits:**
- Webhooks: 300/minute (global)
- Case actions: 30/minute per company
- Scheduler: 20/5 minutes (global)

### Environment Variables:
```bash
RATE_LIMIT_FAIL_CLOSED=true
```

## Security Headers & CSP

### Production Headers

**Implementation:** Comprehensive security headers with production hardening

**Headers Applied:**
```http
Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self' https://api.whop.com; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
X-Download-Options: noopen
X-Permitted-Cross-Domain-Policies: none
```

**CSP Features:**
- Default deny policy
- Frame-ancestors protection
- Form-action restriction
- Base-uri limitation
- Object-src blocking
- Worker-src restriction

### CORS Configuration

**Production:**
- Strict origin validation
- Credential support
- 24-hour cache duration
- Preflight handling

**Environment Variables:**
```bash
ALLOWED_ORIGIN=https://your-domain.vercel.app
```

## Security Monitoring

### Intrusion Detection System

**Implementation:** Real-time threat detection and pattern analysis

**Detection Capabilities:**
- Brute force attack detection
- Distributed attack identification
- Anomalous access patterns
- Data exfiltration attempts
- Webhook abuse detection
- Geographic anomalies
- Suspicious user agent patterns

**Alert Thresholds:**
```typescript
const ALERT_THRESHOLDS = {
  authFailuresPerIp: { threshold: 10, window: '1h' },
  rateLimitViolationsPerIp: { threshold: 20, window: '1h' },
  webhookFailuresPerHour: { threshold: 50, window: '1h' },
  concurrentFailuresPerIp: { threshold: 5, window: '5m' },
  unusualUserAgents: { threshold: 3, window: '1h' }
};
```

### Security Metrics Dashboard

**API Endpoint:** `/api/security/metrics`

**Features:**
- Real-time security metrics
- Active alerts management
- Historical trend analysis
- Top offender identification
- Unusual pattern detection

**Usage:**
```bash
GET /api/security/metrics?timeWindow=24h&includeAlerts=true
```

### Alert Integration

**Environment Variables:**
```bash
SECURITY_MONITORING_ENABLED=true
SECURITY_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/SECURITY/WEBHOOK
```

## Environment Variable Security

### Validation System

**Implementation:** Comprehensive security-focused environment variable validation

**Security Checks:**
- Secret strength validation (minimum 16 characters)
- Weak pattern detection
- Database SSL requirement in production
- Encryption key format validation
- Production value validation

**Validation Functions:**
```typescript
function validateSecret(name: string, value: string): void {
  if (value.length < 16) {
    throw new Error(`${name} must be at least 16 characters long`);
  }
  
  // Check for common weak patterns
  const weakPatterns = [
    /^(test|demo|example|sample|default)/i,
    /^(123|abc|password|secret)/i,
    /^(.)\1{15,}$/ // Repeated characters
  ];
}
```

### Required Security Variables

**Production Requirements:**
```bash
# Authentication
WHOP_APP_ID=your_production_app_id
WHOP_APP_SECRET=your_production_app_secret_min_16_chars
WHOP_WEBHOOK_SECRET=your_production_webhook_secret_min_16_chars

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Security Configuration
ENCRYPTION_KEY=exactly_32_character_key_for_aes256
ALLOWED_ORIGIN=https://your-domain.vercel.app
SECURITY_MONITORING_ENABLED=true
RATE_LIMIT_FAIL_CLOSED=true
```

## Audit Logging

### Security Audit System

**Implementation:** Comprehensive audit logging with PII redaction

**Log Categories:**
- Authentication events
- Authorization failures
- Intrusion attempts
- Data access
- Configuration changes
- Security violations

**PII Redaction:**
```typescript
private redactSecrets(data: Record<string, unknown>): Record<string, unknown> {
  const secretKeys = ['password', 'secret', 'token', 'key', 'signature'];
  for (const key of Object.keys(redacted)) {
    if (secretKeys.some(secretKey => key.toLowerCase().includes(secretKey))) {
      redacted[key] = '[REDACTED]';
    }
  }
  return redacted;
}
```

**Retention Policy:**
- Security alerts: 6 months (resolved)
- Audit logs: 1 year
- Security metrics: 30 days

**Environment Variables:**
```bash
AUDIT_LOG_RETENTION_DAYS=365
```

## Database Security

### Row Level Security (RLS)

**Implementation:** Multi-tenant data isolation with RLS policies

**Security Features:**
- Company-based data segregation
- User access controls
- Security alert isolation
- Audit log protection

**Policies:**
```sql
-- Users can only see alerts for their company
CREATE POLICY "Users can view own company security alerts" ON security_alerts
    FOR SELECT USING (
        company_id = current_setting('app.current_company_id', true)
    );
```

### Encryption

**Data Protection:**
- Webhook payload encryption (AES-256)
- Database SSL connections required
- Environment variable validation
- Sensitive data redaction in logs

## Incident Response

### Security Incident Handling

**Alert Levels:**
- **Critical:** Immediate response required (brute force, data exfiltration)
- **High:** Response within 1 hour (distributed attacks, authentication failures)
- **Medium:** Response within 4 hours (anomalous patterns)
- **Low:** Response within 24 hours (suspicious user agents)

**Response Procedures:**
1. **Detection:** Automated monitoring alerts
2. **Assessment:** Security team evaluation
3. **Containment:** IP blocking, account lockout
4. **Investigation:** Log analysis, pattern identification
5. **Recovery:** System hardening, policy updates
6. **Documentation:** Incident report creation

### Emergency Contacts

**Security Team:**
- Primary: security-team@company.com
- On-call: +1-XXX-XXX-XXXX
- Escalation: ciso@company.com

## Compliance

### Security Standards

**Implementation addresses:**
- **OWASP Top 10:** Protection against common web vulnerabilities
- **SOC 2:** Security monitoring, access controls, audit trails
- **GDPR:** Data protection, PII redaction, right to be forgotten
- **PCI DSS:** Secure handling of payment data (if applicable)

### Data Protection

**Privacy Features:**
- PII redaction in logs
- Minimal data collection
- Encrypted storage
- Secure data transmission
- Data retention policies

### Access Controls

**Implementation:**
- Multi-factor authentication ready
- Role-based access control
- Least privilege principle
- Session management
- Audit trail maintenance

## Monitoring & Maintenance

### Health Checks

**Security Endpoints:**
- `/api/health` - General system health
- `/api/health/webhooks` - Webhook processing health
- `/api/security/metrics` - Security monitoring dashboard

### Automated Monitoring

**Metrics Tracked:**
- Authentication success/failure rates
- Rate limit violations
- Security event volume
- Alert response times
- System performance impact

### Regular Maintenance

**Tasks:**
- Review security alerts weekly
- Update threat patterns monthly
- Audit user access quarterly
- Security assessment semi-annually
- Penetration testing annually

## Deployment Checklist

### Pre-Deployment Security

- [ ] Environment variables validated
- [ ] Security monitoring enabled
- [ ] Rate limiting configured
- [ ] SSL certificates verified
- [ ] Security headers tested
- [ ] Authentication endpoints verified
- [ ] Database security confirmed
- [ ] Logging system operational
- [ ] Alert integrations tested
- [ ] Backup procedures verified

### Post-Deployment Validation

- [ ] Security metrics dashboard functional
- [ ] Alert generation working
- [ ] Rate limiting active
- [ ] Authentication flows working
- [ ] Audit logs being generated
- [ ] Performance impact assessed
- [ ] User access tested
- [ ] Error handling verified

## Troubleshooting

### Common Security Issues

**Authentication Failures:**
1. Check WHOP_APP_SECRET configuration
2. Verify token format and expiration
3. Review security logs for patterns
4. Validate clock synchronization

**Rate Limiting Issues:**
1. Check database connectivity
2. Verify threshold configurations
3. Review IP blocking rules
4. Monitor system performance

**Security Alert Flood:**
1. Check for false positives
2. Adjust alert thresholds
3. Review threat patterns
4. Update detection rules

### Log Analysis

**Security Log Locations:**
- Application logs: Vercel function logs
- Security events: security_alerts table
- Audit trail: security_audit_log table
- Metrics: security_metrics table

**Query Examples:**
```sql
-- Recent security alerts
SELECT * FROM security_alerts 
WHERE created_at > NOW() - INTERVAL '24h'
ORDER BY created_at DESC;

-- Top offending IPs
SELECT ip, COUNT(*) as event_count
FROM security_audit_log
WHERE created_at > NOW() - INTERVAL '24h'
GROUP BY ip
ORDER BY event_count DESC
LIMIT 10;
```

## Conclusion

This security configuration provides comprehensive protection for the Churn Saver application in production. The implementation follows industry best practices and defense-in-depth principles to ensure robust security posture.

Regular reviews, updates, and testing are essential to maintain security effectiveness. The security team should continuously monitor threats and adapt configurations accordingly.

---

**Document History:**
- v1.0 (2025-10-21): Initial security configuration documentation

**Next Review Date:** 2026-01-21