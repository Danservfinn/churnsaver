#!/usr/bin/env tsx
/**
 * Script to add environment variables to Vercel project
 * 
 * Usage:
 *   VERCEL_TOKEN=<token> VERCEL_PROJECT_ID=<project-id> pnpm tsx scripts/add-vercel-env-vars.ts
 * 
 * Or set in .env.local:
 *   VERCEL_TOKEN=...
 *   VERCEL_PROJECT_ID=...
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'churnsaver-o3gl';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'dannys-projects-de68569e';

if (!VERCEL_TOKEN) {
  console.error('❌ VERCEL_TOKEN or VERCEL_ACCESS_TOKEN environment variable required');
  console.error('Get your token from: https://vercel.com/account/tokens');
  process.exit(1);
}

// Environment variables to add (from VERCEL_STAGING_ENV_VARS.md)
const envVars: Array<{
  key: string;
  value: string;
  sensitive: boolean;
  environments: ('production' | 'preview' | 'development')[];
}> = [
  // Basic Environment
  { key: 'NODE_ENV', value: 'production', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_APP_URL', value: 'https://churnsaver-o3gl.vercel.app', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'ALLOW_INSECURE_DEV', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_DEBUG_MODE', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'QA_DEMO_BYPASS', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_QA_DEMO_BYPASS', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  
  // Supabase Configuration
  { key: 'SUPABASE_URL', value: process.env.SUPABASE_URL || 'REPLACE_WITH_SUPABASE_URL', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'SUPABASE_ANON_KEY', value: process.env.SUPABASE_ANON_KEY || 'REPLACE_WITH_SUPABASE_ANON_KEY', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || 'REPLACE_WITH_NEXT_PUBLIC_SUPABASE_URL', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REPLACE_WITH_NEXT_PUBLIC_SUPABASE_ANON_KEY', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || 'REPLACE_WITH_SERVICE_ROLE_KEY', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'DATABASE_URL', value: process.env.DATABASE_URL || 'REPLACE_WITH_DATABASE_URL', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Cron Configuration
  { key: 'ENABLE_PG_BOSS', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'CRON_SECRET', value: process.env.CRON_SECRET || 'REPLACE_WITH_CRON_SECRET', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Security Secrets
  { key: 'ADMIN_API_TOKEN', value: process.env.ADMIN_API_TOKEN || 'REPLACE_WITH_ADMIN_API_TOKEN', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'ADMIN_IP_ALLOWLIST', value: '', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'JWT_SECRET', value: process.env.JWT_SECRET || 'REPLACE_WITH_JWT_SECRET', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'ENCRYPTION_KEY', value: process.env.ENCRYPTION_KEY || 'REPLACE_WITH_ENCRYPTION_KEY', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Whop Configuration
  { key: 'WHOP_APP_ID', value: process.env.WHOP_APP_ID || 'app_oU8bWaXO', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_WHOP_APP_ID', value: process.env.WHOP_APP_ID || 'app_oU8bWaXO', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'WHOP_API_KEY', value: process.env.WHOP_API_KEY || 'REPLACE_WITH_WHOP_API_KEY', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'WHOP_WEBHOOK_SECRET', value: process.env.WHOP_WEBHOOK_SECRET || 'REPLACE_WITH_WHOP_WEBHOOK_SECRET', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Webhook Configuration
  { key: 'WEBHOOK_TIMESTAMP_SKEW_SECONDS', value: '300', sensitive: false, environments: ['production', 'preview', 'development'] },
];

async function createSecret(name: string, value: string): Promise<string> {
  const url = `https://api.vercel.com/v2/secrets`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  // Add team header if team ID is provided
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `${name}_${Date.now()}`,
      value,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create secret ${name}: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  return data.uid;
}

async function addEnvVar(
  key: string,
  value: string,
  sensitive: boolean,
  environments: string[]
): Promise<void> {
  const url = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;
  
  // For sensitive variables, create a secret first
  let secretId: string | undefined;
  if (sensitive) {
    try {
      secretId = await createSecret(key, value);
      console.log(`🔐 Created secret for ${key}`);
    } catch (error) {
      console.error(`❌ Failed to create secret for ${key}:`, error);
      throw error;
    }
  }
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  // Add team header if team ID is provided
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  for (const env of environments) {
    const body: any = {
      key,
      target: [env],
    };
    
    if (sensitive && secretId) {
      body.type = 'secret';
      body.value = secretId;
    } else {
      body.type = 'encrypted';
      body.value = value;
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { code: 'UNKNOWN' } };
        }
        
        if (response.status === 409 || errorData.error?.code === 'ENV_CONFLICT') {
          console.log(`⚠️  ${key} (${env}) already exists, skipping...`);
          continue;
        }
        throw new Error(`Failed to add ${key} (${env}): ${response.status} ${errorText}`);
      }
      
      console.log(`✅ Added ${key} (${env})`);
    } catch (error) {
      console.error(`❌ Error adding ${key} (${env}):`, error);
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Adding environment variables to Vercel project...\n');
  console.log(`Project: ${VERCEL_PROJECT_ID}`);
  console.log(`Team: ${VERCEL_TEAM_ID}\n`);
  
  // Check for required values
  const missingVars: string[] = [];
  if (envVars.find(v => v.key === 'SUPABASE_SERVICE_ROLE_KEY' && v.value.includes('REPLACE'))) {
    missingVars.push('SUPABASE_SERVICE_ROLE_KEY (set SUPABASE_SERVICE_ROLE_KEY env var)');
  }
  if (envVars.find(v => v.key === 'DATABASE_URL' && v.value.includes('REPLACE'))) {
    missingVars.push('DATABASE_URL (set DATABASE_URL env var)');
  }
  if (envVars.find(v => v.key === 'WHOP_API_KEY' && v.value.includes('REPLACE'))) {
    missingVars.push('WHOP_API_KEY (set WHOP_API_KEY env var)');
  }
  if (envVars.find(v => v.key === 'WHOP_WEBHOOK_SECRET' && v.value.includes('REPLACE'))) {
    missingVars.push('WHOP_WEBHOOK_SECRET (set WHOP_WEBHOOK_SECRET env var)');
  }
  
  if (missingVars.length > 0) {
    console.warn('⚠️  Warning: Some variables will be set with placeholder values:');
    missingVars.forEach(v => console.warn(`   - ${v}`));
    console.warn('\nYou can update these later in Vercel dashboard or re-run this script with the values set.\n');
  }
  
  for (const envVar of envVars) {
    // Skip variables with placeholder values
    if (envVar.value.includes('REPLACE_')) {
      console.log(`⏭️  Skipping ${envVar.key} (placeholder value - will need to be added manually)`);
      continue;
    }
    await addEnvVar(envVar.key, envVar.value, envVar.sensitive, envVar.environments);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n✅ All environment variables added!');
  console.log('\nNext steps:');
  console.log('1. Update any placeholder values in Vercel dashboard');
  console.log('2. Trigger a new deployment');
  console.log('3. Verify cron schedules are active');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
