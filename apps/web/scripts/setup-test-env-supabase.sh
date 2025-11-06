#!/bin/bash
# Setup script for test environment with Supabase
# This script sets up environment variables for running tests against Supabase

set -e

echo "🔧 Setting up test environment for Supabase..."

# Supabase Configuration
SUPABASE_URL="https://bhiiqapevietyvepvhpq.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoaWlxYXBldmlldHl2ZXB2aHBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjExODA5ODcsImV4cCI6MjA3Njc1Njk4N30.opoCXbYm6YT6_cZoeI-fUyno70RwKCiS2iSNEx6Rvj0"
PROJECT_REF="bhiiqapevietyvepvhpq"

# Check if DATABASE_URL is already set
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL not set. You need to provide the direct PostgreSQL connection string."
  echo ""
  echo "To get the connection string:"
  echo "1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF"
  echo "2. Navigate to: Settings → Database"
  echo "3. Copy the connection string (URI format)"
  echo "4. Export it: export DATABASE_URL='<connection-string>'"
  echo ""
  echo "Connection string format should be:"
  echo "postgresql://postgres.$PROJECT_REF:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
  echo ""
  read -p "Enter DATABASE_URL (or press Enter to skip): " DB_URL
  
  if [ -n "$DB_URL" ]; then
    export DATABASE_URL="$DB_URL"
    echo "✅ DATABASE_URL set"
  else
    echo "⚠️  DATABASE_URL not set. Some tests may fail."
  fi
else
  echo "✅ DATABASE_URL already set"
fi

# Set other required environment variables
export SUPABASE_URL="$SUPABASE_URL"
export SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export NODE_ENV=test
export WHOP_WEBHOOK_SECRET="${WHOP_WEBHOOK_SECRET:-test_webhook_secret}"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-$DATABASE_URL}"

echo ""
echo "📋 Environment variables set:"
echo "  SUPABASE_URL=$SUPABASE_URL"
echo "  SUPABASE_ANON_KEY=***"
echo "  NODE_ENV=$NODE_ENV"
echo "  WHOP_WEBHOOK_SECRET=$WHOP_WEBHOOK_SECRET"
echo "  DATABASE_URL=${DATABASE_URL:+***set***}"
echo "  TEST_DATABASE_URL=${TEST_DATABASE_URL:+***set***}"
echo ""

# Test Supabase connection if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "🔍 Testing Supabase connection..."
  if command -v psql &> /dev/null; then
    if psql "$DATABASE_URL" -c "SELECT version();" &> /dev/null; then
      echo "✅ Supabase connection successful"
    else
      echo "❌ Supabase connection failed. Please check your DATABASE_URL"
      exit 1
    fi
  else
    echo "⚠️  psql not found. Skipping connection test."
  fi
fi

echo ""
echo "✅ Test environment setup complete!"
echo ""
echo "To run tests:"
echo "  pnpm test              # Unit + Integration tests"
echo "  pnpm test:security    # Security tests"
echo "  pnpm test:e2e         # E2E tests"
echo "  pnpm test:coverage    # Coverage report"
echo ""

