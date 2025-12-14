#!/usr/bin/env tsx
/**
 * Add environment variables to staging Vercel project
 * 
 * Usage:
 *   VERCEL_TOKEN=<token> VERCEL_PROJECT_ID=churnsaver-staging pnpm tsx scripts/add-staging-env-vars.ts
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'churnsaver-staging';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'dannys-projects-de68569e';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

// Staging-specific environment variables
const envVars: Array<{
  key: string;
  value: string;
  sensitive: boolean;
  environments: ('production' | 'preview' | 'development')[];
}> = [
  // Basic Environment
  { key: 'NODE_ENV', value: 'production', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_APP_URL', value: `https://${VERCEL_PROJECT_ID}.vercel.app`, sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'ALLOW_INSECURE_DEV', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_DEBUG_MODE', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'QA_DEMO_BYPASS', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  { key: 'NEXT_PUBLIC_QA_DEMO_BYPASS', value: 'false', sensitive: false, environments: ['production', 'preview', 'development'] },
  
  // Supabase Configuration (staging - requires environment variables)
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
  
  // Whop Configuration (staging - use production values for now, can be updated later)
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
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  for (const env of environments) {
    const body: any = {
      key,
      target: [env],
      type: 'encrypted', // Use encrypted type for all variables (Vercel handles sensitive marking)
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
  console.log('🚀 Adding environment variables to staging Vercel project...\n');
  console.log(`Project: ${VERCEL_PROJECT_ID}`);
  console.log(`Team: ${VERCEL_TEAM_ID}\n`);
  
  // Check for required values
  const missingVars: string[] = [];
  const replaceVars = envVars.filter(v => v.value.includes('REPLACE_'));
  if (replaceVars.length > 0) {
    console.warn('⚠️  Warning: Some variables will be set with placeholder values:');
    replaceVars.forEach(v => console.warn(`   - ${v.key} (set ${v.key} env var)`));
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

