# Configuration Guide

This guide covers all configuration aspects of the Churn Saver development environment, including environment variables, database settings, authentication, and feature flags.

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Database Configuration](#database-configuration)
3. [Authentication Setup](#authentication-setup)
4. [API Configuration](#api-configuration)
5. [Feature Flags](#feature-flags)
6. [Security Configuration](#security-configuration)
7. [Development Tools Configuration](#development-tools-configuration)
8. [Environment-Specific Settings](#environment-specific-settings)

## Environment Variables

### Core Environment Variables

The application uses environment variables defined in [`src/lib/env.ts`](../src/lib/env.ts). All variables are validated at startup.

#### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Whop Integration
NEXT_PUBLIC_WHOP_APP_ID=app_your_app_id
WHOP_API_KEY=your_api_key
WHOP_WEBHOOK_SECRET=your_webhook_secret

# Application
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Security
JWT_SECRET=your_jwt_secret_minimum_32_characters
ENCRYPTION_KEY=your_encryption_key_32_characters
```

#### Optional Variables

```bash
# OAuth Configuration
WHOP_OAUTH_CLIENT_ID=your_oauth_client_id
WHOP_OAUTH_CLIENT_SECRET=your_oauth_client_secret
WHOP_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# External Services
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

# Features
ENABLE_ANALYTICS=true
DEBUG_MODE=true

# Logging
LOG_LEVEL=debug
```

### Environment File Structure

#### Development Environment (`.env.local`)

```bash
# Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Database Configuration
DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=churn_saver_dev
DB_USER=churn_saver_dev
DB_PASSWORD=dev_password

# Test Database (for testing)
TEST_DATABASE_URL=postgresql://churn_saver_test:test_password@localhost:5432/churn_saver_test

# Whop Configuration
NEXT_PUBLIC_WHOP_APP_ID=app_your_development_app_id
WHOP_APP_ID=app_your_development_app_id
WHOP_API_KEY=dev_whop_api_key_here
WHOP_WEBHOOK_SECRET=dev_webhook_secret_here

# OAuth Configuration
WHOP_OAUTH_CLIENT_ID=dev_oauth_client_id
WHOP_OAUTH_CLIENT_SECRET=dev_oauth_client_secret
WHOP_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Development Features
ALLOW_INSECURE_DEV=true
DEBUG_MODE=true
DEBUG_WHOP_SDK=true

# Logging Configuration
LOG_LEVEL=debug

# External Services (Optional)
REDIS_URL=redis://localhost:6379
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Security Configuration
JWT_SECRET=dev_jwt_secret_minimum_32_characters_long
ENCRYPTION_KEY=dev_encryption_key_32_characters_long

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

# Additional Configuration
WHOP_APP_ID=app_your_development_app_id
```

#### Test Environment (`.env.test`)

```bash
# Environment
NODE_ENV=test
LOG_LEVEL=error

# Database
DATABASE_URL=postgresql://churn_saver_test:test_password@localhost:5432/churn_saver_test

# Security
ALLOW_INSECURE_DEV=false
DEBUG_MODE=false

# Whop (Test)
NEXT_PUBLIC_WHOP_APP_ID=app_test_app_id
WHOP_API_KEY=test_api_key
WHOP_WEBHOOK_SECRET=test_webhook_secret

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

#### Production Template (`.env.production.template`)

```bash
# Environment
NODE_ENV=production
ALLOW_INSECURE_DEV=false
DEBUG_MODE=false
LOG_LEVEL=info

# Database (Production)
DATABASE_URL=postgresql://prod_user:prod_password@prod_host:5432/prod_database

# Whop (Production)
NEXT_PUBLIC_WHOP_APP_ID=app_production_app_id
WHOP_API_KEY=production_api_key
WHOP_WEBHOOK_SECRET=production_webhook_secret

# OAuth (Production)
WHOP_OAUTH_CLIENT_ID=prod_oauth_client_id
WHOP_OAUTH_CLIENT_SECRET=prod_oauth_client_secret
WHOP_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/callback

# URLs (Production)
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_API_URL=https://your-domain.com/api

# External Services (Production)
REDIS_URL=redis://prod-redis-host:6379
SMTP_HOST=smtp.your-domain.com
SMTP_PORT=587

# Security (Production)
JWT_SECRET=production_jwt_secret_minimum_32_characters
ENCRYPTION_KEY=production_encryption_key_32_characters

# Feature Flags (Production)
ENABLE_ANALYTICS=true
ENABLE_PUSH=true
ENABLE_DM=true

# KPI Configuration (Production)
KPI_ATTRIBUTION_WINDOW_DAYS=30
DEFAULT_INCENTIVE_DAYS=7
```

### Environment Variable Validation

The application validates all required environment variables at startup:

```typescript
// src/lib/env.ts
export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_WHOP_APP_ID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
  WHOP_API_KEY: process.env.WHOP_API_KEY,
  // ... other variables
} as const;

// Validation occurs automatically
// Missing variables will cause application to fail
```

## Database Configuration

### PostgreSQL Configuration

#### Connection String Format

```bash
# Standard format
DATABASE_URL=postgresql://username:password@host:port/database

# With SSL
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require

# With connection pool
DATABASE_URL=postgresql://username:password@host:port/database?connection_limit=20&pool_timeout=20
```

#### Database Pools

```typescript
// Connection pool configuration
const poolConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,    // Close idle connections
  connectionTimeoutMillis: 2000, // Return error after 2 seconds
};
```

#### Migration Configuration

```bash
# Migration scripts location
MIGRATIONS_PATH=./infra/migrations

# Migration tracking table
MIGRATION_TABLE=migration_history

# Migration timeout
MIGRATION_TIMEOUT=30000
```

### Redis Configuration (Optional)

#### Connection String

```bash
# Standard Redis connection
REDIS_URL=redis://localhost:6379

# With password
REDIS_URL=redis://:password@localhost:6379

# With database
REDIS_URL=redis://localhost:6379/1

# With SSL
REDIS_URL=rediss://localhost:6380
```

#### Redis Configuration

```typescript
// Redis client configuration
const redisConfig = {
  url: process.env.REDIS_URL,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};
```

## Authentication Setup

### Whop Authentication

#### App Configuration

1. **Create Whop Application**
   ```bash
   # Visit https://whop.com/developers
   # Create new application
   # Note down credentials
   ```

2. **Configure OAuth**
   ```bash
   # Set redirect URI
   WHOP_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback
   
   # Configure scopes
   # - read:users
   # - read:companies
   # - webhooks
   ```

3. **Webhook Configuration**
   ```bash
   # Set webhook URL
   # http://localhost:3000/api/webhooks/whop
   
   # Configure webhook events
   # - user.created
   # - user.updated
   # - subscription.created
   # - subscription.cancelled
   ```

#### Authentication Flow

```typescript
// Authentication configuration
const authConfig = {
  clientId: process.env.WHOP_OAUTH_CLIENT_ID,
  clientSecret: process.env.WHOP_OAUTH_CLIENT_SECRET,
  redirectUri: process.env.WHOP_OAUTH_REDIRECT_URI,
  scope: ['read:users', 'read:companies'],
};
```

### JWT Configuration

#### JWT Secret

```bash
# Generate secure JWT secret
openssl rand -base64 32

# Set in environment
JWT_SECRET=your_generated_secret_here
```

#### JWT Configuration

```typescript
// JWT configuration
const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: '7d',
  issuer: 'churn-saver',
  audience: 'churn-saver-users',
};
```

### Encryption Configuration

#### Encryption Key

```bash
# Generate encryption key
openssl rand -hex 32

# Set in environment
ENCRYPTION_KEY=your_generated_key_here
```

#### Encryption Configuration

```typescript
// Encryption configuration
const encryptionConfig = {
  key: process.env.ENCRYPTION_KEY,
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
};
```

## API Configuration

### Whop API Configuration

#### API Key Setup

```bash
# Generate API key in Whop developer dashboard
# Set appropriate permissions
# Configure rate limits

# Set in environment
WHOP_API_KEY=whop_sk_your_api_key_here
```

#### API Configuration

```typescript
// Whop API configuration
const whopConfig = {
  apiKey: process.env.WHOP_API_KEY,
  baseUrl: 'https://api.whop.com',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};
```

### Webhook Configuration

#### Webhook Secret

```bash
# Generate webhook secret
openssl rand -base64 32

# Set in environment
WHOP_WEBHOOK_SECRET=your_webhook_secret_here
```

#### Webhook Configuration

```typescript
// Webhook configuration
const webhookConfig = {
  secret: process.env.WHOP_WEBHOOK_SECRET,
  tolerance: 300, // 5 minutes
  algorithm: 'sha256',
};
```

### Rate Limiting Configuration

```typescript
// Rate limiting configuration
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
};
```

## Feature Flags

### Development Feature Flags

```bash
# Enable development features
ALLOW_INSECURE_DEV=true     # Disable security in development
DEBUG_MODE=true              # Enable debug logging
DEBUG_WHOP_SDK=true          # Enable Whop SDK debugging
```

### Application Feature Flags

```bash
# Application features
ENABLE_ANALYTICS=true        # Enable analytics tracking
ENABLE_PUSH=false           # Enable push notifications
ENABLE_DM=false             # Enable direct messaging
```

### KPI Configuration

```bash
# Attribution window in days
KPI_ATTRIBUTION_WINDOW_DAYS=30

# Default incentive period in days
DEFAULT_INCENTIVE_DAYS=7
```

### Webhook Configuration

```bash
# Webhook timestamp tolerance in seconds
WEBHOOK_TIMESTAMP_SKEW_SECONDS=300
```

### Reminder Configuration

```bash
# Maximum reminder cases per run
MAX_REMINDER_CASES_PER_RUN=50

# Maximum concurrent reminder sends
MAX_CONCURRENT_REMINDER_SENDS=10
```

## Security Configuration

### Development Security

```bash
# Allow insecure development features
ALLOW_INSECURE_DEV=true

# Enable debug mode
DEBUG_MODE=true

# Skip SSL verification (development only)
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Production Security

```bash
# Disable insecure features
ALLOW_INSECURE_DEV=false

# Disable debug mode
DEBUG_MODE=false

# Enable SSL verification
NODE_TLS_REJECT_UNAUTHORIZED=1

# Secure headers
SECURE_HEADERS=true
```

### CORS Configuration

```typescript
// CORS configuration
const corsConfig = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com']
    : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
};
```

### Content Security Policy

```typescript
// CSP configuration
const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", "data:", "https:"],
  },
};
```

## Development Tools Configuration

### VS Code Configuration

#### Settings (`.vscode/settings.json`)

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "source.fixAll.biome": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "tailwindCSS.includeLanguages": [
    "typescript",
    "typescriptreact"
  ],
  "files.associations": {
    "*.css": "tailwindcss"
  },
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}
```

#### Extensions (`.vscode/extensions.json`)

```json
{
  "recommendations": [
    "biomejs.biome",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "ms-vscode.vscode-json",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense",
    "ms-vscode.vscode-eslint",
    "ms-vscode.vscode-prisma"
  ]
}
```

#### Launch Configuration (`.vscode/launch.json`)

```json
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
      "args": ["--runInBand"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

### Biome Configuration

#### Biome Config (`biome.json`)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.4.1/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": "warn"
      },
      "correctness": {
        "noUnusedVariables": "error"
      },
      "style": {
        "noNegationElse": "error",
        "useShorthandArrayType": "error"
      },
      "suspicious": {
        "noArrayIndexKey": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "javascript": {
    "formatter": {
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingComma": "es5",
      "semicolons": "always",
      "arrowParentheses": "always",
      "bracketSpacing": true,
      "bracketSameLine": false
    }
  }
}
```

### TypeScript Configuration

#### TypeScript Config (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/types/*": ["./src/types/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## Environment-Specific Settings

### Development Environment

```bash
# Development settings
NODE_ENV=development
ALLOW_INSECURE_DEV=true
DEBUG_MODE=true
LOG_LEVEL=debug

# Development URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Development database
DATABASE_URL=postgresql://dev_user:dev_pass@localhost:5432/dev_db

# Development features
ENABLE_ANALYTICS=false
ENABLE_PUSH=false
ENABLE_DM=false
```

### Test Environment

```bash
# Test settings
NODE_ENV=test
ALLOW_INSECURE_DEV=false
DEBUG_MODE=false
LOG_LEVEL=error

# Test database
DATABASE_URL=postgresql://test_user:test_pass@localhost:5432/test_db

# Test features
ENABLE_ANALYTICS=false
ENABLE_PUSH=false
ENABLE_DM=false
```

### Staging Environment

```bash
# Staging settings
NODE_ENV=staging
ALLOW_INSECURE_DEV=false
DEBUG_MODE=true
LOG_LEVEL=info

# Staging URLs
NEXT_PUBLIC_APP_URL=https://staging.churn-saver.com
NEXT_PUBLIC_API_URL=https://staging.churn-saver.com/api

# Staging database
DATABASE_URL=postgresql://staging_user:staging_pass@staging-db:5432/staging_db

# Staging features
ENABLE_ANALYTICS=true
ENABLE_PUSH=false
ENABLE_DM=false
```

### Production Environment

```bash
# Production settings
NODE_ENV=production
ALLOW_INSECURE_DEV=false
DEBUG_MODE=false
LOG_LEVEL=info

# Production URLs
NEXT_PUBLIC_APP_URL=https://churn-saver.com
NEXT_PUBLIC_API_URL=https://churn-saver.com/api

# Production database
DATABASE_URL=postgresql://prod_user:prod_pass@prod-db:5432/prod_db

# Production features
ENABLE_ANALYTICS=true
ENABLE_PUSH=true
ENABLE_DM=true
```

## Configuration Validation

### Environment Variable Validation Script

Create `validate-config.js`:

```javascript
// validate-config.js
const { env } = require('./src/lib/env.js');

console.log('🔍 Validating Configuration...');
console.log('==================================');

// Check required variables
const requiredVars = [
  'DATABASE_URL',
  'NEXT_PUBLIC_WHOP_APP_ID',
  'WHOP_API_KEY',
  'WHOP_WEBHOOK_SECRET',
  'JWT_SECRET',
  'ENCRYPTION_KEY'
];

let isValid = true;

requiredVars.forEach(varName => {
  if (!env[varName]) {
    console.log(`❌ Missing: ${varName}`);
    isValid = false;
  } else {
    console.log(`✅ Found: ${varName}`);
  }
});

// Check optional variables
const optionalVars = [
  'REDIS_URL',
  'SMTP_HOST',
  'ENABLE_ANALYTICS',
  'DEBUG_MODE'
];

optionalVars.forEach(varName => {
  if (env[varName]) {
    console.log(`✅ Optional: ${varName} = ${env[varName]}`);
  } else {
    console.log(`⚠️  Optional: ${varName} not set`);
  }
});

console.log('==================================');
if (isValid) {
  console.log('✅ Configuration is valid');
} else {
  console.log('❌ Configuration has errors');
  process.exit(1);
}
```

### Run Validation

```bash
# Validate configuration
node validate-config.js

# Test database connection
pnpm run db:test

# Test API connectivity
curl http://localhost:3000/api/health
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**Next Steps**: [Development Workflow](./workflow.md)