# Staging Environment Setup Guide

## Prerequisites

- Vercel account with CLI installed
- Supabase account
- Whop staging app configured
- Domain for staging deployment (optional)

## Step 1: Create Staging Supabase Project

```bash
# Create new Supabase project for staging
supabase projects create churn-saver-staging --org your-org

# Or via Supabase dashboard:
# 1. Go to https://supabase.com/dashboard
# 2. Click "New Project"
# 3. Name: churn-saver-staging
# 4. Database Password: [secure password]
# 5. Region: [same as production region]
```

## Step 2: Configure Staging Whop App

```bash
# Create staging Whop app via dashboard:
# 1. Go to Whop Developer Dashboard
# 2. Click "Create App"
# 3. App Name: Churn Saver Staging
# 4. App URL: https://churn-saver-staging.vercel.app (or your staging domain)
# 5. Webhook URL: https://churn-saver-staging.vercel.app/api/webhooks/whop
# 6. Generate webhook secret for staging
```

## Step 3: Set Up Vercel Staging Deployment

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Login to Vercel
vercel login

# From the apps/web directory
cd apps/web

# Create staging deployment
vercel --prod=false

# Or link to existing project
vercel link
```

## Step 4: Configure Staging Environment Variables

Create `.env.staging` file or set variables in Vercel dashboard:

```bash
# Database
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres?sslmode=require

# Whop (Staging)
WHOP_APP_ID=your_staging_whop_app_id
WHOP_APP_SECRET=your_staging_whop_app_secret
WHOP_WEBHOOK_SECRET=your_staging_webhook_secret

# Encryption
ENCRYPTION_KEY=your_32_char_encryption_key

# Auth
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://churn-saver-staging.vercel.app

# Optional Configuration
COMPANY_ID=staging_company_id
ENABLE_PUSH=false
ENABLE_DM=false
INCENTIVE_DAYS=3
REMINDER_OFFSETS_DAYS=0,2,4
KPI_WINDOW_DAYS=14
LOG_LEVEL=debug
DATA_RETENTION_DAYS=30

# Staging-specific flags
NODE_ENV=production  # Required for webhook timestamp validation
STAGING=true
```

## Step 5: Deploy Application to Staging

```bash
# Deploy to staging
cd apps/web
vercel --prod=false

# Or deploy current branch
vercel
```

## Step 6: Initialize Staging Database

```bash
# Run database migrations
cd apps/web
npm run init-db

# Verify database setup
npm run db:health
```

## Step 7: Configure Cron Jobs (Optional)

For full staging testing, set up cron jobs:

```json
// vercel.json (staging)
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

## Step 8: Verify Staging Setup

```bash
# Test health endpoints
curl https://churn-saver-staging.vercel.app/api/health
curl https://churn-saver-staging.vercel.app/api/health/db

# Test webhook endpoint (should return 401 without signature)
curl -X POST https://churn-saver-staging.vercel.app/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Test scheduler status
curl https://churn-saver-staging.vercel.app/api/scheduler/reminders
```

## Step 9: Seed Test Data (Optional)

For comprehensive testing, seed the staging database with test data:

```sql
-- Insert test company
INSERT INTO creator_settings (company_id, reminder_offsets_days, incentive_days)
VALUES ('staging-company', '{0,2,4}', 3);

-- Insert test recovery case
INSERT INTO recovery_cases (company_id, membership_id, user_id, status, attempts)
VALUES ('staging-company', 'mem_test_123', 'user_test_456', 'open', 0);
```

## Staging Environment Checklist

- [ ] Supabase staging project created
- [ ] Whop staging app configured
- [ ] Vercel staging deployment active
- [ ] Environment variables configured
- [ ] Database migrations completed
- [ ] Health checks passing
- [ ] Webhook endpoint responding
- [ ] Scheduler operational
- [ ] Test data seeded (optional)
- [ ] Cron jobs configured (optional)

## Production Parity Verification

Ensure staging matches production configuration:

- [ ] Same database schema
- [ ] Same environment variable structure
- [ ] Same webhook security settings
- [ ] Same rate limiting configuration
- [ ] Same encryption settings
- [ ] Same cron job schedules
- [ ] Same domain SSL certificates

## Cleanup After Testing

After staging rehearsal completion:

```bash
# Remove staging deployment
vercel remove churn-saver-staging

# Delete Supabase staging project
supabase projects delete churn-saver-staging

# Remove Whop staging app
# Via Whop dashboard
```

## Troubleshooting

### Database Connection Issues
```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Test connection manually
psql "$DATABASE_URL" -c "SELECT version();"
```

### Webhook Signature Issues
```bash
# Verify webhook secret is set
vercel env ls | grep WHOP_WEBHOOK_SECRET

# Test signature generation
node -e "
const crypto = require('crypto');
const secret = process.env.WHOP_WEBHOOK_SECRET;
const body = 'test';
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log('Test signature:', sig);
"
```

### Deployment Issues
```bash
# Check Vercel deployment logs
vercel logs --app churn-saver-staging

# Check build logs
vercel builds --app churn-saver-staging
```

## Security Considerations

- Use separate credentials for staging
- Never use production secrets in staging
- Implement credential validation to prevent accidents
- Regular rotation of staging secrets
- Audit access to staging environments