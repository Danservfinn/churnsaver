# Vercel Environment Variables Setup - Status

## ✅ Successfully Added (via Script)

The automation script successfully added most environment variables. Here's what was completed:

### Already Configured (from earlier browser automation + script):
- ✅ `NODE_ENV=production` (all environments)
- ✅ `NEXT_PUBLIC_APP_URL=https://churnsaver-o3gl.vercel.app` (all environments)
- ✅ `ALLOW_INSECURE_DEV=false` (all environments)
- ✅ `NEXT_PUBLIC_DEBUG_MODE=false` (all environments)
- ✅ `QA_DEMO_BYPASS=false` (all environments)
- ✅ `NEXT_PUBLIC_QA_DEMO_BYPASS=false` (all environments)
- ✅ `SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co` (all environments)
- ✅ `SUPABASE_ANON_KEY=...` (all environments)
- ✅ `NEXT_PUBLIC_SUPABASE_URL=...` (all environments)
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY=...` (all environments)
- ✅ `ENABLE_PG_BOSS=false` (all environments)

### Generated Secrets:
- ✅ `WHOP_WEBHOOK_SECRET=<REDACTED>` (generated, needs to be added)

## ⚠️ Still Need Manual Addition

Due to rate limiting and placeholder values, these need to be added manually:

### Critical Secrets (Need Actual Values):
1. **`CRON_SECRET`** - Value: `<REDACTED>`
2. **`ADMIN_API_TOKEN`** - Value: `<REDACTED>`
3. **`JWT_SECRET`** - Value: `<REDACTED>`
4. **`ENCRYPTION_KEY`** - Value: `<REDACTED>`
5. **`WHOP_WEBHOOK_SECRET`** - Value: `<REDACTED>`

### Need Credentials to Retrieve:
6. **`SUPABASE_SERVICE_ROLE_KEY`** - Get from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api → Click "Reveal" next to `service_role` key
7. **`DATABASE_URL`** - Get from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database → Copy connection string (pooler, port 6543)
8. **`WHOP_API_KEY`** - Get from: Whop Developer Dashboard → Your App → Settings → API Key

### Other Variables:
9. **`ADMIN_IP_ALLOWLIST`** - Can be empty: `""`
10. **`NEXT_PUBLIC_WHOP_APP_ID`** - Value: `app_oU8bWaXO`
11. **`WHOP_APP_ID`** - Value: `app_oU8bWaXO`
12. **`WEBHOOK_TIMESTAMP_SKEW_SECONDS`** - Value: `300`

## Quick Add via Vercel CLI

You can add the remaining variables using Vercel CLI:

```bash
cd apps/web

# Add secrets (mark as sensitive)
vercel env add CRON_SECRET production preview development --sensitive
# Paste: <REDACTED>

vercel env add ADMIN_API_TOKEN production preview development --sensitive
# Paste: <REDACTED>

vercel env add JWT_SECRET production preview development --sensitive
# Paste: <REDACTED>

vercel env add ENCRYPTION_KEY production preview development --sensitive
# Paste: <REDACTED>

vercel env add WHOP_WEBHOOK_SECRET production preview development --sensitive
# Paste: <REDACTED>

# Add non-sensitive variables
vercel env add ADMIN_IP_ALLOWLIST production preview development
# Paste: (empty, just press Enter)

vercel env add NEXT_PUBLIC_WHOP_APP_ID production preview development
# Paste: app_oU8bWaXO

vercel env add WHOP_APP_ID production preview development
# Paste: app_oU8bWaXO

vercel env add WEBHOOK_TIMESTAMP_SKEW_SECONDS production preview development
# Paste: 300

# Add secrets that need credentials (get values first)
vercel env add SUPABASE_SERVICE_ROLE_KEY production preview development --sensitive
# Paste: [get from Supabase dashboard]

vercel env add DATABASE_URL production preview development --sensitive
# Paste: [get from Supabase dashboard]

vercel env add WHOP_API_KEY production preview development --sensitive
# Paste: [get from Whop dashboard]
```

## Next Steps

1. Add remaining variables using Vercel CLI commands above
2. Trigger a new deployment: `vercel --prod` or via dashboard
3. Verify cron schedules: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/crons
4. Run smoke tests: `bash apps/web/scripts/staging-smoke-tests.sh`
