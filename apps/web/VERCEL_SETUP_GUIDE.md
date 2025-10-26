# Vercel Project Setup Guide

## Project Configuration

### 1. Project Root Directory
- Set project root to: `apps/web`
- This ensures Vercel builds from the correct directory containing package.json and next.config.ts

### 2. Environment Variables Setup

#### Required Variables (set in Vercel Dashboard → Settings → Environment Variables)

**Production Environment:**
```bash
# Whop Credentials (mark as Sensitive)
NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXOsDs6PO
WHOP_API_KEY=X-Y-nTi5c2M8Yp8MpqsSdyF2w67WpI2Sr8YcLufQqnA
WHOP_WEBHOOK_SECRET=your_webhook_secret_from_dashboard

# Default Context
NEXT_PUBLIC_WHOP_AGENT_USER_ID=user_IJ6DUru5He0hG
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_hqNeRcxEMkuyOL

# Legacy Compatibility
WHOP_APP_ID=app_oU8bWaXOsDs6PO

# Database (mark as Sensitive)
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# Application Config
ENCRYPTION_KEY=your_32_byte_encryption_key_here
ENABLE_PUSH=true
ENABLE_DM=true
DEFAULT_INCENTIVE_DAYS=3
REMINDER_OFFSETS_DAYS=[0,2,4]
KPI_ATTRIBUTION_WINDOW_DAYS=14

# Security & Monitoring
SECURITY_MONITORING_ENABLED=true
RATE_LIMIT_FAIL_CLOSED=true
NODE_ENV=production
```

**Staging Environment:**
```bash
# Use same values as production but with staging database URL
NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXOsDs6PO
WHOP_API_KEY=X-Y-nTi5c2M8Yp8MpqsSdyF2w67WpI2Sr8YcLufQqnA
WHOP_WEBHOOK_SECRET=staging_webhook_secret
DATABASE_URL=postgresql://user:pass@staging-host:5432/db?sslmode=require
ENCRYPTION_KEY=your_32_byte_encryption_key_here
# ... other variables same as production
```

**Preview Environment:**
```bash
# Public variables only (no secrets)
NEXT_PUBLIC_WHOP_APP_ID=app_oU8bWaXOsDs6PO
NEXT_PUBLIC_WHOP_AGENT_USER_ID=user_IJ6DUru5He0hG
NEXT_PUBLIC_WHOP_COMPANY_ID=biz_hqNeRcxEMkuyOL
WHOP_APP_ID=app_oU8bWaXOsDs6PO
```

### 3. Build Configuration

The `vercel.json` is already configured correctly:
- Uses Next.js builder (`@vercel/next`)
- Daily cron job for reminders at 9 AM UTC
- Proper cache headers for API routes
- Optimized for Hobby plan (single daily cron)

### 4. Deployment Steps

#### Via Vercel Dashboard (Recommended)
1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Import your Git repository
4. Set **Root Directory** to: `apps/web`
5. Add environment variables as listed above
6. Deploy

#### Via Vercel CLI (After Authentication)
```bash
# Navigate to project root
cd /Users/kurultai/churnsaver

# Link project (sets root to apps/web)
cd apps/web
vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_WHOP_APP_ID production
vercel env add WHOP_API_KEY production
vercel env add WHOP_WEBHOOK_SECRET production
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_WHOP_AGENT_USER_ID production
vercel env add NEXT_PUBLIC_WHOP_COMPANY_ID production
vercel env add WHOP_APP_ID production
vercel env add SECURITY_MONITORING_ENABLED production
vercel env add RATE_LIMIT_FAIL_CLOSED production
vercel env add NODE_ENV production

# Repeat for staging environment
vercel env add NEXT_PUBLIC_WHOP_APP_ID staging
# ... etc

# Deploy
vercel --prod
```

### 5. Post-Deployment Verification

After deployment, verify:

```bash
# Health check
curl https://your-domain.vercel.app/api/health

# Webhook endpoint accessibility
curl https://your-domain.vercel.app/api/webhooks/whop

# Check environment variables in logs
vercel logs --follow | grep -E "(environment|Security validation)"
```

### 6. Whop Configuration

In Whop Developer Dashboard:
1. **Base URL**: `https://your-domain.vercel.app`
2. **App path**: `/experiences/[experienceId]`
3. **Dashboard path**: `/dashboard/[companyId]`
4. **Discover path**: `/discover`
5. **Webhook URL**: `https://your-domain.vercel.app/api/webhooks/whop`
6. **Events**: `payment_failed`, `payment_succeeded`, `membership_went_valid`, `membership_went_invalid`

### 7. Security Best Practices

1. **Never expose secrets in preview deployments** unless absolutely necessary
2. **Mark sensitive variables** (API keys, webhook secrets, database URLs) as "Sensitive" in Vercel
3. **Use different credentials** for staging vs production
4. **Enable Vercel's built-in security headers**
5. **Monitor deployment logs** for any configuration issues
6. **Test webhook signature validation** after deployment
7. **Rotate secrets** quarterly or when compromised
8. **Audit access logs** regularly

### 8. Troubleshooting

#### Common Issues:
- **Build failures**: Check that root directory is set to `apps/web`
- **Environment variable errors**: Verify all required variables are set for correct environment
- **Webhook failures**: Ensure WHOP_WEBHOOK_SECRET is set and matches Whop dashboard
- **Database connection errors**: Verify DATABASE_URL format and SSL settings

#### Debug Commands:
```bash
# Check build logs
vercel logs

# Check specific deployment
vercel inspect [deployment-url]

# Test environment locally
cd apps/web
vercel dev
```

### 9. Verification

After setting variables, verify by deploying and checking:

```bash
# Check environment health
curl https://your-domain.vercel.app/api/health

# Verify no missing env vars in logs
vercel logs --follow | grep "environment variable"
```