# Production Deployment Guide

This guide covers deploying Churn Saver to Vercel with Supabase.

## Prerequisites

- Vercel account
- Supabase account
- Whop developer account with app configured

## Step 1: Supabase Setup

### Create Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and keys from Settings > API

### Run Schema

In the Supabase SQL Editor, run the schema from `apps/web/supabase/schema.sql`:

```sql
-- Events table (webhook idempotency)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whop_event_id TEXT UNIQUE,
  type TEXT NOT NULL,
  company_id TEXT,
  membership_id TEXT,
  user_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recovery cases
CREATE TABLE IF NOT EXISTS recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  membership_id TEXT,
  user_id TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'recovered', 'closed_no_recovery')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  recovered_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_nudge_at TIMESTAMPTZ,
  nudge_count INT DEFAULT 0
);

-- Creator settings
CREATE TABLE IF NOT EXISTS creator_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT UNIQUE NOT NULL,
  incentive_enabled BOOLEAN DEFAULT false,
  incentive_type TEXT,
  incentive_value DECIMAL(10,2),
  push_enabled BOOLEAN DEFAULT true,
  dm_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_whop_event_id ON events(whop_event_id);
CREATE INDEX IF NOT EXISTS idx_events_company_id ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_company_id ON recovery_cases(company_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_status ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_opened_at ON recovery_cases(opened_at);
```

## Step 2: Vercel Setup

### Import Project

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" > "Project"
3. Import your GitHub repository
4. Set the root directory to `apps/web`

### Configure Environment Variables

In Vercel project settings, add these environment variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Whop
WHOP_API_KEY=your-whop-api-key
WHOP_WEBHOOK_SECRET=your-webhook-secret
NEXT_PUBLIC_WHOP_APP_ID=your-app-id
WHOP_APP_ID=your-app-id

# Security
JWT_SECRET=your-jwt-secret-min-32-chars
ENCRYPTION_KEY=your-encryption-key-32-chars
CRON_SECRET=your-cron-secret

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=production
```

### Deploy

1. Push to main branch, or
2. Click "Deploy" in Vercel dashboard

## Step 3: Whop Configuration

### Webhook Setup

1. Go to Whop Developer Dashboard
2. Navigate to your app > Webhooks
3. Add webhook URL: `https://your-app.vercel.app/api/lean/webhooks/whop`
4. Select events:
   - `membership_went_invalid`
   - `membership_went_valid`
5. Copy the webhook secret to your Vercel environment variables

### App URL

Update your Whop app settings:
- App URL: `https://your-app.vercel.app`

## Step 4: Verify Deployment

### Health Check

```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### Test Webhook

In Whop Developer Dashboard:
1. Go to Webhooks
2. Click "Send Test" for `membership_went_invalid`
3. Check Vercel function logs for success

## Cron Jobs

Cron jobs are defined in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

The reminder cron runs every 15 minutes to send follow-up notifications.

## Monitoring

### Vercel Dashboard

- **Deployments**: Build logs, deployment status
- **Analytics**: Request metrics, error rates
- **Logs**: Real-time function logs

### Supabase Dashboard

- **Table Editor**: View/edit data
- **SQL Editor**: Run queries
- **Logs**: Database query logs

## Troubleshooting

### Webhook Not Received

1. Check Vercel function logs for errors
2. Verify webhook secret matches
3. Ensure webhook URL is correct in Whop dashboard

### Database Connection Issues

1. Verify Supabase URL and keys are correct
2. Check Supabase dashboard for connection limits
3. Use connection pooler URL for high traffic

### Cron Not Running

1. Verify `vercel.json` cron configuration
2. Check Vercel dashboard > Cron Jobs
3. Verify CRON_SECRET environment variable

## Rollback

To rollback to a previous deployment:

1. Go to Vercel dashboard > Deployments
2. Find the previous working deployment
3. Click "..." > "Promote to Production"

## Security Checklist

- [ ] All environment variables set in Vercel
- [ ] WHOP_WEBHOOK_SECRET is unique and secure
- [ ] CRON_SECRET is set and verified in cron routes
- [ ] JWT_SECRET is at least 32 characters
- [ ] Production domain added to Whop app settings
