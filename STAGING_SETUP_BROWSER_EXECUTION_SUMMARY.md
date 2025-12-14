# Staging Environment Setup - Browser Execution Summary

**Date**: December 12, 2025  
**Project**: `churnsaver-staging`  
**Status**: ✅ Environment structure complete, ⏳ 2 values need manual update

## ✅ Completed via Browser & Scripts

### 1. Vercel Project ✅
- **Project**: `churnsaver-staging`
- **Project ID**: `prj_8hhNQS4qFI6f8W2IuZXEzxbRamrr`
- **Root Directory**: `apps/web` ✅
- **GitHub Integration**: Connected ✅
- **Domain**: `https://churnsaver-staging.vercel.app`
- **Settings**: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings

### 2. Environment Variables ✅
**All variables configured** in Vercel (Production, Preview, Development):

✅ **Basic Environment:**
- `NODE_ENV=production`
- `NEXT_PUBLIC_APP_URL=https://churnsaver-staging.vercel.app`
- `ALLOW_INSECURE_DEV=false`
- `NEXT_PUBLIC_DEBUG_MODE=false`
- `QA_DEMO_BYPASS=false`
- `NEXT_PUBLIC_QA_DEMO_BYPASS=false`

✅ **Supabase Public Keys:**
- `SUPABASE_URL=https://zhjhvsqogaownorkidfu.supabase.co`
- `SUPABASE_ANON_KEY` (set)
- `NEXT_PUBLIC_SUPABASE_URL` (set)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (set)

✅ **Generated Secrets:**
- `CRON_SECRET` (secure random)
- `ADMIN_API_TOKEN` (secure random)
- `JWT_SECRET` (secure random)
- `ENCRYPTION_KEY` (secure random)
- `WHOP_WEBHOOK_SECRET` (secure random)

✅ **Whop Configuration:**
- `WHOP_APP_ID=app_oU8bWaXO`
- `NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXO`
- `WHOP_API_KEY` (set from production guide)

✅ **Other:**
- `ENABLE_PG_BOSS=false`
- `ADMIN_IP_ALLOWLIST=` (empty)
- `WEBHOOK_TIMESTAMP_SKEW_SECONDS=300`

⏳ **Need Manual Value Updates:**
- `SUPABASE_SERVICE_ROLE_KEY` - Variable exists, needs actual value from Supabase dashboard
- `DATABASE_URL` - Variable exists, needs actual value from Supabase dashboard

### 3. Database Verification ✅
- ✅ Supabase project `zhjhvsqogaownorkidfu` exists and is ACTIVE_HEALTHY
- ✅ Database host: `db.zhjhvsqogaownorkidfu.supabase.co`
- ✅ Tables verified: `events`, `creator_settings`, `recovery_cases`, `recovery_actions`
- ✅ RLS enabled on all tables

## 🔧 Manual Steps Required (Using Browser)

The following steps require manual interaction because Supabase intentionally hides sensitive credentials:

### Update SUPABASE_SERVICE_ROLE_KEY

**Current Status**: Variable exists in Vercel with placeholder value

**Steps:**
1. **Get the value:**
   - Navigate to: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api
   - Scroll to "Project API keys" section
   - Find "service_role" key (below "anon" key)
   - Click "Reveal" button
   - Copy the entire key

2. **Update in Vercel:**
   - Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
   - Find `SUPABASE_SERVICE_ROLE_KEY` in the list
   - Click the variable row or "Edit" button
   - Click "Click to reveal" to see current value
   - Replace placeholder with actual service_role key
   - Click "Save"

### Update DATABASE_URL

**Current Status**: Variable exists in Vercel with placeholder value

**Steps:**
1. **Get the value:**
   - Navigate to: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database
   - Scroll to "Connection string" section
   - Select:
     - Connection mode: **"Pooler"**
     - Connection pooling mode: **"Transaction"**
     - Port: **`6543`**
   - Click "Copy" to copy connection string
   - **Replace `[YOUR-PASSWORD]`** with your actual database password
   - If password unknown, click "Reset database password" first

2. **Update in Vercel:**
   - Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
   - Find `DATABASE_URL` in the list
   - Click the variable row or "Edit" button
   - Click "Click to reveal" to see current value
   - Replace placeholder with complete connection string (with password)
   - Click "Save"

## 📊 Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Vercel Project | ✅ Complete | Created and configured |
| Environment Variables | ⏳ 95% Complete | 2 values need manual update |
| Database Tables | ✅ Verified | All tables exist with RLS |
| Deployment | ⏳ Pending | Will trigger after variable updates |
| Cron Schedules | ⏳ Pending | Need to verify after deployment |

## 🎯 Next Actions

1. **Update the 2 environment variables** using the steps above
2. **Trigger a new deployment** (will happen automatically on next push, or manually redeploy)
3. **Verify deployment** completes successfully
4. **Test endpoints:**
   ```bash
   curl https://churnsaver-staging.vercel.app/api/health
   curl https://churnsaver-staging.vercel.app/api/health/db
   ```
5. **Verify cron schedules** in Vercel dashboard → Settings → Cron Jobs
6. **Run smoke tests** once deployment is live

## 📝 Quick Links

- **Vercel Environment Variables**: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
- **Supabase API Settings**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api
- **Supabase Database Settings**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database
- **Vercel Deployments**: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/deployments

## Summary

✅ **Completed**: Project creation, environment variable structure, database verification  
⏳ **In Progress**: Manual value updates for 2 sensitive credentials  
📋 **Pending**: Deployment verification, cron schedule verification, smoke tests

All programmatically configurable steps are complete. The remaining steps require manual interaction with the Supabase dashboard to retrieve sensitive credentials that cannot be accessed programmatically.

