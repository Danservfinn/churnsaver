# Churn Saver Changelog

All notable changes to the Churn Saver project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- **Database SSL Configuration** - Enforced SSL connections for all database communications
  - Added SSL validation in [`apps/web/src/lib/db.ts`](apps/web/src/lib/db.ts:40) and [`apps/web/src/lib/db-rls.ts`](apps/web/src/lib/db-rls.ts:51)
  - Implemented secure SSL validation with proper fallbacks for development
  - Impact: Prevents man-in-the-middle attacks on database connections
  - Migration: Ensure `DATABASE_URL` includes `sslmode=require` for production environments

- **Authentication Bypass Prevention** - Removed insecure development authentication bypass
  - Eliminated `ALLOW_INSECURE_DEV` environment variable that allowed skipping authentication
  - Updated [`apps/web/src/lib/whop/auth.ts`](apps/web/src/lib/whop/auth.ts:211) to enforce authentication in all environments
  - Impact: Eliminates potential security vulnerability from development configurations
  - Migration: Remove any `ALLOW_INSECURE_DEV=true` environment variables

- **Secure Random Generation** - Enhanced cryptographic random generation
  - Implemented [`generateSecureToken()`](apps/web/src/lib/encryption.ts:169) using Node.js crypto module
  - Added [`generateRandomString()`](apps/web/src/lib/encryption.ts:210) for cryptographically secure random strings
  - Impact: Prevents predictable token generation that could lead to session hijacking
  - Migration: No action required, transparent upgrade

- **Encryption Implementation** - Added comprehensive AES-256-GCM encryption
  - Created [`apps/web/src/lib/encryption.ts`](apps/web/src/lib/encryption.ts:1) with industry-standard encryption
  - Implemented secure key derivation using scrypt with OWASP-recommended parameters
  - Impact: Protects sensitive data at rest with authenticated encryption
  - Migration: Set `ENCRYPTION_KEY` environment variable (32-byte base64 key)

### Features
- **Event Security Enhancement** - Added payload encryption and secure event handling
  - Implemented [`005_secure_events.sql`](infra/migrations/005_secure_events.sql:1) migration
  - Added `payload_encrypted` column for future encrypted payload storage
  - Added `occurred_at` column for accurate event timing
  - Impact: Prepares infrastructure for encrypted event data storage
  - Migration: Run migration and backfill script as needed

- **Data Privacy Maintenance** - Automated data privacy compliance
  - Created [`apps/web/scripts/data-privacy-maintenance.ts`](apps/web/scripts/data-privacy-maintenance.ts:1) script
  - Implements automated cleanup of expired personal data
  - Impact: Ensures GDPR compliance with automated data retention policies
  - Migration: Schedule via cron job or run manually as needed

### Bug Fixes
- **SQL Injection Prevention** - Enhanced parameterized query handling
  - Updated [`apps/web/test/rls-validation.test.ts`](apps/web/test/rls-validation.test.ts:426) with SQL injection tests
  - Added input validation in [`apps/web/src/lib/validation.ts`](apps/web/src/lib/validation.ts:1)
  - Impact: Prevents SQL injection attacks through malicious input
  - Migration: No action required, transparent security enhancement

- **Duplicate Event Handling** - Improved idempotency for webhook processing
  - Added duplicate detection in [`apps/web/src/app/api/health/webhooks/route.ts`](apps/web/src/app/api/health/webhooks/route.ts:209)
  - Implemented proper error categorization for duplicate events
  - Impact: Prevents data corruption from duplicate webhook deliveries
  - Migration: No action required, transparent improvement

- **Event Timestamp Accuracy** - Fixed event timing issues
  - Implemented [`006_backfill_occurred_at.sql`](infra/migrations/006_backfill_occurred_at.sql:1) migration
  - Backfilled historical events with accurate timestamps from payload data
  - Impact: Ensures accurate analytics and reporting based on event timing
  - Migration: Migration includes automatic backfill process

### Documentation
- **Root README.md Update** - Completely rewrote project documentation
  - Added comprehensive project overview and value proposition
  - Included technology stack details and quick start guide
  - Added structured documentation links and contribution guidelines
  - Impact: Improves developer onboarding and project understanding
  - Migration: No action required

- **Security Documentation** - Added comprehensive security guides
  - Created [`apps/web/docs/secure-development-guide.md`](apps/web/docs/secure-development-guide.md:1)
  - Added production security configuration documentation
  - Impact: Provides clear security guidelines for developers
  - Migration: Review and implement security best practices

### CI/CD
- **Migration Pipeline Enhancement** - Improved database migration deployment
  - Updated [`.github/workflows/prd-deploy-migration.yml`](.github/workflows/prd-deploy-migration.yml:1) with comprehensive validation
  - Added pre-flight checks and post-migration verification
  - Implemented rollback capabilities and error handling
  - Impact: Reduces deployment risk and improves migration reliability
  - Migration: Update deployment workflows to use new pipeline

- **Package Manager Standardization** - Standardized on pnpm 9.15.9
  - Updated [`apps/web/package.json`](apps/web/package.json:5) to specify pnpm version
  - Added pnpm setup in CI/CD workflows
  - Impact: Ensures consistent dependency management across environments
  - Migration: Install pnpm 9.15.9 locally if not already present

### Code Quality
- **Duplicate Code Removal** - Refactored shared functionality
  - Consolidated duplicate database connection logic
  - Removed redundant validation functions
  - Created shared utility modules for common operations
  - Impact: Reduces maintenance burden and improves code consistency
  - Migration: No action required, internal improvement

- **Test Coverage Enhancement** - Added comprehensive security tests
  - Implemented [`apps/web/test/rls-validation.test.ts`](apps/web/test/rls-validation.test.ts:1) for security testing
  - Added SQL injection prevention tests
  - Created cross-tenant isolation validation tests
  - Impact: Improves security posture through automated testing
  - Migration: Run test suite to verify security measures

### Configuration
- **Environment Validation** - Enhanced configuration validation
  - Updated [`apps/web/src/lib/env.ts`](apps/web/src/lib/env.ts:1) with comprehensive validation
  - Added warnings for development values in production
  - Implemented secure default configurations
  - Impact: Prevents misconfiguration-related security issues
  - Migration: Review environment variables for security warnings

- **Node.js Version Alignment** - Standardized on Node.js 18+
  - Updated CI/CD workflows to use Node.js 20
  - Added version validation in prerequisite documentation
  - Impact: Ensures consistent runtime environment across deployments
  - Migration: Upgrade local Node.js to version 18 or higher

## [1.0.0] - 2025-01-15

### Added
- Initial release of Churn Saver platform
- Core churn detection algorithms
- Automated recovery workflows
- Real-time analytics dashboard
- Whop API integration
- Basic security implementation

### Security
- Initial Row Level Security (RLS) implementation
- Basic authentication and authorization
- Environment variable validation

### Infrastructure
- PostgreSQL database schema
- Next.js application framework
- Basic CI/CD pipeline
- Production deployment configuration

---

## Migration Guide

### From Previous Versions

#### Security Configuration Updates
1. **Database SSL**:
   ```bash
   # Update your DATABASE_URL to include SSL
   DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
   ```

2. **Encryption Key**:
   ```bash
   # Generate a new encryption key
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   
   # Set as environment variable
   export ENCRYPTION_KEY="your_generated_key_here"
   ```

3. **Remove Insecure Development Settings**:
   ```bash
   # Remove this from all environments
   unset ALLOW_INSECURE_DEV
   ```

#### Dependency Updates
1. **Update pnpm**:
   ```bash
   npm install -g pnpm@9.15.9
   ```

2. **Update Node.js**:
   ```bash
   # Use nvm or download from nodejs.org
   nvm install 18
   nvm use 18
   ```

#### Database Migration
1. **Apply New Migrations**:
   ```bash
   cd infra
   npm run migrate:up
   ```

2. **Verify Migration**:
   ```bash
   npm run migrate:status
   npm run migrate:validate
   ```

### Breaking Changes

- **Removed**: `ALLOW_INSECURE_DEV` environment variable
- **Required**: `ENCRYPTION_KEY` environment variable for all deployments
- **Required**: SSL connections for all database connections
- **Updated**: Minimum Node.js version from 16 to 18

### Deprecated Features

- None in this release

---

## Security Considerations

This release includes several important security enhancements:

1. **Database Encryption**: All database connections now require SSL
2. **Payload Encryption**: Framework is in place for encrypted event data
3. **Authentication**: All environments now require proper authentication
4. **Input Validation**: Enhanced protection against SQL injection

Please review your deployment configuration to ensure compliance with these security requirements.

---

## Need Help?

- **Documentation**: See our [developer documentation](docs/README.md)
- **Issues**: Report bugs via [GitHub Issues](https://github.com/your-org/churn-saver/issues)
- **Discussions**: Join our [GitHub Discussions](https://github.com/your-org/churn-saver/discussions)
- **Security**: Report security issues to security@churnsaver.com