# Queue Worker Deployment Guide

## Overview

The queue worker is a dedicated long-lived process that processes pg-boss jobs (webhook processing and reminders). It should **NOT** be run in serverless environments (Vercel, AWS Lambda, etc.) as it requires persistent connections.

## Prerequisites

- Node.js 18+ installed
- Access to production database (`DATABASE_URL`)
- Environment variables configured (see below)

## Environment Variables

Required environment variables for the worker:

```bash
# Database connection (use direct connection, not pooler for long-lived connections)
DATABASE_URL=postgresql://user:password@host:port/database

# Enable pg-boss and worker mode
ENABLE_PG_BOSS=true
ENABLE_PG_BOSS_WORKER=true

# Whop/Supabase credentials (if needed for processing)
WHOP_API_KEY=your_api_key
WHOP_APP_SECRET=your_app_secret
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Optional: Logging
LOG_LEVEL=info
LOG_DRAIN_URL=your_log_drain_url  # Optional
```

## Deployment Options

### Option 1: Fly.io (Recommended for Pilot)

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`

2. Create `fly.toml` in `apps/web`:
```toml
app = "churnsaver-queue-worker"
primary_region = "iad"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  ENABLE_PG_BOSS = "true"
  ENABLE_PG_BOSS_WORKER = "true"
  NODE_ENV = "production"

[[services]]
  internal_port = 8080
  protocol = "tcp"
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true
```

3. Deploy:
```bash
cd apps/web
fly launch --no-deploy
fly secrets set DATABASE_URL="your_database_url" \
  WHOP_API_KEY="your_key" \
  # ... other secrets
fly deploy
```

**Cost**: ~$5-10/month for shared CPU VM

### Option 2: Render Background Worker

1. Go to Render dashboard → New → Background Worker

2. Configure:
   - **Name**: `churnsaver-queue-worker`
   - **Environment**: `Node`
   - **Build Command**: `cd apps/web && pnpm install && pnpm build`
   - **Start Command**: `cd apps/web && pnpm worker`
   - **Environment Variables**: Set all required vars

3. Deploy

**Cost**: ~$7-15/month for starter plan

### Option 3: Railway

1. Create new project → Add service → GitHub repo

2. Configure:
   - **Root Directory**: `apps/web`
   - **Start Command**: `pnpm worker`
   - **Environment Variables**: Set all required vars

3. Deploy

**Cost**: ~$5-20/month depending on usage

## Verification

After deployment, verify the worker is running:

1. Check worker logs for: `"Queue worker started successfully and is processing jobs"`

2. Monitor job processing:
   - Check database `pgboss.job` table for job status
   - Verify webhook events are being processed
   - Check reminder jobs are being scheduled

## Monitoring

- **Health**: Worker logs should show periodic job processing
- **Errors**: Monitor logs for `"Webhook job failed"` or `"Reminder job failed"`
- **Queue Depth**: Query `pgboss.job` table to check backlog

## Troubleshooting

**Worker not processing jobs:**
- Verify `ENABLE_PG_BOSS_WORKER=true` is set
- Check database connectivity
- Verify pg-boss schema is initialized (run migrations)

**High memory usage:**
- Reduce `maxConcurrentJobs` in job queue config
- Check for memory leaks in job processors

**Jobs stuck:**
- Check database locks: `SELECT * FROM pgboss.job WHERE state = 'active' AND started_on < NOW() - INTERVAL '1 hour';`
- Manually cancel stuck jobs if needed

## Disabling Vercel Cron

**IMPORTANT**: After deploying the worker, disable the expensive Vercel cron job:

1. Go to Vercel project settings → Cron Jobs
2. Remove or disable `/api/cron/process-queue` if it exists
3. Verify it's not in `vercel.json` crons array

This saves ~$70-200/month in compute costs.

