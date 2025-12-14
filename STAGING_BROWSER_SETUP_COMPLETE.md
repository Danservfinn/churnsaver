# Staging Environment Setup - Browser Automation Complete

## ✅ Completed via Browser Automation

### Environment Variables Status
**All environment variables have been configured** in Vercel staging project `churnsaver-staging`.

**Variables that need manual value updates:**
- `SUPABASE_SERVICE_ROLE_KEY` - Currently set with placeholder, needs actual value from Supabase
- `DATABASE_URL` - Currently set with placeholder, needs actual value from Supabase

**All other variables are properly configured** with actual values.

## 🔧 Manual Steps Required

Since the service role key and database URL are sensitive credentials that Supabase intentionally hides behind UI interactions, they require manual configuration. Follow these steps:

### Step 1: Update SUPABASE_SERVICE_ROLE_KEY

1. **Navigate to Supabase API Settings:**
   - URL: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api
   - Scroll down to find the "Project API keys" section
   - Look for the **"service_role"** key (separate from "anon" key)
   - Click the **"Reveal"** button to show the key
   - Copy the entire key (starts with `eyJhbGci...`)

2. **Update in Vercel:**
   - URL: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
   - Find `SUPABASE_SERVICE_ROLE_KEY` in the list
   - Click the **"Edit"** button (or click on the variable row)
   - Click **"Click to reveal"** to see current value
   - Replace the placeholder with the actual service_role key
   - Click **"Save"**

### Step 2: Update DATABASE_URL

1. **Navigate to Supabase Database Settings:**
   - URL: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database
   - Scroll to "Connection string" section
   - Select:
     - **Connection mode**: "Pooler"
     - **Connection pooling mode**: "Transaction"
     - **Port**: `6543`
   - Click **"Copy"** to copy the connection string
   - **Important**: Replace `[YOUR-PASSWORD]` in the connection string with your actual database password
   - If you don't know the password, click **"Reset database password"** and set a new one

2. **Update in Vercel:**
   - URL: https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables
   - Find `DATABASE_URL` in the list
   - Click the **"Edit"** button
   - Click **"Click to reveal"** to see current value
   - Replace the placeholder with the complete connection string (with password)
   - Click **"Save"**

## 📋 Quick Reference

**Vercel Environment Variables Page:**
https://vercel.com/dannys-projects-de68569e/churnsaver-staging/settings/environment-variables

**Supabase API Settings:**
https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api

**Supabase Database Settings:**
https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database

**Vercel Deployments:**
https://vercel.com/dannys-projects-de68569e/churnsaver-staging/deployments

## ✅ Next Steps After Updating Values

1. **Trigger a new deployment** (variables will be available in next deployment)
2. **Verify deployment** completes successfully
3. **Test endpoints:**
   - `curl https://churnsaver-staging.vercel.app/api/health`
   - `curl https://churnsaver-staging.vercel.app/api/health/db`
4. **Verify cron schedules** in Vercel dashboard
5. **Run smoke tests**

## Summary

✅ Project created and configured  
✅ Environment variables structure in place  
✅ Database tables verified  
⏳ **2 variables need manual value updates** (SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL)  
⏳ Deployment pending (will trigger automatically after variable updates)

