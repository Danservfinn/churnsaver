# Troubleshooting Guide

This guide covers common issues and solutions for Churn Saver development environment setup and runtime problems.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Database Connection Problems](#database-connection-problems)
3. [Environment Configuration Issues](#environment-configuration-issues)
4. [Development Server Problems](#development-server-problems)
5. [API Integration Issues](#api-integration-issues)
6. [Build and Deployment Issues](#build-and-deployment-issues)
7. [Performance Issues](#performance-issues)
8. [Testing Problems](#testing-problems)
9. [Debugging Techniques](#debugging-techniques)
10. [Getting Help](#getting-help)

## Installation Issues

### Node.js Version Conflicts

#### Problem: Node.js version not compatible

```bash
# Error message
Error: Node.js version 16.x.x is not supported. Please use Node.js 18.x.x or higher.
```

**Solution:**

```bash
# Check current Node.js version
node --version

# Use nvm to switch to correct version
nvm use 18

# If 18 not installed, install it
nvm install 18
nvm use 18

# Set as default version
nvm alias default 18

# Verify version
node --version  # Should show v18.x.x
```

#### Problem: Multiple Node.js versions installed

```bash
# Check all installed versions
nvm ls

# Uninstall unwanted versions
nvm uninstall 16
nvm uninstall 14

# Keep only required version
nvm use 18
nvm alias default 18
```

### pnpm Installation Issues

#### Problem: pnpm command not found

```bash
# Error message
zsh: command not found: pnpm
```

**Solution:**

```bash
# Install pnpm globally
npm install -g pnpm@9.15.9

# Alternative: Use curl installation
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Update PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="$HOME/.pnpm:$PATH"
source ~/.zshrc

# Verify installation
pnpm --version
```

#### Problem: pnpm permission denied

```bash
# Error message
Error: EACCES: permission denied, mkdir '/.pnpm-store'
```

**Solution:**

```bash
# Fix pnpm permissions
sudo chown -R $(whoami) ~/.pnpm-store

# Alternative: Use npx to avoid global installation
npx pnpm install

# Clear pnpm cache
pnpm store prune
```

### Dependency Installation Issues

#### Problem: Module installation fails

```bash
# Error message
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solution:**

```bash
# Clear node_modules and lock file
rm -rf node_modules
rm pnpm-lock.yaml

# Clear pnpm cache
pnpm store prune

# Reinstall dependencies
pnpm install

# If still failing, try with force flag
pnpm install --force
```

#### Problem: Native module compilation fails

```bash
# Error message
gyp: No Xcode or CLT version detected!
```

**Solution (macOS):**

```bash
# Install Xcode command line tools
xcode-select --install

# Or if already installed, reset path
sudo xcode-select --reset

# Install build essentials
brew install python@3.11 make gcc
```

**Solution (Linux):**

```bash
# Install build tools
sudo apt update
sudo apt install build-essential python3-dev

# Install node-gyp globally
npm install -g node-gyp
```

## Database Connection Problems

### PostgreSQL Connection Issues

#### Problem: Connection refused

```bash
# Error message
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**

```bash
# Check PostgreSQL service status
brew services list | grep postgresql  # macOS
sudo systemctl status postgresql      # Linux

# Start PostgreSQL service
brew services start postgresql@14     # macOS
sudo systemctl start postgresql      # Linux

# Check if port is available
lsof -i :5432

# Test connection manually
psql -h localhost -p 5432 -U postgres -d postgres
```

#### Problem: Authentication failed

```bash
# Error message
FATAL: password authentication failed for user "churn_saver_dev"
```

**Solution:**

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create/update user with correct password
CREATE USER churn_saver_dev WITH PASSWORD 'your_password';
ALTER USER churn_saver_dev WITH PASSWORD 'your_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;

# Test connection
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev
```

#### Problem: Database doesn't exist

```bash
# Error message
FATAL: database "churn_saver_dev" does not exist
```

**Solution:**

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE churn_saver_dev;

# Create user if not exists
CREATE USER churn_saver_dev WITH PASSWORD 'your_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE churn_saver_dev TO churn_saver_dev;

# Exit and test
\q
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev
```

### Migration Issues

#### Problem: Migration fails with error

```bash
# Error message
Error: relation "users" already exists
```

**Solution:**

```bash
# Check migration status
pnpm run db:migrate:status

# Reset database (development only)
pnpm run db:reset

# Or rollback specific migration
pnpm run db:rollback --migration=002_enable_rls_policies.sql

# Re-run migrations
pnpm run db:migrate
```

#### Problem: Migration timeout

```bash
# Error message
Error: Migration timeout after 30000ms
```

**Solution:**

```bash
# Check for long-running queries
psql -d churn_saver_dev -c "
SELECT 
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;
"

# Kill long-running queries
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE '%migration%';

# Increase timeout in environment
export MIGRATION_TIMEOUT=60000
pnpm run db:migrate
```

## Environment Configuration Issues

### Missing Environment Variables

#### Problem: Application fails to start

```bash
# Error message
Error: DATABASE_URL is required
```

**Solution:**

```bash
# Check if .env.local exists
ls -la .env.local

# Create from template if missing
cp .env.example .env.local

# Edit environment file
nano .env.local

# Verify required variables
grep -E "DATABASE_URL|WHOP_API_KEY|JWT_SECRET" .env.local
```

#### Problem: Environment variables not loading

```bash
# Error message
undefined: process.env.WHOP_API_KEY
```

**Solution:**

```bash
# Check file permissions
ls -la .env.local

# Fix permissions if needed
chmod 600 .env.local

# Verify variable format
cat .env.local | grep WHOP_API_KEY

# Test loading
node -e "console.log(process.env.WHOP_API_KEY)"
```

### Invalid Environment Variables

#### Problem: Invalid database URL

```bash
# Error message
Error: Invalid database URL format
```

**Solution:**

```bash
# Verify database URL format
echo $DATABASE_URL

# Correct format:
# postgresql://username:password@host:port/database

# Fix common issues:
# - Missing protocol (postgresql://)
# - Wrong port number
# - Special characters in password (URL encode)

# Test connection
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT 1').then(() => console.log('Connection successful')).catch(console.error);
"
```

## Development Server Problems

### Port Already in Use

#### Problem: Port 3000 already in use

```bash
# Error message
Error: listen EADDRINUSE :::3000
```

**Solution:**

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 $(lsof -t -i :3000)

# Alternative: Use different port
PORT=3001 pnpm dev

# Or kill all Node processes
pkill -f node
```

### Hot Reloading Issues

#### Problem: Changes not reflected

```bash
# Symptoms
- Code changes don't appear in browser
- CSS updates not applied
- Need manual refresh
```

**Solution:**

```bash
# Clear Next.js cache
rm -rf .next

# Restart development server
pnpm dev

# Check for TypeScript errors
pnpm type-check

# Verify file watcher
echo "watch: true" >> next.config.ts
```

### Memory Issues

#### Problem: Out of memory errors

```bash
# Error message
JavaScript heap out of memory
```

**Solution:**

```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or set in package.json script
"dev": "NODE_OPTIONS='--max-old-space-size=4096' pnpm dev"

# Monitor memory usage
node --inspect src/app/server.js
```

## API Integration Issues

### Whop API Connection Issues

#### Problem: API key authentication fails

```bash
# Error message
Error: Invalid API key
```

**Solution:**

```bash
# Verify API key format
echo $WHOP_API_KEY

# Check API key is not expired
curl -H "Authorization: Bearer $WHOP_API_KEY" \
  https://api.whop.com/v1/me

# Regenerate API key if needed
# Visit Whop developer dashboard
# Create new API key
# Update environment variables
```

#### Problem: Webhook signature verification fails

```bash
# Error message
Error: Invalid webhook signature
```

**Solution:**

```bash
# Verify webhook secret
echo $WHOP_WEBHOOK_SECRET

# Test signature generation
node -e "
const crypto = require('crypto');
const payload = '{"test": "data"}';
const secret = process.env.WHOP_WEBHOOK_SECRET;
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
console.log('Signature:', signature);
"

# Check webhook URL configuration
# Ensure correct URL in Whop dashboard
# Verify SSL certificate (production)
```

### Rate Limiting Issues

#### Problem: API rate limited

```bash
# Error message
Error: Rate limit exceeded
```

**Solution:**

```bash
# Check rate limit headers
curl -I -H "Authorization: Bearer $WHOP_API_KEY" \
  https://api.whop.com/v1/me

# Implement exponential backoff
# Wait before retrying requests
# Use request queuing for bulk operations

# Monitor rate limit usage
# Add logging to track request counts
# Implement rate limiting in application
```

## Build and Deployment Issues

### Build Failures

#### Problem: TypeScript compilation errors

```bash
# Error message
Error: TypeScript compilation failed
```

**Solution:**

```bash
# Check TypeScript errors
pnpm type-check

# Fix specific errors
# - Missing type definitions
# - Incorrect type usage
# - Import/export issues

# Update type definitions
pnpm add -D @types/node @types/react

# Check tsconfig.json configuration
cat tsconfig.json
```

#### Problem: Build fails due to missing dependencies

```bash
# Error message
Error: Cannot find module 'some-module'
```

**Solution:**

```bash
# Check if module is installed
pnpm list some-module

# Install missing module
pnpm add some-module

# Check for peer dependency conflicts
pnpm why some-module

# Clear cache and reinstall
pnpm store prune
rm -rf node_modules
pnpm install
```

### Environment-Specific Issues

#### Problem: Production build fails

```bash
# Error message
Error: Environment variable not found in production
```

**Solution:**

```bash
# Check production environment variables
# Ensure all required variables are set
# Verify variable names match exactly

# Test production build locally
NODE_ENV=production pnpm build

# Check for development-only code
grep -r "console.log" src/
grep -r "ALLOW_INSECURE_DEV" src/
```

## Performance Issues

### Slow Database Queries

#### Problem: API responses are slow

```bash
# Symptoms
- API calls taking >5 seconds
- Database queries timing out
- High CPU usage
```

**Solution:**

```bash
# Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();

# Analyze slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
ORDER BY mean_time DESC
LIMIT 10;

# Check missing indexes
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  correlation
FROM pg_stats
WHERE schemaname = 'public'
ORDER BY tablename, attname;
```

### Memory Leaks

#### Problem: Memory usage increases over time

```bash
# Symptoms
- Memory usage steadily increasing
- Application becomes unresponsive
- Out of memory errors
```

**Solution:**

```bash
# Monitor memory usage
node --inspect src/app/server.js

# Check for memory leaks
node --trace-warnings src/app/server.js

# Profile memory usage
node --prof src/app/server.js
node --prof-process isolate-*.log > processed.txt

# Common causes to check:
# - Event listeners not removed
# - Caches not cleared
# - Database connections not closed
# - Timers not cleared
```

## Testing Problems

### Test Failures

#### Problem: Tests fail with timeout

```bash
# Error message
Error: Test timeout of 5000ms exceeded
```

**Solution:**

```bash
# Increase test timeout
// jest.config.js
module.exports = {
  testTimeout: 10000,
};

# Check for async issues
# Ensure promises are awaited
# Verify callback functions are called
# Check for infinite loops

# Debug specific test
pnpm test --testNamePattern="failing test" --verbose
```

#### Problem: Database tests fail

```bash
# Error message
Error: Database connection failed in tests
```

**Solution:**

```bash
# Check test database exists
psql -l | grep churn_saver_test

# Create test database
createdb churn_saver_test

# Set test environment
export NODE_ENV=test
export DATABASE_URL=postgresql://test:test@localhost:5432/churn_saver_test

# Run test migrations
NODE_ENV=test pnpm run db:migrate

# Isolate test data
# Use transactions for test isolation
# Clean up test data after each test
```

### Integration Test Issues

#### Problem: API integration tests fail

```bash
# Error message
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solution:**

```bash
# Start development server for tests
pnpm dev &
DEV_PID=$!

# Wait for server to start
sleep 10

# Run integration tests
pnpm test:integration

# Stop development server
kill $DEV_PID

# Or use test server configuration
# Set different port for tests
# Use test database
# Mock external services
```

## Debugging Techniques

### Logging

#### Enable Debug Logging

```bash
# Set debug environment variables
export DEBUG_WHOP_SDK=true
export LOG_LEVEL=debug

# Start development server
pnpm dev

# Monitor logs in real-time
tail -f logs/app.log
```

#### Database Query Logging

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 0;
SELECT pg_reload_conf();

-- View query logs
SELECT 
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements 
ORDER BY total_time DESC;
```

### Profiling

#### Node.js Profiling

```bash
# Enable CPU profiling
node --prof src/app/server.js

# Process profile data
node --prof-process isolate-*.log > processed.txt

# Analyze with Chrome DevTools
node --inspect-brk src/app/server.js
# Open chrome://inspect
```

#### Memory Profiling

```bash
# Generate heap snapshot
node --inspect src/app/server.js
# In Chrome DevTools: Memory > Take snapshot

# Compare heap snapshots
# Look for detached DOM nodes
# Check for large objects
# Identify memory leaks
```

### Network Debugging

#### API Request Debugging

```bash
# Use curl for testing API endpoints
curl -v -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Use httpie for easier debugging
http POST localhost:3000/api/auth/login \
  email=test@example.com password=password123

# Monitor network requests
# Use browser DevTools Network tab
# Check request/response headers
# Verify request payload
```

## Getting Help

### Documentation Resources

- [Development Guide](./README.md)
- [API Documentation](../api/README.md)
- [Database Schema](../database/README.md)
- [Component Library](../components/README.md)

### Community Support

- **GitHub Issues**: Create issue for bugs and feature requests
- **Development Slack**: Join for real-time help
- **Discord Server**: Community discussion and support

### Debug Information Collection

When reporting issues, include:

```bash
# System information
node --version
pnpm --version
psql --version
git --version

# Environment information
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "OS: $(uname -a)"
echo "Shell: $SHELL"

# Application information
git log --oneline -5
git status
pnpm list --depth=0
```

### Issue Report Template

```markdown
## Issue Description
Brief description of the problem

## Steps to Reproduce
1. Go to...
2. Click on...
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Error Messages
Include full error messages and stack traces

## Environment Information
- OS: [e.g., macOS 13.0]
- Node.js: [e.g., 18.17.0]
- pnpm: [e.g., 9.15.9]
- PostgreSQL: [e.g., 14.8]

## Additional Context
Any other relevant information
```

### Emergency Procedures

#### Database Corruption

```bash
# Stop application
pkill -f node

# Backup current database
pg_dump churn_saver_dev > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
psql churn_saver_dev < backup_latest.sql

# Check data integrity
pnpm run db:verify
```

#### Production Issues

```bash
# Check application status
curl https://your-domain.com/api/health

# Check error logs
tail -f logs/error.log

# Rollback if necessary
git checkout previous-stable-tag
pnpm build
pnpm start
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**Next Steps**: [Main Setup Guide](./local-setup.md)