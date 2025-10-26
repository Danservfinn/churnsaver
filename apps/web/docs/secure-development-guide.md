# Secure Development Guide

## Overview

This guide outlines secure development practices for the ChurnSaver application, with special focus on authentication security and development mode configurations.

## 🔐 Development Mode Security

### Critical Security Controls

The application implements multiple layers of security to prevent accidental production deployment with insecure development configurations:

#### 1. ALLOW_INSECURE_DEV Environment Flag

**Purpose**: Explicit opt-in requirement for insecure development mode

**Usage**:
```bash
# Enable insecure development mode (LOCAL DEVELOPMENT ONLY)
export ALLOW_INSECURE_DEV=true

# Default (secure) - no authentication bypass
export ALLOW_INSECURE_DEV=false
# or simply don't set the variable
```

**Security Features**:
- **Explicit Opt-In**: Development mode bypass requires `ALLOW_INSECURE_DEV=true`
- **Production Blocking**: Production deployments fail if this flag is enabled
- **Security Logging**: All insecure dev mode usage is logged for security monitoring

#### 2. Production Safety Checks

The application includes automatic validation that prevents production deployment when:
- `ALLOW_INSECURE_DEV=true` is set in production environment
- Missing required API keys or secrets
- Development/test patterns detected in production configurations

#### 3. Security Monitoring

All authentication bypass attempts are logged with:
- Security category classification
- Severity levels for monitoring
- Environment context
- Configuration state

## 🛡️ Secure Development Workflow

### Recommended Development Setup

1. **Local Development (Without API Keys)**:
```bash
# For local development without Whop API keys
export NODE_ENV=development
export NEXT_PUBLIC_WHOP_APP_ID=dev_app_id
export ALLOW_INSECURE_DEV=true  # Explicit opt-in required
```

2. **Local Development (With API Keys)**:
```bash
# Preferred secure development method
export NODE_ENV=development
export NEXT_PUBLIC_WHOP_APP_ID=your_dev_app_id
export WHOP_API_KEY=your_development_api_key
export WHOP_WEBHOOK_SECRET=your_dev_webhook_secret
# ALLOW_INSECURE_DEV not needed when API keys are provided
```

3. **Production Deployment**:
```bash
# Production configuration (ALLOW_INSECURE_DEV must be false/unset)
export NODE_ENV=production
export NEXT_PUBLIC_WHOP_APP_ID=prod_app_id
export WHOP_API_KEY=production_api_key
export WHOP_WEBHOOK_SECRET=production_webhook_secret
# NEVER set ALLOW_INSECURE_DEV=true in production
```

## 🚨 Security Warnings

### When Insecure Dev Mode is Active

The application will log security warnings when `ALLOW_INSECURE_DEV=true` is enabled:

```
WARNING: Insecure development mode is active - authentication bypassed
Category: security
Severity: medium
Environment: development
AllowInsecureDev: true
```

### Production Deployment Blocking

Production deployments will fail with clear error messages if insecure configuration is detected:

```
CRITICAL: ALLOW_INSECURE_DEV=true is not allowed in production environment - this creates a severe security vulnerability
```

## 📋 Security Checklist

### Before Development

- [ ] Understand the security implications of `ALLOW_INSECURE_DEV=true`
- [ ] Use real API keys when possible for development
- [ ] Only enable insecure dev mode when absolutely necessary
- [ ] Monitor security logs during development

### Before Production Deployment

- [ ] Ensure `ALLOW_INSECURE_DEV` is unset or `false`
- [ ] Verify all required API keys and secrets are configured
- [ ] Check for any development/test values in configuration
- [ ] Review security logs for any authentication bypass attempts
- [ ] Validate configuration using built-in validation tools

### During Development

- [ ] Monitor security warnings in logs
- [ ] Use least privilege principle for API keys
- [ ] Rotate development keys regularly
- [ ] Avoid committing sensitive configuration to version control

## 🔧 Configuration Validation

### Built-in Validation

The application includes comprehensive configuration validation:

```typescript
import { validateWhopSdkConfig } from '@/lib/whop/sdkConfig';

const result = validateWhopSdkConfig();
if (!result.isValid) {
  console.error('Configuration errors:', result.errors);
}
if (result.warnings.length > 0) {
  console.warn('Configuration warnings:', result.warnings);
}
```

### Environment-Specific Validation

- **Development**: Allows insecure mode with explicit opt-in
- **Staging**: Requires API keys, blocks insecure mode
- **Production**: Requires full configuration, blocks all insecure options

## 🚫 Prohibited Configurations

### Never in Production

- `ALLOW_INSECURE_DEV=true`
- Development/test API keys
- Weak or default secrets
- Localhost/development URLs

### Always Required in Production

- Valid `WHOP_API_KEY` (minimum 16 characters)
- Valid `WHOP_WEBHOOK_SECRET` (minimum 16 characters)
- Production `NEXT_PUBLIC_WHOP_APP_ID`
- `ALLOW_INSECURE_DEV` unset or `false`

## 📊 Security Monitoring

### Log Categories

- **Authentication**: Token verification and authentication events
- **Configuration**: Configuration validation and security checks
- **Security**: Security violations and bypass attempts

### Severity Levels

- **High**: Security violations, blocked authentication attempts
- **Medium**: Insecure development mode usage
- **Low**: Configuration warnings, weak patterns

### Integration with Monitoring

Security events are automatically integrated with:
- Application logging system
- Error monitoring
- Security monitoring tools
- Alerting systems

## 🔄 Best Practices

### Development

1. **Prefer Real API Keys**: Use development API keys over insecure mode
2. **Explicit Configuration**: Always set environment variables explicitly
3. **Security Awareness**: Understand security implications of development settings
4. **Regular Validation**: Use built-in validation tools

### Production

1. **Zero Trust**: Never allow development configurations in production
2. **Principle of Least Privilege**: Use minimal required permissions
3. **Regular Rotation**: Rotate API keys and secrets regularly
4. **Comprehensive Monitoring**: Monitor all security events

### Team Collaboration

1. **Documentation**: Document all development configurations
2. **Code Review**: Review all environment configuration changes
3. **Security Training**: Ensure team understands security implications
4. **Incident Response**: Have plan for security incidents

## 🆘 Emergency Procedures

### If Insecure Dev Mode is Detected in Production

1. **Immediate Action**: Shut down the application
2. **Investigation**: Review logs and configuration
3. **Remediation**: Fix configuration issues
4. **Validation**: Test configuration thoroughly
5. **Monitoring**: Increase monitoring intensity

### Security Incident Response

1. **Isolation**: Isolate affected systems
2. **Investigation**: Review logs and audit trails
3. **Notification**: Notify security team and stakeholders
4. **Remediation**: Address security vulnerabilities
5. **Prevention**: Update procedures to prevent recurrence

## 📚 Additional Resources

- [Whop SDK Integration Guide](./whop-sdk-integration-guide.md)
- [Production Runbook](./whop-production-runbook.md)
- [Security Configuration](../production/security-configuration.md)
- [Error Handling Guide](./error-handling-guide.md)

---

**Last Updated**: 2025-10-24  
**Version**: 1.0  
**Security Classification**: Internal Use Only