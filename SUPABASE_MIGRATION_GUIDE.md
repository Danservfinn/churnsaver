# Supabase Staging Migration Guide

**Project**: `churnsaver-staging`  
**Project ID**: `zhjhvsqogaownorkidfu`  
**URL**: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu

## Current Migration Status

**Applied migrations** (3):
- ✅ `001_init`
- ✅ `001_init_complete`
- ✅ `002_enable_rls_policies`

**Remaining migrations** (29+):
- `003_add_job_queue` through `032_rate_limits_operational`

## Migration Options

### Option 1: Using Migration Script (Recommended)

**Prerequisites**:
1. Get Supabase **direct** database connection string (port 5432, NOT pooler)
   - Go to: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database
   - Copy "Connection string" → Select "Direct connection" → Copy the full URL
   - Format: `postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.compute.amazonaws.com:5432/postgres`

2. Set DATABASE_URL environment variable:
   ```bash
   export DATABASE_URL="postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.compute.amazonaws.com:5432/postgres?sslmode=require"
   ```

3. Run migrations:
   ```bash
   cd apps/web
   pnpm db:migrate
   ```

**Note**: The script (`apps/web/scripts/init-db.ts`) will:
- Discover all migration files in `infra/migrations/`
- Apply them in order (skipping already-applied migrations)
- Track migrations in `schema_migrations` table

### Option 2: Manual SQL Execution (Supabase Dashboard)

1. Navigate to: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/sql/new
2. For each migration file in `infra/migrations/` (in order):
   - Open the file (e.g., `003_add_job_queue.sql`)
   - Copy contents
   - Paste into SQL Editor
   - Click "Run"
   - Verify no errors

**Migration files to apply** (in order):
```
003_add_job_queue.sql
004_add_ab_testing.sql
005_secure_events.sql
006_backfill_occurred_at.sql
007_pgboss_schema.sql
008_performance_indexes.sql
009_foreign_keys.sql
010_additional_performance_indexes.sql
010_rate_limits_table.sql
011_migration_tracking.sql
011_security_alerts.sql
011_slow_queries_table.sql
012_received_at.sql
013_multi_tenancy.sql
014_whop_event_idempotency.sql
015_user_deletion_tracking.sql
016_data_export_tracking.sql
017_consent_management.sql
018_error_recovery_enhancements.sql
019_debug_tables.sql
020_job_queue_enhancements.sql
021_fix_rate_limits_schema.sql
022_click_attribution.sql
023_add_expired_status.sql
024_one_open_case_invariant.sql
024_recovery_source_event_id.sql
025_company_resolution_status.sql
026_click_attribution_rls.sql
027_recovery_source_event_unique.sql
028_billing_rls.sql
029_events_rls_hardening.sql
030_debug_indexes.sql
030_remove_default_company_id.sql
031_force_rls_and_context.sql
032_rate_limits_operational.sql
```

### Option 3: Using Supabase CLI (if installed)

```bash
# Set Supabase project reference
export SUPABASE_PROJECT_ID=zhjhvsqogaownorkidfu

# Link project (if not already linked)
supabase link --project-ref zhjhvsqogaownorkidfu

# Apply migrations
supabase db push
```

## Verification Steps

After migrations complete:

1. **Check migration tracking**:
   ```sql
   SELECT * FROM schema_migrations ORDER BY version;
   ```
   Should show all migrations from 001 through 032.

2. **Verify critical tables exist**:
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   ORDER BY table_name;
   ```
   Should include: `events`, `recovery_cases`, `recovery_actions`, `companies`, `job_queue`, etc.

3. **Verify RLS is enabled**:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN ('events', 'recovery_cases', 'companies');
   ```
   `rowsecurity` should be `true` for all tenant tables.

4. **Verify RLS policies exist**:
   ```sql
   SELECT schemaname, tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public' 
   ORDER BY tablename, policyname;
   ```
   Should show policies for SELECT, INSERT, UPDATE, DELETE on tenant tables.

## Troubleshooting

**Issue**: Migration fails with "relation already exists"
- Some migrations may have been partially applied
- Check which objects exist, then either:
  - Skip the migration if objects are correct
  - Drop objects and re-run migration
  - Modify migration to use `IF NOT EXISTS` clauses

**Issue**: Migration fails with permission errors
- Ensure you're using the **direct** connection (port 5432), not pooler
- Verify you're connected as `postgres` role (service role key)

**Issue**: Migration script can't find `infra/migrations`
- Run from repo root: `cd /Users/kurultai/churnsaver && cd apps/web && pnpm db:migrate`
- Or set `DATABASE_URL` and run: `cd apps/web && pnpm db:migrate`

## Important Notes

- **Use direct connection (5432) for migrations/DDL**
- **Use pooler connection (6543) for Vercel runtime**
- Migrations are idempotent where possible, but some may need manual intervention if partially applied
- Always verify RLS policies after migrations complete

