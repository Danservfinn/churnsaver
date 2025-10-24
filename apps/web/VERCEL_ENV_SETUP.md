# Vercel Environment Variables Setup

## Required Environment Variables

Set these in your Vercel project settings for each environment (Preview, Staging, Production):

### Whop Credentials

```bash
# Primary App Credentials
NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXOsDs6PO
WHOP_API_KEY=X-Y-nTi5c2M8Yp8MpqsSdyF2w67WpI2Sr8YcLufQqnA

# Default Context
NEXT_PUBLIC_WHOP_AGENT_USER_ID=user_IJ6DUru5He0hG
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_hqNeRcxEMkuyOL

# Webhook Security (get from Whop dashboard)
WHOP_WEBHOOK_SECRET=your_webhook_secret_here

# Legacy Compatibility
WHOP_APP_ID=app_oU8bWaXOsDs6PO
```

### Database

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require
```

### Application Config

```bash
ENCRYPTION_KEY=your_32_byte_encryption_key_here
ENABLE_PUSH=true
ENABLE_DM=true
DEFAULT_INCENTIVE_DAYS=3
REMINDER_OFFSETS_DAYS=[0,2,4]
KPI_ATTRIBUTION_WINDOW_DAYS=14
```

### Security & Monitoring

```bash
SECURITY_MONITORING_ENABLED=true
RATE_LIMIT_FAIL_CLOSED=true
NODE_ENV=production
```

## Setup Instructions

### Via Vercel Dashboard

1. Go to your project settings in Vercel
2. Navigate to "Environment Variables"
3. Add each variable above
4. Set appropriate environment scope:
   - `WHOP_API_KEY`: Production only (mark as sensitive)
   - `WHOP_WEBHOOK_SECRET`: Production only (mark as sensitive)
   - `DATABASE_URL`: Production only (mark as sensitive)
   - `NEXT_PUBLIC_*`: All environments (not sensitive, client-exposed)
   - Other config: All environments

### Via Vercel CLI

```bash
# Set production variables
vercel env add NEXT_PUBLIC_WHOP_APP_ID production
vercel env add WHOP_API_KEY production
vercel env add NEXT_PUBLIC_WHOP_AGENT_USER_ID production
vercel env add NEXT_PUBLIC_WHOP_COMPANY_ID production
vercel env add WHOP_WEBHOOK_SECRET production
vercel env add WHOP_APP_ID production
vercel env add DATABASE_URL production

# Repeat for staging and preview environments as needed
```

## Security Best Practices

1. **Never expose secrets in preview deployments** unless absolutely necessary
2. **Mark sensitive variables** (API keys, webhook secrets, database URLs) as "Sensitive" in Vercel
3. **Use different credentials** for staging vs production
4. **Rotate secrets** quarterly or when compromised
5. **Audit access logs** regularly

## Verification

After setting variables, verify by deploying and checking:

```bash
# Check environment health
curl https://your-domain.vercel.app/api/health

# Verify no missing env vars in logs
vercel logs --follow | grep "environment variable"
```
