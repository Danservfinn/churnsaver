# Manual Setup Guide for Staging Environment Variables

## Overview
Two environment variables require manual configuration because they contain sensitive credentials that cannot be retrieved programmatically:
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `DATABASE_URL`

## Step 1: Get SUPABASE_SERVICE_ROLE_KEY

### Navigate to Supabase API Settings
1. Go to: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api
2. Scroll down to find the **"Project API keys"** section
3. Look for the **"service_role"** key (this is different from the "anon" key)
4. Click the **"Reveal"** button next to the service_role key
5. Copy the entire key (it will start with `eyJhbGci...`)

### Add to Vercel
1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
2. Click **"Create new"** tab (if not already selected)
3. Fill in:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Paste the service_role key you copied
   - **Sensitive**: ✅ Check this box (important!)
   - **Environment**: Select "All Environments" (or Production, Preview, Development individually)
4. Click **"Save"**

## Step 2: Get DATABASE_URL

### Navigate to Supabase Database Settings
1. Go to: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database
2. Scroll down to find the **"Connection string"** section
3. Select:
   - **Connection mode**: "Pooler" (not "Direct connection")
   - **Connection pooling mode**: "Transaction" (not "Session")
   - **Port**: `6543` (pooler port)
4. Click **"Copy"** to copy the connection string
5. The connection string will look like:
   ```
   postgresql://postgres.zhjhvsqogaownorkidfu:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
   ```
6. **Important**: Replace `[YOUR-PASSWORD]` with your actual database password
   - If you don't know your password, click **"Reset database password"** button on the same page
   - Set a new password and use that in the connection string

### Add to Vercel
1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
2. Click **"Create new"** tab (if not already selected)
3. Fill in:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the complete connection string with your password
   - **Sensitive**: ✅ Check this box (important!)
   - **Environment**: Select "All Environments" (or Production, Preview, Development individually)
4. Click **"Save"**

## Step 3: Verify Variables Are Set

After adding both variables:
1. Refresh the environment variables page
2. Verify both `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` appear in the list
3. They should show as "••••••••••••••" (hidden) since they're marked as sensitive

## Step 4: Trigger a New Deployment

After setting the environment variables:
1. Go to: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/deployments
2. Click **"Redeploy"** on the latest deployment, OR
3. Make a small commit and push to trigger automatic deployment

## Troubleshooting

### If you can't find the service_role key:
- Make sure you're on the API Settings page (not Database Settings)
- Look for a section titled "Project API keys" or "API Keys"
- The service_role key is usually below the anon key
- If you see "Reveal" buttons, click them to show the keys

### If the connection string doesn't work:
- Verify you're using the **Pooler** connection (port 6543), not Direct (port 5432)
- Make sure you replaced `[YOUR-PASSWORD]` with your actual password
- Check that the password doesn't contain special characters that need URL encoding
- Try resetting your database password if unsure

### If variables aren't showing in Vercel:
- Make sure you clicked "Save" after adding each variable
- Refresh the page
- Check that you selected the correct environment (All Environments, Production, etc.)

## Next Steps After Configuration

Once both variables are set:
1. ✅ Verify deployment completes successfully
2. ✅ Test: `curl https://churnsaver-staging.vercel.app/api/health`
3. ✅ Test: `curl https://churnsaver-staging.vercel.app/api/health/db`
4. ✅ Verify cron schedules are active in Vercel dashboard
5. ✅ Run smoke tests

