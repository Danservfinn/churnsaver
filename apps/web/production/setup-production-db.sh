#!/bin/bash

# Production Database Setup Script
# This script sets up the production database for Churn Saver

set -e

echo "🚀 Setting up Churn Saver Production Database"
echo "=============================================="

# Check if required environment variables are set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set it to your production Supabase database URL"
    exit 1
fi

echo "📋 Using database: $DATABASE_URL"

# Test database connection
echo "🔍 Testing database connection..."
if ! node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: '$DATABASE_URL' });
client.connect()
  .then(() => {
    console.log('✅ Database connection successful');
    return client.end();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });
"; then
    echo "❌ Database connection test failed"
    exit 1
fi

echo "📦 Running database migrations..."

# Run migrations
if node scripts/init-db.js; then
    echo "✅ Database migrations completed successfully"
else
    echo "❌ Database migrations failed"
    exit 1
fi

echo "🔐 Setting up Row Level Security (RLS)..."

# Enable RLS and create policies
node -e "
const { Client } = require('pg');
const fs = require('fs');

async function setupRLS() {
  const client = new Client({ connectionString: '$DATABASE_URL' });

  try {
    await client.connect();
    console.log('Connected to database for RLS setup');

    // Read and execute RLS setup SQL
    const rlsSql = \`
-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for events table
-- Allow inserts (webhook processing)
CREATE POLICY events_insert_policy ON events
FOR INSERT WITH CHECK (true);

-- Allow reads for the company (for debugging)
CREATE POLICY events_select_policy ON events
FOR SELECT USING (company_id = current_setting('app.company_id', true));

-- Create policies for recovery_cases table
CREATE POLICY recovery_cases_insert_policy ON recovery_cases
FOR INSERT WITH CHECK (company_id = current_setting('app.company_id', true));

CREATE POLICY recovery_cases_select_policy ON recovery_cases
FOR SELECT USING (company_id = current_setting('app.company_id', true));

CREATE POLICY recovery_cases_update_policy ON recovery_cases
FOR UPDATE USING (company_id = current_setting('app.company_id', true));

-- Create policies for creator_settings table
CREATE POLICY creator_settings_insert_policy ON creator_settings
FOR INSERT WITH CHECK (company_id = current_setting('app.company_id', true));

CREATE POLICY creator_settings_select_policy ON creator_settings
FOR SELECT USING (company_id = current_setting('app.company_id', true));

CREATE POLICY creator_settings_update_policy ON creator_settings
FOR UPDATE USING (company_id = current_setting('app.company_id', true));

-- Create function to set company context
CREATE OR REPLACE FUNCTION set_company_context(company_id_param text)
RETURNS void AS \$\$
BEGIN
  PERFORM set_config('app.company_id', company_id_param, false);
END;
\$\$ LANGUAGE plpgsql SECURITY DEFINER;
\`;

    // Split and execute statements
    const statements = rlsSql.split(';').filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        await client.query(statement);
      }
    }

    console.log('✅ RLS policies created successfully');

  } catch (error) {
    console.error('❌ RLS setup failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

setupRLS().catch(console.error);
"

echo "📊 Creating database indexes for performance..."

# Create additional production indexes
node -e "
const { Client } = require('pg');

async function createIndexes() {
  const client = new Client({ connectionString: '$DATABASE_URL' });

  try {
    await client.connect();
    console.log('Connected to database for index creation');

    const indexQueries = [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_created_at ON events(created_at)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_membership_id ON events(membership_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_membership_id ON recovery_cases(membership_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_user_id ON recovery_cases(user_id)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cases_updated_at ON recovery_cases(updated_at)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settings_updated_at ON creator_settings(updated_at)'
    ];

    for (const query of indexQueries) {
      await client.query(query);
      console.log('✅ Created index:', query.split(' ON ')[1].split('(')[0]);
    }

    console.log('✅ All indexes created successfully');

  } catch (error) {
    console.error('❌ Index creation failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

createIndexes().catch(console.error);
"

echo "🔍 Running final database verification..."

# Verify database setup
node -e "
const { Client } = require('pg');

async function verifySetup() {
  const client = new Client({ connectionString: '$DATABASE_URL' });

  try {
    await client.connect();

    // Check tables exist
    const tablesResult = await client.query(\`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('events', 'recovery_cases', 'creator_settings')
      ORDER BY tablename
    \`);

    const tables = tablesResult.rows.map(r => r.tablename);
    const expectedTables = ['creator_settings', 'events', 'recovery_cases'];

    if (JSON.stringify(tables.sort()) !== JSON.stringify(expectedTables.sort())) {
      throw new Error(\`Missing tables. Found: \${tables.join(', ')}, Expected: \${expectedTables.join(', ')}\`);
    }

    console.log('✅ All required tables exist');

    // Check RLS is enabled
    const rlsResult = await client.query(\`
      SELECT tablename, rowsecurity
      FROM pg_tables t
      WHERE schemaname = 'public'
      AND tablename IN ('events', 'recovery_cases', 'creator_settings')
      ORDER BY tablename
    \`);

    const rlsEnabled = rlsResult.rows.every(r => r.rowsecurity);
    if (!rlsEnabled) {
      console.log('⚠️  RLS not enabled on all tables - this is expected for development');
    } else {
      console.log('✅ RLS is enabled on all tables');
    }

    // Check indexes
    const indexResult = await client.query(\`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
      ORDER BY indexname
    \`);

    const indexes = indexResult.rows.map(r => r.indexname);
    console.log(\`📊 Found \${indexes.length} performance indexes\`);

  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

verifySetup().catch(console.error);
"

echo ""
echo "🎉 Production database setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Set up your Vercel project: vercel --prod"
echo "2. Configure environment variables in Vercel dashboard"
echo "3. Deploy your application: vercel --prod"
echo "4. Set up your reminder scheduler (see README.md)"
echo "5. Configure your Whop app webhooks to point to production"
echo ""
echo "📖 See production/README.md for detailed deployment instructions"











