# Local Development Setup Guide

This comprehensive guide will help you set up the Churn Saver development environment from scratch. Follow these steps to get your development environment running quickly and efficiently.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Setup](#step-by-step-setup)
4. [Verification](#verification)
5. [Next Steps](#next-steps)
6. [Additional Resources](#additional-resources)

## Quick Start

### 5-Minute Setup (Experienced Developers)

If you're familiar with Node.js development and have all prerequisites installed:

```bash
# 1. Clone repository
git clone https://github.com/your-org/churn-saver.git
cd churn-saver/apps/web

# 2. Install dependencies
pnpm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Start database (Docker)
docker-compose -f docker-compose.dev.yml up -d

# 5. Run migrations
pnpm run db:migrate

# 6. Start development server
pnpm dev
```

Visit http://localhost:3000 to see your running application.

## Prerequisites

Before starting, ensure you have the following installed:

### Required Software

| Software | Minimum Version | Installation Guide |
|----------|------------------|-------------------|
| Node.js | 18.0.0+ | [Installation Instructions](./prerequisites.md#nodejs) |
| pnpm | 8.0.0+ | [Installation Instructions](./prerequisites.md#pnpm) |
| PostgreSQL | 14.0+ | [Installation Instructions](./prerequisites.md#postgresql) |
| Git | 2.0+ | [Installation Instructions](./prerequisites.md#git) |

### Development Tools (Recommended)

| Tool | Purpose | Installation |
|------|---------|--------------|
| VS Code | Code editor | [Download](https://code.visualstudio.com/) |
| Docker | Containerization | [Download](https://www.docker.com/) |
| Postman | API testing | [Download](https://www.postman.com/) |

### Required Accounts

- **GitHub**: For source code access
- **Whop**: For API credentials
- **Vercel**: For deployment (optional)

### Verification Script

Run this script to verify prerequisites:

```bash
#!/bin/bash
# prerequisite-check.sh

echo "🔍 Checking prerequisites..."
echo "=========================="

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version | cut -d'v' -f2)
  if [[ "$(printf '%s\n' "18.0.0" "$NODE_VERSION" | sort -V | head -n1)" = "18.0.0" ]]; then
    echo "✅ Node.js: $NODE_VERSION"
  else
    echo "❌ Node.js: $NODE_VERSION (requires 18.0.0+)"
    exit 1
  fi
else
  echo "❌ Node.js: Not found"
  exit 1
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
  PNPM_VERSION=$(pnpm --version)
  echo "✅ pnpm: $PNPM_VERSION"
else
  echo "❌ pnpm: Not found"
  exit 1
fi

# Check PostgreSQL
if command -v psql &> /dev/null; then
  PG_VERSION=$(psql --version | awk '{print $3}')
  echo "✅ PostgreSQL: $PG_VERSION"
else
  echo "❌ PostgreSQL: Not found"
  exit 1
fi

echo "=========================="
echo "✅ All prerequisites satisfied!"
```

Save as `prerequisite-check.sh` and run:
```bash
chmod +x prerequisite-check.sh
./prerequisite-check.sh
```

## Step-by-Step Setup

### Step 1: Repository Setup

#### 1.1 Fork and Clone

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/churn-saver.git
cd churn-saver

# Add upstream repository
git remote add upstream https://github.com/original-org/churn-saver.git

# Verify remotes
git remote -v
```

#### 1.2 Navigate to Web Application

```bash
cd apps/web
pwd  # Should show /path/to/churn-saver/apps/web
```

### Step 2: Install Dependencies

#### 2.1 Install Node.js Dependencies

```bash
# Install all project dependencies
pnpm install

# Verify installation
pnpm list --depth=0
```

#### 2.2 Install Global Tools

```bash
# Install useful global tools
pnpm add -g @whop/cli
pnpm add -g vercel
pnpm add -g supabase  # if using Supabase
```

### Step 3: Database Setup

#### Option A: Docker (Recommended)

```bash
# Create docker-compose.dev.yml
cat > docker-compose.dev.yml << EOF
version: '3.8'
services:
  postgres:
    image: postgres:14
    container_name: churn-saver-postgres
    environment:
      POSTGRES_DB: churn_saver_dev
      POSTGRES_USER: churn_saver_dev
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U churn_saver_dev"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: churn-saver-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
EOF

# Start services
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready
sleep 30

# Verify services
docker-compose -f docker-compose.dev.yml ps
```

#### Option B: Local PostgreSQL

```bash
# Create development database
createdb churn_saver_dev

# Create user
createuser churn_saver_dev

# Set password
psql -d postgres -c "ALTER USER churn_saver_dev WITH PASSWORD 'dev_password';"

# Grant privileges
psql -d churn_saver_dev -c "GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;"
```

### Step 4: Environment Configuration

#### 4.1 Create Environment File

```bash
# Copy environment template
cp .env.example .env.local

# Edit environment file
nano .env.local
```

#### 4.2 Configure Required Variables

Add the following to `.env.local`:

```bash
# Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev

# Whop Configuration
NEXT_PUBLIC_WHOP_APP_ID=app_your_development_app_id
WHOP_API_KEY=your_development_api_key
WHOP_WEBHOOK_SECRET=your_development_webhook_secret

# Development Features
ALLOW_INSECURE_DEV=true
DEBUG_MODE=true

# Security
JWT_SECRET=your_development_jwt_secret_minimum_32_characters
ENCRYPTION_KEY=your_development_encryption_key_32_characters
```

#### 4.3 Get Whop Credentials

1. Visit [Whop Developer Dashboard](https://whop.com/developers)
2. Create new application or use existing one
3. Note down:
   - App ID
   - API Key
   - Webhook Secret

### Step 5: Database Migration

#### 5.1 Run Migrations

```bash
# Run all pending migrations
pnpm run db:migrate

# Check migration status
pnpm run db:migrate:status
```

#### 5.2 Seed Development Data

```bash
# Seed with sample data (optional)
pnpm run db:seed

# Verify seeded data
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT COUNT(*) FROM users;"
```

### Step 6: Start Development Server

#### 6.1 Launch Application

```bash
# Start development server
pnpm dev

# Server will start on http://localhost:3000
# API available at http://localhost:3000/api
```

#### 6.2 Verify Server is Running

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok","timestamp":"2023-12-25T10:00:00.000Z"}
```

### Step 7: Initial Setup Verification

#### 7.1 Test Application Features

1. **Open Browser**: Navigate to http://localhost:3000
2. **Check Health**: Visit http://localhost:3000/api/health
3. **Test Authentication**: Try logging in with test credentials
4. **Verify Database**: Check if data loads correctly

#### 7.2 Run Tests

```bash
# Run all tests
pnpm test

# Check code quality
pnpm lint

# Verify TypeScript compilation
pnpm type-check
```

## Verification

### Complete Setup Verification

Run this comprehensive verification script:

```bash
#!/bin/bash
# verify-setup.sh

echo "🔍 Verifying Churn Saver Setup..."
echo "===================================="

# Check if we're in correct directory
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
  exit 1
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
  PNPM_VERSION=$(pnpm --version)
  echo "✅ pnpm: $PNPM_VERSION"
else
  echo "❌ pnpm: Not found"
  exit 1
fi

# Check dependencies
if [ -d "node_modules" ]; then
  echo "✅ Dependencies: Installed"
else
  echo "❌ Dependencies: Not installed"
  echo "   Run 'pnpm install'"
  exit 1
fi

# Check environment file
if [ -f ".env.local" ]; then
  echo "✅ Environment: .env.local exists"
else
  echo "❌ Environment: .env.local missing"
  echo "   Create from .env.example"
  exit 1
fi

# Check database connection
if psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT 1;" &> /dev/null; then
  echo "✅ Database: Connected"
else
  echo "❌ Database: Connection failed"
  echo "   Check PostgreSQL service"
  exit 1
fi

# Check migrations
if pnpm run db:migrate:status &> /dev/null; then
  echo "✅ Migrations: Applied"
else
  echo "❌ Migrations: Not applied"
  echo "   Run 'pnpm run db:migrate'"
  exit 1
fi

# Check if development server is accessible
if curl -s http://localhost:3000/api/health &> /dev/null; then
  echo "✅ Development Server: Running"
else
  echo "❌ Development Server: Not accessible"
  echo "   Start with 'pnpm dev'"
  exit 1
fi

echo "===================================="
echo "🎉 Setup verification complete!"
echo "🚀 Your Churn Saver development environment is ready!"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Read the [Development Workflow](./workflow.md) guide"
echo "3. Check out the [Testing Procedures](./testing.md) guide"
```

Save as `verify-setup.sh` and run:
```bash
chmod +x verify-setup.sh
./verify-setup.sh
```

### Manual Verification Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] pnpm 8+ installed (`pnpm --version`)
- [ ] PostgreSQL 14+ running (`psql --version`)
- [ ] Repository cloned (`git status`)
- [ ] Dependencies installed (`ls node_modules`)
- [ ] Environment configured (`cat .env.local`)
- [ ] Database connected (`psql -d churn_saver_dev`)
- [ ] Migrations applied (`pnpm run db:migrate:status`)
- [ ] Development server running (`curl http://localhost:3000/api/health`)
- [ ] Tests passing (`pnpm test`)

## Next Steps

### Immediate Next Steps

1. **Explore the Application**: Open http://localhost:3000 and familiarize yourself with the interface
2. **Read Documentation**: Review the following guides:
   - [Development Workflow](./workflow.md) - Learn our development process
   - [Testing Procedures](./testing.md) - Understand testing requirements
   - [Configuration Guide](./configuration.md) - Customize your environment

### Development Workflow

1. **Create Feature Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**: Write code, add tests, update documentation

3. **Run Tests**:
   ```bash
   pnpm test
   pnpm lint
   pnpm type-check
   ```

4. **Commit Changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push and Create PR**:
   ```bash
   git push origin feature/your-feature-name
   # Create pull request on GitHub
   ```

### Learning Resources

- [Component Library](../components/README.md) - Understand available components
- [API Documentation](../api/README.md) - Learn API endpoints
- [Database Schema](../database/README.md) - Understand data structure

## Additional Resources

### Development Tools Setup

#### VS Code Extensions

Install these recommended extensions:

```bash
# Install VS Code extensions
code --install-extension biomejs.biome
code --install-extension bradlc.vscode-tailwindcss
code --install-extension esbenp.prettier-vscode
code --install-extension ms-vscode.vscode-typescript-next
```

#### Git Hooks Setup

```bash
# Install husky for git hooks
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "pnpm lint && pnpm test:unit"

# Add pre-push hook
npx husky add .husky/pre-push "pnpm test:integration"
```

#### Docker Development

For consistent development environment:

```bash
# Create development Dockerfile
cat > Dockerfile.dev << EOF
FROM node:18-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start development server
CMD ["pnpm", "dev"]
EOF

# Build and run
docker build -f Dockerfile.dev -t churn-saver-dev .
docker run -p 3000:3000 churn-saver-dev
```

### Common Development Tasks

#### Adding New Dependencies

```bash
# Add production dependency
pnpm add package-name

# Add development dependency
pnpm add -D package-name

# Update dependencies
pnpm update
```

#### Database Operations

```bash
# Create new migration
# Create file in infra/migrations/ with descriptive name
# Example: 016_add_user_preferences.sql

# Run migration
pnpm run db:migrate

# Rollback migration
pnpm run db:rollback --migration=016_add_user_preferences.sql

# Reset database (development only)
pnpm run db:reset
```

#### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test test/unit/auth.test.js

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Performance Monitoring

#### Local Performance Testing

```bash
# Install performance testing tools
pnpm add -D lighthouse @lhci/cli

# Run Lighthouse audit
lhci autorun
```

#### Database Performance

```sql
-- Monitor slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
ORDER BY mean_time DESC
LIMIT 10;
```

### Getting Help

#### Troubleshooting

If you encounter issues:

1. **Check the [Troubleshooting Guide](./troubleshooting.md)**
2. **Search existing GitHub issues**
3. **Create new issue** with:
   - Error messages
   - Steps to reproduce
   - Environment information

#### Community Support

- **Development Slack**: Join for real-time help
- **GitHub Discussions**: Ask questions and share knowledge
- **Documentation**: Check for updated guides

---

**Congratulations!** 🎉

You've successfully set up your Churn Saver development environment. You're now ready to start contributing to the project.

**Last Updated**: 2025-10-25  
**Version**: 1.0.0

**Quick Links:**
- [Prerequisites](./prerequisites.md) - Detailed requirements
- [Installation](./installation.md) - Step-by-step instructions
- [Configuration](./configuration.md) - Environment setup
- [Workflow](./workflow.md) - Development process
- [Testing](./testing.md) - Testing procedures
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions