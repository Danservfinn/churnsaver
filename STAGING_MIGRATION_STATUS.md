# Staging Database Migration Status

## Current Status

✅ **Phase 1 & 2 Complete**: Vercel staging project created and non-sensitive environment variables configured.

⏳ **Phase 3 Pending**: Database migrations need to be applied once staging DATABASE_URL is configured.

## Migration Requirements

### Prerequisites

1. **Staging Supabase Database**: 
   - A dedicated Supabase project for staging (or use production Supabase project `zhjhvsqogaownorkidfu`)
   - Get the **direct connection string** (port 5432, NOT pooler) from Supabase Dashboard
   - Format: `postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].compute.amazonaws.com:5432/postgres?sslmode=require`

2. **Set DATABASE_URL**:
   ```bash
   export DATABASE_URL="postgresql://postgres.zhjhvsqogaownorkidfu:[PASSWORD]@aws-0-us-east-1.compute.amazonaws.com:5432/postgres?sslmode=require"
   ```

### Migration Files to Apply

All migrations in `infra/migrations/` (excluding rollback files):

1. `001_init.sql` - Core schema initialization
2. `002_enable_rls_policies.sql` - RLS policies
3. `003_add_job_queue.sql` - Job queue tables
4. `004_add_ab_testing.sql` - A/B testing tables
5. `005_secure_events.sql` - Event security
6. `006_backfill_occurred_at.sql` - Data backfill
7. `007_pgboss_schema.sql` - PgBoss schema
8. `008_performance_indexes.sql` - Performance indexes
9. `009_foreign_keys.sql` - Foreign key constraints
10. `010_additional_performance_indexes.sql` - More indexes
11. `010_rate_limits_table.sql` - Rate limits table
12. `011_migration_tracking.sql` - Migration tracking
13. `011_security_alerts.sql` - Security alerts table
14. `011_slow_queries_table.sql` - Query monitoring
15. `012_received_at.sql` - Received at timestamp
16. `013_multi_tenancy.sql` - Multi-tenancy support
17. `014_whop_event_idempotency.sql` - Whop event idempotency
18. `015_user_deletion_tracking.sql` - User deletion tracking
19. `016_data_export_tracking.sql` - Data export tracking
20. `017_consent_management.sql` - Consent management
21. `018_error_recovery_enhancements.sql` - Error recovery
22. `019_debug_tables.sql` - Debug tables
23. `020_job_queue_enhancements.sql` - Job queue enhancements
24. `021_fix_rate_limits_schema.sql` - Rate limits schema fix
25. `022_click_attribution.sql` - Click attribution
26. `023_add_expired_status.sql` - Expired status
27. `024_one_open_case_invariant.sql` - Case invariants
28. `024_recovery_source_event_id.sql` - Recovery source event
29. `025_company_resolution_status.sql` - Company resolution
30. `026_click_attribution_rls.sql` - Click attribution RLS
31. `027_recovery_source_event_unique.sql` - Recovery source uniqueness
28. `028_billing_rls.sql` - Billing RLS
29. `029_events_rls_hardening.sql` - Events RLS hardening
30. `030_remove_default_company_id.sql` - Remove default company ID
31. `031_force_rls_and_context.sql` - Force RLS and context
32. `032_rate_limits_operational.sql` - Rate limits operational

### Running Migrations

Once `DATABASE_URL` is set:

```bash
cd apps/web
DATABASE_URL="<staging-database-url>" pnpm db:migrate
```

The script (`apps/web/scripts/init-db.ts`) will:
- Discover all migration files in `infra/migrations/`
- Apply them in order (skipping already-applied migrations)
- Track migrations in `schema_migrations` table

### Verification

After migrations complete, verify:

```sql
-- Check migration status
SELECT * FROM schema_migrations ORDER BY version DESC;

-- Verify core tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('events', 'recovery_cases', 'creator_settings', 'companies')
ORDER BY table_name;

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('events', 'recovery_cases', 'companies');
```

## Next Steps

1. **Get staging DATABASE_URL** from Supabase dashboard
2. **Set DATABASE_URL** environment variable
3. **Run migrations**: `cd apps/web && DATABASE_URL="<url>" pnpm db:migrate`
4. **Verify schema** using SQL queries above
5. **Update Vercel staging env vars** with the DATABASE_URL
6. **Proceed to Phase 4**: Deploy staging and validate runtime

