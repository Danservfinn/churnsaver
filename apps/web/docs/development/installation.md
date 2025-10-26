# Installation Instructions

This guide provides step-by-step instructions for setting up the Churn Saver development environment from scratch.

## Table of Contents

1. [Repository Setup](#repository-setup)
2. [Dependency Installation](#dependency-installation)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Development Server Setup](#development-server-setup)
6. [Verification Steps](#verification-steps)

## Repository Setup

### Prerequisites

Before starting, ensure you have completed all [Prerequisites](./prerequisites.md).

### Fork and Clone Repository

#### Option 1: Fork and Clone (Recommended)

1. **Fork the Repository**
   ```bash
   # Navigate to the repository on GitHub
   # Click "Fork" button in the top-right corner
   # Choose your GitHub account as destination
   ```

2. **Clone Your Fork**
   ```bash
   # Clone your forked repository
   git clone https://github.com/YOUR_USERNAME/churn-saver.git
   cd churn-saver

   # Add original repository as upstream
   git remote add upstream https://github.com/original-org/churn-saver.git

   # Verify remotes
   git remote -v
   ```

3. **Configure Upstream Tracking**
   ```bash
   # Configure main branch to track upstream
   git branch --set-upstream-to=upstream/main main

   # Sync with upstream
   git pull upstream main
   ```

#### Option 2: Direct Clone (Team Members)

```bash
# Clone the repository directly
git clone https://github.com/original-org/churn-saver.git
cd churn-saver

# Verify repository structure
ls -la
```

### Repository Structure

After cloning, you should see this structure:

```
churn-saver/
├── apps/
│   └── web/                 # Next.js web application
│       ├── docs/            # Documentation
│       ├── src/             # Source code
│       ├── test/            # Test files
│       ├── scripts/         # Utility scripts
│       └── package.json     # Dependencies and scripts
├── infra/                  # Infrastructure as code
│   ├── migrations/          # Database migrations
│   └── scripts/            # Infrastructure scripts
├── docs/                   # Project documentation
└── README.md               # Project overview
```

### Navigate to Web Application

```bash
# Change to web application directory
cd apps/web

# Verify package.json exists
ls -la package.json
```

## Dependency Installation

### Install Node.js Dependencies

```bash
# Install all dependencies using pnpm
pnpm install

# Alternative: Use npm (not recommended)
npm install

# Alternative: Use yarn (not recommended)
yarn install
```

### Verify Installation

```bash
# Check installed packages
pnpm list --depth=0

# Check for security vulnerabilities
pnpm audit

# Fix any vulnerabilities (if found)
pnpm audit fix
```

### Install Global Dependencies

```bash
# Install global tools (if not already installed)
pnpm add -g @whop/cli  # Whop CLI tools
pnpm add -g vercel     # Vercel CLI for deployment
pnpm add -g supabase   # Supabase CLI (if using Supabase)
```

### Development Dependencies

The project includes several development dependencies:

- **@biomejs/biome**: Linting and formatting
- **TypeScript**: Type checking
- **Tailwind CSS**: Styling framework
- **Jest**: Testing framework
- **ESLint**: Code quality

## Database Setup

### Option 1: Local PostgreSQL Installation

#### Install PostgreSQL

Follow the PostgreSQL installation instructions in the [Prerequisites](./prerequisites.md) guide.

#### Create Development Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create databases
CREATE DATABASE churn_saver_dev;
CREATE DATABASE churn_saver_test;

# Create development user
CREATE USER churn_saver_dev WITH PASSWORD 'your_dev_password';
GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;

# Create test user
CREATE USER churn_saver_test WITH PASSWORD 'your_test_password';
GRANT ALL PRIVILEGES ON DATABASE churn_saver_test TO churn_saver_test;

# Exit PostgreSQL
\q
```

#### Verify Database Creation

```bash
# List databases
psql -U postgres -l

# Test connection to development database
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT 1;"
```

### Option 2: Docker PostgreSQL (Recommended)

#### Create Docker Compose File

Create `docker-compose.dev.yml` in the project root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    container_name: churn-saver-postgres
    environment:
      POSTGRES_DB: churn_saver_dev
      POSTGRES_USER: churn_saver_dev
      POSTGRES_PASSWORD: dev_password
      POSTGRES_MULTIPLE_DATABASES: churn_saver_test
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U churn_saver_dev"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  redis:
    image: redis:7-alpine
    container_name: churn-saver-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

#### Start Docker Services

```bash
# Start PostgreSQL and Redis
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f postgres

# Check service status
docker-compose -f docker-compose.dev.yml ps
```

#### Create Test Database

```bash
# Connect to running PostgreSQL container
docker exec -it churn-saver-postgres psql -U churn_saver_dev -d postgres

# Create test database
CREATE DATABASE churn_saver_test;
CREATE USER churn_saver_test WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE churn_saver_test TO churn_saver_test;

# Exit
\q
```

### Database Migration Setup

#### Run Initial Migrations

```bash
# Navigate to web application directory
cd apps/web

# Run database migrations
pnpm run db:migrate

# Check migration status
pnpm run db:migrate:status

# View applied migrations
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT * FROM migration_history;"
```

#### Seed Development Data

```bash
# Seed development database with sample data
pnpm run db:seed

# Verify seeded data
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT COUNT(*) FROM companies;"
```

#### Migration Scripts

The project includes several migration scripts:

```bash
# Available database scripts
pnpm run db:migrate          # Run pending migrations
pnpm run db:migrate:status   # Check migration status
pnpm run db:reset          # Reset database (development only)
pnpm run db:seed           # Seed development data
pnpm run db:studio         # Open Prisma Studio (if using Prisma)
```

## Environment Configuration

### Create Environment Files

#### Development Environment

Create `.env.local` in `apps/web/` directory:

```bash
# Environment
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=churn_saver_dev
DB_USER=churn_saver_dev
DB_PASSWORD=dev_password

# Test Database
TEST_DATABASE_URL=postgresql://churn_saver_test:test_password@localhost:5432/churn_saver_test

# Whop Configuration
NEXT_PUBLIC_WHOP_APP_ID=app_your_development_app_id
WHOP_APP_ID=app_your_development_app_id
WHOP_API_KEY=your_development_api_key
WHOP_WEBHOOK_SECRET=your_development_webhook_secret

# OAuth Configuration
WHOP_OAUTH_CLIENT_ID=your_oauth_client_id
WHOP_OAUTH_CLIENT_SECRET=your_oauth_client_secret
WHOP_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Application URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Development Features
ALLOW_INSECURE_DEV=true
DEBUG_MODE=true
DEBUG_WHOP_SDK=true

# Logging
LOG_LEVEL=debug

# Optional: External Services
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Security (Development)
JWT_SECRET=your_development_jwt_secret_at_least_32_characters
ENCRYPTION_KEY=your_development_encryption_key_32_chars

# Feature Flags
ENABLE_ANALYTICS=false
ENABLE_PUSH=false
ENABLE_DM=false

# KPI Configuration
KPI_ATTRIBUTION_WINDOW_DAYS=30
DEFAULT_INCENTIVE_DAYS=7

# Webhook Configuration
WEBHOOK_TIMESTAMP_SKEW_SECONDS=300

# Reminder Configuration
MAX_REMINDER_CASES_PER_RUN=50
MAX_CONCURRENT_REMINDER_SENDS=10
```

#### Test Environment

Create `.env.test` in `apps/web/` directory:

```bash
# Environment
NODE_ENV=test

# Database
DATABASE_URL=postgresql://churn_saver_test:test_password@localhost:5432/churn_saver_test

# Logging
LOG_LEVEL=error

# Security
ALLOW_INSECURE_DEV=false
DEBUG_MODE=false
```

#### Production Template

Create `.env.production.template` (DO NOT commit actual production values):

```bash
# Environment
NODE_ENV=production

# Database (Production)
DATABASE_URL=postgresql://user:password@host:5432/database

# Whop (Production)
NEXT_PUBLIC_WHOP_APP_ID=app_production_app_id
WHOP_API_KEY=production_api_key
WHOP_WEBHOOK_SECRET=production_webhook_secret

# Security
ALLOW_INSECURE_DEV=false
DEBUG_MODE=false
LOG_LEVEL=info

# External Services
REDIS_URL=redis://production-host:6379
```

### Environment Variable Validation

The project includes environment validation in [`src/lib/env.ts`](../src/lib/env.ts):

```typescript
// Environment variables are validated at startup
// Missing required variables will cause application to fail
```

### Verify Environment Configuration

```bash
# Test environment variable loading
node -e "console.log(require('./src/lib/env.js').env)"

# Check for missing variables
node -e "
const { env } = require('./src/lib/env.js');
Object.entries(env).forEach(([key, value]) => {
  if (!value) console.log('Missing:', key);
});
"
```

## Development Server Setup

### Start Development Server

#### Basic Development Server

```bash
# Navigate to web application directory
cd apps/web

# Start development server
pnpm dev

# Server will start on http://localhost:3000
```

#### Development with Docker Services

```bash
# Start database services first
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready (30 seconds)
sleep 30

# Start development server
pnpm dev
```

#### Development with Debug Mode

```bash
# Enable debug logging
DEBUG_WHOP_SDK=true pnpm dev

# Enable all debug features
ALLOW_INSECURE_DEV=true DEBUG_MODE=true pnpm dev
```

### Development Scripts

The project includes several development scripts:

```bash
# Available scripts
pnpm dev              # Start development server
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run linter
pnpm format           # Format code
pnpm test             # Run tests
```

### Verify Development Server

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test application in browser
open http://localhost:3000

# Check server logs
tail -f .next/server.log
```

## Verification Steps

### Complete Setup Verification

Create a verification script `verify-setup.sh`:

```bash
#!/bin/bash
# verify-setup.sh

echo "🔍 Verifying Churn Saver Setup..."
echo "=================================="

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
  echo "❌ Not in web application directory"
  echo "   Navigate to apps/web/"
  exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  echo "✅ Node.js: $NODE_VERSION"
else
  echo "❌ Node.js: Not found"
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
  PNPM_VERSION=$(pnpm --version)
  echo "✅ pnpm: $PNPM_VERSION"
else
  echo "❌ pnpm: Not found"
fi

# Check dependencies
if [ -d "node_modules" ]; then
  echo "✅ Dependencies: Installed"
else
  echo "❌ Dependencies: Not installed"
  echo "   Run 'pnpm install'"
fi

# Check environment file
if [ -f ".env.local" ]; then
  echo "✅ Environment: .env.local exists"
else
  echo "❌ Environment: .env.local missing"
  echo "   Create from template"
fi

# Check database connection
if psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT 1;" &> /dev/null; then
  echo "✅ Database: Connected"
else
  echo "❌ Database: Connection failed"
  echo "   Check PostgreSQL service"
fi

# Check migrations
if pnpm run db:migrate:status &> /dev/null; then
  echo "✅ Migrations: Applied"
else
  echo "❌ Migrations: Not applied"
  echo "   Run 'pnpm run db:migrate'"
fi

echo "=================================="
echo "🏁 Setup verification complete"
```

### Run Verification Tests

```bash
# Make script executable
chmod +x verify-setup.sh

# Run verification
./verify-setup.sh
```

### Test Development Workflow

```bash
# Test linting
pnpm lint

# Test formatting
pnpm format

# Test building
pnpm build

# Test starting server
pnpm dev &
DEV_PID=$!

# Wait for server to start
sleep 10

# Test health endpoint
curl http://localhost:3000/api/health

# Stop development server
kill $DEV_PID
```

## Next Steps

After completing installation:

1. **Read Configuration Guide**: [Configuration](./configuration.md)
2. **Learn Development Workflow**: [Workflow](./workflow.md)
3. **Set Up Testing**: [Testing Procedures](./testing.md)
4. **Review Troubleshooting**: [Troubleshooting Guide](./troubleshooting.md)

## Common Issues and Solutions

### Installation Problems

#### Permission Denied

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) ~/.pnpm-store

# Or use npx to avoid global installation
npx pnpm install
```

#### Dependency Conflicts

```bash
# Clear and reinstall
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install

# Clear pnpm cache
pnpm store prune
```

#### Node.js Version Issues

```bash
# Switch to correct version
nvm use 18

# Set as default
nvm alias default 18

# Verify version
node --version
```

### Database Issues

#### Connection Failed

```bash
# Check PostgreSQL service
brew services list | grep postgresql  # macOS
sudo systemctl status postgresql      # Linux

# Check port availability
lsof -i :5432

# Test connection manually
psql -h localhost -p 5432 -U postgres -d postgres
```

#### Migration Failures

```bash
# Check migration status
pnpm run db:migrate:status

# Reset and retry
pnpm run db:reset
pnpm run db:migrate

# Check migration files
ls -la infra/migrations/
```

### Development Server Issues

#### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 $(lsof -t -i :3000)

# Use different port
PORT=3001 pnpm dev
```

#### Environment Variable Issues

```bash
# Check environment variables
printenv | grep NEXT_PUBLIC
printenv | grep WHOP_
printenv | grep DATABASE_URL

# Test environment loading
node -e "console.log(require('./src/lib/env.js').env)"
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**Next Steps**: [Configuration Guide](./configuration.md)