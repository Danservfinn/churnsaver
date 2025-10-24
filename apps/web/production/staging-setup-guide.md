# Staging Environment Setup Guide

## Overview

This guide walks through setting up a complete staging environment for the Churn Saver application that mirrors production configuration.

## Prerequisites

- Vercel account with team/pro plan
- Whop developer account with staging app configured
- PostgreSQL database for staging (Supabase recommended)
- Access to deployment credentials

## Whop Staging Configuration

### 1. Create Staging App in Whop Dashboard

1. Go to Whop Developer Dashboard
2. Create a new app specifically for staging (separate from production)
3. Configure app settings:
   - Base URL: `https://your-staging-domain.vercel.app`
   - App path: `/experiences/[experienceId]` (if using Whop template)
   - Dashboard path: `/dashboard/[companyId]` (if using Whop template)
   - Discover path: `/discover` (if using Whop template)

### 2. Get Staging Credentials

Retrieve the following credentials from your Whop staging app:

```bash
# Primary Credentials
NEXT_PUBLIC_WHOP_APP_ID=app_staging_xxxxx
WHOP_API_KEY=X-Y-staging_api_key_here

# Default Context
NEXT_PUBLIC_WHOP_AGENT_USER_ID=user_staging_agent
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_staging_company

# Webhook Security
WHOP_WEBHOOK_SECRET=whsec_staging_secret
```

### 3. Configure Webhook Endpoint

1. In Whop app settings, add webhook endpoint:
   ```
   https://your-staging-domain.vercel.app/api/webhooks/whop
   ```

2. Subscribe to events:
   - `payment_failed`
   - `payment_succeeded`
   - `membership_went_valid`
   - `membership_went_invalid`

3. Copy the webhook secret to your environment variables

## Vercel Staging Environment

### 1. Create Vercel Project

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Link your project
cd apps/web
vercel link
```

### 2. Configure Environment Variables

Set the following environment variables in Vercel dashboard under your staging environment:

**Whop Credentials:**
```bash
NEXT_PUBLIC_WHOP_APP_ID=app_staging_xxxxx
WHOP_API_KEY=X-Y-staging_api_key_here
NEXT_PUBLIC_WHOP_AGENT_USER_ID=user_staging_agent
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_staging_company
WHOP_WEBHOOK_SECRET=whsec_staging_secret
WHOP_APP_ID=app_staging_xxxxx  # Legacy alias
```

**Database:**
```bash
DATABASE_URL=postgresql://user:pass@staging-db.supabase.co:5432/postgres?sslmode=require
```

**Security & Features:**
```bash
ENCRYPTION_KEY=your_staging_32_byte_encryption_key
SECURITY_MONITORING_ENABLED=true
RATE_LIMIT_FAIL_CLOSED=true
ENABLE_PUSH=true
ENABLE_DM=true
DEFAULT_INCENTIVE_DAYS=3
REMINDER_OFFSETS_DAYS=[0,2,4]
KPI_ATTRIBUTION_WINDOW_DAYS=14
```

### 3. Deploy to Staging

```bash
# Deploy to staging
vercel --env staging

# Or use GitHub integration with staging branch
git push origin staging
```

## Database Setup

### 1. Create Staging Database

```bash
# If using Supabase
# Create a new project for staging in Supabase dashboard

# Get connection string
DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

### 2. Run Migrations

```bash
# Set DATABASE_URL for staging
export DATABASE_URL="your-staging-database-url"

# Run migrations
cd infra
node scripts/migrate.js
```

### 3. Seed Test Data (Optional)

```bash
# Create test memberships and cases
node scripts/seed-test-data.js
```

## Verification Steps

### 1. Health Checks

```bash
# Check application health
curl https://your-staging-domain.vercel.app/api/health

# Check database health
curl https://your-staging-domain.vercel.app/api/health/db

# Check webhook health
curl https://your-staging-domain.vercel.app/api/health/webhooks
```

### 2. Webhook Testing

```bash
# Test webhook signature verification
curl -X POST https://your-staging-domain.vercel.app/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "X-Whop-Signature: test_signature" \
  -d '{"id":"evt_test","type":"payment.succeeded","data":{}}'
```

### 3. Authentication Testing

1. Install your staging app in a test Whop community
2. Navigate to the app through Whop dashboard
3. Verify authentication and company context work correctly

## Monitoring

### Logs

```bash
# View logs in Vercel dashboard or CLI
vercel logs --follow

# Filter for errors
vercel logs | grep ERROR
```

### Metrics

Access monitoring dashboard:
```
https://your-staging-domain.vercel.app/api/monitoring/dashboard
```

## Troubleshooting

### Missing Environment Variables

If deployment fails due to missing variables:

1. Check Vercel environment variables are set for staging environment
2. Verify no typos in variable names
3. Ensure sensitive values are marked as secret in Vercel

### Webhook Signature Failures

1. Verify `WHOP_WEBHOOK_SECRET` matches Whop dashboard exactly
2. Check webhook logs for signature validation errors
3. Test with Whop's webhook testing tool

### Database Connection Issues

1. Verify `DATABASE_URL` includes `?sslmode=require` for production/staging
2. Check database is accessible from Vercel's IP ranges
3. Verify connection pooling limits

## Security Checklist

- [ ] All secrets are marked as sensitive in Vercel
- [ ] Database uses SSL connections
- [ ] Webhook signature validation is enabled
- [ ] Rate limiting is configured
- [ ] Security monitoring is enabled
- [ ] Audit logging is active

## Next Steps

After staging is verified:

1. Run staging rehearsal checklist
2. Perform load testing
3. Validate all critical user flows
4. Prepare production deployment