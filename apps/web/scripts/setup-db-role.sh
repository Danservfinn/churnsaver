#!/bin/bash

# Database Role Setup Script
# Creates the churn_saver_dev role if it doesn't exist
# This fixes the "role churn_saver_dev does not exist" error

set -e

echo "🔧 Setting up database role: churn_saver_dev"
echo "=============================================="

# Ensure Node.js is available before using node -e for URL parsing
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js is required to parse DATABASE_URL but was not found on PATH."
    echo "Please install Node.js (v18+) and re-run this script."
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it in your .env.local file:"
    echo "DATABASE_URL=postgresql://<username>:<password>@localhost:5432/churn_saver_dev"
    echo ""
    echo "Or use a PostgreSQL superuser URL (e.g., postgres user):"
    echo "DATABASE_URL=postgresql://postgres:<password>@localhost:5432/churn_saver_dev"
    exit 1
fi

DB_URL="$DATABASE_URL"

# Parse DATABASE_URL safely (handles special characters)
DB_USER=$(node -e "const url = process.env.DATABASE_URL; if(!url) process.exit(1); const u = new URL(url); console.log(decodeURIComponent(u.username || ''));")
DB_PASS=$(node -e "const url = process.env.DATABASE_URL; if(!url) process.exit(1); const u = new URL(url); console.log(decodeURIComponent(u.password || ''));")
DB_HOST=$(node -e "const url = process.env.DATABASE_URL; if(!url) process.exit(1); const u = new URL(url); console.log(u.hostname);")
DB_PORT=$(node -e "const url = process.env.DATABASE_URL; if(!url) process.exit(1); const u = new URL(url); console.log(u.port || '5432');")
DB_NAME=$(node -e "const url = process.env.DATABASE_URL; if(!url) process.exit(1); const u = new URL(url); console.log(u.pathname.replace(/^\//, ''));")

ROLE_PASSWORD="${CHURN_SAVER_ROLE_PASSWORD:-${ROLE_PASSWORD:-}}"
if [ -z "$ROLE_PASSWORD" ]; then
    echo -n "Enter password to assign to churn_saver_dev role: "
    read -r -s ROLE_PASSWORD_INPUT
    echo ""
    if [ -z "$ROLE_PASSWORD_INPUT" ]; then
        echo "❌ Role password is required. Set ROLE_PASSWORD or CHURN_SAVER_ROLE_PASSWORD."
        exit 1
    fi
    ROLE_PASSWORD="$ROLE_PASSWORD_INPUT"
fi

# Extract password from postgres connection URL (returns empty string if none)
extract_password() {
    local url="$1"
    node -e "const u=new URL(process.argv[1]); console.log(decodeURIComponent(u.password || ''))" "$url"
}

# Try to connect and create the role
echo "📋 Attempting to create database role..."

# Use psql to create the role if it doesn't exist
# We'll connect as the postgres superuser to create the role
# First, try to extract the database name and create a connection string for postgres user

echo "📍 Database details:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Build list of superuser URLs (no hardcoded credentials)
POSTGRES_URLS=()
if [ -n "$DB_SUPERUSER_URLS" ]; then
    IFS=',' read -r -a POSTGRES_URLS <<< "$DB_SUPERUSER_URLS"
else
    echo "🔐 Provide PostgreSQL superuser URL(s) (comma-separated)."
    echo "    Example: postgresql://postgres:strong_password@$DB_HOST:$DB_PORT/$DB_NAME"
    read -r -p "Superuser URL(s) [leave empty to reuse DATABASE_URL credentials]: " SUPERUSER_INPUT
    if [ -n "$SUPERUSER_INPUT" ]; then
        IFS=',' read -r -a POSTGRES_URLS <<< "$SUPERUSER_INPUT"
    else
        POSTGRES_URLS=("$DATABASE_URL")
    fi
fi

ROLE_CREATED=false

# Encode the role password to avoid shell/SQL escaping pitfalls
ROLE_PASSWORD_B64=$(printf "%s" "$ROLE_PASSWORD" | base64 | tr -d '\n')

CREATE_ROLE_SQL="DO \$\$
DECLARE
  role_password text := convert_from(decode('${ROLE_PASSWORD_B64}', 'base64'), 'UTF8');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'churn_saver_dev') THEN
    EXECUTE format('CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD %L', role_password);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END
\$\$;"

for POSTGRES_URL in "${POSTGRES_URLS[@]}"; do
    if [ -z "$POSTGRES_URL" ]; then
        continue
    fi

    echo "🔄 Trying connection: $POSTGRES_URL"
    POSTGRES_PASSWORD="$(extract_password "$POSTGRES_URL")"
    
    if PGPASSWORD="$POSTGRES_PASSWORD" psql "$POSTGRES_URL" -c "$CREATE_ROLE_SQL" 2>/dev/null; then
        echo "✅ Successfully ensured role: churn_saver_dev"
        ROLE_CREATED=true
        break
    fi
    
    if psql "$POSTGRES_URL" -c "$CREATE_ROLE_SQL" 2>/dev/null; then
        echo "✅ Successfully ensured role: churn_saver_dev"
        ROLE_CREATED=true
        break
    fi
done

if [ "$ROLE_CREATED" = false ]; then
    echo "⚠️  Could not create role automatically. Please run manually:"
    echo ""
    echo "Connect to PostgreSQL as a superuser:"
    echo "  psql -U <superuser> -d $DB_NAME"
    echo ""
    echo "Then run:"
    echo "  CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD '<your-role-password>';"
    echo "  GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO churn_saver_dev;"
    echo "  \\c $DB_NAME"
    echo "  GRANT ALL ON SCHEMA public TO churn_saver_dev;"
    exit 1
fi

# Grant privileges
echo "🔐 Granting privileges..."
for POSTGRES_URL in "${POSTGRES_URLS[@]}"; do
    if [ -z "$POSTGRES_URL" ]; then
        continue
    fi

    POSTGRES_PASSWORD="$(extract_password "$POSTGRES_URL")"
    if PGPASSWORD="$POSTGRES_PASSWORD" psql "$POSTGRES_URL" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO churn_saver_dev;" 2>/dev/null; then
        echo "✅ Granted database privileges"
        break
    fi
    if psql "$POSTGRES_URL" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO churn_saver_dev;" 2>/dev/null; then
        echo "✅ Granted database privileges"
        break
    fi
done

echo ""
echo "✅ Database role setup complete!"
echo ""
echo "Update your DATABASE_URL with the new role credentials if needed."



