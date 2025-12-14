#!/usr/bin/env tsx
/**
 * Update SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in Vercel staging project
 * 
 * Usage:
 *   VERCEL_TOKEN=<token> \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   DATABASE_URL=<url> \
 *   pnpm tsx scripts/update-supabase-credentials.ts
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'churnsaver-staging';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'dannys-projects-de68569e';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in environment');
  console.error('   Get it from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/api');
  console.error('   Click "Reveal" next to the service_role key');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ Missing DATABASE_URL in environment');
  console.error('   Get it from: https://supabase.com/dashboard/project/zhjhvsqogaownorkidfu/settings/database');
  console.error('   Use Pooler mode, Transaction pooling, port 6543');
  process.exit(1);
}

async function updateEnvVar(
  key: string,
  value: string,
  environments: string[]
): Promise<void> {
  const url = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  // First, get existing env vars to find the IDs
  const listResponse = await fetch(`${url}?decrypt=true`, {
    headers,
  });
  
  if (!listResponse.ok) {
    throw new Error(`Failed to list env vars: ${listResponse.status}`);
  }
  
  const listData = await listResponse.json();
  const existingVars = listData.envs?.filter((env: any) => env.key === key) || [];
  
  // Delete existing vars for each environment
  for (const envVar of existingVars) {
    const deleteUrl = `${url}/${envVar.id}`;
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers,
    });
    
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      console.warn(`⚠️  Could not delete existing ${key} (${envVar.target?.join(',')}): ${deleteResponse.status}`);
    }
  }
  
  // Add new vars for each environment
  for (const env of environments) {
    const body: any = {
      key,
      target: [env],
      type: 'encrypted',
      value: value,
    };
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to add ${key} (${env}): ${response.status} ${errorText}`);
      }
      
      console.log(`✅ Updated ${key} (${env})`);
    } catch (error: any) {
      console.error(`❌ Error updating ${key} (${env}):`, error.message);
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Updating Supabase credentials in Vercel staging project...\n');
  console.log(`Project: ${VERCEL_PROJECT_ID}`);
  console.log(`Team: ${VERCEL_TEAM_ID}\n`);
  
  const environments: ('production' | 'preview' | 'development')[] = ['production', 'preview', 'development'];
  
  await updateEnvVar('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY, environments);
  await updateEnvVar('DATABASE_URL', DATABASE_URL, environments);
  
  console.log('\n✅ All credentials updated!');
  console.log('\nNext steps:');
  console.log('1. Trigger a new deployment (or wait for auto-deployment)');
  console.log('2. Verify: curl https://churnsaver-staging.vercel.app/api/health/db');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

