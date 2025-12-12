# Manual Configuration Progress Report

## ✅ Completed via Browser Automation

### Vercel Environment Variables
- ✅ `NODE_ENV=production` - Added successfully
- ✅ `NEXT_PUBLIC_APP_URL=https://churnsaver-o3gl.vercel.app` - Added successfully

**Status**: 2 of ~20 variables added via browser automation

## 🚀 Recommended Approach: Use Vercel API Script

I've created an automated script that can add all remaining variables at once using the Vercel API.

### Option 1: Use the Automated Script (Fastest)

**Prerequisites**:
1. Get Vercel API token:
   - Go to: https://vercel.com/account/tokens
   - Click "Create Token"
   - Name: "churnsaver-staging-setup"
   - Scope: Select "Danny's project" (or Full Account)
   - Copy the token

2. Get missing credentials:
   - **Supabase Service Role Key**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api → Click "Reveal" next to `service_role` key
   - **Database Password**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database → Copy from connection string (or reset if needed)
   - **Whop API Key**: https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/ → Your App → Settings → API Key
   - **Whop Webhook Secret**: Generate with `openssl rand -base64 32`

3. Run the script:
```bash
cd apps/web

# Set required environment variables
export VERCEL_TOKEN="your_vercel_token_here"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
export DATABASE_URL="postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
export WHOP_API_KEY="your_whop_api_key"
export WHOP_WEBHOOK_SECRET="your_generated_webhook_secret"

# Run the script
pnpm tsx scripts/add-vercel-env-vars.ts
```

The script will:
- Add all 20+ environment variables
- Set appropriate environments (production/preview/development)
- Mark sensitive variables correctly
- Skip variables that already exist

### Option 2: Continue Browser Automation

If you prefer to continue via browser:
1. Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables
2. Use the content from `vercel-env-import.txt` as reference
3. Add each variable manually (18+ remaining)

### Option 3: Bulk Import via Vercel UI

1. Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables
2. Click "Import .env" button
3. Paste the content from `vercel-env-import.txt`
4. Replace placeholders:
   - `REPLACE_WITH_SERVICE_ROLE_KEY` → Get from Supabase API settings
   - `REPLACE_WITH_PASSWORD` in DATABASE_URL → Get from Supabase database settings
   - `REPLACE_WITH_WHOP_API_KEY` → Get from Whop dashboard
   - `REPLACE_WITH_WHOP_WEBHOOK_SECRET` → Generate with `openssl rand -base64 32`
5. Mark sensitive variables as "Sensitive"
6. Click "Save"

## 📋 Variables Still Needed

### Already Have Values (can be added via script/UI):
- `ALLOW_INSECURE_DEV=false`
- `NEXT_PUBLIC_DEBUG_MODE=false`
- `QA_DEMO_BYPASS=false`
- `NEXT_PUBLIC_QA_DEMO_BYPASS=false`
- `SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co`
- `SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (already have)
- `NEXT_PUBLIC_SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (already have)
- `ENABLE_PG_BOSS=false`
- `CRON_SECRET=a4pvVzJCTZqhVL+H+wtR/AVh66vJmz6CR6vMVnK0YRM=`
- `ADMIN_API_TOKEN=1WP6U0i1zisJfIKubIbUy6w+PXhZAkL2nZoSrbt96nI=`
- `ADMIN_IP_ALLOWLIST=` (empty)
- `JWT_SECRET=b7Xe8HdLmXq9ewK/4Ip+mDhtK+1U02/SYOS1cWbrYT4=`
- `ENCRYPTION_KEY=o1oxj+/YCBpgXV5wq2p4IBi6Qb12s08ZtsFo3JoGL38=`
- `NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXO`
- `WHOP_APP_ID=app_oU8bWaXO`
- `WEBHOOK_TIMESTAMP_SKEW_SECONDS=300`

### Need Manual Retrieval:
- ⚠️ `SUPABASE_SERVICE_ROLE_KEY` - Get from Supabase Dashboard → Settings → API
- ⚠️ `DATABASE_URL` - Get pooler connection string from Supabase Dashboard → Settings → Database (replace `[PASSWORD]`)
- ⚠️ `WHOP_API_KEY` - Get from Whop Developer Dashboard → Your App → Settings
- ⚠️ `WHOP_WEBHOOK_SECRET` - Generate: `openssl rand -base64 32` (save this - you'll need it for Whop webhook config too)

## Next Steps After Variables Added

1. **Trigger New Deployment**:
   - Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/deployments
   - Click "Redeploy" on latest deployment

2. **Verify Cron Jobs**:
   - Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/crons
   - Should see 3 cron jobs from `apps/web/vercel.json`

3. **Run Smoke Tests**:
   ```bash
   cd apps/web
   STAGING_URL="https://churnsaver-o3gl.vercel.app" \
   CRON_SECRET="a4pvVzJCTZqhVL+H+wtR/AVh66vJmz6CR6vMVnK0YRM=" \
   bash scripts/staging-smoke-tests.sh
   ```

4. **Configure Whop Webhook**:
   - See `WHOP_PORTAL_CONFIG.md` for detailed steps

## Files Created

- ✅ `apps/web/scripts/add-vercel-env-vars.ts` - Automated script to add all variables via Vercel API
- ✅ `vercel-env-import.txt` - Bulk import content for Vercel UI
- ✅ `VERCEL_ENV_CONFIGURATION_STATUS.md` - Status tracking
- ✅ `MANUAL_CONFIGURATION_PROGRESS.md` - This file
