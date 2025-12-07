# How to Check Webhook Logs for CompanyId Extraction

## Issue
CompanyId is still showing as "unknown" when testing from Whop dashboard.

## Solution
The enhanced logging will now show the **actual payload structure** from Whop dashboard, which will help us fix the extraction logic.

## Steps to Check Logs

### Option 1: Vercel Dashboard Logs

1. Go to: https://vercel.com/dashboard
2. Select your project: `churnsaver`
3. Click on "Logs" tab
4. Filter for: `[DEBUG_WEBHOOK]` or `[DEBUG]`
5. Look for entries like:
   - `[DEBUG_WEBHOOK] CompanyId extraction result`
   - `[DEBUG] getWebhookCompanyContext called`
   - `[DEBUG] No companyId found in payload. Full structure`

### Option 2: Vercel CLI

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Login
vercel login

# View logs
vercel logs --follow
```

### What to Look For

When you test the webhook from Whop dashboard, look for these log entries:

1. **Payload Structure**:
   ```
   [DEBUG_WEBHOOK] CompanyId extraction result
   {
     fullPayload: "{...actual payload from Whop...}",
     membershipKeys: [...],
     paymentKeys: [...]
   }
   ```

2. **Extraction Attempts**:
   ```
   [DEBUG] getWebhookCompanyContext called
   {
     payloadKeys: [...],
     dataKeys: [...],
     payloadStructure: "{...}"
   }
   ```

3. **Failure Details**:
   ```
   [DEBUG] No companyId found in payload. Full structure
   {
     topLevelKeys: [...],
     dataKeys: [...],
     membershipKeys: [...],
     samplePayload: "{...}"
   }
   ```

## What to Share

Please share the log output that shows:
1. The `fullPayload` or `samplePayload` from the logs
2. The `membershipKeys` array
3. Any `[DEBUG]` entries related to companyId extraction

This will help identify where the companyId actually is in the Whop dashboard payload structure.

## Expected Next Steps

Once we see the actual payload structure:
1. We'll update the extraction logic to match the real structure
2. Test again to verify companyId is extracted correctly
3. The issue should be resolved

## Quick Test

After deployment, test the webhook from Whop dashboard and immediately check the logs. The enhanced logging will show exactly what structure Whop is sending.























