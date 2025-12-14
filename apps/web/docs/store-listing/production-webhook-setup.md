# Production Webhook Setup Guide

## Current Status

**Staging Webhook:** ✅ Configured at `https://churnsaver-staging.vercel.app/api/webhooks/whop`  
**Production Webhook:** ⚠️ **NOT CONFIGURED** - Needs to be created

## Step-by-Step Setup Instructions

### 1. Navigate to Whop Developer Dashboard

Go to: https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/apps/app_oU8bWaXOsDs6PO/webhooks/

### 2. Create Production Webhook

1. Click the **"Create webhook"** button
2. Fill in the webhook configuration:

   **Webhook URL:**
   ```
   https://churnsaver.vercel.app/api/webhooks/whop
   ```
   ⚠️ **Important:** Use `https://` (not `http://`)

   **Webhook Secret:**
   - Generate a secure random secret (minimum 32 characters)
   - Example format: `ws_` followed by 64 hexadecimal characters
   - **Save this secret** - you'll need to add it to Vercel

   **API Version:**
   - Select: `v1`

   **Events to Subscribe:**
   Check the following events:
   - ✅ `payment_failed` - Triggers recovery case creation
   - ✅ `payment_succeeded` - Marks recovery case as recovered
   - ✅ `membership_activated` - Tracks new/activated memberships
   - ✅ `membership_deactivated` - Handles membership termination

3. Click **"Save"** or **"Create"**

### 3. Add Secret to Vercel Production Environment

1. Go to Vercel Dashboard: https://vercel.com/dashboard
2. Select the **`churnsaver`** project (production, not staging)
3. Navigate to: **Settings → Environment Variables**
4. Add/Update the following variable:
   - **Key:** `WHOP_WEBHOOK_SECRET`
   - **Value:** The webhook secret you generated in step 2
   - **Environments:** Select `Production` and `Preview`
   - **Type:** `Encrypted` (sensitive)
5. Click **"Save"**

### 4. Redeploy Production

After adding the environment variable, trigger a redeployment:

```bash
vercel deploy --prod --cwd "/Users/kurultai/churnsaver"
```

Or use Vercel dashboard:
1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Select **"Use existing Build Cache"** (optional)
4. Click **"Redeploy"**

### 5. Test Production Webhook

**Option A: Use Whop Dashboard Test Feature**
1. In the webhook list, find your production webhook
2. Click on it to view details
3. Use Whop's "Test Webhook" feature if available

**Option B: Manual Test with curl**

```bash
# Set your webhook secret
WEBHOOK_SECRET="your_production_webhook_secret_here"
TIMESTAMP=$(date +%s)

# Create test payload
PAYLOAD='{"type":"payment_failed","id":"test_prod_123","whop_event_id":"test_prod_123","data":{"membership_id":"test_mem_123"},"created_at":"2025-12-13T02:50:00Z"}'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

# Send test webhook
curl -v -X POST "https://churnsaver.vercel.app/api/webhooks/whop" \
  -H "Content-Type: application/json" \
  -H "x-whop-signature: $SIGNATURE" \
  -H "x-whop-timestamp: $TIMESTAMP" \
  -H "x-whop-event-type: payment_failed" \
  -d "$PAYLOAD"
```

**Expected Response:**
- `200 OK` - Webhook accepted and processed
- `401 Unauthorized` - Signature validation failed (check secret)
- `429 Rate Limit` - Too many requests (wait 60 seconds)

### 6. Verify Webhook Processing

1. **Check Vercel Logs:**
   - Go to Vercel Dashboard → `churnsaver` project → **Logs**
   - Filter for `/api/webhooks/whop`
   - Verify webhook is being received and processed

2. **Check Database:**
   - Query `events` table in Supabase
   - Verify test event was inserted with `company_id` populated
   - Check that `processed` flag is set correctly

3. **Check Recovery Cases:**
   - If testing `payment_failed` event, verify a recovery case was created
   - Check `recovery_cases` table in Supabase

## Troubleshooting

### Webhook Returns 401 Unauthorized
- **Cause:** Signature validation failed
- **Fix:** Verify `WHOP_WEBHOOK_SECRET` in Vercel matches the secret in Whop dashboard
- **Action:** Redeploy after updating the secret

### Webhook Returns 429 Rate Limit
- **Cause:** Too many requests in short time
- **Fix:** Wait 60 seconds and retry
- **Note:** This is expected behavior - rate limiting is working correctly

### Webhook Returns 500 Internal Server Error
- **Cause:** Application error processing webhook
- **Fix:** Check Vercel function logs for error details
- **Action:** Review error logs and fix the underlying issue

### Events Not Being Processed
- **Cause:** Cron job may not be running or events not being drained
- **Fix:** 
  1. Verify cron schedules in `vercel.json` are correct
  2. Check `/api/cron/process-queue` endpoint is accessible
  3. Verify `CRON_SECRET` is set in Vercel
  4. Check Vercel cron job execution logs

## Security Checklist

- [ ] Webhook URL uses `https://` (not `http://`)
- [ ] Webhook secret is at least 32 characters
- [ ] Secret is stored encrypted in Vercel
- [ ] Secret matches between Whop and Vercel
- [ ] Only required events are subscribed
- [ ] Production webhook is separate from staging

## Comparison: Staging vs Production

| Setting | Staging | Production |
|---------|---------|------------|
| **URL** | `https://churnsaver-staging.vercel.app/api/webhooks/whop` | `https://churnsaver.vercel.app/api/webhooks/whop` |
| **Secret** | `ws_9f7c97e6c86858e89a93af9fb757cb6b60baddcac9e5b187bc96ce2e17767053` | **Generate new secret** |
| **Events** | `payment_failed`, `payment_succeeded`, `membership_activated`, `membership_deactivated` | Same |
| **Status** | ✅ Configured | ⚠️ Needs setup |

## Next Steps After Setup

1. ✅ Test webhook with sample events
2. ✅ Monitor webhook delivery in Whop dashboard
3. ✅ Verify events are being processed by cron jobs
4. ✅ Check recovery cases are being created correctly
5. ✅ Monitor error rates and performance

---

**Last Updated:** December 13, 2024  
**Status:** Ready for production webhook creation

