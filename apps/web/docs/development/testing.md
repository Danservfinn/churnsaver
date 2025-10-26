# Testing Procedures

This guide covers comprehensive testing procedures for Churn Saver, including unit testing, integration testing, end-to-end testing, and API testing.

## Table of Contents

1. [Testing Overview](#testing-overview)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [API Testing](#api-testing)
6. [Database Testing](#database-testing)
7. [Performance Testing](#performance-testing)
8. [Security Testing](#security-testing)
9. [Test Automation](#test-automation)
10. [Test Coverage](#test-coverage)

## Testing Overview

### Testing Pyramid

We follow the testing pyramid model with the following distribution:

```
    E2E Tests (10%)
   ┌─────────────────┐
  │  Critical User  │
  │    Journeys     │
 ┌───────────────────────┐
│   Integration Tests    │  (20%)
│  API Integration     │
│ Database Integration │
├───────────────────────────────┤
│      Unit Tests              │  (70%)
│  Component Tests          │
│  Utility Tests           │
│  Service Tests           │
└───────────────────────────────┘
```

### Test Environment Setup

#### Test Database

```bash
# Create test database
createdb churn_saver_test

# Set test environment
export NODE_ENV=test
export DATABASE_URL=postgresql://churn_saver_test:test_password@localhost:5432/churn_saver_test

# Run test migrations
pnpm run db:migrate:test

# Seed test data
pnpm run db:seed:test
```

#### Test Configuration

```javascript
// test/setup.js
const { Pool } = require('pg');

// Test database setup
const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL,
});

// Global test setup
beforeAll(async () => {
  // Setup test database
  await setupTestDatabase();
});

// Global test cleanup
afterAll(async () => {
  // Cleanup test database
  await cleanupTestDatabase();
  await testPool.end();
});

// Test isolation
beforeEach(async () => {
  // Reset database state
  await resetTestDatabase();
});
```

### Test Scripts

```json
{
  "scripts": {
    "test": "node test/auth.test.js && node test/webhooks.test.js && node test/protected-api.test.js && node test/dashboard.test.js",
    "test:unit": "jest test/unit",
    "test:integration": "jest test/integration",
    "test:e2e": "playwright test",
    "test:api": "jest test/api",
    "test:database": "jest test/database",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:coverage:check": "jest --coverage --coverageReporters=text-lcov | coveralls",
    "test:performance": "node test/performance/load-test.js"
  }
}
```

## Unit Testing

### Unit Test Structure

```
test/unit/
├── components/
│   ├── ui/
│   │   ├── button.test.tsx
│   │   └── input.test.tsx
│   ├── dashboard/
│   │   ├── user-card.test.tsx
│   │   └── metrics-chart.test.tsx
│   └── auth/
│       └── login-form.test.tsx
├── lib/
│   ├── common/
│   │   ├── formatters.test.ts
│   │   └── validators.test.ts
│   ├── whop/
│   │   ├── auth.test.ts
│   │   └── webhook-validator.test.ts
│   └── db.test.ts
├── server/
│   ├── services/
│   │   ├── cases.test.ts
│   │   └── incentives.test.ts
│   └── middleware/
│       └── auth.test.ts
└── types/
    └── api.test.ts
```

### Component Testing

#### React Component Tests

```typescript
// test/unit/components/ui/button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button Component', () => {
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

  test('applies correct styles for variants', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveClass('bg-destructive');
  });

  test('is disabled when loading', () => {
    render(<Button loading>Loading</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  test('shows loading spinner when loading', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
});
```

#### Form Component Tests

```typescript
// test/unit/components/auth/login-form.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '@/components/auth/login-form';

describe('LoginForm Component', () => {
  test('renders all form fields', () => {
    render(<LoginForm />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('validates required fields', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  test('validates email format', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'invalid-email');
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
    });
  });

  test('submits form with valid data', async () => {
    const mockSubmit = jest.fn();
    const user = userEvent.setup();
    
    render(<LoginForm onSubmit={mockSubmit} />);
    
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    
    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123'
      });
    });
  });
});
```

### Utility Testing

#### Formatter Tests

```typescript
// test/unit/lib/common/formatters.test.ts
import { formatCurrency, formatDate, formatPercentage } from '@/lib/common/formatters';

describe('Formatters', () => {
  describe('formatCurrency', () => {
    test('formats positive amounts correctly', () => {
      expect(formatCurrency(2999, 'USD')).toBe('$29.99');
      expect(formatCurrency(1000, 'EUR')).toBe('€10.00');
    });

    test('formats zero amount correctly', () => {
      expect(formatCurrency(0, 'USD')).toBe('$0.00');
    });

    test('formats negative amounts correctly', () => {
      expect(formatCurrency(-500, 'USD')).toBe('-$5.00');
    });

    test('handles different currencies', () => {
      expect(formatCurrency(2999, 'GBP')).toBe('£29.99');
      expect(formatCurrency(2999, 'JPY')).toBe('¥2,999');
    });

    test('handles invalid currency codes', () => {
      expect(() => formatCurrency(2999, 'INVALID')).toThrow('Invalid currency code');
    });
  });

  describe('formatDate', () => {
    test('formats date correctly', () => {
      const date = new Date('2023-12-25');
      expect(formatDate(date)).toBe('December 25, 2023');
    });

    test('handles different formats', () => {
      const date = new Date('2023-12-25');
      expect(formatDate(date, 'short')).toBe('12/25/2023');
      expect(formatDate(date, 'ISO')).toBe('2023-12-25');
    });

    test('handles invalid dates', () => {
      expect(() => formatDate(new Date('invalid'))).toThrow('Invalid date');
    });
  });

  describe('formatPercentage', () => {
    test('formats positive percentages correctly', () => {
      expect(formatPercentage(0.25)).toBe('25%');
      expect(formatPercentage(0.75)).toBe('75%');
    });

    test('formats negative percentages correctly', () => {
      expect(formatPercentage(-0.15)).toBe('-15%');
    });

    test('handles decimal precision', () => {
      expect(formatPercentage(0.1234, 2)).toBe('12.34%');
    });
  });
});
```

### Service Testing

#### Service Unit Tests

```typescript
// test/unit/server/services/cases.test.ts
import { CaseService } from '@/server/services/cases';
import { mockDatabase } from '../../helpers/database';

jest.mock('@/lib/db', () => mockDatabase);

describe('CaseService', () => {
  let caseService: CaseService;

  beforeEach(() => {
    caseService = new CaseService();
    mockDatabase.clear();
  });

  describe('createCase', () => {
    test('creates a new case successfully', async () => {
      const caseData = {
        userId: 'user-123',
        companyId: 'company-456',
        reason: 'churn_risk',
        description: 'User at risk of churning'
      };

      const result = await caseService.createCase(caseData);

      expect(result).toHaveProperty('id');
      expect(result.userId).toBe(caseData.userId);
      expect(result.companyId).toBe(caseData.companyId);
      expect(result.status).toBe('open');
    });

    test('throws error for invalid user ID', async () => {
      const caseData = {
        userId: '',
        companyId: 'company-456',
        reason: 'churn_risk',
        description: 'User at risk of churning'
      };

      await expect(caseService.createCase(caseData)).rejects.toThrow('Invalid user ID');
    });

    test('throws error for invalid company ID', async () => {
      const caseData = {
        userId: 'user-123',
        companyId: '',
        reason: 'churn_risk',
        description: 'User at risk of churning'
      };

      await expect(caseService.createCase(caseData)).rejects.toThrow('Invalid company ID');
    });
  });

  describe('getCaseById', () => {
    test('returns case when found', async () => {
      const createdCase = await caseService.createCase({
        userId: 'user-123',
        companyId: 'company-456',
        reason: 'churn_risk',
        description: 'User at risk of churning'
      });

      const result = await caseService.getCaseById(createdCase.id);

      expect(result).toEqual(createdCase);
    });

    test('returns null when case not found', async () => {
      const result = await caseService.getCaseById('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
```

## Integration Testing

### API Integration Testing

#### API Route Tests

```javascript
// test/integration/api/auth.test.js
const request = require('supertest');
const app = require('../../../src/app');

describe('Authentication API Integration', () => {
  describe('POST /api/auth/login', () => {
    test('authenticates user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user).not.toHaveProperty('password');
    });

    test('rejects invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    test('validates required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toContain('Email is required');
      expect(response.body.errors).toContain('Password is required');
    });
  });

  describe('POST /api/auth/register', () => {
    test('creates new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.name).toBe(userData.name);
    });

    test('rejects duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Duplicate User'
      };

      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.error).toContain('Email already exists');
    });
  });
});
```

#### Webhook Integration Tests

```javascript
// test/integration/webhooks/whop.test.js
const request = require('supertest');
const crypto = require('crypto');
const app = require('../../../src/app');

describe('Whop Webhook Integration', () => {
  const webhookSecret = 'test_webhook_secret';

  describe('POST /api/webhooks/whop', () => {
    test('processes valid webhook', async () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created',
        data: {
          user: {
            id: 'user_123',
            email: 'test@example.com',
            name: 'Test User'
          }
        }
      };

      const signature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

      const response = await request(app)
        .post('/api/webhooks/whop')
        .set('whop-signature', `sha256=${signature}`)
        .send(payload)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    test('rejects invalid signature', async () => {
      const payload = {
        id: 'evt_123',
        type: 'user.created'
      };

      const response = await request(app)
        .post('/api/webhooks/whop')
        .set('whop-signature', 'sha256=invalid_signature')
        .send(payload)
        .expect(401);

      expect(response.body.error).toContain('Invalid signature');
    });

    test('processes different event types', async () => {
      const eventTypes = [
        'user.created',
        'user.updated',
        'subscription.created',
        'subscription.cancelled'
      ];

      for (const eventType of eventTypes) {
        const payload = {
          id: `evt_${Math.random()}`,
          type: eventType,
          data: { test: 'data' }
        };

        const signature = crypto
          .createHmac('sha256', webhookSecret)
          .update(JSON.stringify(payload))
          .digest('hex');

        await request(app)
          .post('/api/webhooks/whop')
          .set('whop-signature', `sha256=${signature}`)
          .send(payload)
          .expect(200);
      }
    });
  });
});
```

### Database Integration Testing

#### Database Test Helpers

```javascript
// test/helpers/database.js
const { Pool } = require('pg');

class TestDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  }

  async clear() {
    await this.pool.query('TRUNCATE TABLE users, companies, cases CASCADE');
  }

  async createUser(userData) {
    const result = await this.pool.query(
      'INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [userData.id, userData.email, userData.name]
    );
    return result.rows[0];
  }

  async createCompany(companyData) {
    const result = await this.pool.query(
      'INSERT INTO companies (id, name, created_at) VALUES ($1, $2, NOW()) RETURNING *',
      [companyData.id, companyData.name]
    );
    return result.rows[0];
  }

  async createCase(caseData) {
    const result = await this.pool.query(
      'INSERT INTO cases (id, user_id, company_id, reason, status, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [caseData.id, caseData.userId, caseData.companyId, caseData.reason, caseData.status]
    );
    return result.rows[0];
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { TestDatabase };
```

#### Database Integration Tests

```javascript
// test/integration/database/cases.test.js
const { TestDatabase } = require('../../helpers/database');
const { CaseService } = require('../../../src/server/services/cases');

describe('Cases Database Integration', () => {
  let db;
  let caseService;

  beforeAll(async () => {
    db = new TestDatabase();
    caseService = new CaseService();
  });

  beforeEach(async () => {
    await db.clear();
  });

  afterAll(async () => {
    await db.close();
  });

  test('creates case in database', async () => {
    const user = await db.createUser({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User'
    });

    const company = await db.createCompany({
      id: 'company-456',
      name: 'Test Company'
    });

    const caseData = {
      userId: user.id,
      companyId: company.id,
      reason: 'churn_risk',
      description: 'User at risk of churning'
    };

    const result = await caseService.createCase(caseData);

    expect(result).toHaveProperty('id');
    expect(result.userId).toBe(user.id);
    expect(result.companyId).toBe(company.id);

    // Verify in database
    const dbCase = await db.pool.query(
      'SELECT * FROM cases WHERE id = $1',
      [result.id]
    );
    expect(dbCase.rows).toHaveLength(1);
    expect(dbCase.rows[0].user_id).toBe(user.id);
  });

  test('retrieves case from database', async () => {
    const user = await db.createUser({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User'
    });

    const company = await db.createCompany({
      id: 'company-456',
      name: 'Test Company'
    });

    const createdCase = await db.createCase({
      id: 'case-789',
      userId: user.id,
      companyId: company.id,
      reason: 'churn_risk',
      status: 'open'
    });

    const retrievedCase = await caseService.getCaseById(createdCase.id);

    expect(retrievedCase).toEqual(createdCase);
  });
});
```

## End-to-End Testing

### Playwright Setup

#### Configuration

```javascript
// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### E2E Test Examples

```javascript
// test/e2e/auth.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('user can login with valid credentials', async ({ page }) => {
    await page.fill('[data-testid=email-input]', 'test@example.com');
    await page.fill('[data-testid=password-input]', 'password123');
    await page.click('[data-testid=login-button]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Should show user name
    await expect(page.locator('[data-testid=user-name]')).toContainText('Test User');
  });

  test('user cannot login with invalid credentials', async ({ page }) => {
    await page.fill('[data-testid=email-input]', 'test@example.com');
    await page.fill('[data-testid=password-input]', 'wrongpassword');
    await page.click('[data-testid=login-button]');

    // Should show error message
    await expect(page.locator('[data-testid=error-message]')).toContainText('Invalid credentials');
    
    // Should stay on login page
    await expect(page).toHaveURL('/login');
  });

  test('form validation works correctly', async ({ page }) => {
    // Submit empty form
    await page.click('[data-testid=login-button]');

    // Should show validation errors
    await expect(page.locator('[data-testid=email-error]')).toContainText('Email is required');
    await expect(page.locator('[data-testid=password-error]')).toContainText('Password is required');
  });

  test('user can logout', async ({ page }) => {
    // Login first
    await page.fill('[data-testid=email-input]', 'test@example.com');
    await page.fill('[data-testid=password-input]', 'password123');
    await page.click('[data-testid=login-button]');
    
    // Wait for dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Logout
    await page.click('[data-testid=logout-button]');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });
});
```

#### Dashboard E2E Tests

```javascript
// test/e2e/dashboard.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid=email-input]', 'test@example.com');
    await page.fill('[data-testid=password-input]', 'password123');
    await page.click('[data-testid=login-button]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('displays user statistics', async ({ page }) => {
    await expect(page.locator('[data-testid=total-users]')).toBeVisible();
    await expect(page.locator('[data-testid=active-users]')).toBeVisible();
    await expect(page.locator('[data-testid=churn-rate]')).toBeVisible();
  });

  test('displays case list', async ({ page }) => {
    await expect(page.locator('[data-testid=case-list]')).toBeVisible();
    
    // Should have table headers
    await expect(page.locator('[data-testid=case-table]')).toContainText('Case ID');
    await expect(page.locator('[data-testid=case-table]')).toContainText('User');
    await expect(page.locator('[data-testid=case-table]')).toContainText('Status');
  });

  test('can create new case', async ({ page }) => {
    await page.click('[data-testid=new-case-button]');
    
    // Should open modal
    await expect(page.locator('[data-testid=case-modal]')).toBeVisible();
    
    // Fill form
    await page.fill('[data-testid=user-select]', 'Test User');
    await page.fill('[data-testid=reason-select]', 'churn_risk');
    await page.fill('[data-testid=description-textarea]', 'User showing signs of churning');
    
    // Submit form
    await page.click('[data-testid=save-case-button]');
    
    // Should close modal and show success message
    await expect(page.locator('[data-testid=case-modal]')).not.toBeVisible();
    await expect(page.locator('[data-testid=success-message]')).toContainText('Case created successfully');
  });

  test('can filter cases', async ({ page }) => {
    await page.fill('[data-testid=search-input]', 'Test User');
    await page.click('[data-testid=filter-button]');
    
    // Should filter results
    await expect(page.locator('[data-testid=case-list]')).toContainText('Test User');
  });
});
```

## API Testing

### Manual API Testing

#### Postman Collection

```json
{
  "info": {
    "name": "Churn Saver API",
    "description": "API collection for Churn Saver application"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api"
    },
    {
      "key": "authToken",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"test@example.com\",\n  \"password\": \"password123\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/auth/login",
              "host": ["{{baseUrl}}"],
              "path": ["auth", "login"]
            }
          },
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 200) {",
                  "    const response = pm.response.json();",
                  "    pm.collectionVariables.set('authToken', response.token);",
                  "}"
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

#### Automated API Tests

```javascript
// test/api/cases.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Cases API', () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    // Login and get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    authToken = loginResponse.body.token;
    userId = loginResponse.body.user.id;
  });

  describe('GET /api/cases', () => {
    test('returns list of cases', async () => {
      const response = await request(app)
        .get('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('cases');
      expect(Array.isArray(response.body.cases)).toBe(true);
    });

    test('supports pagination', async () => {
      const response = await request(app)
        .get('/api/cases?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('cases');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    test('requires authentication', async () => {
      const response = await request(app)
        .get('/api/cases')
        .expect(401);

      expect(response.body.error).toContain('Authentication required');
    });
  });

  describe('POST /api/cases', () => {
    test('creates new case', async () => {
      const caseData = {
        userId: 'user-123',
        companyId: 'company-456',
        reason: 'churn_risk',
        description: 'User at risk of churning'
      };

      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send(caseData)
        .expect(201);

      expect(response.body).toHaveProperty('case');
      expect(response.body.case.userId).toBe(caseData.userId);
      expect(response.body.case.reason).toBe(caseData.reason);
    });

    test('validates required fields', async () => {
      const response = await request(app)
        .post('/api/cases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toContain('User ID is required');
      expect(response.body.errors).toContain('Company ID is required');
    });
  });
});
```

## Database Testing

### Database Schema Tests

```javascript
// test/database/schema.test.js
const { Pool } = require('pg');

describe('Database Schema', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('users table has correct schema', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    const columns = result.rows;
    
    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: 'id',
          data_type: 'uuid',
          is_nullable: 'NO'
        }),
        expect.objectContaining({
          column_name: 'email',
          data_type: 'character varying',
          is_nullable: 'NO'
        }),
        expect.objectContaining({
          column_name: 'name',
          data_type: 'character varying',
          is_nullable: 'YES'
        })
      ])
    );
  });

  test('required indexes exist', async () => {
    const result = await pool.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE tablename IN ('users', 'cases', 'companies')
      ORDER BY tablename, indexname
    `);

    const indexes = result.rows;
    
    // Check for unique index on users.email
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tablename: 'users',
          indexname: expect.stringContaining('email')
        })
      ])
    );
  });

  test('foreign key constraints exist', async () => {
    const result = await pool.query(`
      SELECT 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `);

    const constraints = result.rows;
    
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table_name: 'cases',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id'
        })
      ])
    );
  });
});
```

### Database Migration Tests

```javascript
// test/database/migrations.test.js
const { execSync } = require('child_process');
const { Pool } = require('pg');

describe('Database Migrations', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('migrations run successfully', async () => {
    // Run migrations
    execSync('pnpm run db:migrate', { stdio: 'inherit' });

    // Check migration table
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM migration_history'
    );

    expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
  });

  test('migration can be rolled back', async () => {
    // Get current migration count
    const beforeResult = await pool.query(
      'SELECT COUNT(*) as count FROM migration_history'
    );
    const beforeCount = parseInt(beforeResult.rows[0].count);

    // Rollback last migration
    execSync('pnpm run db:rollback', { stdio: 'inherit' });

    // Check migration count decreased
    const afterResult = await pool.query(
      'SELECT COUNT(*) as count FROM migration_history'
    );
    const afterCount = parseInt(afterResult.rows[0].count);

    expect(afterCount).toBe(beforeCount - 1);
  });

  test('migration status is tracked correctly', async () => {
    const result = await pool.query(`
      SELECT migration_name, status, executed_at 
      FROM migration_history 
      ORDER BY executed_at DESC 
      LIMIT 1
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('success');
    expect(result.rows[0].executed_at).toBeInstanceOf(Date);
  });
});
```

## Performance Testing

### Load Testing

```javascript
// test/performance/load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate under 10%
  },
};

export default function () {
  // Test API endpoints
  const responses = http.batch([
    ['GET', 'http://localhost:3000/api/health'],
    ['GET', 'http://localhost:3000/api/cases'],
    ['POST', 'http://localhost:3000/api/auth/login', JSON.stringify({
      email: 'test@example.com',
      password: 'password123'
    })],
  ]);

  check(responses[0], {
    'health check status is 200': (r) => r.status === 200,
    'health check time < 200ms': (r) => r.timings.duration < 200,
  });

  check(responses[1], {
    'cases list status is 200': (r) => r.status === 200,
    'cases list time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

### Database Performance Tests

```javascript
// test/performance/database.test.js
const { Pool } = require('pg');

describe('Database Performance', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  test('query performance meets requirements', async () => {
    const startTime = Date.now();
    
    const result = await pool.query(`
      SELECT u.*, c.*
      FROM users u
      LEFT JOIN cases c ON u.id = c.user_id
      WHERE u.created_at > NOW() - INTERVAL '30 days'
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    
    const queryTime = Date.now() - startTime;
    
    expect(queryTime).toBeLessThan(1000); // Under 1 second
    expect(result.rows.length).toBeLessThanOrEqual(100);
  });

  test('index usage is optimal', async () => {
    const result = await pool.query(`
      EXPLAIN ANALYZE SELECT * FROM cases WHERE user_id = $1
    `, ['user-123']);

    const explainPlan = result.rows.map(row => row['QUERY PLAN']).join('\n');
    
    // Should use index scan, not sequential scan
    expect(explainPlan).toContain('Index Scan');
    expect(explainPlan).not.toContain('Seq Scan');
  });

  test('connection pooling works correctly', async () => {
    const promises = [];
    
    // Create 20 concurrent connections
    for (let i = 0; i < 20; i++) {
      promises.push(
        pool.query('SELECT pg_sleep(0.1), $1 as id', [i])
      );
    }
    
    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(20);
    results.forEach((result, index) => {
      expect(result.rows[0].id).toBe(index);
    });
  });
});
```

## Security Testing

### Authentication Security Tests

```javascript
// test/security/auth.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Authentication Security', () => {
  test('prevents SQL injection in login', async () => {
    const maliciousInput = "'; DROP TABLE users; --";
    
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: maliciousInput,
        password: 'password123'
      })
      .expect(400);

    expect(response.body.error).toContain('Invalid email format');
  });

  test('implements rate limiting', async () => {
    const requests = [];
    
    // Make 100 rapid requests
    for (let i = 0; i < 100; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          })
      );
    }
    
    const responses = await Promise.all(requests);
    
    // Some requests should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  test('uses secure headers', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
  });

  test('validates JWT tokens properly', async () => {
    // Test with expired token
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
    
    const response = await request(app)
      .get('/api/cases')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.error).toContain('Invalid or expired token');
  });
});
```

### Input Validation Tests

```javascript
// test/security/validation.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Input Validation Security', () => {
  test('sanitizes HTML input', async () => {
    const maliciousHTML = '<script>alert("xss")</script>';
    
    const response = await request(app)
      .post('/api/cases')
      .set('Authorization', 'Bearer valid-token')
      .send({
        userId: 'user-123',
        companyId: 'company-456',
        reason: 'churn_risk',
        description: maliciousHTML
      })
      .expect(400);

    expect(response.body.error).toContain('Invalid characters in description');
  });

  test('validates file uploads', async () => {
    const response = await request(app)
      .post('/api/upload')
      .attach('file', Buffer.from('malicious content'), 'malicious.exe')
      .expect(400);

    expect(response.body.error).toContain('Invalid file type');
  });

  test('prevents NoSQL injection', async () => {
    const maliciousInput = { $ne: null };
    
    const response = await request(app)
      .get('/api/users')
      .query({ email: JSON.stringify(maliciousInput) })
      .expect(400);

    expect(response.body.error).toContain('Invalid query parameters');
  });
});
```

## Test Automation

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: churn_saver_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install pnpm
      run: npm install -g pnpm

    - name: Install dependencies
      run: pnpm install

    - name: Run linting
      run: pnpm lint

    - name: Run type checking
      run: pnpm type-check

    - name: Run unit tests
      run: pnpm test:unit
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/churn_saver_test

    - name: Run integration tests
      run: pnpm test:integration
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/churn_saver_test

    - name: Run E2E tests
      run: pnpm test:e2e
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/churn_saver_test

    - name: Upload coverage reports
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

### Pre-commit Hooks

```bash
#!/bin/sh
# .husky/pre-commit

# Run linting
pnpm lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed"
  exit 1
fi

# Run formatting
pnpm format
if [ $? -ne 0 ]; then
  echo "❌ Formatting failed"
  exit 1
fi

# Run unit tests
pnpm test:unit
if [ $? -ne 0 ]; then
  echo "❌ Unit tests failed"
  exit 1
fi

echo "✅ Pre-commit checks passed"
```

## Test Coverage

### Coverage Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.tsx',
    '!src/**/*.test.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/lib/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json-summary',
  ],
};
```

### Coverage Reports

```bash
# Generate coverage report
pnpm test:coverage

# View coverage in browser
open coverage/lcov-report/index.html

# Check coverage thresholds
pnpm test:coverage:check

# Upload coverage to external service
pnpm test:coverage:upload
```

### Coverage Analysis

```javascript
// test/helpers/coverage.js
const { execSync } = require('child_process');

function generateCoverageReport() {
  execSync('pnpm test:coverage', { stdio: 'inherit' });
}

function checkCoverageThresholds() {
  const coverage = require('../coverage/coverage-summary.json');
  
  const thresholds = {
    statements: 80,
    branches: 80,
    functions: 80,
    lines: 80,
  };

  Object.keys(thresholds).forEach(metric => {
    const actual = coverage.total[metric].pct;
    const required = thresholds[metric];
    
    if (actual < required) {
      console.error(`❌ ${metric} coverage: ${actual}% (required: ${required}%)`);
      process.exit(1);
    } else {
      console.log(`✅ ${metric} coverage: ${actual}%`);
    }
  });
}

module.exports = {
  generateCoverageReport,
  checkCoverageThresholds,
};
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**Next Steps**: [Troubleshooting Guide](./troubleshooting.md)