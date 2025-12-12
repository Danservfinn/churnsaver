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
  { key: 'SUPABASE_URL', value: 'https://zhjhvsqogaownorkidfu.supabase.co', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoamh2c3FvZ2Fvd25vcmtpZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ2OTEsImV4cCI6MjA4MTEyMDY5MX0.igz41zVKbd37Xpt_0l3UzRZNufFcMj6_xlNZAKe12aU', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', value: 'https://zhjhvsqogaownorkidfu.supabase.co', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpoamh2c3FvZ2Fvd25vcmtpZGZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NDQ2OTEsImV4cCI6MjA4MTEyMDY5MX0.igz41zVKbd37Xpt_0l3UzRZNufFcMj6_xlNZAKe12aU', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', value: process.env.SUPABASE_SERVICE_ROLE_KEY || 'REPLACE_WITH_SERVICE_ROLE_KEY', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'DATABASE_URL', value: process.env.DATABASE_URL || 'REPLACE_WITH_DATABASE_URL', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Cron Configuration
  { key: 'ENABLE_PG_BOSS', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'CRON_SECRET', value: 'a4pvVzJCTZqhVL+H+wtR/AVh66vJmz6CR6vMVnK0YRM=', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Security Secrets
  { key: 'ADMIN_API_TOKEN', value: '1WP6U0i1zisJfIKubIbUy6w+PXhZAkL2nZoSrbt96nI=', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'ADMIN_IP_ALLOWLIST', value: '', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'JWT_SECRET', value: 'b7Xe8HdLmXq9ewK/4Ip+mDhtK+1U02/SYOS1cWbrYT4=', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'ENCRYPTION_KEY', value: 'o1oxj+/YCBpgXV5wq2p4IBi6Qb12s08ZtsFo3JoGL38=', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Whop Configuration
  { key: 'WHOP_APP_ID', value: process.env.WHOP_APP_ID || 'app_oU8bWaXO', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_WHOP_APP_ID', value: process.env.WHOP_APP_ID || 'app_oU8bWaXO', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'WHOP_API_KEY', value: process.env.WHOP_API_KEY || 'REPLACE_WITH_WHOP_API_KEY', sensitive: true, environments: ['production', 'preview', 'development'] },
  { key: 'WHOP_WEBHOOK_SECRET', value: process.env.WHOP_WEBHOOK_SECRET || 'REPLACE_WITH_WHOP_WEBHOOK_SECRET', sensitive: true, environments: ['production', 'preview', 'development'] },
  
  // Webhook Configuration
  { key: 'WEBHOOK_TIMESTAMP_SKEW_SECONDS', value: '300', sensitive: false, environments: ['production', 'preview', 'development'] },
];

async function addEnvVar(
  key: string,
  value: string,
  sensitive: boolean,
  environments: string[]
): Promise<void> {
  const url = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;
  
  for (const env of environments) {
    const body = {
      key,
      value,
      type: sensitive ? 'secret' : 'encrypted',
      target: [env],
    };
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const error = await response.text();
        if (response.status === 409) {
          console.log(`⚠️  ${key} (${env}) already exists, skipping...`);
          continue;
        }
        throw new Error(`Failed to add ${key} (${env}): ${response.status} ${error}`);
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
