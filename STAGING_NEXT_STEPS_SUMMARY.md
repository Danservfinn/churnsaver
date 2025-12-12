# Staging Next Steps - Implementation Summary

## ✅ Completed (Automated/Programmatic)

### 1. Documentation Created
- ✅ `VERCEL_SETTINGS_VERIFICATION.md` - Step-by-step guide to verify Root Directory and build settings
- ✅ `ENV_VAR_SETUP_STEPS.md` - Detailed instructions for adding all environment variables in Vercel
- ✅ `SUPABASE_MIGRATION_GUIDE.md` - Guide for applying remaining migrations (29+ migrations pending)
- ✅ `STAGING_NEXT_STEPS_SUMMARY.md` - This summary document

### 2. Smoke Test Script Ready
- ✅ `apps/web/scripts/staging-smoke-tests.sh` - Automated smoke test script
- Default staging URL: `https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app`
- Tests: health, db health, cron auth, webhook validation

### 3. Code Verification
- ✅ Verified `apps/web/vercel.json` contains correct cron schedules
- ✅ Verified migration script (`apps/web/scripts/init-db.ts`) is ready
- ✅ Verified Supabase staging project exists (`zhjhvsqogaownorkidfu`)
- ✅ Verified only 3 migrations applied (001, 001_complete, 002) - 29+ remaining

## ⏳ Remaining Manual Steps

### Step 1: Verify Vercel Root Directory
**Action Required**: Manual verification in Vercel Dashboard
- Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/build-and-deployment
- Verify "Root Directory" is set to `apps/web`
- If not, set it and click "Save"
- **Reference**: `VERCEL_SETTINGS_VERIFICATION.md`

### Step 2: Set Vercel Environment Variables
**Action Required**: Manual entry in Vercel Dashboard
- Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables
- Add all variables listed in `ENV_VAR_SETUP_STEPS.md`
- **Critical variables**:
  - `DATABASE_URL` (Supabase pooler, port 6543)
  - `SUPABASE_SERVICE_ROLE_KEY` (get from Supabase dashboard)
  - `CRON_SECRET` (already generated: `<REDACTED>`)
  - `WHOP_APP_ID`, `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` (get from Whop dashboard)
- **Reference**: `ENV_VAR_SETUP_STEPS.md` for complete list

### Step 3: Apply Supabase Migrations
**Action Required**: Run migration script or manual SQL
- Get Supabase **direct** connection string (port 5432, NOT pooler)
- Set `DATABASE_URL` environment variable
- Run: `cd apps/web && pnpm db:migrate`
- **Reference**: `SUPABASE_MIGRATION_GUIDE.md`

### Step 4: Redeploy Vercel Project
**Action Required**: Trigger new deployment
- After setting environment variables, go to Deployments tab
- Click "Redeploy" on latest deployment
- Wait for deployment to complete
- Verify deployment succeeds

### Step 5: Verify Canonical Domain
**Action Required**: Check Vercel Domains page
- Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/domains
- Note the **Production** domain (should be `churnsaver-o3gl.vercel.app` or similar)
- Update `NEXT_PUBLIC_APP_URL` if it differs from what you set
- Use this domain for all smoke tests and webhook URLs

### Step 6: Verify Cron Jobs
**Action Required**: Check Vercel Cron Jobs page
- Navigate to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/crons
- Verify these cron jobs exist:
  - `/api/cron/process-queue` - `* * * * *`
  - `/api/cron/reminders` - `*/15 * * * *`
  - `/api/cron/maintenance` - `0 * * * *`
- If crons don't appear, verify Root Directory is `apps/web` and redeploy

### Step 7: Run Staging Smoke Tests
**Action Required**: Execute smoke test script
```bash
cd apps/web
STAGING_URL="https://[CANONICAL_DOMAIN]" \
CRON_SECRET=<REDACTED> \
bash scripts/staging-smoke-tests.sh
```

**Expected Results**:
- ✅ `/api/health` returns 200
- ✅ `/api/health/db` returns 200 (after DATABASE_URL configured)
- ✅ `/api/cron/process-queue` requires auth (401 without token)
- ✅ `/api/cron/process-queue` accessible with CRON_SECRET (200/202)
- ✅ `/api/webhooks/whop` validates requests (401/400 without signature)

### Step 8: Configure Whop Webhook
**Action Required**: Manual configuration in Whop Dashboard
- Navigate to: https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/
- Select app: "Churn Saver [st]" (ID: `app_oU8bWaXO`)
- Create/update webhook:
  - URL: `https://[CANONICAL_DOMAIN]/api/webhooks/whop`
  - Secret: Must match `WHOP_WEBHOOK_SECRET` in Vercel
  - Events: `membership.payment_failed`, `membership.payment_succeeded`, `membership.cancelled`, etc.
- **Reference**: `WHOP_PORTAL_CONFIG.md`

### Step 9: Test Webhook End-to-End
**Action Required**: Send test webhook and verify processing
- Use Whop's test webhook feature (if available) or curl
- Verify:
  - Webhook accepted (signature validation)
  - Event stored in Supabase `events` table
  - Cron job processes event (`/api/cron/process-queue`)
  - Recovery case created in `recovery_cases` table

### Step 10: Complete Go/No-Go Checklist
**Action Required**: Verify all launch readiness criteria
- **Reference**: `GO_NO_GO_CHECKLIST.md`
- Verify:
  - ✅ CI green
  - ⏳ Staging health/db health green
  - ⏳ Cron schedules active
  - ⏳ Webhook ingest + drain works end-to-end
  - ✅ QA demo bypass disabled (enforced by code)

## Quick Reference Links

- **Vercel Project**: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl
- **Supabase Project**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu
- **Whop Developer Dashboard**: https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/

## Key Credentials (Generated)

**CRON_SECRET**: `<REDACTED>`  
**ADMIN_API_TOKEN**: `<REDACTED>`  
**JWT_SECRET**: `<REDACTED>`  
**ENCRYPTION_KEY**: `<REDACTED>`

**Note**: These are staging secrets. Generate new ones for production.

## Next Phase After Staging Complete

Once staging is fully configured and tested:
1. Create production Supabase project
2. Create production Vercel project
3. Configure production environment variables
4. Apply production migrations
5. Configure Whop production webhook
6. Run production smoke tests
7. Submit to Whop App Store (if applicable)
