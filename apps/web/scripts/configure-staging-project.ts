#!/usr/bin/env tsx
/**
 * Configure staging Vercel project: update root directory and set environment variables
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'dannys-projects-de68569e';
const STAGING_PROJECT_ID = process.env.STAGING_PROJECT_ID || 'churnsaver-staging';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

async function updateRootDirectory() {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }

  try {
    console.log(`⚙️  Updating root directory to apps/web...`);
    
    // First, get the project to find its ID
    const getUrl = `https://api.vercel.com/v9/projects/${STAGING_PROJECT_ID}`;
    const getResponse = await fetch(getUrl, { headers });
    
    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      throw new Error(`Failed to get project: ${getResponse.status} ${errorText}`);
    }
    
    const project = await getResponse.json();
    console.log(`   Found project: ${project.name} (ID: ${project.id})`);
    
    // Update root directory
    const updateUrl = `https://api.vercel.com/v9/projects/${project.id}`;
    const updateBody = {
      rootDirectory: 'apps/web',
    };

    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateBody),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update root directory: ${updateResponse.status} ${errorText}`);
    }

    const updated = await updateResponse.json();
    console.log(`✅ Root directory updated to: ${updated.rootDirectory || 'apps/web'}`);
    return project.id;
  } catch (error: any) {
    console.error('❌ Error updating root directory:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await updateRootDirectory();
    console.log(`\n✅ Staging project configured!`);
    console.log(`\nNext steps:`);
    console.log(`1. Run: VERCEL_PROJECT_ID=${STAGING_PROJECT_ID} pnpm tsx scripts/add-vercel-env-vars.ts`);
    console.log(`2. Set staging-specific values (Supabase staging DB, Whop staging app, etc.)`);
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();

