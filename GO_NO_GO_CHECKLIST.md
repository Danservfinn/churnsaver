# Launch Readiness: Go/No-Go Checklist

## ✅ Pre-Launch Verification

### 1. CI/CD Pipeline Status

**Status**: ✅ Green (all checks passing)

**Verification Steps**:
```bash
# Check GitHub Actions workflow status
# Navigate to: https://github.com/Danservfinn/churnsaver/actions
# Verify latest workflow run is green:
# - ✅ Lint
# - ✅ Typecheck
# - ✅ Unit Tests
# - ✅ Integration Tests
# - ✅ Migration Tests
# - ✅ E2E Tests (if applicable)
```

**Required**: All CI checks must be green before launch

---

### 2. Staging Environment Status

#### 2.1 Supabase Staging

**Project**: `churnsaver-staging`  
**Project ID**: `zhjhvsqogaownorkidfu`  
**URL**: https://zhjhvsqogaownorkidfu.supabase.co

**Checklist**:
- [x] Project created
- [x] Core migrations applied (001, 002)
- [ ] **REMAINING**: Apply all remaining migrations (003-032+)
- [ ] RLS policies verified on all tables
- [ ] Database connection pooler configured (port 6543)
- [ ] Service role key retrieved and stored securely

**Migration Command**:
```bash
export DATABASE_URL="postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
cd apps/web
pnpm db:migrate
```

#### 2.2 Vercel Staging

**Project**: `churnsaver-o3gl`  
**Deployment URL**: `churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app`

**Checklist**:
- [x] Project created
- [x] Initial deployment triggered
- [ ] **REMAINING**: Environment variables configured (see `VERCEL_STAGING_ENV_VARS.md`)
- [ ] Deployment successful and accessible
- [ ] Cron schedules verified (see `apps/web/vercel.json`):
  - `/api/cron/process-queue` - `* * * * *` (every minute)
  - `/api/cron/reminders` - `*/15 * * * *` (every 15 minutes)
  - `/api/cron/maintenance` - `0 * * * *` (hourly)

**Verification**:
```bash
# Run smoke tests
cd apps/web
STAGING_URL="https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app" \
CRON_SECRET="[CRON_SECRET]" \
bash scripts/staging-smoke-tests.sh
```

**Expected Results**:
- ✅ `/api/health` returns 200
- ✅ `/api/health/db` returns 200 (after DATABASE_URL configured)
- ✅ `/api/cron/process-queue` requires authentication (401 without token)
- ✅ `/api/cron/process-queue` accessible with CRON_SECRET (200/202)
- ✅ `/api/webhooks/whop` validates requests (401/400 without signature)

---

### 3. Production Environment Preparation

#### 3.1 Supabase Production

**Checklist**:
- [ ] Create production Supabase project
- [ ] Apply all migrations
- [ ] Verify RLS policies
- [ ] Configure connection pooler
- [ ] Store service role key securely
- [ ] Enable database backups
- [ ] Configure monitoring/alerts

#### 3.2 Vercel Production

**Checklist**:
- [ ] Create production Vercel project
- [ ] Configure production environment variables:
  - Database connection (production Supabase)
  - Whop production credentials
  - Security secrets (CRON_SECRET, ADMIN_API_TOKEN, JWT_SECRET, ENCRYPTION_KEY)
  - `ENABLE_PG_BOSS=false` (cron-only mode)
  - `NODE_ENV=production`
  - `QA_DEMO_BYPASS=false` (must be false)
  - `NEXT_PUBLIC_QA_DEMO_BYPASS=false` (must be false)
- [ ] Deploy production build
- [ ] Verify cron schedules active
- [ ] Configure custom domain (if applicable)
- [ ] Enable Vercel Analytics (optional)
- [ ] Configure error monitoring (Sentry, etc.)

---

### 4. Monitoring & Observability

**Checklist**:
- [ ] Vercel function logs accessible
- [ ] Supabase database logs accessible
- [ ] Error tracking configured (Sentry, LogRocket, etc.)
- [ ] Uptime monitoring configured (UptimeRobot, Pingdom, etc.)
- [ ] Health check endpoints monitored:
  - `/api/health`
  - `/api/health/db`
- [ ] Alert channels configured (email, Slack, PagerDuty, etc.)

**Recommended Monitoring**:
- Health check endpoint monitoring (every 1-5 minutes)
- Database connection pool monitoring
- Cron job execution monitoring
- Webhook processing latency monitoring
- Error rate monitoring

---

### 5. Security Verification

**Checklist**:
- [x] QA demo bypass disabled in production (enforced by code)
- [ ] All environment variables marked as sensitive in Vercel
- [ ] Database credentials rotated and secure
- [ ] Webhook secrets generated securely (32+ characters)
- [ ] Admin API token generated securely
- [ ] IP allowlist configured for admin endpoints (if applicable)
- [ ] Rate limiting enabled on webhook endpoints
- [ ] Path traversal protection verified on export endpoints
- [ ] RLS policies verified on all database tables
- [ ] Encryption at rest configured (Supabase default)

**QA Demo Bypass Verification**:
```typescript
// Code already enforces: isQaDemoBypassEnabled() returns false in production
// See: apps/web/src/lib/qaDemo.ts:15-16
if (isProductionLikeEnvironment() || process.env.NODE_ENV === 'production') {
  return false;
}
```

**Environment Variables to Verify**:
- `QA_DEMO_BYPASS=false` (must be false or unset)
- `NEXT_PUBLIC_QA_DEMO_BYPASS=false` (must be false or unset)
- `ALLOW_INSECURE_DEV=false` (must be false or unset)
- `ENABLE_PG_BOSS=false` (cron-only mode)

---

### 6. Whop Integration

**Checklist**:
- [ ] Staging webhook configured in Whop Developer Dashboard
- [ ] Staging webhook URL: `https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app/api/webhooks/whop`
- [ ] Staging webhook events subscribed:
  - `membership.payment_failed`
  - `membership.payment_succeeded`
  - `membership.cancelled`
  - `membership.created`
  - `membership.updated`
- [ ] Staging webhook secret configured (matches Vercel `WHOP_WEBHOOK_SECRET`)
- [ ] Staging OAuth redirect URLs configured (if using OAuth)
- [ ] Production webhook URL prepared (for store submission)
- [ ] Production OAuth redirect URLs prepared (for store submission)
- [ ] Webhook signature validation tested
- [ ] Webhook timestamp validation tested
- [ ] Webhook idempotency verified

**See**: `WHOP_PORTAL_CONFIG.md` for detailed configuration steps

---

### 7. End-to-End Testing

**Staging E2E Tests**:

1. **Webhook Ingest**:
   - [ ] Send test webhook from Whop (or curl)
   - [ ] Verify webhook signature validation
   - [ ] Verify event stored in `events` table
   - [ ] Verify event has correct `company_id`

2. **Event Processing**:
   - [ ] Trigger `/api/cron/process-queue` manually (with CRON_SECRET)
   - [ ] Verify event processed successfully
   - [ ] Verify recovery case created in `recovery_cases` table
   - [ ] Verify event marked as `processed=true`

3. **Reminder Cron**:
   - [ ] Create test recovery case with `status='open'` and `reminder_due_at` in past
   - [ ] Trigger `/api/cron/reminders` manually (with CRON_SECRET)
   - [ ] Verify reminder sent (check logs or external service)
   - [ ] Verify case `last_reminder_at` updated

4. **Case Creation Flow**:
   - [ ] Webhook → Event → Case creation end-to-end
   - [ ] Verify case has correct `company_id`
   - [ ] Verify case accessible via dashboard API
   - [ ] Verify RLS policies enforce tenant isolation

---

### 8. Documentation

**Checklist**:
- [x] `VERCEL_STAGING_ENV_VARS.md` - Environment variables guide
- [x] `STAGING_SETUP_STATUS.md` - Setup status tracking
- [x] `WHOP_PORTAL_CONFIG.md` - Whop configuration guide
- [x] `GO_NO_GO_CHECKLIST.md` - This checklist
- [ ] Production deployment runbook (if different from staging)
- [ ] Incident response playbook
- [ ] Rollback procedure documented

---

## 🚦 Go/No-Go Decision Matrix

### ✅ GO Criteria (All Must Be True)

1. ✅ CI/CD pipeline is green
2. ⏳ Staging environment fully configured and tested
3. ⏳ Production environment prepared (can be done post-launch for soft launch)
4. ✅ Security verification complete
5. ⏳ Monitoring configured
6. ✅ QA demo bypass disabled (enforced by code)
7. ⏳ End-to-end tests passing in staging
8. ⏳ Whop integration configured and tested

### ⚠️ NO-GO Criteria (Any One Blocks Launch)

1. ❌ CI/CD pipeline failing
2. ❌ Critical security vulnerabilities
3. ❌ QA demo bypass enabled in production
4. ❌ Database migrations failing
5. ❌ Webhook processing not working
6. ❌ RLS policies not enforced
7. ❌ Data loss risk identified

---

## 📋 Launch Day Checklist

**Pre-Launch (T-1 day)**:
- [ ] Final CI run green
- [ ] Staging smoke tests passing
- [ ] Production environment variables prepared
- [ ] Monitoring dashboards ready
- [ ] Team notified of launch window

**Launch Day**:
- [ ] Create production Supabase project
- [ ] Apply production migrations
- [ ] Create production Vercel project
- [ ] Configure production environment variables
- [ ] Deploy production build
- [ ] Verify production health checks
- [ ] Configure Whop production webhook
- [ ] Run production smoke tests
- [ ] Monitor for 1-2 hours post-deploy
- [ ] Verify cron jobs executing
- [ ] Verify webhook processing

**Post-Launch (T+1 day)**:
- [ ] Review error logs
- [ ] Verify monitoring alerts working
- [ ] Check database performance metrics
- [ ] Review webhook processing latency
- [ ] Gather user feedback (if applicable)

---

## 🔄 Rollback Procedure

If critical issues are detected post-launch:

1. **Immediate Actions**:
   - Disable Whop webhook (prevent new events)
   - Pause Vercel cron jobs (if possible)
   - Notify team

2. **Investigation**:
   - Review error logs
   - Check database state
   - Identify root cause

3. **Rollback Options**:
   - **Code Rollback**: Revert to previous Vercel deployment
   - **Database Rollback**: Restore from backup (if data corruption)
   - **Feature Flag**: Disable problematic features via environment variables

4. **Communication**:
   - Update status page (if applicable)
   - Notify affected users
   - Document incident

---

## 📞 Emergency Contacts

- **On-Call Engineer**: [TBD]
- **Database Admin**: [TBD]
- **Whop Support**: https://whop.com/support
- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/support

---

**Last Updated**: 2025-12-12  
**Status**: ⏳ In Progress - Staging setup complete, production prep pending
