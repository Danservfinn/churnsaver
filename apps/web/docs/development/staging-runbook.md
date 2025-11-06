# Staging Environment Runbook

## Overview

This runbook provides operational procedures for managing and troubleshooting the ChurnSaver staging environment.

## Environment Details

### Infrastructure
- **Frontend**: Vercel (staging project)
- **Database**: Supabase PostgreSQL (staging instance)
- **URL**: `https://staging.churnsaver.app` (or Vercel preview URL)

### Database Connection
```
postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres
```

## Access

### Vercel Dashboard
1. Navigate to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the staging project
3. Access deployments, logs, and environment variables

### Supabase Dashboard
1. Navigate to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select the staging project
3. Access database, authentication, and logs

## Environment Variables

### Required Variables (Vercel)
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `NODE_ENV=staging`
- `NEXT_PUBLIC_APP_URL` - Staging URL
- `WHOP_WEBHOOK_SECRET` - Staging webhook secret
- `WHOP_API_KEY` - Staging API key
- `NEXT_PUBLIC_WHOP_APP_ID` - Staging app ID

### Optional Variables
- `REDIS_URL` - Redis connection (if using)
- `ENABLE_PUSH` - Enable push notifications
- `ENABLE_DM` - Enable direct messages
- `DEFAULT_INCENTIVE_DAYS` - Default incentive days

## Database Migrations

### Running Migrations

```bash
cd apps/web
DATABASE_URL="postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres" pnpm db:migrate
```

### Verifying Migrations

```bash
# Connect to database
psql "postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres"

# Check migration status
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 10;
```

### Rolling Back Migrations

If a migration causes issues:

```bash
cd infra
node scripts/test-rollback.js <migration_number>
```

## Test Execution

### Running E2E Tests Against Staging

```bash
cd apps/web
E2E_BASE_URL=https://staging.churnsaver.app pnpm test:e2e:staging
```

### Running Integration Tests

```bash
cd apps/web
DATABASE_URL="postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres" pnpm test test/integration/
```

## Troubleshooting

### Application Not Starting

1. **Check Vercel Logs**
   - Navigate to Vercel Dashboard → Deployments → Latest → Functions Logs
   - Look for build errors or runtime errors

2. **Check Environment Variables**
   - Verify all required variables are set
   - Check for typos in variable names
   - Ensure DATABASE_URL is correct

3. **Check Build Logs**
   - Review build output for TypeScript errors
   - Check for missing dependencies

### Database Connection Issues

1. **Verify Connection String**
   ```bash
   psql "postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres" -c "SELECT version();"
   ```

2. **Check Supabase Status**
   - Visit Supabase Dashboard → Settings → Database
   - Verify database is running
   - Check connection pooling settings

3. **Test RLS Policies**
   ```sql
   -- Check if RLS is enabled
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```

### Webhook Issues

1. **Verify Webhook Secret**
   - Check Vercel environment variables
   - Ensure `WHOP_WEBHOOK_SECRET` matches Whop dashboard

2. **Test Webhook Endpoint**
   ```bash
   curl -X POST https://staging.churnsaver.app/api/webhooks/whop \
     -H "Content-Type: application/json" \
     -H "x-whop-signature: sha256=test" \
     -d '{"id":"test","type":"test"}'
   ```

3. **Check Webhook Logs**
   - Review Vercel function logs for webhook processing
   - Check for signature validation errors

### Performance Issues

1. **Check Database Performance**
   ```sql
   -- Check slow queries
   SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
   ```

2. **Review Vercel Analytics**
   - Check function execution times
   - Review response times and error rates

3. **Check Job Queue**
   ```sql
   -- Check pending jobs
   SELECT COUNT(*) FROM pgboss.job WHERE state = 'created';
   ```

## Health Checks

### API Health Endpoints

```bash
# Overall health
curl https://staging.churnsaver.app/api/health

# Database health
curl https://staging.churnsaver.app/api/health/database

# Webhook health
curl https://staging.churnsaver.app/api/health/webhooks
```

### Manual Verification

1. **Dashboard Access**
   - Navigate to `https://staging.churnsaver.app/dashboard`
   - Verify authentication works
   - Check data loads correctly

2. **Webhook Processing**
   - Send test webhook from Whop dashboard
   - Verify case creation in dashboard
   - Check logs for processing confirmation

## Rollback Procedures

### Rolling Back Deployment

1. **Via Vercel Dashboard**
   - Navigate to Deployments
   - Find previous working deployment
   - Click "Promote to Production" (staging)

2. **Via CLI**
   ```bash
   vercel rollback
   ```

### Rolling Back Database Migration

```bash
cd infra
node scripts/emergency-rollback.sh <migration_number>
```

## Data Management

### Cleaning Test Data

```sql
-- Delete test cases (use with caution)
DELETE FROM recovery_cases WHERE membership_id LIKE 'mem_test_%';

-- Delete test events
DELETE FROM whop_events WHERE id LIKE 'evt_test_%';
```

### Seeding Test Data

```bash
# Use test data scripts if available
cd apps/web
pnpm test:seed:staging
```

## Monitoring

### Key Metrics to Monitor

1. **Application Metrics**
   - Request rate
   - Error rate
   - Response times
   - Function execution time

2. **Database Metrics**
   - Connection pool usage
   - Query performance
   - Slow queries
   - Lock contention

3. **Webhook Metrics**
   - Webhook processing rate
   - Success/failure rate
   - Processing latency

### Logs

- **Vercel Logs**: Available in Vercel Dashboard
- **Supabase Logs**: Available in Supabase Dashboard → Logs
- **Application Logs**: Check structured logging output

## Security

### Access Control

- Only authorized team members should have access
- Use environment-specific credentials
- Never use production credentials in staging

### Security Checklist

- [ ] RLS policies are enabled
- [ ] Webhook signatures are validated
- [ ] API endpoints require authentication
- [ ] Sensitive data is not logged
- [ ] Environment variables are secure

## Emergency Contacts

- **DevOps**: [Contact Info]
- **Database Admin**: [Contact Info]
- **On-Call Engineer**: [Contact Info]

## Common Issues and Solutions

### Issue: "Database connection timeout"
**Solution**: Check Supabase connection pooling settings, verify DATABASE_URL format

### Issue: "Webhook signature validation failed"
**Solution**: Verify WHOP_WEBHOOK_SECRET matches Whop dashboard, check timestamp skew

### Issue: "RLS policy violation"
**Solution**: Verify RLS policies are correctly configured, check company_id context

### Issue: "Job queue not processing"
**Solution**: Check pg-boss configuration, verify database connection, check job state

## Maintenance Windows

- **Scheduled Maintenance**: [Schedule]
- **Notification**: Team Slack channel
- **Duration**: Typically 15-30 minutes

## Backup and Recovery

### Database Backups

Supabase handles automatic backups. Manual backup:

```bash
pg_dump "postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres" > staging_backup.sql
```

### Restore from Backup

```bash
psql "postgresql://postgres:0BoDyCmM&PWhUM@db.bhiiqapevietyvepvhpq.supabase.co:5432/postgres" < staging_backup.sql
```

