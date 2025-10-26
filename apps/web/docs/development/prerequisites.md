# Prerequisites

This document outlines all required tools, dependencies, and system requirements for setting up the Churn Saver development environment.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Development Tools](#development-tools)
3. [Required Accounts](#required-accounts)
4. [Version Compatibility](#version-compatibility)
5. [Installation Verification](#installation-verification)

## System Requirements

### Operating System

- **macOS**: 10.15 (Catalina) or higher
- **Windows**: Windows 10 or higher (with WSL2 recommended)
- **Linux**: Ubuntu 20.04+, Debian 10+, or equivalent

### Hardware Requirements

- **RAM**: Minimum 8GB, recommended 16GB
- **Storage**: Minimum 10GB free space
- **Processor**: Modern 64-bit CPU with 2+ cores

### Network Requirements

- **Internet**: Stable broadband connection
- **Firewall**: Allow outbound connections on ports 443, 80, 5432, 3000

## Core Dependencies

### Node.js

**Required Version**: 18.0.0 or higher

Node.js is the JavaScript runtime environment required for the Next.js application and development tools.

#### Installation Options

**Option 1: Using nvm (Recommended)**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install and use Node.js 18
nvm install 18
nvm use 18
nvm alias default 18
```

**Option 2: Direct Download**
- Download from [nodejs.org](https://nodejs.org/)
- Select LTS version (18.x or higher)
- Follow platform-specific installation instructions

**Option 3: Package Manager**
```bash
# macOS with Homebrew
brew install node@18

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Verification
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

### pnpm Package Manager

**Required Version**: 8.0.0 or higher (project uses 9.15.9)

pnpm is a fast, disk space efficient package manager used for dependency management.

#### Installation

```bash
# Install pnpm globally
npm install -g pnpm@9.15.9

# Alternative: Using npm
npm install -g pnpm

# Alternative: Using curl (Unix systems)
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

#### Configuration

```bash
# Configure pnpm
pnpm setup

# Verify installation
pnpm --version  # Should show 9.15.9 or higher

# Set default registry (optional)
pnpm config set registry https://registry.npmjs.org/
```

#### Verification
```bash
pnpm --version
pnpm store path  # Show store location
pnpm store status  # Check store status
```

### PostgreSQL Database

**Required Version**: 14.0 or higher

PostgreSQL is the primary database used for data persistence and application state.

#### Installation Options

**Option 1: Local Installation**

**macOS with Homebrew:**
```bash
# Install PostgreSQL
brew install postgresql@14
brew services start postgresql@14

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"' >> ~/.zshrc
```

**Ubuntu/Debian:**
```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Start and enable service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
- Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- Run installer with default settings
- Remember password for postgres user

**Option 2: Docker (Recommended for Development)**
```bash
# Using Docker Compose (see installation guide)
docker run --name postgres-dev -e POSTGRES_PASSWORD=dev_password -p 5432:5432 -d postgres:14
```

#### Verification
```bash
# Check PostgreSQL version
psql --version  # Should show 14.x or higher

# Test connection
psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT version();"
```

### Git Version Control

**Required Version**: 2.0 or higher

Git is required for source code management and version control.

#### Installation

**macOS:**
```bash
# Install with Homebrew
brew install git

# Or use Xcode Command Line Tools
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install git
```

**Windows:**
- Download from [git-scm.com](https://git-scm.com/download/win)
- Run installer with default settings

#### Configuration
```bash
# Configure user identity
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Configure default branch name
git config --global init.defaultBranch main

# Configure line endings (Windows only)
git config --global core.autocrlf true

# Verify configuration
git config --list
```

#### Verification
```bash
git --version  # Should show 2.x.x or higher
```

## Development Tools

### IDE and Editor

#### VS Code (Recommended)

**Installation:**
- Download from [code.visualstudio.com](https://code.visualstudio.com/)
- Install platform-specific version

**Required Extensions:**
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
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-prisma"
  ]
}
```

**Optional Extensions:**
- GitLens - Git integration
- Thunder Client - API testing
- PostgreSQL - Database management
- Docker - Container management

#### Alternative Editors

- **WebStorm**: Full-featured IDE (paid)
- **Vim/Neovim**: Terminal-based editor
- **Sublime Text**: Lightweight text editor

### Browser and Developer Tools

#### Required Browsers

- **Google Chrome**: Latest version (recommended for DevTools)
- **Firefox**: Latest version (alternative for testing)
- **Safari**: Latest version (macOS testing)

#### Browser Extensions

- **React Developer Tools**: Component debugging
- **Redux DevTools**: State management debugging
- **Postman Interceptor**: API request capture
- **JSON Viewer**: JSON formatting and validation

### API Testing Tools

#### Postman (Recommended)

- Download from [postman.com](https://www.postman.com/downloads/)
- Create workspace for Churn Saver APIs
- Import collection from repository

#### Insomnia (Alternative)

- Download from [insomnia.rest](https://insomnia.rest/download)
- Lightweight REST client
- Environment variable support

#### cURL (Built-in)

```bash
# Test API endpoint
curl -X GET http://localhost:3000/api/health

# Test with headers
curl -X POST http://localhost:3000/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Database Tools

#### pgAdmin (Recommended)

- Download from [pgadmin.org](https://www.pgadmin.org/download/)
- Full-featured PostgreSQL management
- Visual query builder

#### DBeaver (Alternative)

- Download from [dbeaver.io](https://dbeaver.io/download/)
- Universal database tool
- Multiple database support

#### psql (Built-in)

```bash
# Connect to database
psql -h localhost -p 5432 -U postgres -d churn_saver_dev

# Common commands
\l                    # List databases
\dt                   # List tables
\d table_name         # Describe table
\q                    # Quit
```

## Required Accounts

### Whop Developer Account

**Purpose**: API access, webhooks, and OAuth integration

**Setup Steps:**
1. Visit [whop.com/developers](https://whop.com/developers)
2. Create developer account
3. Create new application
4. Generate API credentials:
   - App ID
   - API Key
   - Webhook Secret
   - OAuth Client ID/Secret

**Required for:**
- API integration
- Webhook processing
- User authentication
- Data synchronization

### GitHub Account

**Purpose**: Repository access, code collaboration, CI/CD

**Setup Steps:**
1. Create account at [github.com](https://github.com)
2. Configure SSH keys (recommended)
3. Request repository access
4. Configure two-factor authentication

**Required for:**
- Source code access
- Pull requests
- Code reviews
- Issue tracking

### Vercel Account (Optional)

**Purpose**: Deployment, preview environments, hosting

**Setup Steps:**
1. Create account at [vercel.com](https://vercel.com)
2. Connect GitHub account
3. Import repository
4. Configure environment variables

**Required for:**
- Production deployments
- Preview environments
- Custom domains
- Analytics

### Database Hosting (Optional)

**Options:**
- **Supabase**: PostgreSQL hosting with real-time features
- **Neon**: Serverless PostgreSQL
- **Railway**: Application and database hosting
- **AWS RDS**: Managed PostgreSQL service

## Version Compatibility Matrix

| Component | Minimum Version | Recommended Version | Notes |
|-----------|-----------------|---------------------|-------|
| Node.js | 18.0.0 | 18.x LTS | Use LTS for stability |
| pnpm | 8.0.0 | 9.15.9 | Project uses 9.15.9 |
| PostgreSQL | 14.0 | 14.x or 15.x | 14+ required for features |
| Git | 2.0 | 2.30+ | Latest stable recommended |
| npm | 8.0 | 9.x+ | Comes with Node.js |
| TypeScript | 4.5 | 5.x+ | Project uses 5.x |
| Next.js | 13.0 | 16.0.0 | Project uses 16.0.0 |

## Installation Verification

### System Check Script

Create a verification script to check all prerequisites:

```bash
#!/bin/bash
# prerequisite-check.sh

echo "🔍 Checking Prerequisites..."
echo "================================"

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

# Check PostgreSQL
if command -v psql &> /dev/null; then
  PG_VERSION=$(psql --version | awk '{print $3}')
  echo "✅ PostgreSQL: $PG_VERSION"
else
  echo "❌ PostgreSQL: Not found"
fi

# Check Git
if command -v git &> /dev/null; then
  GIT_VERSION=$(git --version | awk '{print $3}')
  echo "✅ Git: $GIT_VERSION"
else
  echo "❌ Git: Not found"
fi

echo "================================"
echo "🏁 Prerequisite check complete"
```

### Database Connection Test

```bash
#!/bin/bash
# db-test.sh

echo "🔍 Testing Database Connection..."
echo "================================"

# Test PostgreSQL connection
if psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT 1;" &> /dev/null; then
  echo "✅ Database connection successful"
else
  echo "❌ Database connection failed"
  echo "   Check PostgreSQL service status"
  echo "   Verify connection parameters"
fi

echo "================================"
```

### Development Environment Test

```bash
#!/bin/bash
# dev-test.sh

echo "🔍 Testing Development Environment..."
echo "================================"

# Test Node.js modules
if [ -d "node_modules" ]; then
  echo "✅ Node modules installed"
else
  echo "❌ Node modules not found"
  echo "   Run 'pnpm install'"
fi

# Test environment files
if [ -f ".env.local" ]; then
  echo "✅ Environment file exists"
else
  echo "❌ Environment file missing"
  echo "   Create .env.local from template"
fi

echo "================================"
```

## Troubleshooting

### Common Issues

#### Node.js Version Conflicts

**Problem**: Multiple Node.js versions installed
**Solution**: Use nvm to manage versions
```bash
nvm ls                    # List installed versions
nvm use 18               # Switch to Node 18
nvm alias default 18     # Set default version
```

#### pnpm Permission Issues

**Problem**: Permission denied during installation
**Solution**: Fix npm permissions
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) ~/.pnpm-store

# Or use npx to avoid global installation
npx pnpm install
```

#### PostgreSQL Connection Issues

**Problem**: Cannot connect to PostgreSQL
**Solution**: Check service status and configuration
```bash
# Check service status
brew services list | grep postgresql  # macOS
sudo systemctl status postgresql      # Linux

# Check port availability
lsof -i :5432

# Test connection
psql -h localhost -p 5432 -U postgres -d postgres
```

#### Git Configuration Issues

**Problem**: Git identity not configured
**Solution**: Configure user identity
```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Getting Help

- **Documentation**: [Development Guide](./README.md)
- **Issues**: Create GitHub issue
- **Community**: Join development Slack/Discord
- **Support**: Contact development team

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0  
**Next Steps**: [Installation Instructions](./installation.md)