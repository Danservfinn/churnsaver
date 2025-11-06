# Test Execution Plan - Supabase Configuration

## Overview
Execute comprehensive test suite execution plan covering all test types using Supabase as the database backend. Tests will be run in a logical order with proper prerequisites and verification.

## Prerequisites and Setup

### 1. Install Dependencies
**Location**: `apps/web/`
**Commands**:
- `pnpm install` - Install all npm dependencies including Playwright, husky, lint-staged
- `pnpm exec playwright install --with-deps` - Install Playwright browsers (Chromium, Firefox, WebKit)

**Verification**: Check that `node_modules` exists and Playwright browsers are installed

### 2. Database Setup (Supabase)
**Requirements**: Supabase project configured and accessible
**Connection Details**:
- Supabase URL: `https://bhiiqapevietyvepvhpq.supabase.co`
- API Key (anon): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWlxYXBldmlldHl2ZXB2aHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExODA5ODcsImV4cCI6MjA3Njc1Njk4N30.opoCXbYm6YT6_cZoeI-fUyno70RwKCiS2iSNEx6Rvj0`
- Project Reference: `bhiiqapevietyvepvhpq`

**Database Connection String**:
- Get the direct PostgreSQL connection string from Supabase Dashboard → Settings → Database
- Format (connection pooler): `postgresql://postgres.bhiiqapevietyvepvhpq:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true`
- Format (direct connection): `postgresql://postgres.bhiiqapevietyvepvhpq:[password]@aws-0-[region].pooler.supabase.com:5432/postgres?sslmode=require`
- Set environment variable: `DATABASE_URL=<supabase-postgresql-connection-string>`

**Important Notes**:
- The anon key is for API/REST access, not direct database connections
- For direct database access, use the PostgreSQL connection string with `postgres` user or service role credentials
- SSL is required (`sslmode=require`)
- Connection pooler (port 6543) is recommended for connection pooling
- Direct connection (port 5432) can be used for migrations

**Quick Setup Script**:
```bash
# Use the setup script to configure environment variables
cd apps/web
source scripts/setup-test-env-supabase.sh
```

**Or Manual Setup**:
```bash
# Copy example env file
cp .env.test.example .env.test

# Edit .env.test and add DATABASE_URL from Supabase Dashboard
# Then source it:
source .env.test
```

**Verification**:
```bash
# Test Supabase connection
psql "$DATABASE_URL" -c "SELECT version();"

# Or verify via Supabase Dashboard
# Go to: https://supabase.com/dashboard/project/bhiiqapevietyvepvhpq → Settings → Database → Connection string
```

### 3. Environment Variables
**Required variables**:
- `DATABASE_URL` - Supabase PostgreSQL connection string (from Supabase Dashboard → Settings → Database)
  - Use direct connection or connection pooler URL
  - Must include `?sslmode=require` for SSL
  - Format: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require`
- `SUPABASE_URL` - Supabase API URL: `https://bhiiqapevietyvepvhpq.supabase.co`
- `SUPABASE_ANON_KEY` - Supabase anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWlxYXBldmlldHl2ZXB2aHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExODA5ODcsImV4cCI6MjA3Njc1Njk4N30.opoCXbYm6YT6_cZoeI-fUyno70RwKCiS2iSNEx6Rvj0`
- `WHOP_WEBHOOK_SECRET` - Webhook secret for testing (can use 'test_webhook_secret' for local)
- `NODE_ENV=test` - Set to test environment
- `TEST_DATABASE_URL` - For migration tests (can use same DATABASE_URL or separate test database)

**File**: Create `.env.test` with Supabase connection details or export variables in shell:
```bash
export DATABASE_URL="postgresql://postgres.bhiiqapevietyvepvhpq:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
export SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWlxYXBldmlldHl2ZXB2aHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExODA5ODcsImV4cCI6MjA3Njc1Njk4N30.opoCXbYm6YT6_cZoeI-fUyno70RwKCiS2iSNEx6Rvj0"
export NODE_ENV=test
export WHOP_WEBHOOK_SECRET="test_webhook_secret"
```

**Note**: Replace `[PASSWORD]` and `[REGION]` with actual values from Supabase Dashboard. The password should be URL-encoded if it contains special characters.

### 4. Application Build (for E2E tests)
**Command**: `pnpm build` - Build Next.js application
**Note**: Playwright config includes webServer that starts dev server automatically, but build may be needed for some tests

## Test Execution Sequence

### Phase 1: Unit Tests (Fastest, Foundation)
**Location**: `apps/web/`
**Command**: `pnpm test`
**Expected duration**: 1-5 minutes
**Verification**: All unit tests pass, coverage report generated

**Details**:
- Runs Vitest on all `test/**/*.test.{js,ts,tsx}` files
- Includes unit tests in `test/unit/` directory
- Uses jsdom environment for component tests
- Generates coverage report
- **Database**: Not required for unit tests (mocked)

**If failures occur**: Review specific test failures, check test setup in `test/setup.ts`

### Phase 2: Security Tests
**Location**: `apps/web/`
**Command**: `pnpm test:security`
**Expected duration**: 2-5 minutes
**Verification**: All security tests pass

**Details**:
- Tests webhook validation, encryption, RLS, security monitoring, rate limiting
- Includes new security tests: XSS, CSRF, command injection, path traversal
- Critical for security compliance
- **Database**: May require database for RLS tests

**If failures occur**: Review security test output, verify security implementations

### Phase 3: Integration Tests
**Location**: `apps/web/`
**Command**: `pnpm test` (runs integration tests in `test/integration/`)
**Or specific**: Focus on integration directory if separate command needed
**Expected duration**: 5-10 minutes
**Verification**: All integration tests pass, Supabase database connections verified

**Details**:
- Tests API endpoints, database integration, RLS policies
- Requires Supabase database connection
- Tests webhook rate limiting, job queue integration
- Service integration tests (cases, eventProcessor, incentives, etc.)

**Prerequisites**: 
- Supabase database must be accessible
- DATABASE_URL must be set correctly with valid credentials
- SSL connection enabled (Supabase requires SSL)
- Verify connection: `psql "$DATABASE_URL" -c "SELECT 1;"`

**If failures occur**: 
- Verify Supabase connection string is correct
- Check network connectivity to Supabase
- Verify SSL mode is set (`?sslmode=require`)
- Review RLS policies in Supabase Dashboard
- Check Supabase project is active and not paused
- Verify database password is correct and URL-encoded if needed

### Phase 4: Migration Tests
**Location**: `apps/web/`
**Command**: `pnpm test test/migrations/migration-test.ts`
**Expected duration**: 2-5 minutes
**Verification**: All migrations apply forward, rollback successfully, are idempotent

**Details**:
- Tests forward migrations from `infra/migrations/`
- Tests backward migrations (rollback)
- Tests migration idempotency
- Verifies database schema integrity

**Prerequisites**: 
- Supabase database accessible
- Database user has CREATE/DROP/ALTER permissions
- Migration files accessible from `infra/migrations/`
- **Note**: Use direct connection (port 5432) for migrations, not pooler (port 6543)

**Supabase-specific considerations**:
- Some migrations may need to be run via Supabase Dashboard SQL Editor for schema changes
- Verify RLS policies are created correctly
- Check that migrations don't conflict with Supabase-managed schemas

**If failures occur**: 
- Review migration files for Supabase compatibility
- Check database permissions in Supabase Dashboard
- Verify migration scripts don't conflict with Supabase features
- Some migrations may need to be applied manually via Supabase Dashboard

### Phase 5: E2E Tests (Requires Running Application)
**Location**: `apps/web/`
**Command**: `pnpm test:e2e`
**Expected duration**: 5-15 minutes
**Verification**: All E2E user journeys pass

**Details**:
- Playwright automatically starts dev server via webServer config
- Tests run against `http://localhost:3000`
- Tests 4 critical user journeys:
  - Webhook to recovery flow
  - Case management workflow
  - Multi-tenant isolation
  - Settings configuration
- Runs on multiple browsers (Chromium, Firefox, WebKit, Mobile)

**Prerequisites**: 
- Application can build successfully
- Port 3000 available
- Playwright browsers installed
- Supabase database accessible (for data operations in E2E tests)

**Environment for E2E**:
```bash
export DATABASE_URL="<supabase-connection-string>"
export SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export NODE_ENV=test
```

**If failures occur**: 
- Check application logs
- Verify test selectors match actual UI (`data-testid` attributes)
- Review authentication flow in tests
- Check webhook simulation helpers
- Verify Supabase connection is working

**Debug options**:
- `pnpm test:e2e:ui` - Run with Playwright UI for debugging
- `pnpm test:e2e:headed` - Run in headed mode to see browser

### Phase 6: Performance Tests (k6 Load Tests)
**Location**: `apps/web/`
**Prerequisites**: 
- k6 installed: `brew install k6` (macOS) or use Docker: `docker run --rm -i grafana/k6 run - <test/performance/k6-load-test.js`
- Application running on localhost:3000
- Supabase database accessible (for performance testing under load)

**Commands**:
- Webhook load test: `k6 run test/performance/k6-load-test.js`
- API load test: `k6 run test/performance/api-load-test.js`
- Database load test: `k6 run test/performance/db-load-test.js`
- Stress test: `k6 run test/performance/stress-test.js`
- Endurance test: `k6 run test/performance/endurance-test.js` (longer duration)
- Scalability test: `k6 run test/performance/scalability-test.js`

**Expected duration**: 5-30 minutes depending on test
**Verification**: 
- Webhook: 1000 req/min capacity met
- API: <500ms p95 response time
- Database: <1s p95 query time (Supabase connection pooler should help)
- Error rate <10%

**Environment variables**:
- `BASE_URL=http://localhost:3000`
- `WHOP_WEBHOOK_SECRET=test_webhook_secret`
- `TEST_AUTH_TOKEN=<token if needed>`
- `TEST_COMPANY_ID=<company_id if needed>`

**Supabase Performance Considerations**:
- Supabase connection pooler helps with connection management
- Monitor Supabase dashboard for connection limits
- Check Supabase project tier limits (free tier has connection limits)
- Consider using connection pooler URL for better performance

**If failures occur**: 
- Verify application is running and accessible
- Check performance thresholds are realistic for Supabase
- Review application logs for errors
- Verify Supabase connection pooler is being used
- Check Supabase dashboard for connection/query limits

**Alternative**: Use Docker for k6 if not installed locally:
```bash
docker run --rm -i -v $(pwd)/apps/web/test/performance:/scripts \
  -e BASE_URL=http://host.docker.internal:3000 \
  grafana/k6 run /scripts/k6-load-test.js
```

## Coverage Verification

### Generate Coverage Report
**Command**: `pnpm test:coverage`
**Expected**: Overall coverage >= 85%
**Verification**: 
- Check coverage summary in terminal
- Open HTML report: `pnpm coverage:html` then open `coverage/index.html`
- Verify component-specific thresholds met:
  - Core Services: 90%
  - Webhook Validation: 95%
  - Database Access: 90%
  - Encryption/Security: 95%
  - Queue Processing: 90%
  - UI Components: 80%

**If coverage below threshold**: 
- Review coverage report to identify uncovered code
- Add tests for uncovered areas
- Verify coverage exclusions are appropriate

## Test Execution Scripts

### Quick Test (Unit + Integration)
```bash
cd apps/web
export DATABASE_URL="<supabase-connection-string>"
export SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export NODE_ENV=test
pnpm test
```

### Full Test Suite (All except E2E/Performance)
```bash
cd apps/web

# Set Supabase environment variables
export DATABASE_URL="<supabase-connection-string>"
export SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWlxYXBldmlldHl2ZXB2aHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExODA5ODcsImV4cCI6MjA3Njc1Njk4N30.opoCXbYm6YT6_cZoeI-fUyno70RwKCiS2iSNEx6Rvj0"
export NODE_ENV=test
export WHOP_WEBHOOK_SECRET="test_webhook_secret"

# Run tests in sequence
pnpm test                    # Unit + Integration
pnpm test:security          # Security
pnpm test test/migrations/  # Migrations
```

### Complete Test Suite (Everything)
```bash
cd apps/web

# Setup
pnpm install
pnpm exec playwright install --with-deps

# Set Supabase environment variables
export DATABASE_URL="<supabase-connection-string>"
export SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export NODE_ENV=test
export WHOP_WEBHOOK_SECRET="test_webhook_secret"

# Run tests in sequence
pnpm test                    # Unit + Integration
pnpm test:security          # Security
pnpm test test/migrations/  # Migrations
pnpm test:e2e              # E2E (starts app automatically)

# Performance (requires app running separately)
# Terminal 1: pnpm dev
# Terminal 2: 
export BASE_URL=http://localhost:3000
k6 run test/performance/k6-load-test.js
```

### CI-Style Test Run
```bash
cd apps/web
export DATABASE_URL="<supabase-connection-string>"
export SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export NODE_ENV=test
pnpm test:ci               # Runs with coverage, verbose reporter
```

## Troubleshooting

### Common Issues

1. **Supabase Connection Errors**
   - Verify DATABASE_URL is correct format
   - Check password is URL-encoded if it contains special characters
   - Verify SSL mode is set: `?sslmode=require`
   - Test connection: `psql "$DATABASE_URL" -c "SELECT 1;"`
   - Check Supabase Dashboard → Settings → Database for correct connection string
   - Verify project is not paused in Supabase Dashboard

2. **SSL Connection Issues**
   - Ensure `sslmode=require` is in connection string
   - For development, may need `sslmode=no-verify` (not recommended for production)
   - Check Supabase SSL certificate is valid

3. **Connection Pooler vs Direct Connection**
   - Use pooler (port 6543) for application connections: better for connection management
   - Use direct (port 5432) for migrations: required for some DDL operations
   - Add `&pgbouncer=true` for pooler connections

4. **Playwright browsers not installed**
   - Solution: `pnpm exec playwright install --with-deps`

5. **E2E tests fail with "timeout"**
   - Application may not be starting
   - Check Playwright webServer timeout in `playwright.config.ts`
   - Verify port 3000 is available
   - Check application logs
   - Verify Supabase connection is working

6. **k6 not found**
   - Install: `brew install k6` (macOS) or use Docker
   - Or run via Docker: `docker run --rm -i grafana/k6`

7. **Coverage below threshold**
   - Review coverage report
   - Add tests for uncovered code paths
   - Verify test files are being discovered

8. **Migration tests fail**
   - Verify migration files exist in `infra/migrations/`
   - Check database user has CREATE/DROP permissions in Supabase
   - Verify migration files are valid SQL for Supabase
   - Some migrations may need to be run via Supabase Dashboard SQL Editor
   - Check for conflicts with Supabase-managed schemas

9. **Supabase Connection Limits**
   - Free tier has connection limits (typically 60 connections)
   - Use connection pooler to manage connections efficiently
   - Monitor Supabase Dashboard for connection usage
   - Consider upgrading tier if hitting limits

10. **RLS Policy Issues**
    - Verify RLS policies are set correctly in Supabase Dashboard
    - Check that test data isolation works with RLS
    - Review RLS policy definitions in migration files

## Expected Outcomes

### Success Criteria
- All unit tests pass
- All integration tests pass (with Supabase)
- All security tests pass
- All migration tests pass (forward, backward, idempotent)
- All E2E tests pass (4 critical user journeys)
- Performance tests meet thresholds:
  - Webhook: 1000 req/min
  - API: <500ms p95
  - Database: <1s p95 (Supabase pooler helps)
- Coverage >= 85% overall
- Component-specific coverage thresholds met

### Test Reports Generated
- Coverage reports: `coverage/` directory
- E2E reports: `playwright-report/` directory
- k6 results: JSON summary files
- Test artifacts available for CI/CD

## Execution Order Summary

1. **Setup** (5-10 min)
   - Install dependencies
   - Configure Supabase connection
   - Set environment variables

2. **Unit Tests** (1-5 min)
   - Fast feedback on code changes

3. **Security Tests** (2-5 min)
   - Verify security implementations

4. **Integration Tests** (5-10 min)
   - Verify system integration with Supabase

5. **Migration Tests** (2-5 min)
   - Verify database migrations work with Supabase

6. **E2E Tests** (5-15 min)
   - Verify user journeys

7. **Performance Tests** (5-30 min)
   - Verify performance requirements with Supabase

8. **Coverage Verification** (1-2 min)
   - Verify coverage thresholds

**Total estimated time**: 30-75 minutes for full suite

## Supabase-Specific Notes

### Connection String Format
```
# Connection Pooler (Recommended for applications)
postgresql://postgres.bhiiqapevietyvepvhpq:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true

# Direct Connection (For migrations)
postgresql://postgres.bhiiqapevietyvepvhpq:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
```

### Getting Connection String from Supabase Dashboard
1. Go to: https://supabase.com/dashboard/project/bhiiqapevietyvepvhpq
2. Navigate to: Settings → Database
3. Find "Connection string" section
4. Select "Connection pooling" tab for pooler URL
5. Select "Direct connection" tab for migration URL
6. Copy the connection string (URI format)
7. Replace `[YOUR-PASSWORD]` with actual database password

### Password URL Encoding
If password contains special characters, URL-encode them:
- `@` becomes `%40`
- `#` becomes `%23`
- `&` becomes `%26`
- etc.

### Testing Supabase Connection
```bash
# Test connection pooler
psql "postgresql://postgres.bhiiqapevietyvepvhpq:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true" -c "SELECT version();"

# Test direct connection
psql "postgresql://postgres.bhiiqapevietyvepvhpq:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require" -c "SELECT version();"
```

### Supabase Dashboard Access
- Dashboard URL: https://supabase.com/dashboard/project/bhiiqapevietyvepvhpq
- API URL: https://bhiiqapevietyvepvhpq.supabase.co
- Monitor connections, queries, and performance in Dashboard

