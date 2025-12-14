#!/usr/bin/env tsx
/**
 * Add missing environment variables that need to be added for all environments
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = 'churnsaver-o3gl';
const VERCEL_TEAM_ID = 'dannys-projects-de68569e';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

const missingVars = [
  { key: 'JWT_SECRET', value: process.env.JWT_SECRET ?? 'REPLACE_WITH_JWT_SECRET', sensitive: true },
  { key: 'ADMIN_IP_ALLOWLIST', value: '', sensitive: false },
  { key: 'WEBHOOK_TIMESTAMP_SKEW_SECONDS', value: '300', sensitive: false },
  { key: 'SUPABASE_URL', value: process.env.SUPABASE_URL ?? 'REPLACE_WITH_SUPABASE_URL', sensitive: false },
  { key: 'SUPABASE_ANON_KEY', value: process.env.SUPABASE_ANON_KEY ?? 'REPLACE_WITH_SUPABASE_ANON_KEY', sensitive: false },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'REPLACE_WITH_NEXT_PUBLIC_SUPABASE_URL', sensitive: false },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'REPLACE_WITH_NEXT_PUBLIC_SUPABASE_ANON_KEY', sensitive: false },
  { key: 'ALLOW_INSECURE_DEV', value: 'false', sensitive: false },
  { key: 'NEXT_PUBLIC_DEBUG_MODE', value: 'false', sensitive: false },
  { key: 'QA_DEMO_BYPASS', value: 'false', sensitive: false },
  { key: 'NEXT_PUBLIC_QA_DEMO_BYPASS', value: 'false', sensitive: false },
];

async function addEnvVar(key: string, value: string, sensitive: boolean, env: string) {
  const url = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };
  
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  const body: any = {
    key,
    target: [env],
  };
  
  if (sensitive) {
    // For sensitive vars, we need to create a secret first, then reference it
    // But Vercel API requires the value directly for encrypted type
    body.type = 'encrypted';
    body.value = value;
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
        return { success: false, skipped: true, message: 'already exists' };
      }
      return { success: false, skipped: false, message: errorText };
    }
    
    return { success: true, skipped: false };
  } catch (error: any) {
    return { success: false, skipped: false, message: error.message };
  }
}

async function main() {
  console.log('🚀 Adding missing environment variables...\n');
  
  for (const envVar of missingVars) {
    if (envVar.value.startsWith('REPLACE_')) {
      console.log(`⏭️  Skipping ${envVar.key} (missing value; set it in your environment)`);
      continue;
    }
    for (const env of ['production', 'preview', 'development']) {
      const result = await addEnvVar(envVar.key, envVar.value, envVar.sensitive, env);
      
      if (result.success) {
        console.log(`✅ Added ${envVar.key} (${env})`);
      } else if (result.skipped) {
        console.log(`⚠️  ${envVar.key} (${env}) already exists, skipping...`);
      } else {
        console.log(`❌ Failed to add ${envVar.key} (${env}): ${result.message}`);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  console.log('\n✅ Done!');
}

main().catch(console.error);

