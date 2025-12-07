#!/bin/bash

# Database Role Setup Script
# Creates the churn_saver_dev role if it doesn't exist
# This fixes the "role churn_saver_dev does not exist" error

set -e

echo "🔧 Setting up database role: churn_saver_dev"
echo "=============================================="

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set it in your .env.local file:"
    echo "DATABASE_URL=postgresql://churn_saver_dev:dev_password@localhost:5432/churn_saver_dev"
    echo ""
    echo "Or use the default postgres user:"
    echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/churn_saver_dev"
    exit 1
fi

# Extract connection details from DATABASE_URL
# Format: postgresql://username:password@host:port/database
DB_URL="$DATABASE_URL"

# Try to connect and create the role
echo "📋 Attempting to create database role..."

# Use psql to create the role if it doesn't exist
# We'll connect as the postgres superuser to create the role
# First, try to extract the database name and create a connection string for postgres user

# Parse DATABASE_URL to get components
# This is a simple parser - assumes standard format
if [[ "$DB_URL" =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
    
    echo "📍 Database details:"
    echo "   Host: $DB_HOST"
    echo "   Port: $DB_PORT"
    echo "   Database: $DB_NAME"
    echo "   User: $DB_USER"
    echo ""
    
    # Create a connection string using postgres superuser (if available)
    # Try common postgres superuser credentials
    POSTGRES_URLS=(
        "postgresql://postgres:postgres@$DB_HOST:$DB_PORT/$DB_NAME"
        "postgresql://postgres@$DB_HOST:$DB_PORT/$DB_NAME"
        "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
    )
    
    ROLE_CREATED=false
    
    for POSTGRES_URL in "${POSTGRES_URLS[@]}"; do
        echo "🔄 Trying to connect as postgres superuser..."
        
        # Create the role if it doesn't exist
        if PGPASSWORD="${POSTGRES_URL##*:}" psql "$POSTGRES_URL" -c "DO \$\$ BEGIN CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password'; EXCEPTION WHEN duplicate_object THEN null; END \$\$;" 2>/dev/null; then
            echo "✅ Successfully created role: churn_saver_dev"
            ROLE_CREATED=true
            break
        fi
        
        # Try without password
        if psql "$POSTGRES_URL" -c "DO \$\$ BEGIN CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password'; EXCEPTION WHEN duplicate_object THEN null; END \$\$;" 2>/dev/null; then
            echo "✅ Successfully created role: churn_saver_dev"
            ROLE_CREATED=true
            break
        fi
    done
    
    if [ "$ROLE_CREATED" = false ]; then
        echo "⚠️  Could not create role automatically. Please run manually:"
        echo ""
        echo "Connect to PostgreSQL as superuser:"
        echo "  psql -U postgres -d $DB_NAME"
        echo ""
        echo "Then run:"
        echo "  CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';"
        echo "  GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO churn_saver_dev;"
        echo "  \\c $DB_NAME"
        echo "  GRANT ALL ON SCHEMA public TO churn_saver_dev;"
        echo ""
        echo "Or if using Docker:"
        echo "  docker exec -it <container-name> psql -U postgres -c \"CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';\""
        exit 1
    fi
    
    # Grant privileges
    echo "🔐 Granting privileges..."
    for POSTGRES_URL in "${POSTGRES_URLS[@]}"; do
        if PGPASSWORD="${POSTGRES_URL##*:}" psql "$POSTGRES_URL" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO churn_saver_dev;" 2>/dev/null; then
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
    echo "Your DATABASE_URL should be:"
    echo "DATABASE_URL=postgresql://churn_saver_dev:dev_password@$DB_HOST:$DB_PORT/$DB_NAME"
    
else
    echo "⚠️  Could not parse DATABASE_URL format"
    echo "Expected format: postgresql://username:password@host:port/database"
    echo ""
    echo "Please create the role manually:"
    echo "  CREATE ROLE churn_saver_dev WITH LOGIN PASSWORD 'dev_password';"
    exit 1
fi



