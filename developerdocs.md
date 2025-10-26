# Developer Documentation

This comprehensive guide provides everything new developers need to set up and start contributing to the Churn Saver project. Follow these instructions to get your development environment running quickly and independently.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Environment Setup](#local-environment-setup)
3. [Database Setup](#database-setup)
4. [Testing Procedures](#testing-procedures)
5. [Common Debugging Scenarios](#common-debugging-scenarios)
6. [Development Server Startup](#development-server-startup)

## Prerequisites

Before setting up the development environment, ensure you have the following installed:

### Required Software

| Component | Version | Installation |
|-----------|---------|--------------|
| **Node.js** | 18.0.0+ | [Download from nodejs.org](https://nodejs.org/) |
| **pnpm** | 8.0.0+ | `npm install -g pnpm` |
| **PostgreSQL** | 14.0+ | [Download from postgresql.org](https://www.postgresql.org/) |
| **Git** | 2.0+ | [Download from git-scm.com](https://git-scm.com/) |

### Whop Developer Account

1. Visit [whop.com/developers](https://whop.com/developers)
2. Create a developer account
3. Create a new application
4. Generate API credentials:
   - App ID
   - API Key
   - Webhook Secret

### Verification

Run these commands to verify prerequisites:

```bash
# Check Node.js version
node --version  # Should show v18.x.x or higher

# Check pnpm version
pnpm --version  # Should show 8.x.x or higher

# Check PostgreSQL
psql --version  # Should show 14.x or higher

# Check Git
git --version   # Should show 2.x.x or higher
```

## Local Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/churn-saver.git
cd churn-saver/apps/web
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

Create environment file from template:

```bash
cp .env.example .env.local
```

Configure the following variables in `.env.local`:

```bash
# Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev

# Whop Configuration
NEXT_PUBLIC_WHOP_APP_ID=your_development_app_id
WHOP_API_KEY=your_development_api_key
WHOP_WEBHOOK_SECRET=your_development_webhook_secret

# Development Features
ALLOW_INSECURE_DEV=true
DEBUG_MODE=true

# Security
JWT_SECRET=your_development_jwt_secret_minimum_32_characters
ENCRYPTION_KEY=your_development_encryption_key_32_characters
```

### 4. Database Setup

#### Option A: Docker (Recommended)

```bash
# Start PostgreSQL with Docker
docker run --name postgres-dev \
  -e POSTGRES_DB=churn_saver_dev \
  -e POSTGRES_USER=churn_saver_dev \
  -e POSTGRES_PASSWORD=dev_password \
  -p 5432:5432 \
  -d postgres:14

# Wait for database to be ready
sleep 10
```

#### Option B: Local PostgreSQL

```bash
# Create development database
createdb churn_saver_dev

# Create user (if needed)
createuser churn_saver_dev
psql -c "ALTER USER churn_saver_dev WITH PASSWORD 'dev_password';"
```

### 5. Run Database Migrations

```bash
# Run all pending migrations
pnpm run db:migrate

# Verify migration status
pnpm run db:migrate:status
```

### 6. Seed Development Data (Optional)

```bash
# Seed with sample data
pnpm run db:seed
```

## Database Setup

### Connection Configuration

The application uses PostgreSQL with connection pooling. Database connections are configured through the `DATABASE_URL` environment variable.

### Schema Overview

Key tables include:
- `users` - User accounts and profiles
- `companies` - Company/organization data
- `cases` - Churn recovery cases
- `events` - Webhook events from Whop
- `reminders` - Scheduled reminders

### Migration Commands

```bash
# Run migrations
pnpm run db:migrate

# Rollback last migration
pnpm run db:rollback

# Create new migration
pnpm run db:migrate:create <migration_name>

# Check migration status
pnpm run db:migrate:status
```

### Database Tools

#### pgAdmin (GUI)
- Download from [pgadmin.org](https://www.pgadmin.org/)
- Connect using development credentials
- Access at `postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev`

#### psql (Command Line)

```bash
# Connect to database
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev

# Useful commands
\l                    # List databases
\dt                   # List tables
\d table_name         # Describe table
\q                    # Quit
```

## Testing Procedures

### Test Structure

The project follows a testing pyramid with comprehensive coverage:

- **Unit Tests** (70%): Component and utility testing
- **Integration Tests** (20%): API and database integration
- **E2E Tests** (10%): Critical user journey testing

### Running Tests

#### Unit Tests

```bash
# Run all unit tests
pnpm run test:unit

# Run specific test file
pnpm run test:unit -- test/unit/components/Button.test.tsx

# Run tests in watch mode
pnpm run test:unit -- --watch
```

#### Integration Tests

```bash
# Run integration tests
pnpm run test:integration

# Run with database
pnpm run test:integration -- --runInBand
```

#### End-to-End Tests

```bash
# Run E2E tests (requires running dev server)
pnpm run test:e2e

# Run specific test
pnpm run test:e2e -- tests/auth.spec.ts

# Run in headed mode (see browser)
pnpm run test:e2e -- --headed
```

#### All Tests

```bash
# Run complete test suite
pnpm test

# Run with coverage
pnpm run test:coverage

# Generate coverage report
open coverage/lcov-report/index.html
```

### Test Scripts

Available npm scripts:

```json
{
  "test": "node test/auth.test.js && node test/webhooks.test.js && node test/protected-api.test.js && node test/dashboard.test.js",
  "test:unit": "jest test/unit",
  "test:integration": "jest test/integration",
  "test:e2e": "playwright test",
  "test:coverage": "jest --coverage"
}
```

### Test Data Setup

Tests use isolated database state. Each test suite:

1. Creates fresh test database
2. Runs migrations
3. Seeds with test data
4. Cleans up after completion

### Writing Tests

#### Component Test Example

```typescript
// test/unit/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  test('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  test('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

#### API Test Example

```javascript
// test/integration/api/cases.test.js
const request = require('supertest');
const app = require('../../../src/app');

describe('Cases API', () => {
  test('creates new case', async () => {
    const response = await request(app)
      .post('/api/cases')
      .set('Authorization', 'Bearer valid-token')
      .send({
        userId: 'user-123',
        companyId: 'company-456',
        reason: 'churn_risk',
        description: 'User at risk of churning'
      })
      .expect(201);

    expect(response.body).toHaveProperty('case');
    expect(response.body.case.reason).toBe('churn_risk');
  });
});
```

## Common Debugging Scenarios

### Database Connection Issues

**Problem**: Cannot connect to PostgreSQL

**Symptoms**:
- Migration commands fail
- Application throws connection errors
- Tests fail with database errors

**Solutions**:

```bash
# Check if PostgreSQL is running
brew services list | grep postgresql  # macOS
sudo systemctl status postgresql      # Linux

# Test connection manually
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev

# Check DATABASE_URL format
echo $DATABASE_URL  # Should be: postgresql://user:pass@host:port/db

# Reset database (development only)
pnpm run db:reset
```

### Webhook Testing Issues

**Problem**: Webhooks not processing correctly

**Symptoms**:
- Events not appearing in dashboard
- Webhook endpoint returns errors
- Signature validation fails

**Debug Steps**:

```bash
# Test webhook endpoint directly
curl -X POST http://localhost:3000/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "whop-signature: sha256=test_signature" \
  -d '{"type":"user.created","data":{"user":{"id":"123"}}}'

# Check application logs
tail -f logs/app.log | grep webhook

# Use ngrok for external webhook testing
npx ngrok http 3000
# Update webhook URL in Whop dashboard to: https://xyz.ngrok.io/api/webhooks/whop
```

### Environment Variable Issues

**Problem**: Application cannot start due to missing env vars

**Symptoms**:
- Build fails with "process.env not defined"
- Runtime errors about undefined variables
- Authentication failures

**Solutions**:

```bash
# Check if .env.local exists
ls -la .env.local

# Validate required variables
grep -E "^(NEXT_PUBLIC_|WHOP_|DATABASE_URL|JWT_SECRET)" .env.local

# Restart development server after env changes
pnpm dev
```

### Build and Compilation Errors

**Problem**: TypeScript or build errors

**Symptoms**:
- `pnpm build` fails
- IDE shows type errors
- Runtime JavaScript errors

**Debug Commands**:

```bash
# Type check only
pnpm type-check

# Lint code
pnpm lint

# Format code
pnpm format

# Clean and rebuild
rm -rf .next && pnpm build
```

### Test Failures

**Problem**: Tests failing unexpectedly

**Symptoms**:
- Unit tests fail
- Integration tests timeout
- E2E tests cannot find elements

**Debug Steps**:

```bash
# Run specific failing test
pnpm run test:unit -- test/unit/components/Button.test.tsx --verbose

# Debug integration test
DEBUG=test:* pnpm run test:integration

# Run E2E in debug mode
pnpm run test:e2e -- --debug
```

## Development Server Startup

### Standard Development Mode

```bash
# Start development server with Whop proxy
pnpm dev

# Server starts on http://localhost:3000
# API available at http://localhost:3000/api
# Whop iFrame context automatically configured
```

### Development Options

#### Hot Reload
The development server automatically reloads on file changes. No manual restart required.

#### Debug Mode
Enable additional logging:

```bash
DEBUG=* pnpm dev
```

#### Custom Port
```bash
PORT=4000 pnpm dev  # Starts on http://localhost:4000
```

### Server Logs

Monitor application logs during development:

```bash
# View logs in terminal (server must be running in another terminal)
tail -f logs/development.log

# Or check Docker logs (if using Docker)
docker logs -f churn-saver-postgres
```

### Health Check

Verify server is running correctly:

```bash
# Health endpoint
curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok","timestamp":"2023-12-25T10:00:00.000Z"}
```

### Troubleshooting Startup Issues

**Server won't start**:
- Check if port 3000 is available: `lsof -i :3000`
- Verify all dependencies installed: `pnpm install`
- Check environment variables: `cat .env.local`
- Clear cache: `rm -rf .next`

**Database connection fails on startup**:
- Ensure PostgreSQL is running
- Verify DATABASE_URL format
- Check database exists: `psql -l`
- Run migrations: `pnpm run db:migrate`

**Whop proxy issues**:
- Verify Whop credentials in `.env.local`
- Check internet connection
- Restart with clean cache: `rm -rf node_modules/.cache`

---

**Getting Help**

- **Documentation**: Check [apps/web/docs/](../apps/web/docs/) for detailed guides
- **Issues**: Create GitHub issue with error details
- **Community**: Join development Slack/Discord
- **Support**: Contact development team

**Last Updated**: 2025-10-25
**Version**: 1.0.0