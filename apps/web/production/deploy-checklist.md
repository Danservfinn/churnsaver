# Churn Saver Production Readiness Plan

## Automated Deployment Process

### Overview
The Churn Saver application uses automated CI/CD pipelines for migrations, scheduler operations, and deployments. The process ensures migrations are applied safely before application code is deployed.

### Migration CI/CD Process

#### 1. Pre-Deployment Migration Verification
**Manual Trigger**: Migration verification can be run before any deployment
```bash
# Via GitHub Actions UI: "Migration Verification" workflow
# Input: Environment (staging/production)
# Result: Reports if migration is safe to deploy
```

#### 2. Migration Deployment Process
**Automatic**: Migrations are applied during deployment via GitHub Actions
```yaml
# .github/workflows/prd-deploy-migration.yml
# Triggered by deployment workflows
# Features:
# - Database connectivity testing
# - Migration state detection (prevents re-runs)
# - Timeout protection (5 minute limit)
# - Post-migration verification
# - Automatic rollback alerts on failure
```

#### 3. Migration Safety Features
- **Idempotency**: Migrations can be run multiple times safely (IF NOT EXISTS clauses)
- **Timeout Protection**: 5-minute timeout prevents hanging deployments
- **Verification**: Post-migration checks ensure tables and indexes exist
- **Reporting**: Detailed logs and status reports for each deployment
- **Rollback Notes**: Current migrations are additive only (CREATE TABLE/INDEX), no destructive operations

#### 4. Migration Rollback (Comprehensive rollback capabilities now available)
The migration system now includes comprehensive rollback capabilities:

**Automated Rollback:**
```bash
# Rollback to specific migration
cd infra && npm run migrate:down 8

# Emergency rollback procedures
./scripts/emergency-rollback.sh --full-emergency

# Application rollback
./scripts/emergency-rollback.sh --app-rollback
```

**Rollback Validation:**
```bash
# Test rollback procedures
npm run test:rollback:all

# Validate rollback integrity
npm run test:rollback:dry-run

# Check rollback status
./scripts/emergency-rollback.sh --status-only
```

**Documentation:**
- [Emergency Rollback Playbook](../../infra/docs/emergency-rollback-playbook.md)
- [Migration Deployment Guide](../../infra/docs/migration-deployment-guide.md)
- [Infrastructure README](../../infra/README.md)

#### 5. Migration 005 and 006 Notes
- **005_secure_events.sql**: Adds occurred_at, payload_min, payload_encrypted columns and indexes. Safe to run multiple times.
- **006_backfill_occurred_at.sql**: Backfills occurred_at from payload.created_at or events.created_at. Removes DEFAULT from occurred_at. Safe to run multiple times due to conditional WHERE clause.

#### 4. Manual Migration Fallback
If automated migration fails:
```bash
# Login to the database instance directly
psql DATABASE_URL

# Apply migration manually
\i infra/migrations/001_init.sql

# Or use the setup script
./production/setup-production-db.sh
```

### Scheduler Operations

#### Scheduler Architecture
The system uses **Vercel Cron Jobs** for reliable reminder processing:
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Endpoint**: `POST /api/scheduler/reminders`
- **Authentication**: Shared secret key (`SCHEDULER_SECRET_KEY`)
- **Configuration**: Defined in `vercel.json`

#### Scheduler Monitoring
**Pre-deployment checks:**
- ✅ Scheduler job executions appear in Vercel function logs
- ✅ Reminder processing logs show company-by-company progress
- ✅ No failed webhook deliveries reported (check monitoring dashboard)

**Post-deployment monitoring:**
- ✅ First scheduler execution completes within 30 minutes of deployment
- ✅ Processing logs show activity across all companies
- ✅ No increase in error rates or failed delivery metrics
- ✅ Database reminder counters (`last_nudge_at`, `attempts`) are updating

#### Scheduler Rollback Procedures
If scheduler issues occur after deployment:
```bash
# Pause cron jobs (via Vercel dashboard or CLI)
vercel cron pause

# Manually trigger test processing
curl -X POST /api/scheduler/reminders \
  -H "Authorization: Bearer ${{SCHEDULER_SECRET_KEY}}"

# Resume cron jobs
vercel cron resume
```

#### Troubleshooting Common Scheduler Issues
- **Jobs not running**: Check Vercel cron configuration and logs
- **Processing hangs**: Verify database connectivity and query timeouts
- **Rate limiting**: Monitor 429 responses from external services
- **Company isolation failures**: Check database RLS policies

#### Scheduler Incident Response
**Immediate actions:**
1. Check Vercel function logs for scheduler endpoint
2. Verify database connectivity and recent event processing
3. Monitor external service rate limits (Push/DM providers)
4. Review error patterns in observability dashboard

### Deployment Rollback Procedures

#### Rollback Triggers
- Migration failures during automated deployment
- Application deployment failures after migration
- Production incidents requiring emergency rollback

#### Migration Rollback (Comprehensive rollback capabilities available)
The migration system now includes comprehensive rollback capabilities with automated procedures:

**Emergency Rollback Commands:**
```bash
# Full emergency rollback (application + database)
./infra/scripts/emergency-rollback.sh --full-emergency

# Rollback to specific migration
./infra/scripts/emergency-rollback.sh --migration-target=8

# Application rollback only
./infra/scripts/emergency-rollback.sh --app-rollback

# Restore from backup
./infra/scripts/emergency-rollback.sh --backup-restore=backup.sql
```

**Rollback Testing and Validation:**
```bash
# Test rollback procedures in staging
cd infra && npm run test:rollback:all

# Validate rollback integrity
npm run test:rollback:dry-run

# Run enhanced staging rehearsal
./scripts/enhanced-staging-rehearsal.sh
```

**Rollback Decision Matrix:**
- P0 Incident: Full emergency rollback (5-10 minutes)
- P1 Incident: Application rollback (2-5 minutes)
- P2 Incident: Migration rollback (10-15 minutes)
- P3 Incident: Fix in place (no rollback needed)

#### Application Rollback
Vercel provides instant rollback to previous deployments:
```bash
# Via Vercel dashboard
# Or via command line
vercel rollback [target-deployment-id]

# Scheduler rollback: Stop external cron jobs until fixed
```

#### Rollback Verification
After any rollback, verify:
- ✅ Previous application version is running
- ✅ Database schema unchanged (tables intact)
- ✅ No broken foreign keys or constraints
- ✅ Webhook processing continues (events table intact)

---

## Production Readiness Validation

### Schema Validation Tightening
- [x] Zod schemas updated with explicit length limits (255 chars for strings, 36 for UUIDs)
- [x] UUID pattern enforcement on caseId and membershipId parameters
- [x] Array limits enforced (max 10 elements for reminder_offsets_days)
- [x] Strict object validation (no additional properties allowed)

### Security Hardening
- [x] Row Level Security (RLS) enabled with company-scoped policies
- [x] Audit triggers for cross-company data access prevention
- [x] Payload encryption for sensitive webhook data
- [x] Non-production credentials locked for safe testing

### Cron Jobs Configuration
- [x] Reminder scheduler: Every 5 minutes (`*/5 * * * *`)
- [x] Event cleanup: Daily at 2:00 UTC (`0 2 * * *`)
- [x] Privacy maintenance: Weekly on Sundays at 3:00 UTC (`0 3 * * 0`)
- [x] Vercel cron configuration documented in production README

## Pre-production Implementation Tasks (Original Content)

### Track A: Harden x-whop-user-token verification with official SDK
**Current state**: Basic HMAC verification with fallback to anonymous access for invalid tokens across all dashboard/API routes.
**Impact**: All customer-facing endpoints (dashboard, nudge actions, settings) rely on this verification.

#### A1: SDK Evaluation and Integration (Time: 2 days)
- **Decision**: Adopt Whop's official Node.js SDK if available, or use JWT library with proper JWKS endpoint validation
- **Whop documentation review**:
  - Verify token format: JWT-like with Header.Payload.Signature
  - Confirm signature algorithm (HMAC-SHA256) and header expectations
  - Review official verification process vs current implementation
  - Identify required claims (app_id, company_id, user_id, iat, exp)
- **SDK selection**:
  - Primary: Whop's official TypeScript/Node.js SDK if exists
  - Backup: `jose` library with JWKS endpoint integration for token verification
  - Fallback: Enhanced HMAC verification with additional security checks

#### A2: Verification Module Implementation (Time: 3 days)
- **Create**: `apps/web/src/lib/auth/whopVerify.ts`
  - Export `verifyWhopToken(token: string): Promise<RequestContext | null>`
  - Export `verifyRequestToken(request: NextRequest): Promise<RequestContext>`
  - Handle both iframe tokens and potential API access tokens
  - Implement proper JWT validation with:
    - Signature verification
    - Issuer validation (app-specific)
    - Audience validation
    - Expiration checks (with clock skew tolerance)
    - Required claims validation
    - Multi-tenant company_id resolution
- **Error handling**: Structured error responses safe for logging (no PII leaks)
- **Fallback behavior**: For invalid tokens, return anonymous context instead of failing
- **Unit tests**: Comprehensive test matrix covering valid/invalid/expired tokens

#### A3: Route Integration and Testing (Time: 2 days)
- **Replace direct `getRequestContext` calls** in:
  - `apps/web/src/app/api/dashboard/cases/route.ts`
  - `apps/web/src/app/api/dashboard/kpis/route.ts`
  - `apps/web/src/app/api/cases/[caseId]/nudge/route.ts`
  - `apps/web/src/app/api/cases/[caseId]/cancel/route.ts`
  - `apps/web/src/app/api/cases/[caseId]/terminate/route.ts`
  - `apps/web/src/app/api/cases/[caseId]/cancel-membership/route.ts`
  - `apps/web/src/app/api/settings/route.ts`
  - `apps/web/src/app/api/scheduler/reminders/route.ts` (if still used)
- **Production enforcement**: Only authenticated company contexts for production deploys
- **Integration tests**: End-to-end with valid signing keys
- **Logging**: Structured audit logs on verification failures (anonymous, no user data)

### Track B: Production scheduler approach
**Current state**: Node-cron running every minute processing all tenant companies individually.
**Impact**: Critical for reminder delivery SLIs and resource utilization.

#### B1: Scheduler Architecture Decision (Time: 1 day)
**Options evaluated:**

1. **Current node-cron (linear scaling)**
   - Pros: Simple, works with all hosts, observable
   - Cons: Single point of failure, dogpiling under high load, no leader election

2. **External cron with secure webhook endpoints**
   - Pros: Scalable, leader-election free, works with Vercel/Github Actions
   - Cons: External dependency, requires webhook security
   - Implementation: Add `apps/web/src/app/api/scheduler/reminders/route.ts` with HMAC authentication

3. **Managed workflow engine**
   - Pros: Advanced features (observability, at-least-once delivery, retries)
   - Cons: Cost/complexity, overkill for current scale
   - Options: Temporal Cloud, AWS EventBridge, Cloud Tasks

**Recommended: Option 2 (External cron + secure endpoint) for Vercel/production hosting**
- Least risky migration from current approach
- Enables horizontal scaling
- Maintains idempotency through existing recovery_actions tracking

#### B2: Cron Infrastructure Setup (Time: 3 days)
- **If Vercel**: Configure Vercel Cron Jobs in `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/scheduler/reminders",
        "schedule": "*/5 * * * *"
      }
    ]
  }
  ```
- **If Heroku/Fly**: Use scheduler addons with authenticated webhooks
- **Security**: Shared secret header authentication for cron endpoints
- **Environment vars**: Add `SCHEDULER_SECRET_KEY` for endpoint protection

#### B3: Scheduler Safety and Monitoring (Time: 2 days)
- **Idempotency**: Leverage existing `last_nudge_at` and `attempts` counters in recovery_cases
- **Race condition handling**: Post-job advisory locks in database for exclusive processing
- **Error handling**: Comprehensive logging of failed reminders for retries
- **Monitoring**: Add job success/failure/duration metrics
- **Circuit breakers**: Skip problematic companies after repeated failures
- **Load management**: Time-boxed processing per tenant per run

### Track C: Log manual nudge attempts to recovery_actions
**Current state**: recovery_actions table exists with correct schema, but manual nudges only trigger notifications without audit logging.
**Impact**: Lack of audit trail for customer service interactions.

#### C1: Extend recovery_actions Schema (Time: 0.5 day)
- **Already exists**: Check `infra/migrations/001_init.sql` - schema supports required types
- **Types in use**: `nudge_push`, `nudge_dm`, `incentive_applied`, `case_cancelled`, `membership_terminated`
- **Metadata field**: JSONB supports additional context like template_id, recipient_id subset
- **No migration needed**: Current schema sufficient for manual nudge logging

#### C2: Write Path Integration (Time: 2 days)
- **Update**: `apps/web/src/app/api/cases/[caseId]/nudge/route.ts`
  - Insert recovery_actions row with `type: 'nudge_push'|'nudge_dm'`, `actor_type: 'system'|'user'`
  - Log actor_id (anonymous hash from request context)
  - Store sanitized payload (no full message content)
  - Link to case_id and membership_id from existing case lookup
- **Metadata structure**:
  ```json
  {
    "attempt_number": number,
    "channel": "push"|"dm",
    "template_version": string,
    "manual": true
  }
  ```
- **Transaction safety**: Ensure logging and nudge execution atomic

#### C3: Read Path and Compatibility (Time: 1 day)
- **Dashboard integration**: Update case detail view to show manual interventions
- **Audit queries**: Add API endpoint for filtering recovery_actions by case/membership
- **PII safety**: Never log sensitive message content, only metadata
- **Performance indexing**: Ensure compound indexes support common query patterns

### Track D: Validate Whop endpoints on staging tenant
**Current state**: Whop integration exists but only tested manually in production/development.
**Impact**: Risk of production outages from untested edge cases.

#### D1: Staging Environment Setup (Time: 2 days)
- **Whop staging tenant**: Create separate app/credentials from production
- **Environment configuration**: Separate `.env.staging` with staging webhooks/signing keys
- **Webhook endpoints**: Deploy to staging URL and configure in Whop dashboard
- **Data seeding**: Scripts to create test memberships/products for validation

#### D2: Integration Test Matrix (Time: 3 days)
**Webhook validation tests:**
- Membership created/updated/cancelled events
- Payment succeeded/failed/pending transitions
- Subscription lifecycle hooks

**API endpoint tests:**
- Membership details retrieval
- Cancel/termination operations
- Manage URL generation
- Incentive day addition

**Token validation tests:**
- Valid/expired/malformed tokens from staging iframe
- Multi-tenant company scoping
- Anonymous fallback paths

#### D3: Automated Test Suite (Time: 2 days)
- **Comprehensive QA script**: Extend `apps/web/test/comprehensive-qa.js` for staging
- **Idempotency tests**: Ensure repeated webhook delivery handled safely
- **Error injection**: Test failure scenarios (API errors, network timeouts)
- **Integration smoke tests**: Full nudge → Whop API → recovery_actions flow

### Track E: Metrics and alerting (optional enhancement)
**Current state**: Basic logging only, no application metrics or alerting.
**Impact**: No visibility into system health or business KPIs.

#### E1: Metrics Stack Selection (Time: 1 day)
**Minimal viable approach:**
- **Metrics library**: OpenTelemetry SDK for Node.js
- **Exporters**: Console logging for development, HTTP exporter for production
- **Stack**: Grafana Cloud + Prometheus for ingestion/visualization
- **No external dependencies**: Rely on existing logging infrastructure

#### E2: Key Metrics Instrumentation (Time: 3 days)
**Core SLOs to track:**
- Scheduler job success rate, execution latency, retry counts
- Whop API success rates by endpoint (overall and per-tenant)
- Token verification failure rates
- Recovery nudge attempt/delivery rates
- Database query performance (especially for reminder processing)

**Implementation locations:**
- `apps/web/src/server/cron/processReminders.ts`: Job timing/success metrics
- `apps/web/src/lib/auth/whopVerify.ts`: Token validation metrics
- `apps/web/src/server/services/memberships.ts`: Whop API metrics
- `apps/web/src/server/services/push.ts`: Notification delivery metrics

#### E3: Health Checks and Alerting (Time: 2 days)
**Health endpoints:**
- `/api/health`: Basic database/webhook connectivity checks
- `/api/health/deep`: Including token validation dry-run and nudge delivery test

**Alerting thresholds:**
- Scheduler job miss rate >5%
- Whop API error rate >10% over 15min
- Token verification failures >50/min
- Significant nudge delivery failures

**Delivery**: Slack channel with escalation to PagerDuty during CRMs

## Implementation Phases and Timeline

### Phase 1: Core Security & Reliability (Week 1-2)
- A1-A2: Whop SDK integration and verification module
- B1-B2: Scheduler architecture and infrastructure
- D1: Staging environment preparation

### Phase 2: Feature Completion (Week 3)
- C1-C2: Manual nudge audit logging
- A3: Token verification route integration
- B3: Scheduler safety monitoring
- D2: Integration test matrix execution

### Phase 3: Production Validation (Week 4)
- D3: Automated staging test suite
- E1-E3: Metrics and alerting (if time permits)
- End-to-end integration testing on staging

### Phase 4: Rollout and Monitoring (Week 5-6)
- Gradual rollout starting with non-cron paths
- Feature flags for scheduler changes
- Validation of metrics collection
- Production monitoring for 1 week

## Resource Requirements
- **Frontend TypeScript/Node.js experience**: Required for SDK integration and route changes
- **Database schema knowledge**: For ensuring audit logging compatibility
- **Webhook/API integration testing**: For staging validation
- **Infrastructure knowledge**: Vercel config, environment management
- **Optional: Observability experience**: For metrics/alerting

## Risk Assessment
- **High risk**: Whop verification changes - could break all customer access if flawed
- **Medium risk**: Scheduler changes - timing/cron dependency could affect reminder delivery
- **Low risk**: recovery_actions logging - additive only, no breaking changes
- **Medium risk**: Staging validation - time-consuming but no operational impact
- **Low risk**: Metrics - optional, log-only changes

## Success Criteria
- [ ] Whop token verification works with official client tokens across all environments
- [ ] Scheduler runs reliably every 5-15 minutes without duplicates/misses
- [ ] Manual nudges create audit trails in recovery_actions
- [ ] Staging environment demonstrates end-to-end integration reliability
- [ ] Key system metrics collected and alertable
- [ ] All changes deployed with zero-downtime
- [ ] Production monitoring shows healthy system operation for 7+ days

## Rollback Plan
- **Database Migrations**: Comprehensive rollback system with automated procedures
- **Application Deployment**: Vercel instant rollback with emergency scripts
- **Feature Flags**: Granular rollback control for individual features
- **Emergency Procedures**: Documented emergency rollback playbook
- **Testing**: Rollback procedures tested in staging before production

**Rollback Documentation:**
- [Emergency Rollback Playbook](../../infra/docs/emergency-rollback-playbook.md)
- [Migration Deployment Guide](../../infra/docs/migration-deployment-guide.md)
- [Infrastructure README](../../infra/README.md)
- [Rollback Testing Workflow](../../.github/workflows/migration-rollback-testing.yml)

## Post-Implementation Monitoring
- **Week 1**: Token verification success rates (>99.99%)
- **Week 1-2**: Scheduler job completion rates (>99.5%)
- **Week 2**: Manual nudge audit logging working
- **Week 2-3**: No production incidents from changes
- **Ongoing**: Webhook/API error rates under baseline
- **Ongoing**: Reminder delivery within 1 hour of scheduled time

