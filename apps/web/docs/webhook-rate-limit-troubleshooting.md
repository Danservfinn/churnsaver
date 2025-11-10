# Webhook Rate Limit Troubleshooting Guide

## Issue Summary

The webhook endpoint was returning `429 Rate limit exceeded` with `companyId: "unknown"` when testing from the Whop dashboard.

## Fixes Applied

1. **Rate limiting moved BEFORE webhook processing** - Prevents unnecessary work when rate limited
2. **IP-based fallback instead of global** - When companyId can't be extracted, uses per-IP rate limiting (50 req/min) instead of global (300 req/min)
3. **Improved companyId extraction** - Added debug logging to track extraction
4. **Better error messages** - Includes more context in rate limit responses

## How to Verify the Fix

### Option 1: Test via Whop Dashboard

1. Navigate to: https://whop.com/dashboard/developer/
2. Select your app
3. Go to Settings → Webhooks
4. Click "Test" or "Send Test Webhook" for `payment_failed` event
5. Check the response - it should either:
   - Return `200 OK` if under rate limit
   - Return `429` with proper `companyId` (not "unknown") if rate limited

### Option 2: Check Application Logs

Look for these debug log entries in your application logs (Vercel dashboard or local console):

```
[DEBUG_WEBHOOK] CompanyId extraction result
```

This will show:
- What `companyId` was extracted (or if it's undefined)
- The payload structure received
- Available keys in the payload

### Option 3: Run Test Script

```bash
cd apps/web
# Set your webhook secret
export WHOP_WEBHOOK_SECRET=your_webhook_secret
export WEBHOOK_TEST_URL=http://localhost:3000/api/webhooks/whop

# Run the test script
pnpm tsx scripts/test-webhook-rate-limit.ts
```

## What to Look For

### ✅ Success Indicators

1. **CompanyId is extracted correctly**
   - Logs show: `companyId: "biz_xxxxx"` (not "unknown")
   - Rate limit key uses: `webhook:company:biz_xxxxx`

2. **Rate limiting works per-company**
   - Each company has its own 100 req/min limit
   - Testing from one company doesn't affect others

3. **IP-based fallback works**
   - When companyId is missing, uses: `webhook:ip:<client_ip>`
   - 50 req/min limit per IP (more lenient for testing)

### ⚠️ If CompanyId is Still "unknown"

If logs show `companyId: "undefined"` or `companyId: "unknown"`, check:

1. **Webhook payload structure** - The payload from Whop dashboard might have a different structure
2. **Check the debug logs** - Look for:
   ```
   [DEBUG_WEBHOOK] CompanyId extraction result
   ```
   This shows what keys are available in the payload

3. **Update extraction logic** - If the payload structure is different, we may need to update `getWebhookCompanyContext()` in `apps/web/src/lib/whop-sdk.ts`

## Rate Limit Configuration

- **Per-company**: 100 requests per minute
- **Per-IP (fallback)**: 50 requests per minute
- **Window**: 1 minute (60 seconds)

## Checking Rate Limits in Database

To check current rate limit entries:

```sql
-- Check all webhook rate limits
SELECT company_key, window_bucket_start, count, updated_at 
FROM rate_limits 
WHERE company_key LIKE 'webhook:%'
ORDER BY updated_at DESC 
LIMIT 20;

-- Check specific company
SELECT * FROM rate_limits 
WHERE company_key = 'webhook:company:biz_xxxxx';

-- Check IP-based limits
SELECT * FROM rate_limits 
WHERE company_key LIKE 'webhook:ip:%';
```

## Clearing Rate Limits (for testing)

If you need to clear rate limits for testing:

```sql
-- Clear all webhook rate limits (use with caution!)
DELETE FROM rate_limits WHERE company_key LIKE 'webhook:%';

-- Clear specific company
DELETE FROM rate_limits WHERE company_key = 'webhook:company:biz_xxxxx';

-- Clear IP-based limits
DELETE FROM rate_limits WHERE company_key LIKE 'webhook:ip:%';
```

## Next Steps

1. **Test the webhook** from Whop dashboard
2. **Check the logs** for companyId extraction results
3. **Share the log output** if companyId is still "unknown" so we can update the extraction logic
4. **Verify rate limiting** - Make multiple rapid requests to confirm rate limiting works correctly

## Expected Behavior

- **First request**: Should succeed (200 OK)
- **Subsequent requests**: Should succeed until rate limit is reached
- **After rate limit**: Should return 429 with proper companyId and retryAfter time
- **After window expires**: Should allow requests again

## Debugging Tips

1. **Enable debug logging**: The code already includes `[DEBUG_WEBHOOK]` logs
2. **Check Vercel logs**: Go to Vercel dashboard → Your project → Logs
3. **Filter logs**: Search for `[DEBUG_WEBHOOK]` in logs
4. **Check rate limit table**: Query the database to see current rate limit counts

## Common Issues

### Issue: Still getting "unknown" companyId

**Solution**: Check the webhook payload structure. The extraction logic looks for:
- `payload.data.company_id`
- `payload.data.company.id`
- `payload.data.membership.company_id`
- `payload.data.membership.company.id`
- `payload.data.experience.company_id`

If your payload has a different structure, we need to update the extraction logic.

### Issue: Rate limit too strict for testing

**Solution**: The per-IP fallback (50 req/min) should be sufficient for testing. If you need more, temporarily increase the limit in `apps/web/src/app/api/webhooks/whop/route.ts`:

```typescript
maxRequests: companyId ? 100 : 100  // Increase from 50 to 100 for testing
```

### Issue: Rate limits not clearing

**Solution**: Rate limits automatically clear after the window expires (1 minute). You can also manually clear them using the SQL commands above.

