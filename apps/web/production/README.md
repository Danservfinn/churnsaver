# Production Deployment Guide

This directory contains production deployment configuration and scripts for the Churn Saver application.

## Overview

The Churn Saver application is designed to be deployed as a serverless Next.js application on Vercel with Supabase Postgres as the database. The reminder scheduler runs as a separate service (can be moved to a hosted cron service later).

## Prerequisites

- Vercel account and CLI
- Supabase project (Production)
- Whop app configured for production
- Domain for production deployment

## Environment Setup

### 1. Supabase Production Database

Create a new Supabase project for production:

```bash
# Create new project via Supabase dashboard or CLI
supabase projects create churn-saver-prod
```

Run migrations:

```bash
# From project root
cd apps/web
npm run init-db
```

### 2. Whop Production App

Create a production Whop app and configure webhooks:

- App URL: `https://your-domain.vercel.app`
- Webhook URL: `https://your-domain.vercel.app/api/webhooks/whop`
- Generate production webhook secret

### 3. Vercel Deployment

Install Vercel CLI and deploy:

```bash
npm i -g vercel
cd apps/web
vercel --prod
```

### 4. Environment Variables

Set these environment variables in Vercel dashboard:

#### Required Production Variables
```
DATABASE_URL=postgresql://[user]:[password]@[host]:5432/postgres?sslmode=require
WHOP_APP_ID=your_production_whop_app_id
WHOP_APP_SECRET=your_production_whop_app_secret
WHOP_WEBHOOK_SECRET=your_production_webhook_secret
ENCRYPTION_KEY=your_32_char_encryption_key
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://your-domain.vercel.app
```

#### Optional Configuration
```
COMPANY_ID=your_company_id
ENABLE_PUSH=true
ENABLE_DM=true
INCENTIVE_DAYS=3
REMINDER_OFFSETS_DAYS=0,2,4
KPI_WINDOW_DAYS=14
LOG_LEVEL=info
```

### 5. Cron Jobs and Scheduled Tasks

The application uses Vercel Cron Jobs for automated scheduled tasks:

#### Reminder Scheduler
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Endpoint**: `POST /api/scheduler/reminders`
- **Purpose**: Process pending recovery reminders across all companies

#### Event Retention Cleanup
- **Schedule**: Daily at 2:00 UTC (`0 2 * * *`)
- **Endpoint**: `POST /api/cleanup/events`
- **Purpose**: GDPR-compliant cleanup of old webhook events

#### Data Privacy Maintenance
- **Schedule**: Weekly on Sundays at 3:00 UTC (`0 3 * * 0`)
- **Endpoint**: `POST /api/cleanup/privacy`
- **Purpose**: Automated PII cleanup and privacy compliance

#### Vercel Cron Configuration
Add this to your `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/scheduler/reminders",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cleanup/events",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cleanup/privacy",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

#### Alternative: GitHub Actions Cron
If Vercel cron is unavailable, use GitHub Actions:

```yaml
# .github/workflows/scheduled-jobs.yml
name: Scheduled Jobs
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
    - cron: '0 2 * * *'    # Daily at 2:00 UTC
    - cron: '0 3 * * 0'    # Weekly on Sundays at 3:00 UTC
jobs:
  reminders:
    if: github.event.schedule == '*/5 * * * *'
    runs-on: ubuntu-latest
    steps:
      - name: Send reminders
        run: curl -X POST https://your-domain.vercel.app/api/scheduler/reminders
  cleanup-events:
    if: github.event.schedule == '0 2 * * *'
    runs-on: ubuntu-latest
    steps:
      - name: Cleanup events
        run: curl -X POST https://your-domain.vercel.app/api/cleanup/events
  privacy-maintenance:
    if: github.event.schedule == '0 3 * * 0'
    runs-on: ubuntu-latest
    steps:
      - name: Privacy maintenance
        run: curl -X POST https://your-domain.vercel.app/api/cleanup/privacy
```

## Privacy & Data Compliance

### Currently Stored PII

**Direct PII:**
- `recovery_cases.user_id` - User identifier (may be email or personal ID)
- `recovery_actions.user_id` - Same user tracking across actions

**Indirect PII:**
- `recovery_cases.company_id`, `recovery_actions.company_id` - Business identifiers that can correlate user activities
- `recovery_cases.membership_id`, `events.membership_id`, `recovery_actions.membership_id` - Subscription identifiers

**Sensitive Webhook Data:**
- `events.payload` - JSONB containing entire webhook payloads with payment information, user data, personal details
- **CRITICAL:** Webhook payloads are stored indefinitely and may contain card data, billing addresses, personal information

**Audit Logging:**
- `recovery_actions.metadata` - Contains contextual data (attempt numbers, amounts) - generally not PII but review for edge cases

### Privacy Compliance Actions Required

1. **Data Minimization** - Implement retention policies for `events.payload` and old audit logs ✅ **COMPLETED**
2. **Data Deletion** - Provide user data deletion endpoints for GDPR compliance
3. **Webhook Payload Review** - Only store essential event data, redact sensitive payment information
4. **Logging Review** - Ensure no webhook payloads or sensitive form data are logged in application logs

### Recommended Actions

```sql
-- Example: Remove sensitive webhook data after processing
CREATE TABLE events_minimal (
  id uuid PRIMARY KEY,
  whop_event_id text UNIQUE,
  type text,
  membership_id text,
  processed boolean DEFAULT true,
  essential_data jsonb -- Only non-sensitive fields
);

-- Migrate and clean up
INSERT INTO events_minimal (id, whop_event_id, type, membership_id, essential_data)
SELECT id, whop_event_id, type, membership_id,
       jsonb_build_object('processed_at', processed_at, 'created_at', created_at)
FROM events;
```

## Security Considerations

### Database Security
- Enable Row Level Security (RLS) on all tables with company-scoped policies
- Use connection pooling with prepared statements
- Regular backup schedule with encryption
- Audit triggers for cross-company data access prevention

### Webhook Security
- HMAC-SHA256 signature validation with timing-safe comparison
- Support for multiple signature formats (`sha256=<hex>`, `v1,<hex>`, raw hex)
- 5-minute timestamp window for replay prevention (production only)
- Rate limiting: 300/hour global, fail-open behavior with per-company limits
- Idempotent processing by `whop_event_id` to prevent duplicates
- HTTPS required in production
- Payload encryption for sensitive webhook data

### Input Validation
- Zod schemas with explicit length limits and UUID pattern enforcement
- Maximum string lengths: 255 characters for text fields, 36 characters for UUIDs
- Array limits: maximum 10 elements for reminder offsets
- Strict object validation (no additional properties allowed)

### Environment Variables
- Never commit secrets to code
- Use Vercel's encrypted environment variables
- Rotate secrets regularly
- Non-production credentials locked for safe testing

### Testing with Locked Credentials
For safe testing procedures when non-production credentials are locked:

#### Staging Environment Setup
1. **Create separate Whop staging app**: Use dedicated staging/sandbox credentials
2. **Isolated test database**: Create separate Supabase project for testing
3. **Mock external services**: Use test doubles for Push/DM providers
4. **Document test credentials**: Store in team vault/wiki, not in code

#### Safe Testing Practices
1. **Never use production credentials** in non-production environments
2. **Use environment-specific secrets** for each deployment stage
3. **Implement credential validation** to prevent accidental production data access
4. **Regular credential rotation** with automated deployment updates
5. **Audit credential usage** through logging and monitoring

#### Testing Checklist
- [ ] Staging environment configured with test credentials
- [ ] Mock services replace external API dependencies
- [ ] Test database isolated from production data
- [ ] Credential sources documented in team vault
- [ ] No production secrets accessible in test environments

### Reminder Core Tests

A dedicated unit test suite validates the shared reminder orchestration utilities (`shouldSendReminder`, `processReminderBatch`) that both the serverless scheduler and the local cron helper consume:

```bash
cd apps/web
npm run test -- --runInBand test/companyDiscovery.test.ts
```

## Monitoring & Logging

### Application Logs
- Vercel provides built-in logging
- Use structured logging for better searchability
- Set up log retention policies

### Database Monitoring
- Monitor connection pools
- Set up alerts for high query latency
- Regular health checks

### Business Metrics
- Monitor recovery rates
- Track nudge effectiveness
- Alert on webhook failures

## Rollback Strategy

### Database Rollbacks
- Keep migration files versioned
- Test migrations on staging first
- Have backup restore procedures

### Application Rollbacks
- Vercel supports instant rollbacks
- Keep multiple versions deployed
- Use feature flags for gradual rollouts

## Reminder Scheduler

### Serverless-Compatible Design

The reminder scheduler is designed for serverless environments and doesn't use node-cron, which is incompatible with Vercel and similar platforms. Instead, it uses external cron services.

### Setup Instructions

**1. Vercel Cron Jobs (Recommended)**
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
Add this to your `vercel.json` file. This runs every 5 minutes.

**2. GitHub Actions Cron (Alternative)**
```yaml
# .github/workflows/reminder-scheduler.yml
name: Send Reminders
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - name: Send reminders
        run: curl -X POST https://your-domain.vercel.app/api/scheduler/reminders
```

**3. Railway/Railway Cron (Alternative)**
Create a cron job in your Railway project dashboard to POST to `/api/scheduler/reminders`.

### Monitoring

**Scheduler Status API:**
```bash
# Get scheduler status
curl https://your-domain.vercel.app/api/scheduler/reminders

# Get detailed stats (authenticated)
curl -X POST https://your-domain.vercel.app/api/scheduler/reminders \
  -d '{"action":"stats"}'
```

**Key Metrics:**
- Companies processed per run
- Reminder attempts sent successfully
- Processing time per company
- Error rates and stuck jobs

### Troubleshooting

**Missing Reminders:**
- Check cron job is active in deployment platform
- Verify `/api/scheduler/reminders` GET endpoint returns healthy status
- Check logs for "Starting serverless reminder processing cycle"
- Ensure companies have `creator_settings` configured

**Duplicate Processing:**
- The scheduler includes locking to prevent concurrent processing
- Check for stuck jobs: `curl -X POST /api/scheduler/reminders -d '{"action":"stats"}'`

**Performance Issues:**
- If too many companies, consider staggering cron frequency by company type
- Monitor average processing time via scheduler stats endpoint

## Scaling Considerations

### Database Scaling
- Supabase handles vertical scaling
- Consider read replicas for heavy reporting
- Optimize queries with proper indexing

### Application Scaling
- Next.js handles horizontal scaling
- API routes are serverless
- Monitor cold start times

## Scheduled Jobs

### Event Retention Cleanup

The application implements automated cleanup of old webhook events based on GDPR-compliant retention policies.

**Retention Policies:**
- **Events with null/plaintext payloads**: Deleted after 30 days
- **Events with encrypted payloads**: Deleted after 60 days

**Configuration:**
- **Schedule**: Daily at 2:00 UTC (`0 2 * * *`)
- **Endpoint**: `/api/cleanup/events` (POST)
- **Method**: Serverless HTTP trigger via Vercel cron

**How it works:**
1. Vercel cron calls `/api/cleanup/events` daily at 2:00 UTC
2. Endpoint executes the `cleanup-events.ts` script
3. Script deletes events based on retention policies
4. Returns detailed cleanup statistics and error handling

**Key features:**
- GDPR-compliant data retention policies
- Separate retention periods for different payload types
- Comprehensive error handling and logging
- Automatic execution via Vercel cron service

**Monitoring:**
- Health check: `GET /api/cleanup/events`
- Cleanup stats logged on each execution
- Error alerts for failed cleanup operations

**Error Handling:**
- Graceful failure handling with detailed logging
- Partial cleanup support (continues if one query fails)
- Alert on repeated failures through logging

### Data Privacy Maintenance

The application includes automated data privacy maintenance scripts for GDPR compliance.

**Configuration:**
- **Schedule**: Weekly on Sundays at 3:00 UTC (`0 3 * * 0`)
- **Endpoint**: `/api/cleanup/privacy` (POST)
- **Method**: Serverless HTTP trigger via Vercel cron

**Features:**
- Automated PII data cleanup and anonymization
- Retention policy enforcement for audit logs
- Privacy compliance monitoring and reporting
- Encrypted data rotation and key management

**Monitoring:**
- Health check: `GET /api/cleanup/privacy`
- Privacy maintenance stats logged weekly
- Compliance alerts for data retention violations

### Reminder Processing

The application uses Vercel's built-in cron service for reliable reminder processing in production.

**Configuration:**
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Endpoint**: `/api/scheduler/reminders` (POST)
- **Method**: Serverless HTTP trigger (recommended for Vercel)

**How it works:**
1. Vercel cron calls `/api/scheduler/reminders` every 5 minutes
2. Endpoint automatically detects cron invocation (no action parameter)
3. Triggers `scheduler.schedulePendingJobs()` to process all companies
4. Returns detailed processing stats and error handling

**Key features:**
- Serverless-compatible (no node-cron)
- Multi-tenant processing across all companies
- Comprehensive error handling and logging
- Rate limiting and authentication enforced in production
- Concurrent processing protection to prevent duplicates
- Shared reminder core (`src/server/services/shared/companyDiscovery.ts`) is reused across the serverless entrypoint and the local cron helper so reminder eligibility logic stays identical in every environment

**Monitoring:**
- Health check: `GET /api/scheduler/reminders`
- Processing stats: Authenticated request with `{"action":"stats"}`
- Logs show processing times, success rates, and company counts

**Error Handling:**
- Automatic retry on transient failures
- Detailed error logging with company context
- Graceful degradation (fails quietly, doesn't crash app)
- Alert on repeated failures through logging

**Cadence Notes:**
- 5-minute intervals balance timeliness vs. resource usage
- Processes all companies sequentially for consistency
- Scales horizontally via Vercel's serverless architecture

### Scheduler Scaling
- Current design processes all companies sequentially
- For high volume: split cron jobs by company category (e.g., high-value vs standard)
- Monitor processing times and consider parallel processing for very large deployments
- Queue-based processing could be added later with tools like BullMQ + Redis

## Troubleshooting

### Common Issues

**Webhook Signature Failures**
- Check WHOP_WEBHOOK_SECRET matches production
- Verify webhook URL is correct
- Check HTTPS certificate

**Database Connection Issues**
- Verify DATABASE_URL format
- Check Supabase project status
- Confirm SSL settings

**Scheduler Not Running**
- Check cron job configuration
- Verify environment variables
- Check application logs

### Health Checks

Add these health check endpoints:

- `GET /api/health` - Application health
- `GET /api/health/db` - Database connectivity
- `GET /api/health/webhooks` - Webhook processing status

## Incident Response Runbook

This section provides procedures for responding to production incidents involving webhooks, reminders, scheduler operations, and external providers (Push and DM services).

### Critical Incident Classification

**P0 - Service Down**: Complete system failure, no recovery processes working
**P1 - Service Degraded**: Partial failure, some recovery processes failing
**P2 - Service Monitoring**: Performance issues, alerts active
**P3 - Service Maintenance**: Non-critical issues requiring attention

### Webhook Processing Incidents

#### Symptom: Webhook events not being processed

**Diagnosis:**
1. Check Vercel function logs for webhook endpoint:
   ```bash
   vercel logs --app your-app-name --since 1m
   ```
2. Verify webhook signature validation:
   ```bash
   # Test webhook
   curl -X POST https://your-domain.vercel.app/api/webhooks/whop \
     -H "Content-Type: application/json" \
     -H "X-Whop-Signature: test-sig" \
     -d '{"test": "data"}'
   ```
3. Check database connectivity:
   ```bash
   # Via health check
   curl https://your-domain.vercel.app/api/health/webhooks
   ```

**Immediate Actions:**
1. **Check webhook secrets**: Verify `WHOP_WEBHOOK_SECRET` is correct and hasn't rotated
2. **Verify webhook URL**: Ensure Whop dashboard points to correct production URL
3. **Database access**: Confirm database is accessible and not rate limited
4. **Circuit breaker**: If external API failing, temporarily disable webhook processing

**Common Causes & Fixes:**
- **Invalid signature**: Regenerate webhook secret in Whop dashboard
- **Database full**: Check Supabase usage and upgrade if needed
- **Rate limiting**: Add webhook queuing or implement backoff

#### Symptom: Duplicate webhook processing

**Diagnosis:**
- Check event idempotency in logs
- Verify `whop_event_id` uniqueness constraints

**Fix:**
- Events are deduplicated by `whop_event_id` - investigate why duplicates are reaching database
- Add webhook-level deduplication if needed

### Scheduler/Reminder Processing Incidents

#### Symptom: Reminders not being sent

**Diagnosis:**
1. Check scheduler execution:
   ```bash
   # Manual trigger
   curl -X POST https://your-domain.vercel.app/api/scheduler/reminders \
     -H "Authorization: Bearer ${SCHEDULER_SECRET_KEY}"
   ```
2. Check Vercel cron job status:
   ```bash
   vercel cron list --app your-app-name
   ```
3. Verify database updates:
   ```sql
   -- Check recent processing
   SELECT company_id, last_nudge_at, attempts
   FROM recovery_cases
   WHERE status = 'open'
   ORDER BY last_nudge_at DESC
   LIMIT 10;
   ```

**Immediate Actions:**
1. **Force scheduler execution**: Use manual API trigger above
2. **Check cron configuration**: Verify vercel.json cron settings
3. **Database locks**: Ensure no stuck database locks blocking processing

**Common Issues:**
- **Cron job disabled**: Re-enable in Vercel dashboard
- **Authentication failed**: Verify `SCHEDULER_SECRET_KEY`
- **Database timeout**: Check long-running queries in scheduler logs

#### Symptom: Too many/few reminders sent

**Diagnosis:**
- Check `recovery_cases.attempts` and `last_nudge_at` for unusual patterns
- Review scheduler logs for companies being processed

**Fix:**
- **Over-processing**: Database locks may not be working - check advisory locks
- **Under-processing**: Companies may be skipped due to errors - check error logs

### External Provider Incidents (Push/DM Services)

#### Symptom: Push notifications failing

**Diagnosis:**
1. Check API responses in logs:
   ```bash
   vercel logs --app your-app-name --since 30m | grep "push.*fail"
   ```
2. Test provider connectivity:
   ```bash
   # Check provider status
   curl -s https://status.pushprovider.com/api/v2/status.json
   ```

**Immediate Actions:**
1. **Rate limit hit**: Temporarily disable push notifications
2. **API key rotation**: Regenerate provider API keys
3. **Provider outage**: Check provider status page and incident timeline

**Common Fixes:**
- **Authentication**: Rotate `PUSH_API_KEY` in environment
- **Rate limiting**: Implement exponential backoff
- **Provider changes**: Update integration for API changes

#### Symptom: DM messages bouncing/failing

**Similar to push notifications:**
1. Check DM provider logs
2. Verify webhook callbacks from DM service
3. Test direct API calls to DM provider

### Monitoring & Alerting

#### Key Metrics to Monitor

**Webhook Processing:**
- Events processed/minute
- Webhook signature failures
- Processing errors by type

**Scheduler Performance:**
- Jobs completed per cron run
- Processing time per company
- Database lock contention

**Provider Status:**
- Message delivery rates
- API response times
- Error rates by provider

**Business Impact:**
- Recovery case processing lag
- Failed recovery attempts
- Overall nudge delivery success rate

#### Alert Thresholds

```yaml
# Example alert configuration for monitoring system
alerts:
  # P0 - Immediate intervention required
  - name: "Webhook processing stopped"
    condition: "webhook_events_processed < 1 per 10min"
    severity: critical

  - name: "Database connectivity lost"
    condition: "health/db != 200"
    severity: critical

  # P1 - Service degraded
  - name: "Webhook errors elevated"
    condition: "webhook_error_rate > 10% over 5min"
    severity: high

  - name: "Scheduler not running"
    condition: "scheduler_runs < 1 per 15min"
    severity: high

  # P2 - Service monitoring
  - name: "High reminder failure rate"
    condition: "reminder_failure_rate > 20% over 30min"
    severity: medium
```

### Recovery Procedures

#### P0 Recovery (Complete System Failure)
1. **Stop all automated processing**:
   ```bash
   # Pause cron jobs
   vercel cron pause
   ```

2. **Assess damage**:
   - Check unprocessed webhook backlog
   - Evaluate reminder sending delays
   - Monitor provider API limits

3. **Restore service**:
   - Fix root cause (database, secrets, etc.)
   - Restart automated processing
   - Verify webhook processing resumes

4. **Catch up missed processing**:
   - Manually trigger reminder processing
   - Reprocess failed webhooks if idempotent

#### P1 Recovery (Partial Service Degradation)
1. **Identify failing component**: Webhooks, scheduler, or specific provider
2. **Mitigate temporarily**: Disable failing integrations if needed
3. **Fix underlying issue**: Update secrets, fix code bugs, etc.
4. **Gradually restore**: Re-enable integrations with monitoring

#### Post-Incident Actions
1. **Update documentation**: Add incident cause and resolution
2. **Improve monitoring**: Add alerts for newly discovered failure modes
3. **Schedule review**: Hold incident review meeting with stakeholders
4. **Prevent recurrence**: Implement code fixes and process improvements

### Communication Plan

**Internal Communication:**
- Slack alerts for on-call engineer
- Team notification for P0/P1 incidents
- Stakeholder update for prolonged outages

**External Communication:**
- Customer status page for service degradation
- Email notifications for significant outages
- Social media updates if needed

### Prevention Measures

**Regular Maintenance:**
- Monthly secret rotation
- Weekly dependency updates
- Biannual disaster recovery testing

**Monitoring Enhancement:**
- Implement synthetic transaction monitoring
- Add canary deployments for high-risk changes
- Continuous log analysis for early warning signs

**Capacity Planning:**
- Monitor provider API limits and usage patterns
- Plan for traffic spikes during key business periods
- Implement queue-based processing for high-volume scenarios











