#!/usr/bin/env tsx
/**
 * Trigger a new Vercel deployment via API
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = 'churnsaver-o3gl';
const VERCEL_TEAM_ID = 'dannys-projects-de68569e';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

async function triggerDeployment() {
  const url = `https://api.vercel.com/v13/deployments`;
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
  
  const body = {
    name: VERCEL_PROJECT_ID,
    gitSource: {
      type: 'github',
      repo: 'Danservfinn/churnsaver',
      ref: gitBranch,
      sha: gitCommit,
    },
    target: 'production',
  };
  
  try {
    console.log(`🚀 Triggering deployment for ${VERCEL_PROJECT_ID}...`);
    console.log(`   Branch: ${gitBranch}`);
    console.log(`   Commit: ${gitCommit}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
    console.log(`\nMonitor at: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/deployments`);
  } catch (error: any) {
    console.error('Error triggering deployment:', error.message);
  }
}

triggerDeployment();

