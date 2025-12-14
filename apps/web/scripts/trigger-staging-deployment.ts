#!/usr/bin/env tsx
/**
 * Trigger a staging Vercel deployment via API
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'churnsaver-staging';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'dannys-projects-de68569e';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

async function triggerDeployment() {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }

  // Get latest git commit
  const { execSync } = require('child_process');
  const gitCommit = execSync('git rev-parse HEAD').toString().trim();
  const gitBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

  const deployUrl = `https://api.vercel.com/v13/deployments`;
  const deployBody: any = {
    name: VERCEL_PROJECT_ID,
    target: 'production',
    gitSource: {
      type: 'github',
      repo: 'Danservfinn/churnsaver',
      ref: gitBranch,
    },
  };

  try {
    console.log(`🚀 Triggering staging deployment for ${VERCEL_PROJECT_ID}...`);
    console.log(`   Branch: ${gitBranch}`);
    console.log(`   Commit: ${gitCommit}`);

    const response = await fetch(deployUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(deployBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to trigger deployment: ${response.status} ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log(`✅ Deployment triggered!`);
    console.log(`   URL: ${data.url}`);
    console.log(`   Deployment ID: ${data.uid}`);
    console.log(`\nMonitor at: https://vercel.com/${VERCEL_TEAM_ID}/${VERCEL_PROJECT_ID}/deployments`);
  } catch (error: any) {
    console.error('Error triggering deployment:', error.message);
  }
}

triggerDeployment();

