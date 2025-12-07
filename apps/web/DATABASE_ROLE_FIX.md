# Database Role Configuration Fix

## Issue
The application was failing with the error: `role "churn_saver_dev" does not exist`

## Solution
Created the database role and database, and granted necessary privileges.

## What Was Done

1. **Created the database role:**
   ```sql
   CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';
   ```

2. **Created the database:**
   ```sql
   CREATE DATABASE churn_saver_dev;
   ```

3. **Granted privileges:**
   ```sql
   GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;
   GRANT ALL ON SCHEMA public TO churn_saver_dev;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO churn_saver_dev;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO churn_saver_dev;
   ```

## Verification

The role and database are now set up correctly. You can verify by:

```bash
# Test connection
psql -U churn_saver_dev -d churn_saver_dev -c "SELECT version();"
```

## Setup Scripts Created

Two scripts were created to help with future setup:

1. **`scripts/setup-db-role.sh`** - Bash script for setting up the database role
2. **`scripts/setup-db-role.ts`** - TypeScript script (can be run with `pnpm db:setup-role`)

## Next Steps

1. Run database migrations:
   ```bash
   pnpm db:migrate
   ```

2. Verify the application can connect:
   ```bash
   pnpm dev
   ```

3. Check that the settings API works without errors

## For Future Reference

If you need to recreate the database role on a new system:

```bash
# Connect as postgres superuser
psql -U postgres

# Run these commands:
CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';
CREATE DATABASE churn_saver_dev;
GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;
\c churn_saver_dev
GRANT ALL ON SCHEMA public TO churn_saver_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO churn_saver_dev;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO churn_saver_dev;
```

Or use the automated script:
```bash
pnpm db:setup-role
```



