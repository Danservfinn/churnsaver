# Vercel Settings Verification Checklist

## Project: churnsaver-o3gl

### Required Manual Verification (Vercel Dashboard)

**URL**: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/build-and-deployment

#### 1. Root Directory
- [ ] Navigate to Settings → Build and Deployment
- [ ] Find "Root Directory" field
- [ ] **Verify or set to**: `apps/web`
- [ ] Click "Save" if changed

#### 2. Framework Detection
- [ ] Verify Framework is detected as "Next.js"
- [ ] If not, select "Next.js" from Framework Preset dropdown

#### 3. Build Settings (should auto-detect from `apps/web/vercel.json`)
- [ ] Install Command: `pnpm install`
- [ ] Build Command: `pnpm run build`
- [ ] Output Directory: `.next`

#### 4. Node.js Version
- [ ] Verify Node.js version is 20.x or 22.x (recommended: 20.x)

### After Settings Verification

Once Root Directory is confirmed as `apps/web`:
1. Proceed to set environment variables (see `VERCEL_STAGING_ENV_VARS.md`)
2. Trigger a new deployment
3. Verify deployment succeeds
4. Check that cron schedules appear in Settings → Cron Jobs

### Expected Cron Jobs (from `apps/web/vercel.json`)

After successful deployment with correct Root Directory, you should see:
- `/api/cron/process-queue` - Schedule: `* * * * *` (every minute)
- `/api/cron/reminders` - Schedule: `*/15 * * * *` (every 15 minutes)  
- `/api/cron/maintenance` - Schedule: `0 * * * *` (hourly)

If cron jobs don't appear, the Root Directory is likely incorrect or `vercel.json` isn't being read.

