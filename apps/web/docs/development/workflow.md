# Development Workflow

This guide covers the complete development workflow for Churn Saver, including code organization, branching strategies, testing procedures, and collaboration processes.

## Table of Contents

1. [Code Organization](#code-organization)
2. [Branching Strategy](#branching-strategy)
3. [Development Process](#development-process)
4. [Code Quality](#code-quality)
5. [Testing Workflow](#testing-workflow)
6. [Debugging Process](#debugging-process)
7. [Code Review Process](#code-review-process)
8. [Deployment Workflow](#deployment-workflow)

## Code Organization

### Project Structure

```
apps/web/
├── src/                          # Source code
│   ├── app/                       # Next.js app router
│   │   ├── (auth)/               # Authentication routes
│   │   ├── (dashboard)/          # Dashboard routes
│   │   ├── api/                  # API routes
│   │   ├── globals.css           # Global styles
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx             # Home page
│   ├── components/                # React components
│   │   ├── ui/                  # Base UI components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   └── index.ts
│   │   ├── layouts/              # Layout components
│   │   │   ├── dashboard-layout.tsx
│   │   │   └── auth-layout.tsx
│   │   └── dashboard/           # Dashboard components
│   │       ├── charts/
│   │       ├── tables/
│   │       └── forms/
│   ├── lib/                      # Utility libraries
│   │   ├── whop/                # Whop SDK integration
│   │   │   ├── auth.ts
│   │   │   ├── client.ts
│   │   │   └── webhook-validator.ts
│   │   ├── auth/                # Authentication utilities
│   │   ├── common/              # Common utilities
│   │   │   ├── formatters.ts
│   │   │   └── validators.ts
│   │   └── db.ts               # Database connection
│   ├── server/                   # Server-side code
│   │   ├── middleware/           # API middleware
│   │   │   ├── auth.ts
│   │   │   └── rate-limit.ts
│   │   ├── services/             # Business logic
│   │   │   ├── cases.ts
│   │   │   ├── incentives.ts
│   │   │   └── user-deletion.ts
│   │   └── webhooks/            # Webhook handlers
│   │       └── whop.ts
│   ├── types/                    # TypeScript definitions
│   │   ├── api.ts
│   │   ├── database.ts
│   │   └── whop.ts
│   └── middleware.ts             # Next.js middleware
├── test/                         # Test files
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   ├── e2e/                     # End-to-end tests
│   └── fixtures/                 # Test data
├── scripts/                      # Utility scripts
│   ├── data-privacy-maintenance.ts
│   ├── init-db.ts
│   └── run-scheduler.ts
├── docs/                         # Documentation
├── public/                       # Static assets
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.ts           # Tailwind configuration
├── biome.json                   # Linting and formatting
└── next.config.ts               # Next.js configuration
```

### File Naming Conventions

#### Components

```typescript
// Component files: PascalCase with .tsx extension
export default function UserProfile() {
  // Component implementation
}

// Component exports: index.ts for barrel exports
export { default as UserProfile } from './user-profile';
export { default as UserList } from './user-list';
```

#### Utilities

```typescript
// Utility files: camelCase with .ts extension
export const formatCurrency = (amount: number) => {
  // Implementation
};

export const validateEmail = (email: string) => {
  // Implementation
};
```

#### API Routes

```typescript
// API route files: lowercase with hyphens
// File: src/app/api/users/[id]/route.ts
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Implementation
}
```

#### Types

```typescript
// Type files: camelCase with .ts extension
export interface User {
  id: string;
  email: string;
  name: string;
}

export type UserRole = 'admin' | 'user' | 'moderator';
```

### Import Organization

```typescript
// Import order: External libraries, internal modules, relative imports
import React from 'react';
import { NextRequest } from 'next/server';

import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/common/formatters';

import { UserCard } from './user-card';
import { UserList } from './user-list';
```

## Branching Strategy

### Git Flow Model

We use a simplified Git Flow model with the following branches:

#### Main Branches

```bash
main                    # Production-ready code
├── develop             # Integration branch for features
├── release/v1.0.0     # Release preparation
└── hotfix/critical-bug  # Production hotfixes
```

#### Supporting Branches

```bash
feature/user-auth       # New feature development
feature/dashboard-v2    # Another feature
bugfix/login-issue     # Bug fixes
refactor/api-cleanup   # Code refactoring
```

### Branch Naming Conventions

#### Feature Branches

```bash
# Format: feature/feature-name
feature/user-authentication
feature/dashboard-analytics
feature/webhook-processing
```

#### Bug Fix Branches

```bash
# Format: bugfix/issue-description
bugfix/login-validation-error
bugfix/database-connection-timeout
bugfix/webhook-signature-verification
```

#### Hotfix Branches

```bash
# Format: hotfix/critical-issue
hotfix/security-vulnerability
hotfix/payment-processing-failure
hotfix/data-corruption-issue
```

#### Release Branches

```bash
# Format: release/version-number
release/v1.0.0
release/v1.1.0
release/v2.0.0
```

### Branch Workflow

#### Feature Development

```bash
# 1. Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/user-authentication

# 2. Develop feature
# ... make changes ...

# 3. Commit changes
git add .
git commit -m "feat: implement user authentication"

# 4. Push to remote
git push origin feature/user-authentication

# 5. Create pull request to develop
# ... code review ...

# 6. Merge and clean up
git checkout develop
git pull origin develop
git branch -d feature/user-authentication
git push origin --delete feature/user-authentication
```

#### Bug Fix Workflow

```bash
# 1. Create bugfix branch from develop
git checkout develop
git pull origin develop
git checkout -b bugfix/login-validation-error

# 2. Fix bug
# ... make changes ...

# 3. Test fix
pnpm test
pnpm build

# 4. Commit and push
git add .
git commit -m "fix: resolve login validation error"
git push origin bugfix/login-validation-error

# 5. Create pull request
# ... code review ...

# 6. Merge and clean up
git checkout develop
git pull origin develop
git branch -d bugfix/login-validation-error
```

#### Hotfix Workflow

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/security-vulnerability

# 2. Fix critical issue
# ... make changes ...

# 3. Test thoroughly
pnpm test
pnpm build
pnpm test:e2e

# 4. Commit and push
git add .
git commit -m "hotfix: resolve security vulnerability"
git push origin hotfix/security-vulnerability

# 5. Merge to main and develop
git checkout main
git merge --no-ff hotfix/security-vulnerability
git tag -a v1.0.1 -m "Release version 1.0.1"
git push origin main --tags

git checkout develop
git merge --no-ff hotfix/security-vulnerability
git push origin develop

# 6. Clean up
git branch -d hotfix/security-vulnerability
git push origin --delete hotfix/security-vulnerability
```

## Development Process

### Daily Development Workflow

#### 1. Start of Day

```bash
# Update develop branch
git checkout develop
git pull origin develop

# Create/update feature branch
git checkout feature/current-feature
git rebase develop

# Start development server
pnpm dev

# Check for any issues
pnpm lint
pnpm type-check
```

#### 2. During Development

```bash
# Make small, focused changes
# Commit frequently with descriptive messages

# Example commit flow
git add .
git commit -m "feat: add user authentication form"

# Continue development
git add .
git commit -m "feat: implement form validation"

# Fix issues
git add .
git commit -m "fix: resolve validation edge case"
```

#### 3. End of Day

```bash
# Push changes to remote
git push origin feature/current-feature

# Update develop branch
git checkout develop
git pull origin develop

# Return to feature branch
git checkout feature/current-feature
git rebase develop
```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

#### Commit Types

```bash
feat:     # New feature
fix:       # Bug fix
docs:      # Documentation changes
style:     # Code formatting (no logic change)
refactor:   # Code refactoring
test:       # Adding or updating tests
chore:      # Maintenance tasks
perf:       # Performance improvements
ci:         # CI/CD changes
build:      # Build system changes
revert:     # Revert previous commit
```

#### Commit Message Format

```bash
# Format: type(scope): description

feat(auth): add user authentication
fix(api): resolve database connection timeout
docs(readme): update installation instructions
style(components): fix linting issues
refactor(services): simplify user service logic
test(auth): add unit tests for authentication
chore(deps): update dependencies
perf(api): optimize database queries
ci(github): add automated testing workflow
build(webpack): update webpack configuration
revert(api): revert problematic API changes
```

#### Commit Message Examples

```bash
# Simple commit
feat: add user authentication

# Commit with scope
feat(auth): add OAuth integration

# Commit with description and body
feat(auth): add OAuth integration

Implement OAuth2.0 authentication flow with Whop integration.
Includes user profile retrieval and token management.

Closes #123

# Breaking changes
feat(api)!: change user endpoint response format

BREAKING CHANGE: User endpoint now returns user object directly
instead of wrapping in data property.
```

### Pull Request Process

#### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Cross-browser testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Code is self-documenting
- [ ] Documentation updated if necessary
- [ ] Tests added for new functionality
- [ ] No console.log statements left in code
- [ ] Environment variables documented if added

## Related Issues
Closes #issue_number
Fixes #issue_number
```

#### Pull Request Process

```bash
# 1. Create pull request
# Use GitHub web interface or CLI

# 2. Fill out PR template
# Provide clear description
# Link related issues

# 3. Request reviews
# At least one reviewer required
# Team lead approval for major changes

# 4. Address feedback
# Make requested changes
# Push updates to branch

# 5. Merge when approved
# Use squash merge for feature branches
# Use merge commit for release branches
```

## Code Quality

### Linting and Formatting

#### Biome Configuration

```bash
# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check
```

#### Pre-commit Hooks

```bash
# Install husky
npx husky install

# Add pre-commit hook
npx husky add .husky/pre-commit "pnpm lint && pnpm format && pnpm test:unit"

# Add pre-push hook
npx husky add .husky/pre-push "pnpm test:integration"
```

### Type Checking

```bash
# TypeScript compilation check
pnpm type-check

# Watch for type errors
pnpm type-check:watch

# Generate type documentation
pnpm type-docs
```

### Code Review Guidelines

#### Review Checklist

```markdown
## Functionality
- [ ] Code implements requirements correctly
- [ ] Edge cases are handled
- [ ] Error handling is appropriate
- [ ] Performance considerations addressed

## Code Quality
- [ ] Code is readable and maintainable
- [ ] Follows project conventions
- [ ] No hardcoded values
- [ ] Proper error handling
- [ ] No unnecessary complexity

## Security
- [ ] No security vulnerabilities
- [ ] Input validation implemented
- [ ] Authentication/authorization correct
- [ ] Sensitive data handled properly

## Testing
- [ ] Tests cover new functionality
- [ ] Tests are comprehensive
- [ ] Test cases are meaningful
- [ ] No test duplication

## Documentation
- [ ] Code is self-documenting
- [ ] Complex logic explained
- [ ] API documentation updated
- [ ] README updated if necessary
```

#### Review Process

```bash
# 1. Automated checks
# CI/CD runs automatically
# Linting, formatting, type checking
# Unit and integration tests

# 2. Manual review
# Code review by team members
# Focus on logic and architecture
# Security and performance considerations

# 3. Approval
# At least one approval required
# Team lead approval for major changes
# All feedback addressed before merge
```

## Testing Workflow

### Test Structure

```
test/
├── unit/                     # Unit tests
│   ├── components/           # Component tests
│   ├── lib/                 # Library tests
│   └── services/            # Service tests
├── integration/              # Integration tests
│   ├── api/                 # API integration tests
│   └── database/            # Database integration tests
├── e2e/                    # End-to-end tests
│   ├── auth/                # Authentication flows
│   └── dashboard/           # Dashboard workflows
├── fixtures/                # Test data
│   ├── users.json
│   └── companies.json
└── helpers/                 # Test utilities
    ├── setup.js
    ├── teardown.js
    └── utils.js
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run end-to-end tests
pnpm test:e2e

# Run specific test file
pnpm test test/unit/auth.test.js

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Run tests with coverage threshold
pnpm test:coverage:check
```

### Test Development

#### Unit Tests

```javascript
// test/unit/lib/formatters.test.js
const { formatCurrency } = require('../../../src/lib/common/formatters');

describe('formatCurrency', () => {
  test('formats positive amounts correctly', () => {
    expect(formatCurrency(2999, 'USD')).toBe('$29.99');
  });

  test('formats zero amount correctly', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
  });

  test('formats negative amounts correctly', () => {
    expect(formatCurrency(-500, 'USD')).toBe('-$5.00');
  });

  test('handles different currencies', () => {
    expect(formatCurrency(2999, 'EUR')).toBe('€29.99');
  });
});
```

#### Integration Tests

```javascript
// test/integration/api/auth.test.js
const request = require('supertest');
const app = require('../../../src/app');

describe('Authentication API', () => {
  test('POST /api/auth/login with valid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      })
      .expect(200);

    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
  });

  test('POST /api/auth/login with invalid credentials', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      })
      .expect(401);

    expect(response.body).toHaveProperty('error');
  });
});
```

## Debugging Process

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
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

#### Debugging Techniques

```typescript
// Debugging with console.log (development only)
if (process.env.NODE_ENV === 'development') {
  console.log('Debug: User data', userData);
  console.log('Debug: API response', response);
}

// Debugging with debugger statement
function processUser(user: User) {
  debugger; // Execution will pause here in debug mode
  // ... processing logic
}

// Debugging with VS Code launch configuration
// Set breakpoints in VS Code interface
// Use debug console to inspect variables
// Step through code execution
```

### Browser Debugging

#### React Developer Tools

```typescript
// Debug component with React DevTools
import { useEffect } from 'react';

function UserProfile({ userId }: { userId: string }) {
  useEffect(() => {
    // Component will appear in React DevTools
    // Props and state can be inspected
    console.log('UserProfile mounted with userId:', userId);
  }, [userId]);

  return <div>User Profile</div>;
}
```

#### API Debugging

```typescript
// Debug API routes with logging
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  logger.debug('API request received', {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries())
  });

  try {
    // ... route logic
    
    logger.debug('API response sent', {
      status: response.status,
      processingTime: Date.now() - startTime
    });
    
    return response;
  } catch (error) {
    logger.error('API error', {
      error: error.message,
      stack: error.stack,
      processingTime: Date.now() - startTime
    });
    
    throw error;
  }
}
```

### Database Debugging

#### Query Logging

```sql
-- Enable query logging in PostgreSQL
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 0;
SELECT pg_reload_conf();

-- View slow queries
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

#### Connection Debugging

```bash
# Monitor database connections
watch -n 1 "psql -d churn_saver_dev -c 'SELECT count(*) FROM pg_stat_activity WHERE state = \"active\";'"

# Test database connectivity
psql -h localhost -p 5432 -U churn_saver_dev -d churn_saver_dev -c "SELECT 1;"
```

## Code Review Process

### Review Workflow

#### 1. Automated Checks

```bash
# CI/CD pipeline runs automatically
# - Linting checks
# - Type checking
# - Unit tests
# - Integration tests
# - Security scans
# - Dependency vulnerability checks
```

#### 2. Manual Review Process

```bash
# Assign reviewers
# - At least one team member
# - Team lead for major changes
# - Subject matter expert for domain-specific changes

# Review focus areas
# - Code logic and architecture
# - Security considerations
# - Performance implications
# - Test coverage
# - Documentation completeness
```

#### 3. Review Guidelines

```markdown
## Review Best Practices

### What to Look For
- [ ] Code implements requirements correctly
- [ ] Edge cases are handled appropriately
- [ ] Error handling is comprehensive
- [ ] Performance considerations are addressed
- [ ] Security best practices are followed
- [ ] Code is readable and maintainable
- [ ] Tests are comprehensive and meaningful
- [ ] Documentation is accurate and complete

### Review Comments
- Be constructive and specific
- Provide suggestions for improvement
- Explain reasoning behind suggestions
- Use inline comments for specific issues
- Use general comments for architectural concerns

### Approval Criteria
- All automated checks pass
- All review comments addressed
- At least one approval from team member
- Team lead approval for major changes
```

### Merge Strategies

#### Feature Branches

```bash
# Use squash merge for feature branches
# Creates single commit with descriptive message
# Keeps commit history clean

# Example:
git checkout develop
git merge --squash feature/new-feature
git commit -m "feat: implement user authentication with OAuth"
```

#### Release Branches

```bash
# Use merge commit for release branches
# Preserves feature development history
# Enables easy cherry-picking

# Example:
git checkout main
git merge --no-ff release/v1.0.0
git tag -a v1.0.0 -m "Release version 1.0.0"
```

#### Hotfix Branches

```bash
# Use merge commit for hotfixes
# Enables quick deployment to production
# Merges back to develop for future releases

# Example:
git checkout main
git merge --no-ff hotfix/critical-bug
git tag -a v1.0.1 -m "Hotfix version 1.0.1"

git checkout develop
git merge --no-ff hotfix/critical-bug
```

## Deployment Workflow

### Pre-deployment Checklist

```markdown
## Code Quality
- [ ] All tests pass
- [ ] Code coverage meets requirements
- [ ] Linting checks pass
- [ ] Type checking passes
- [ ] Security scans pass

## Documentation
- [ ] API documentation updated
- [ ] README updated if necessary
- [ ] Changelog updated
- [ ] Migration scripts prepared

## Environment
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] External services configured
- [ ] Monitoring and logging set up
```

### Deployment Process

```bash
# 1. Prepare release
git checkout main
git pull origin main

# 2. Create release branch
git checkout -b release/v1.0.0

# 3. Update version numbers
# Update package.json version
# Update changelog
# Commit changes

# 4. Run final tests
pnpm test
pnpm build

# 5. Deploy to staging
# Deploy to staging environment
# Run smoke tests
# Manual verification

# 6. Deploy to production
# Merge release to main
# Deploy to production
# Monitor deployment

# 7. Post-deployment
# Verify functionality
# Monitor error rates
# Check performance metrics
```

### Rollback Process

```bash
# 1. Identify issue
# Monitor error rates
# Check user reports
# Analyze logs

# 2. Decision to rollback
# Team consensus
# Impact assessment
# Communication plan

# 3. Execute rollback
# Revert to previous version
# Verify rollback success
# Update monitoring

# 4. Post-rollback
# Analyze root cause
# Plan fix
# Communicate status
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**Next Steps**: [Testing Procedures](./testing.md)