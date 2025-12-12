# Vercel Staging Environment Variables

**Project**: `churnsaver-o3gl`  
**Deployment URL**: `churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app`  
**Settings URL**: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables

## Required Environment Variables

Add these in Vercel Dashboard → Project Settings → Environment Variables → "All Environments" (or Production/Preview as needed):

### Database (Supabase Staging)
```
DATABASE_URL=postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
```
**Note**: Replace `[PASSWORD]` with the database password from Supabase Dashboard → Project Settings → Database → Connection string

```
SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoamh2c3FvZ2Fvd25vcmtpZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ2OTEsImV4cCI6MjA4MTEyMDY5MX0.igz41zVKbd37Xpt_0l3UzRZNufFcMj6_xlNZAKe12aU
NEXT_PUBLIC_SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoamh2c3FvZ2Fvd25vcmtpZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ2OTEsImV4cCI6MjA4MTEyMDY5MX0.igz41zVKbd37Xpt_0l3UzRZNufFcMj6_xlNZAKe12aU
```
**Note**: Get `SUPABASE_SERVICE_ROLE_KEY` from Supabase Dashboard → Project Settings → API → service_role key

### Cron Configuration (Cron-only mode)
```
ENABLE_PG_BOSS=false
CRON_SECRET=a4pvVzJCTZqhVL+H+wtR/AVh66vJmz6CR6vMVnK0YRM=
```

### Security
```
ADMIN_API_TOKEN=1WP6U0i1zisJfIKubIbUy6w+PXhZAkL2nZoSrbt96nI=
ADMIN_IP_ALLOWLIST=
JWT_SECRET=b7Xe8HdLmXq9ewK/4Ip+mDhtK+1U02/SYOS1cWbrYT4=
ENCRYPTION_KEY=o1oxj+/YCBpgXV5wq2p4IBi6Qb12s08ZtsFo3JoGL38=
```

### Environment
```
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app
ALLOW_INSECURE_DEV=false
NEXT_PUBLIC_DEBUG_MODE=false
QA_DEMO_BYPASS=false
NEXT_PUBLIC_QA_DEMO_BYPASS=false
```

### Whop Configuration (Staging/Test values)
```
NEXT_PUBLIC_WHOP_APP_ID=[STAGING_APP_ID]
WHOP_APP_ID=[STAGING_APP_ID]
WHOP_API_KEY=[STAGING_API_KEY]
WHOP_WEBHOOK_SECRET=[STAGING_WEBHOOK_SECRET]
```
**Note**: Get these from Whop Developer Dashboard → Your App → Settings

### Webhook Configuration
```
WEBHOOK_TIMESTAMP_SKEW_SECONDS=300
```

## Setup Instructions

1. Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables
2. Click "Create new" tab
3. For each variable above:
   - Enter the Key (variable name)
   - Enter the Value
   - Select "All Environments" (or specific environment)
   - Mark as "Sensitive" for secrets (CRON_SECRET, ADMIN_API_TOKEN, JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL, WHOP_*)
   - Click "Save"
4. After adding all variables, trigger a new deployment:
   - Go to Deployments tab
   - Click "Redeploy" on the latest deployment
   - Or push a new commit to trigger automatic deployment

## Verify Cron Schedules

After deployment, verify cron schedules are active:
1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/crons
2. Verify these cron jobs exist:
   - `/api/cron/process-queue` - Schedule: `* * * * *` (every minute)
   - `/api/cron/reminders` - Schedule: `*/15 * * * *` (every 15 minutes)
   - `/api/cron/maintenance` - Schedule: `0 * * * *` (hourly)

If crons are not showing, they may need to be configured manually or will appear after the first deployment with `vercel.json` present.
