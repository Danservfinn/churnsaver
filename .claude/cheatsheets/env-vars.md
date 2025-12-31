---
title: Environment Variables
link: env-vars
type: cheatsheet
created_at: 2025-12-31
uuid: a1b2c3d4-cheat-0002
tags: [config, env, secrets]
---

# Environment Variables

## Required Variables

### Whop Integration

```bash
# Whop OAuth
WHOP_APP_ID=app_xxx
WHOP_API_KEY=xxx
WHOP_CLIENT_ID=xxx
WHOP_CLIENT_SECRET=xxx
WHOP_WEBHOOK_SECRET=xxx

# Public (client-side)
NEXT_PUBLIC_WHOP_APP_ID=app_xxx
```

### Supabase

```bash
# Database
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Connection
DATABASE_URL=postgres://...
```

### Application

```bash
# Base URL
NEXT_PUBLIC_APP_URL=https://app.churnsaver.com

# Environment
NODE_ENV=production
VERCEL_ENV=production
```

## Optional Variables

### Development

```bash
# QA Demo bypass (dev only)
QA_DEMO_BYPASS=true
NEXT_PUBLIC_QA_DEMO_BYPASS=true
QA_DEMO_COMPANY_ID=demo-company
QA_DEMO_USER_ID=demo-user
```

### Monitoring

```bash
# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx

# Logging
LOG_LEVEL=info
```

### Rate Limiting

```bash
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Environment Files

```
.env.local           # Local development (gitignored)
.env.development     # Development defaults
.env.production      # Production defaults
.env.test            # Test environment
```

## Vercel Setup

```bash
# Pull env vars from Vercel
vercel env pull .env.local

# Add new env var
vercel env add VARIABLE_NAME

# List env vars
vercel env ls
```

## Security Notes

- Never commit `.env.local`
- Use Vercel dashboard for production secrets
- Rotate `WHOP_WEBHOOK_SECRET` if compromised
- Service role key has full DB access
