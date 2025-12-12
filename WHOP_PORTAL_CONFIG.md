# Whop Portal Configuration Guide

## App Information

**Existing App**: "Churn Saver [st]"  
**App ID**: `app_oU8bWaXO`  
**Developer Dashboard**: https://whop.com/dashboard/biz_hqNeRcxEMkuyOL/developer/

## Configuration Steps

### 1. OAuth Redirect URLs (if using OAuth)

Navigate to: App Settings → OAuth (if available) or App Configuration

**Staging Redirect URLs**:
```
https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app/api/auth/callback
```

**Production Redirect URLs** (prepare for store submission):
```
https://[PRODUCTION_DOMAIN]/api/auth/callback
```

### 2. Webhook Configuration

Navigate to: Developer Dashboard → Webhooks → Create webhook (or edit existing)

#### Staging Webhook

**Webhook URL**:
```
https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app/api/webhooks/whop
```

**Webhook Events** (subscribe to):
- `membership.payment_failed` - Trigger recovery case creation
- `membership.payment_succeeded` - Mark recovery case as recovered
- `membership.cancelled` - Handle membership termination
- `membership.created` - Track new memberships
- `membership.updated` - Handle membership changes

**Webhook Secret**: 
- Generate a secure random secret (minimum 32 characters)
- Store in Vercel environment variable: `WHOP_WEBHOOK_SECRET`
- Use the same secret in Whop webhook configuration

#### Production Webhook (for store submission)

**Webhook URL**:
```
https://[PRODUCTION_DOMAIN]/api/webhooks/whop
```

**Webhook Events**: Same as staging

**Webhook Secret**: Generate new secure secret for production

### 3. App Settings

Navigate to: App Settings → General

**Required Settings**:
- **App Name**: Churn Saver
- **Description**: Automated payment recovery system for Whop memberships
- **Icon**: Upload app icon (if required)
- **Privacy Policy URL**: (if required for store submission)
- **Terms of Service URL**: (if required for store submission)

### 4. API Keys

Navigate to: App Settings → API Keys

**Staging API Key**:
- Copy API Key
- Set in Vercel: `WHOP_API_KEY`

**Production API Key**:
- Use production API key for production environment
- Set in Vercel production environment variables

### 5. App ID

**Staging App ID**: `app_oU8bWaXO` (or check current app ID)
- Set in Vercel: `WHOP_APP_ID` and `NEXT_PUBLIC_WHOP_APP_ID`

**Production App ID**: (Will be assigned when app is submitted to store)
- Update production environment variables after store approval

## Testing Webhooks

### Test Webhook Delivery

1. Use Whop's webhook testing feature (if available)
2. Or use curl to send test webhook:

```bash
# Generate test signature
WEBHOOK_SECRET="your_webhook_secret"
TIMESTAMP=$(date +%s)
PAYLOAD='{"type":"membership.payment_failed","membership_id":"test_mem_123","data":{}}'
SIGNATURE=$(echo -n "${TIMESTAMP}.${PAYLOAD}" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | cut -d' ' -f2)

# Send test webhook
curl -X POST https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "x-whop-signature: ${SIGNATURE}" \
  -H "x-whop-timestamp: ${TIMESTAMP}" \
  -d "${PAYLOAD}"
```

### Verify Webhook Processing

1. Check Vercel function logs for webhook processing
2. Verify events are stored in Supabase `events` table
3. Verify recovery cases are created in `recovery_cases` table
4. Check cron job processes events correctly

## Store Submission Checklist

Before submitting to Whop App Store:

- [ ] Production Vercel project created and deployed
- [ ] Production Supabase project created and migrated
- [ ] Production environment variables configured
- [ ] Production webhook URL configured in Whop
- [ ] Production OAuth redirect URLs configured (if using OAuth)
- [ ] App icon and screenshots prepared
- [ ] Privacy policy and terms of service URLs ready
- [ ] App description and marketing materials prepared
- [ ] All staging tests passing
- [ ] Production smoke tests passing

## References

- Whop Developer Docs: https://dev.whop.com
- Whop API Reference: https://dev.whop.com/api-reference
- Webhook Documentation: https://dev.whop.com/apps/webhooks
