# Development Setup Guide

## Overview

This guide provides comprehensive instructions for setting up the Churn Saver development environment. It covers environment configuration, dependency management, database setup, and development workflows.

## 🚀 Quick Start

**New to Churn Saver?** Start with our comprehensive [Local Setup Guide](./local-setup.md) for a complete step-by-step walkthrough.

**Experienced developer?** The quick start guide below will get you running in minutes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Configuration](#configuration)
5. [Development Workflow](#development-workflow)
6. [Testing](#testing)
7. [Debugging](#debugging)
8. [Common Issues](#common-issues)

## Prerequisites

### System Requirements

- **Node.js**: Version 18.x or higher
- **pnpm**: Version 9.15.9 or higher (package manager)
- **PostgreSQL**: Version 14.x or higher
- **Git**: Version 2.x or higher
- **Optional**: Docker for containerized development

### Development Tools

- **IDE**: VS Code (recommended) with extensions
- **Browser**: Chrome/Firefox with developer tools
- **API Client**: Postman or Insomnia for API testing
- **Database Tool**: pgAdmin or DBeaver for database management

### Required Accounts

- **Whop**: Developer account with API access
- **Git**: GitHub account for repository access
- **Cloud**: Vercel account for deployment
- **Database**: PostgreSQL hosting (local or cloud)

### 📚 Detailed Documentation

For comprehensive prerequisites information, including version compatibility and installation instructions, see our [Prerequisites Guide](./prerequisites.md).

## Environment Setup

### Clone Repository

```bash
# Clone the repository
git clone https://github.com/your-org/churn-saver.git
cd churn-saver

# Install dependencies
pnpm install

# Set up development environment
pnpm dev:setup
```

### 📖 Complete Installation Guide

For detailed step-by-step installation instructions, including repository setup, dependency installation, and initial configuration, see our [Installation Guide](./installation.md).

## Database Setup

### Local PostgreSQL

#### Installation

```bash
# macOS with Homebrew
brew install postgresql@14
brew services start postgresql@14

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Windows
# Download and install from postgresql.org
```

#### Database Creation

```bash
# Connect to PostgreSQL
psql -U postgres

# Create development database
CREATE DATABASE churn_saver_dev;
CREATE DATABASE churn_saver_test;

# Create development user
CREATE USER churn_saver_dev WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;

# Create test user
CREATE USER churn_saver_test WITH PASSWORD 'test_password';
GRANT ALL PRIVILEGES ON DATABASE churn_saver_test TO churn_saver_test;
```

#### Migration Setup

```bash
# Run initial migrations
pnpm run db:migrate

# Check migration status
pnpm run db:migrate:status

# Reset database (development only)
pnpm run db:reset

# Seed development data
pnpm run db:seed
```

### Docker PostgreSQL

#### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: churn_saver_dev
      POSTGRES_USER: churn_saver_dev
      POSTGRES_PASSWORD: your_password
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

  redis:
    image: redis:7
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

#### Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f postgres

# Stop services
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d
```

## Configuration

### Development Scripts

Package.json scripts:

```json
{
  "scripts": {
    "dev": "whop-proxy --command 'next dev --turbopack'",
    "build": "next build",
    "start": "next start",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "test": "node test/auth.test.js && node test/webhooks.test.js && node test/protected-api.test.js && node test/dashboard.test.js",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "db:migrate": "tsx scripts/run-migrations.ts",
    "db:migrate:status": "tsx scripts/check-migration-status.ts",
    "db:reset": "tsx scripts/reset-database.ts",
    "db:seed": "tsx scripts/seed-database.ts",
    "db:studio": "npx prisma studio",
    "data-privacy-maintenance": "npx tsx scripts/data-privacy-maintenance.ts"
  }
}
```

### 🔧 Comprehensive Configuration Guide

For detailed environment configuration, including all environment variables, database settings, authentication setup, and feature flags, see our [Configuration Guide](./configuration.md).

## Development Workflow

### Starting Development

```bash
# Start development server
pnpm dev

# Start with database
docker-compose up -d && pnpm dev

# Start with debug
DEBUG_WHOP_SDK=true pnpm dev
```

### Development Server

The development server runs on:
- **Application**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Database**: localhost:5432
- **Health Check**: http://localhost:3000/api/health
- **Dashboard**: http://localhost:3000/dashboard/[companyId] (company-scoped route)

**Dashboard Routes:**
- `/dashboard/[companyId]` - Full dashboard with company ID validation
- `/dashboard` - Redirects to company-scoped route using authenticated context

### Hot Reloading

- **Next.js**: Automatic hot module replacement
- **Tailwind**: CSS updates without refresh
- **Database**: Manual migration for schema changes
- **Environment**: Restart for .env changes

### Code Quality

#### Linting

```bash
# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Check specific files
pnpm lint src/app/api/
```

#### Formatting

```bash
# Format all files
pnpm format

# Format specific files
pnpm format src/components/

# Check formatting
pnpm format:check
```

#### Type Checking

```bash
# TypeScript compilation check
pnpm type-check

# Watch for type errors
pnpm type-check:watch
```

### 🔄 Complete Development Workflow Guide

For comprehensive development workflow information, including branching strategies, commit conventions, code review processes, and deployment workflows, see our [Development Workflow Guide](./workflow.md).

## Testing

### Test Structure

```
test/
├── unit/                 # Unit tests
├── integration/          # Integration tests
├── e2e/                 # End-to-end tests
├── fixtures/             # Test data
├── helpers/              # Test utilities
└── setup/               # Test setup
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run specific test file
pnpm test test/auth.test.js

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Test Configuration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testMatch: [
    '<rootDir>/test/**/*.test.js',
    '<rootDir>/src/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
```

### Writing Tests

#### Unit Tests

```javascript
// test/unit/utils.test.js
const { formatCurrency } = require('../src/lib/common/formatters');

describe('formatCurrency', () => {
  test('formats currency correctly', () => {
    expect(formatCurrency(2999, 'USD')).toBe('$29.99');
  });

  test('handles zero amount', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  test('handles negative amounts', () => {
    expect(formatCurrency(-500, 'USD')).toBe('-$5.00');
  });
});
```

#### Integration Tests

```javascript
// test/integration/api.test.js
const request = require('supertest');
const app = require('../src/app');

describe('API Integration', () => {
  test('GET /api/health returns status', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
  });
});
```

### 🧪 Comprehensive Testing Guide

For detailed testing procedures, including unit testing, integration testing, end-to-end testing, API testing, database testing, performance testing, and security testing, see our [Testing Procedures Guide](./testing.md).

## Debugging

### VS Code Debugging

#### Launch Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "cwd": "${workspaceFolder}",
      "env": {
        "NODE_OPTIONS": "--inspect"
      },
      "console": "integratedTerminal",
      "restart": true,
      "runtimeExecutable": "node"
    }
  ]
}
```

### Browser Debugging

#### React Developer Tools

```typescript
// Debug component with React DevTools
if (process.env.NODE_ENV === 'development') {
  const { whyDidYouUpdate } = require('@welldone-software/why-did-you-render');
  whyDidYouUpdate(React);
}
```

#### API Debugging

```typescript
// Debug API routes
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  logger.debug('API request received', {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries())
  });

  // ... route logic
  
  logger.debug('API response sent', {
    status: response.status,
    processingTime: Date.now() - startTime
  });
}
```

### Database Debugging

#### Query Logging

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 0;

-- View slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements 
ORDER BY mean_time DESC
LIMIT 10;
```

#### Connection Debugging

```bash
# Monitor database connections
watch -n 1 "psql -d churn_saver_dev -c 'SELECT count(*) FROM pg_stat_activity WHERE state = \\\"active\\\";'"

# Test database connectivity
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT 1;"
```

### 🐛 Troubleshooting Guide

For common issues and solutions, including installation problems, database connection issues, API integration problems, build and deployment issues, and performance optimization tips, see our [Troubleshooting Guide](./troubleshooting.md).

## Common Issues

### Installation Issues

#### Node.js Version Conflicts

```bash
# Check current Node version
node --version

# Switch to required version
nvm use 18

# Set default version
nvm alias default 18
```

#### Dependency Conflicts

```bash
# Clear node_modules and reinstall
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install

# Clear pnpm cache
pnpm store prune
```

#### Permission Issues

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm

# Fix pnpm permissions
sudo chown -R $(whoami) ~/.pnpm-store
```

### Database Issues

#### Connection Failures

```bash
# Check PostgreSQL status
brew services list | grep postgresql
sudo systemctl status postgresql

# Check port availability
lsof -i :5432

# Test connection
psql -h localhost -p 5432 -U postgres -d postgres
```

#### Migration Failures

```bash
# Check migration status
pnpm run db:migrate:status

# Rollback failed migration
pnpm run db:rollback --migration=004_add_ab_testing.sql

# Reset and re-migrate
pnpm run db:reset
pnpm run db:migrate
```

### Development Issues

#### Port Conflicts

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 $(lsof -t -i :3000 | grep LISTEN | awk '{print $2}')

# Use different port
PORT=3001 pnpm dev
```

#### Environment Variable Issues

```bash
# Verify environment variables
printenv | grep NEXT_PUBLIC
printenv | grep WHOP_
printenv | grep DATABASE_URL

# Test configuration
node -e "console.log(require('./src/lib/env.js').validate())"
```

#### Hot Reloading Issues

```bash
# Clear Next.js cache
rm -rf .next

# Restart development server
pnpm dev

# Check for TypeScript errors
pnpm type-check
```

### Performance Issues

#### Memory Usage

```bash
# Monitor Node.js memory
node --inspect src/app/server.js

# Check memory leaks
node --inspect --trace-warnings src/app/server.js
```

#### Build Performance

```bash
# Analyze bundle size
pnpm build
npx @next/bundle-analyzer

# Optimize build
pnpm build:analyze
```

## Development Best Practices

### Code Organization

```
src/
├── app/                  # Next.js app router
├── components/            # React components
│   ├── ui/             # Base UI components
│   ├── layouts/         # Layout components
│   └── dashboard/       # Dashboard components
├── lib/                  # Utility libraries
│   ├── whop/            # Whop SDK integration
│   ├── auth/            # Authentication utilities
│   └── common/          # Common utilities
├── server/               # Server-side code
│   ├── middleware/       # API middleware
│   ├── services/         # Business logic
│   └── webhooks/        # Webhook handlers
└── types/                # TypeScript definitions
```

### Git Workflow

```bash
# Feature branch workflow
git checkout -b feature/new-feature
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
# Create pull request

# Hotfix workflow
git checkout -b hotfix/critical-bug
git add .
git commit -m "fix: resolve critical bug"
git push origin hotfix/critical-bug
# Create pull request
```

### Environment Management

```bash
# Development environment
NODE_ENV=development
ALLOW_INSECURE_DEV=true
LOG_LEVEL=debug

# Testing environment
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
LOG_LEVEL=error

# Production environment
NODE_ENV=production
ALLOW_INSECURE_DEV=false
LOG_LEVEL=info
```

### 🔧 Additional Resources

For more detailed information on specific topics:

- **📋 [Prerequisites](./prerequisites.md)** - System requirements and installation
- **🚀 [Local Setup](./local-setup.md)** - Complete step-by-step setup guide
- **⚙️ [Installation](./installation.md)** - Detailed installation instructions
- **🔧 [Configuration](./configuration.md)** - Environment and service configuration
- **🔄 [Development Workflow](./workflow.md)** - Branching, commits, and code review
- **🧪 [Testing Procedures](./testing.md)** - Comprehensive testing guide
- **🐛 [Troubleshooting](./troubleshooting.md)** - Common issues and solutions

### 📞 Getting Help

- **GitHub Issues**: [Create issue](https://github.com/your-org/churn-saver/issues) for bugs and feature requests
- **Development Slack**: Join for real-time help and discussion
- **Documentation**: Check existing guides for specific topics

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0

### 📚 Complete Documentation Set

This development setup guide is part of a comprehensive documentation set. For the complete development experience, explore all our guides:

| Guide | Purpose | Link |
|-------|---------|-------|
| 🚀 Quick Start | Complete step-by-step setup | [Local Setup Guide](./local-setup.md) |
| 📋 Prerequisites | System requirements and installation | [Prerequisites](./prerequisites.md) |
| ⚙️ Installation | Detailed installation instructions | [Installation](./installation.md) |
| 🔧 Configuration | Environment and service configuration | [Configuration](./configuration.md) |
| 🔄 Development Workflow | Branching, commits, and code review | [Development Workflow](./workflow.md) |
| 🧪 Testing | Comprehensive testing procedures | [Testing Procedures](./testing.md) |
| 🐛 Troubleshooting | Common issues and solutions | [Troubleshooting](./troubleshooting.md) |