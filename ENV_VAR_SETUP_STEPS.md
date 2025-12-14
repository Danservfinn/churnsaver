# Step-by-Step Environment Variable Setup for Vercel Staging

**Project**: `churnsaver-o3gl`  
**URL**: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables

## Quick Setup Checklist

Follow these steps in order:

### Step 1: Navigate to Environment Variables Page
1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/environment-variables
2. Click the **"Create new"** tab (if not already selected)

### Step 2: Add Each Variable

For each variable below, repeat:
1. Click in the **Key** field → Enter variable name
2. Click in the **Value** field → Enter variable value
3. Select **Environment**: Choose "Production", "Preview", or "All Environments" (recommended: "All Environments")
4. For secrets, check **"Sensitive"** checkbox
5. Click **"Save"**
6. Click **"Add Another"** to add the next variable

### Step 3: Variables to Add (in order)

#### Group 1: Basic Environment
```
Key: NODE_ENV
Value: production
Environment: All Environments
Sensitive: No
```

```
Key: NEXT_PUBLIC_APP_URL
Value: https://churnsaver-o3gl-hlqdg3fn8-dannys-projects-de68569e.vercel.app
Environment: All Environments
Sensitive: No
```

```
Key: ALLOW_INSECURE_DEV
Value: false
Environment: All Environments
Sensitive: No
```

```
Key: NEXT_PUBLIC_DEBUG_MODE
Value: false
Environment: All Environments
Sensitive: No
```

```
Key: QA_DEMO_BYPASS
Value: false
Environment: All Environments
Sensitive: No
```

```
Key: NEXT_PUBLIC_QA_DEMO_BYPASS
Value: false
Environment: All Environments
Sensitive: No
```

#### Group 2: Supabase Configuration
```
Key: SUPABASE_URL
Value: https://zhjhvsqogaownorkidfu.supabase.co
Environment: All Environments
Sensitive: No
```

```
Key: SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoamh2c3FvZ2Fvd25vcmtpZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ2OTEsImV4cCI6MjA4MTEyMDY5MX0.igz41zVKbd37Xpt_0l3UzRZNufFcMj6_xlNZAKe12aU
Environment: All Environments
Sensitive: No
```

```
Key: NEXT_PUBLIC_SUPABASE_URL
Value: https://zhjhvsqogaownorkidfu.supabase.co
Environment: All Environments
Sensitive: No
```

```
Key: NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoamh2c3FvZ2Fvd25vcmtpZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ2OTEsImV4cCI6MjA4MTEyMDY5MX0.igz41zVKbd37Xpt_0l3UzRZNufFcMj6_xlNZAKe12aU
Environment: All Environments
Sensitive: No
```

```
Key: SUPABASE_SERVICE_ROLE_KEY
Value: [GET FROM SUPABASE DASHBOARD]
Environment: All Environments
Sensitive: Yes
```
**How to get**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api → Copy "service_role" key

```
Key: DATABASE_URL
Value: postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
Environment: All Environments
Sensitive: Yes
```
**How to get**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database → Copy "Connection string" → Select "Pooler" → Select "Transaction" mode → Replace `[PASSWORD]` with your database password

#### Group 3: Cron Configuration
```
Key: ENABLE_PG_BOSS
Value: false
Environment: All Environments
Sensitive: No
```

```
Key: CRON_SECRET
Value: <REDACTED>
Environment: All Environments
Sensitive: Yes
```

#### Group 4: Security Secrets
```
Key: ADMIN_API_TOKEN
Value: <REDACTED>
Environment: All Environments
Sensitive: Yes
```

```
Key: JWT_SECRET
Value: <REDACTED>
Environment: All Environments
Sensitive: Yes
```

```
Key: ENCRYPTION_KEY
Value: <REDACTED>
Environment: All Environments
Sensitive: Yes
```

```
Key: ADMIN_IP_ALLOWLIST
Value: [Leave empty or add comma-separated IPs]
Environment: All Environments
Sensitive: No
```

#### Group 5: Whop Configuration
```
Key: WHOP_APP_ID
Value: [GET FROM WHOP DASHBOARD - app_oU8bWaXO or check current app]
Environment: All Environments
Sensitive: No
```

```
Key: NEXT_PUBLIC_WHOP_APP_ID
Value: [Same as WHOP_APP_ID]
Environment: All Environments
Sensitive: No
```

```
Key: WHOP_API_KEY
Value: [GET FROM WHOP DASHBOARD]
Environment: All Environments
Sensitive: Yes
```

```
Key: WHOP_WEBHOOK_SECRET
Value: [GENERATE SECURE RANDOM STRING - 32+ chars]
Environment: All Environments
Sensitive: Yes
```
**Generate**: `openssl rand -base64 32` (save this - you'll need it for Whop webhook config too)

#### Group 6: Webhook Configuration
```
Key: WEBHOOK_TIMESTAMP_SKEW_SECONDS
Value: 300
Environment: All Environments
Sensitive: No
```

### Step 4: Verify All Variables Added

After adding all variables, scroll through the list and verify:
- [ ] All variables listed above are present
- [ ] Sensitive variables are marked as "Sensitive" (values hidden)
- [ ] Environment scope is correct (All Environments or specific)

### Step 5: Trigger New Deployment

1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/deployments
2. Find the latest deployment
3. Click the "..." menu → "Redeploy"
4. Wait for deployment to complete
5. Check deployment logs for any errors

### Step 6: Verify Cron Jobs

1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/crons
2. Verify these cron jobs are listed:
   - `/api/cron/process-queue` - `* * * * *`
   - `/api/cron/reminders` - `*/15 * * * *`
   - `/api/cron/maintenance` - `0 * * * *`

If cron jobs don't appear:
- Verify Root Directory is set to `apps/web` (see `VERCEL_SETTINGS_VERIFICATION.md`)
- Check that `apps/web/vercel.json` exists and contains the crons section
- Redeploy after fixing Root Directory

### Step 7: Get Canonical Domain

1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/settings/domains
2. Note the **Production** domain (should be `churnsaver-o3gl.vercel.app` or similar)
3. Update `NEXT_PUBLIC_APP_URL` if it differs from what you set earlier
4. Use this domain for all smoke tests and webhook URLs

## Troubleshooting

**Issue**: Variables not saving
- Make sure you click "Save" after each variable
- Check for validation errors (red text)

**Issue**: Deployment fails after adding variables
- Check deployment logs for specific error
- Verify DATABASE_URL format is correct (pooler URL with port 6543)
- Verify all required variables are set

**Issue**: Cron jobs not appearing
- Root Directory must be `apps/web`
- `vercel.json` must be in `apps/web/` directory
- Redeploy after fixing Root Directory

