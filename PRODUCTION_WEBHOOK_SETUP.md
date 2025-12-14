# Production Webhook Setup - Automated Guide

**Status:** ⚠️ Manual step required in Whop dashboard (browser automation not reliable)

## Generated Configuration

**Webhook Secret:** `ws_a7a287b518b945354e243841d757be1e813aa3d9ba445565d1e1664498320e9e`

**Production URL:** `https://churnsaver.vercel.app/api/webhooks/whop`

## Step 1: Create Webhook in Whop Dashboard (Manual)

1. **Navigate to:** https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/apps/app_oU8bWaXOsDs6PO/webhooks/

2. **Click:** "Create webhook" button

3. **Fill in the form:**
   - **URL:** `https://churnsaver.vercel.app/api/webhooks/whop`
   - **Secret:** `ws_a7a287b518b945354e243841d757be1e813aa3d9ba445565d1e1664498320e9e`
   - **API Version:** `v1`
   - **Events:** Select all of the following:
     - ✅ `payment_failed`
     - ✅ `payment_succeeded`
     - ✅ `membership_activated`
     - ✅ `membership_deactivated`

4. **Click:** "Save" or "Create"

## Step 2: Add Secret to Vercel (Automated)

Run the setup script:

```bash
cd apps/web
./scripts/setup-production-webhook.sh
```

Or manually add via Vercel CLI:

```bash
cd /Users/kurultai/churnsaver
vercel env add WHOP_WEBHOOK_SECRET production
# When prompted, paste: ws_a7a287b518b945354e243841d757be1e813aa3d9ba445565d1e1664498320e9e
```

Or via Vercel Dashboard:
1. Go to: https://vercel.com/dashboard
2. Select: `churnsaver` project
3. Navigate to: **Settings → Environment Variables**
4. Click: **"Add New"**
5. Fill in:
   - **Key:** `WHOP_WEBHOOK_SECRET`
   - **Value:** `ws_a7a287b518b945354e243841d757be1e813aa3d9ba445565d1e1664498320e9e`
   - **Environments:** Select `Production` and `Preview`
   - **Type:** `Encrypted` (sensitive)
6. Click: **"Save"**

## Step 3: Redeploy Production

After adding the environment variable, redeploy:

```bash
cd /Users/kurultai/churnsaver
vercel deploy --prod
```

Or via Vercel Dashboard:
1. Go to: **Deployments** tab
2. Click: **"Redeploy"** on latest deployment
3. Select: **"Use existing Build Cache"** (optional)
4. Click: **"Redeploy"**

## Step 4: Verify Webhook

Test the production webhook:

```bash
# Test endpoint accessibility
curl -I https://churnsaver.vercel.app/api/webhooks/whop

# Expected: 401 Unauthorized (signature required) or 429 Rate Limit
# Both indicate the endpoint is working correctly
```

## Verification Checklist

- [ ] Webhook created in Whop dashboard with production URL
- [ ] Webhook secret matches between Whop and Vercel
- [ ] `WHOP_WEBHOOK_SECRET` added to Vercel production environment
- [ ] Production deployment completed
- [ ] Webhook endpoint responds (401/429 is expected without signature)

## Troubleshooting

### Webhook returns 401 Unauthorized
- **Cause:** Secret mismatch
- **Fix:** Verify `WHOP_WEBHOOK_SECRET` in Vercel matches Whop dashboard
- **Action:** Redeploy after fixing

### Webhook returns 429 Rate Limit
- **Cause:** Too many requests
- **Fix:** Wait 60 seconds and retry
- **Note:** This is expected - rate limiting is working

### Events not being processed
- **Cause:** Cron jobs may not be running
- **Fix:** Verify cron schedules in `vercel.json`
- **Check:** `/api/cron/process-queue` endpoint accessibility

---

**Generated:** December 13, 2024  
**Secret:** `ws_a7a287b518b945354e243841d757be1e813aa3d9ba445565d1e1664498320e9e`

