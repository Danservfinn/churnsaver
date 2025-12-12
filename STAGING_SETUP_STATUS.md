# Staging Environment Setup Status

## ✅ Completed

### Supabase Staging
- **Project**: `churnsaver-staging`
- **Project ID**: `zhjhvsqogaownorkidfu`
- **URL**: `https://zhjhvsqogaownorkidfu.supabase.co`
- **Status**: Created, core migrations applied (001, 002)
- **RLS**: Enabled on all tables
- **Remaining**: Apply remaining 30+ migrations (can use `pnpm db:migrate` with DATABASE_URL)

### Vercel Staging
- **Project**: `churnsaver-o3gl`
- **Deployment URL**: `churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app` (may need verification)
- **Status**: Project created and initial deployment triggered
- **Root Directory**: `apps/web` (needs verification)
- **Remaining**: 
  - Set environment variables (see `VERCEL_STAGING_ENV_VARS.md`)
  - Verify deployment completes successfully
  - Verify cron schedules are active

## 🔄 Next Steps

1. **Set Vercel Environment Variables**:
   - Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables
   - Add all variables from `VERCEL_STAGING_ENV_VARS.md`
   - Get Supabase database password from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database
   - Get Supabase service role key from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api

2. **Complete Supabase Migrations**:
   ```bash
   export DATABASE_URL="postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
   cd apps/web
   pnpm db:migrate
   ```

3. **Trigger New Vercel Deployment**:
   - After setting environment variables, trigger a redeploy
   - Or push a commit to trigger automatic deployment

4. **Run Smoke Tests**:
   ```bash
   cd apps/web
   STAGING_URL="https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app" \
   CRON_SECRET="a4pvVzJCTZqhVL+H+wtR/AVh66vJmz6CR6vMVnK0YRM=" \
   bash scripts/staging-smoke-tests.sh
   ```

5. **Verify Cron Schedules**:
   - Check: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/crons
   - Should see:
     - `/api/cron/process-queue` - `* * * * *`
     - `/api/cron/reminders` - `*/15 * * * *`
     - `/api/cron/maintenance` - `0 * * * *`
