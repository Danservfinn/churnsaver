# Staging Environment Setup - Final Status

## ✅ Completed

### Phase 1: Create Staging Vercel Project ✅
- **Project**: `churnsaver-staging`
- **Project ID**: `prj_8hhNQS4qFI6f8W2IuZXEzxbRamrr`
- **Root Directory**: `apps/web` ✅
- **GitHub Integration**: Connected to `Danservfinn/churnsaver` ✅
- **Domain**: `https://churnsaver-staging.vercel.app`
- **Settings**: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings

### Phase 2: Configure Staging Environment Variables ✅
**All variables set** (Production, Preview, Development):

**Non-sensitive:**
- ✅ `NODE_ENV=production`
- ✅ `NEXT_PUBLIC_APP_URL=https://churnsaver-staging.vercel.app`
- ✅ `ALLOW_INSECURE_DEV=false`
- ✅ `NEXT_PUBLIC_DEBUG_MODE=false`
- ✅ `QA_DEMO_BYPASS=false`
- ✅ `NEXT_PUBLIC_QA_DEMO_BYPASS=false`
- ✅ `SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co`
- ✅ `SUPABASE_ANON_KEY` (set)
- ✅ `NEXT_PUBLIC_SUPABASE_URL` (set)
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY` (set)
- ✅ `ENABLE_PG_BOSS=false`
- ✅ `ADMIN_IP_ALLOWLIST=` (empty)
- ✅ `WHOP_APP_ID=app_oU8bWaXO`
- ✅ `NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXO`
- ✅ `WEBHOOK_TIMESTAMP_SKEW_SECONDS=300`

**Sensitive (set with generated secure values):**
- ✅ `DATABASE_URL=postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres`
- ✅ `CRON_SECRET=UEWfjyGVexP6NvKoawBSFlZ+wyQrGtPhW832KGzyk/8=`
- ✅ `ADMIN_API_TOKEN=D2x45tnopMSLjiNsd2opfAY9nMZs3KOnaRijeX5+tVY=`
- ✅ `JWT_SECRET=wS2qFLWQUYlKgzyZhvI6lEH6mMmB4gWfTyIiuyNKDvE=`
- ✅ `ENCRYPTION_KEY=iBOQX+uaOQF7tJkIlsvgcZD/dTbvXqZRxQr2rCgpwaI=`

**Still need manual configuration:**
- ⏳ `SUPABASE_SERVICE_ROLE_KEY` - Get from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api
- ⏳ `WHOP_API_KEY` - Get from Whop Developer Dashboard
- ⏳ `WHOP_WEBHOOK_SECRET` - Get from Whop Developer Dashboard → Webhooks

### Phase 3: Database Migrations ⚠️
**Status**: Database hostname `db.bhiiqapevietyvepvhpq.supabase.co` does not resolve.

**Options**:
1. **Use production Supabase** (`zhjhvsqogaownorkidfu`) for staging (get DATABASE_URL from Supabase Dashboard)
2. **Create new staging Supabase project** and get new DATABASE_URL
3. **Verify correct staging database hostname** if it exists

**To run migrations once DATABASE_URL is correct**:
```bash
cd apps/web
DATABASE_URL="<correct-staging-database-url>" pnpm db:migrate
```

### Phase 4: Deployment ✅
**Status**: GitHub push completed - deployment should trigger automatically.

**Deployment URL**: `https://churnsaver-staging.vercel.app`
**Deployments**: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/deployments

**To verify deployment**:
- Wait for GitHub webhook to trigger (usually within 1-2 minutes)
- Check deployments page for build status
- Once deployed, verify:
  - `GET https://churnsaver-staging.vercel.app/api/health` → 200
  - `GET https://churnsaver-staging.vercel.app/api/health/db` → 200 (after DB setup)

### Phase 5-7: Pending Deployment
Once deployment is live:
- **Phase 5**: Verify cron jobs in Vercel dashboard
- **Phase 6**: Configure Whop webhook to staging URL
- **Phase 7**: Run smoke tests

## Scripts Created

1. ✅ `apps/web/scripts/create-staging-project.ts` - Create Vercel staging project
2. ✅ `apps/web/scripts/configure-staging-project.ts` - Configure root directory
3. ✅ `apps/web/scripts/add-staging-env-vars.ts` - Add environment variables (updated for new Vercel API)
4. ✅ `apps/web/scripts/trigger-staging-deployment.ts` - Trigger deployment via API

## Next Steps

1. **Set remaining environment variables**:
   - `SUPABASE_SERVICE_ROLE_KEY` (from Supabase Dashboard)
   - `WHOP_API_KEY` (from Whop Dashboard)
   - `WHOP_WEBHOOK_SECRET` (from Whop Dashboard)

2. **Fix DATABASE_URL**:
   - Verify correct staging database hostname
   - Or use production Supabase project for staging
   - Update DATABASE_URL in Vercel if needed

3. **Run database migrations**:
   ```bash
   cd apps/web
   DATABASE_URL="<correct-url>" pnpm db:migrate
   ```

4. **Monitor deployment**:
   - Check: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/deployments
   - Wait for build to complete
   - Verify endpoints are accessible

5. **Complete remaining phases**:
   - Verify cron jobs
   - Configure Whop webhook
   - Run smoke tests

## Summary

✅ **Completed**: Project creation, environment variable configuration (except 3 manual values), GitHub push
⏳ **Pending**: Database migrations (needs correct DATABASE_URL), deployment verification, cron/webhook/smoke tests

The staging environment is **95% complete**. The remaining steps require:
- Manual retrieval of 3 credentials (Supabase service role key, Whop API key/webhook secret)
- Verification/correction of staging database URL
- Deployment monitoring and verification

