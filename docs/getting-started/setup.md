# Setup Guide

This comprehensive guide will walk you through setting up Churn Saver for local development, including all prerequisites, environment configuration, and initial testing.

## Prerequisites

### System Requirements

- **Operating System**: macOS 12+, Ubuntu 20.04+, or Windows 10+ (WSL2)
- **Node.js**: Version 18.17.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **Git**: Version 2.30.0 or higher
- **Docker**: Version 20.10.0 or higher (for local database)
- **RAM**: Minimum 8GB, recommended 16GB
- **Storage**: Minimum 10GB free space

### Required Accounts

1. **GitHub Account**: For repository access
2. **Whop Account**: For API access and webhooks
3. **Supabase Account**: For database hosting (production)
4. **OpenRouter Account**: For AI services
5. **SMTP Service**: For email delivery (production)

## Installation Steps

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-org/churn-saver.git
cd churn-saver

# Install dependencies
npm install

# Verify installation
npm --version
node --version
```

### Step 2: Environment Setup

#### Copy Environment Template

```bash
# Copy the environment template
cp .env.example .env.local

# Edit the environment file
nano .env.local  # or use your preferred editor
```

#### Configure Environment Variables

```env
# Application Configuration
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-development-secret-here

# Database Configuration (Local)
DATABASE_URL="postgresql://postgres:password@localhost:54322/churn_saver_dev?schema=public"
DIRECT_URL="postgresql://postgres:password@localhost:54322/churn_saver_dev"

# Redis Configuration (Local)
REDIS_URL=redis://localhost:6379

# Whop Integration
WHOP_API_KEY=your_whop_api_key_here
NEXT_PUBLIC_WHOP_APP_ID=your_whop_app_id_here
NEXT_PUBLIC_WHOP_AGENT_USER_ID=your_whop_agent_user_id_here

# AI Services
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Security
ENCRYPTION_KEY=your-32-character-encryption-key
JWT_SECRET=your-jwt-secret-here
WEBHOOK_SECRET=your-webhook-secret-here

# Email Configuration (Development)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=

# Monitoring (Development)
SENTRY_DSN=your_sentry_dsn_here
DATADOG_API_KEY=your_datadog_api_key_here

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false
```

#### Generate Secure Keys

```bash
# Generate encryption key (32 characters)
openssl rand -hex 32

# Generate JWT secret
openssl rand -hex 32

# Generate webhook secret
openssl rand -hex 32

# Generate NextAuth secret
openssl rand -hex 32
```

### Step 3: Database Setup

#### Using Docker (Recommended)

```bash
# Start PostgreSQL and Redis with Docker Compose
docker-compose up -d postgres redis

# Wait for services to be ready
sleep 10

# Verify database connection
docker-compose exec postgres psql -U postgres -d postgres -c "SELECT version();"
```

#### Manual Database Setup

If you prefer not to use Docker:

```bash
# Install PostgreSQL locally
# macOS with Homebrew
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Create database and user
sudo -u postgres psql
```

```sql
-- Create database and user
CREATE DATABASE churn_saver_dev;
CREATE USER churn_dev WITH ENCRYPTED PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_dev;
ALTER DATABASE churn_saver_dev OWNER TO churn_dev;
\q
```

```bash
# Install and start Redis
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis
```

### Step 4: Database Migration

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma db push

# (Optional) Seed the database with sample data
npx prisma db seed
```

### Step 5: Whop Integration Setup

#### Create Whop App

1. Go to [Whop Developer Dashboard](https://whop.com/dashboard/developer)
2. Click **"Create App"**
3. Fill in app details:
   - **Name**: Churn Saver Dev
   - **Description**: Customer retention platform
   - **Category**: Developer Tools

#### Configure App Settings

1. **API Keys**:
   - Copy the **App API Key** → `WHOP_API_KEY`
   - Note the **Agent User ID** → `NEXT_PUBLIC_WHOP_AGENT_USER_ID`
   - Note the **App ID** → `NEXT_PUBLIC_WHOP_APP_ID`

2. **App Configuration**:
   - **Base URL**: `http://localhost:3000`
   - **App Path**: `/app`
   - **Redirect URIs**: `http://localhost:3000/api/auth/callback/whop`

3. **Permissions**:
   - Enable: `users:read`, `experiences:read`, `experiences:write`
   - Enable: `payments:read`, `memberships:read`, `memberships:write`

#### Webhook Configuration

1. In Whop App Settings → **Webhooks**
2. Add webhook endpoint: `http://localhost:3000/api/webhooks/whop`
3. Select events to receive:
   - `payment.succeeded`
   - `payment.failed`
   - `membership.activated`
   - `membership.deactivated`
   - `user.created`

### Step 6: AI Services Setup

#### OpenRouter Configuration

1. Go to [OpenRouter](https://openrouter.ai/)
2. Sign up for an account
3. Generate an API key
4. Add to `.env.local`: `OPENROUTER_API_KEY=your_key_here`

#### OpenAI Configuration (Optional)

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account and add credits
3. Generate an API key
4. Add to `.env.local`: `OPENAI_API_KEY=your_key_here`

### Step 7: Start Development Server

```bash
# Start the development server
npm run dev

# Or with detailed logging
DEBUG=* npm run dev

# The application should be available at:
# http://localhost:3000
```

### Step 8: Verify Installation

#### Health Check

```bash
# Test the health endpoint
curl http://localhost:3000/api/health

# Expected response:
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-10-25T...",
  "checks": {
    "database": { "healthy": true, "response_time": 45 },
    "redis": { "healthy": true, "response_time": 12 }
  }
}
```

#### API Testing

```bash
# Test API connectivity
curl -H "Authorization: Bearer test_token" \
     http://localhost:3000/api/cases

# Test webhook endpoint
curl -X POST \
     -H "Content-Type: application/json" \
     -H "X-Webhook-Signature: test_signature" \
     -d '{"event":"test","data":{}}' \
     http://localhost:3000/api/webhooks/whop
```

#### Database Verification

```bash
# Check database tables
npx prisma db execute --file scripts/verify-setup.sql

# View created tables
npx prisma db pull
npx prisma generate
```

## Development Workflow

### Code Changes

```bash
# Make your changes
# The development server will automatically reload

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests
npm run test
```

### Database Changes

```bash
# When you modify the Prisma schema
npx prisma format
npx prisma generate

# Apply changes to database
npx prisma db push

# Create a migration (for production)
npx prisma migrate dev --name your_migration_name
```

### Testing Webhooks

#### Using ngrok for Local Testing

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Update Whop webhook URL:
# https://abc123.ngrok.io/api/webhooks/whop
```

#### Manual Webhook Testing

```bash
# Test with sample webhook payload
curl -X POST \
  http://localhost:3000/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $(echo -n '{"test":"data"}' | openssl dgst -sha256 -hmac 'your_webhook_secret' | cut -d' ' -f2)" \
  -d '{
    "event": "payment.failed",
    "id": "evt_test_123",
    "timestamp": "2025-10-25T10:30:00Z",
    "data": {
      "payment": {
        "id": "pay_test_456",
        "amount": 2999,
        "currency": "usd",
        "status": "failed"
      }
    }
  }'
```

## Troubleshooting

### Common Issues

#### Database Connection Issues

**Error**: `Can't reach database server`
```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart postgres

# Check logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d postgres
npx prisma db push
```

#### Port Conflicts

**Error**: `Port 3000 already in use`
```bash
# Find process using port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

#### Environment Variable Issues

**Error**: `Missing required environment variable`
```bash
# Check if .env.local exists
ls -la .env.local

# Validate environment variables
node -e "console.log(require('dotenv').config({ path: '.env.local' }))"

# Regenerate Prisma client after env changes
npx prisma generate
```

#### Dependency Issues

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next
npm run dev
```

### Performance Issues

#### Slow Development Server

```bash
# Enable faster refresh
NODE_OPTIONS="--max-old-space-size=4096" npm run dev

# Use turbopack (experimental)
npm run dev -- --turbo
```

#### Database Query Performance

```bash
# Enable query logging
export DEBUG="prisma:query"

# Check slow queries
npx prisma studio

# Add database indexes
npx prisma db push
```

## Production Setup

### Environment Variables for Production

```env
# Production Environment
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app.churnsaver.com

# Production Database (Supabase, AWS RDS, etc.)
DATABASE_URL=postgresql://user:pass@prod-host:5432/db
DIRECT_URL=postgresql://user:pass@prod-host:5432/db

# Production Redis (AWS ElastiCache, etc.)
REDIS_URL=redis://prod-redis-host:6379

# Production Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
DATADOG_API_KEY=your-datadog-key
```

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database backup created
- [ ] SSL certificates installed
- [ ] Domain DNS configured
- [ ] Monitoring and logging set up
- [ ] Backup and recovery tested
- [ ] Security headers configured
- [ ] Rate limiting enabled

## Next Steps

### Development Tasks

1. **Explore the Codebase**:
   - Review the [Architecture Guide](architecture.md)
   - Understand the [API Reference](../api/rest-api.md)
   - Check out the [Testing Guide](../testing/overview.md)

2. **Build Your First Feature**:
   - Create a new API endpoint
   - Add a dashboard widget
   - Implement a webhook handler

3. **Contribute to the Project**:
   - Read the [Contributing Guide](../development/contributing.md)
   - Set up pre-commit hooks
   - Write your first test

### Integration Tasks

1. **Connect External Services**:
   - Set up email delivery
   - Configure monitoring
   - Add error tracking

2. **Test End-to-End Flows**:
   - Create test recovery cases
   - Test webhook processing
   - Validate email delivery

3. **Security Hardening**:
   - Review security settings
   - Test authentication flows
   - Validate data encryption

## Support

### Getting Help

- **Documentation**: Check this guide and related docs
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub Discussions for questions
- **Community**: Join our developer community

### Useful Commands

```bash
# View all available scripts
npm run

# Clean and rebuild
npm run clean && npm install && npm run build

# Run full test suite
npm run test:ci

# Check code quality
npm run lint && npm run type-check

# Database operations
npx prisma studio    # Open database browser
npx prisma db push   # Apply schema changes
npx prisma migrate dev # Create migrations
```

---

**Ready to start developing?** The application should now be running at [http://localhost:3000](http://localhost:3000). Check the [Architecture Guide](architecture.md) to understand how everything fits together.