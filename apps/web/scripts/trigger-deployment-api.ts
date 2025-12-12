#!/usr/bin/env tsx
/**
 * Trigger a Vercel deployment via API
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || 'Tn2z3hyFo5xgxes2Dp0VhqG2';
const VERCEL_PROJECT_ID = 'churnsaver-o3gl';
const VERCEL_TEAM_ID = 'dannys-projects-de68569e';

async function triggerDeployment() {
  // First, get the project to find the git connection
  const projectUrl = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
  };
  
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  try {
    // Get project info
    const projectResponse = await fetch(projectUrl, { headers });
    if (!projectResponse.ok) {
      const errorText = await projectResponse.text();
      console.error(`Failed to get project: ${projectResponse.status} ${errorText}`);
      return;
    }
    
    const project = await projectResponse.json();
    console.log('Project info:', JSON.stringify(project, null, 2));
    
    // Get latest git commit
    const { execSync } = require('child_process');
    const gitCommit = execSync('git rev-parse HEAD').toString().trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const gitRepo = execSync('git config --get remote.origin.url').toString().trim();
    
    console.log(`\n🚀 Triggering deployment...`);
    console.log(`   Branch: ${gitBranch}`);
    console.log(`   Commit: ${gitCommit}`);
    console.log(`   Repo: ${gitRepo}`);
    
    // Trigger deployment
    const deployUrl = `https://api.vercel.com/v13/deployments`;
    const deployBody: any = {
      name: VERCEL_PROJECT_ID,
      target: 'production',
    };
    
    // Use git source - project shows it's connected to Danservfinn/churnsaver
    deployBody.gitSource = {
      type: 'github',
      repo: 'Danservfinn/churnsaver',
      ref: gitBranch,
    };
    
    const deployResponse = await fetch(deployUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(deployBody),
    });
    
    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error(`❌ Failed to trigger deployment: ${deployResponse.status} ${errorText}`);
      
      // Try alternative: create deployment without git source
      console.log('\n🔄 Trying alternative deployment method...');
      const altBody = {
        name: VERCEL_PROJECT_ID,
        target: 'production',
      };
      
      const altResponse = await fetch(deployUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(altBody),
      });
      
      if (!altResponse.ok) {
        const altErrorText = await altResponse.text();
        console.error(`❌ Alternative method also failed: ${altResponse.status} ${altErrorText}`);
        return;
      }
      
      const altData = await altResponse.json();
      console.log(`✅ Deployment triggered via alternative method!`);
      console.log(`   URL: ${altData.url}`);
      console.log(`   Deployment ID: ${altData.uid}`);
      console.log(`\nMonitor at: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/deployments`);
      return;
    }
    
    const data = await deployResponse.json();
    console.log(`✅ Deployment triggered!`);
    console.log(`   URL: ${data.url}`);
    console.log(`   Deployment ID: ${data.uid}`);
    console.log(`\nMonitor at: https://vercel.com/dannys-projects-de68569e/churnsaver-o3gl/deployments`);
  } catch (error: any) {
    console.error('Error triggering deployment:', error.message);
  }
}

triggerDeployment();
