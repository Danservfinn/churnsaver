#!/usr/bin/env tsx
/**
 * Verify cron schedules are configured in Vercel
 * Uses Vercel API to check if cron jobs exist
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = 'churnsaver-o3gl';
const VERCEL_TEAM_ID = 'dannys-projects-de68569e';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

async function checkCronSchedules() {
  const url = `https://api.vercel.com/v1/crons`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
  };
  
  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }
  
  try {
    const response = await fetch(`${url}?projectId=${VERCEL_PROJECT_ID}`, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch cron schedules: ${response.status} ${errorText}`);
      return;
    }
    
    const data = await response.json();
    console.log('Cron schedules:', JSON.stringify(data, null, 2));
    
    const expectedCrons = [
      { path: '/api/cron/process-queue', schedule: '* * * * *' },
      { path: '/api/cron/reminders', schedule: '*/15 * * * *' },
      { path: '/api/cron/maintenance', schedule: '0 * * * *' },
    ];
    
    if (data.crons && Array.isArray(data.crons)) {
      console.log(`\nFound ${data.crons.length} cron job(s):`);
      data.crons.forEach((cron: any) => {
        console.log(`  - ${cron.path} (${cron.schedule})`);
      });
      
      // Check if all expected crons exist
      const foundPaths = data.crons.map((c: any) => c.path);
      expectedCrons.forEach(expected => {
        if (foundPaths.includes(expected.path)) {
          console.log(`✅ ${expected.path} is configured`);
        } else {
          console.log(`❌ ${expected.path} is missing`);
        }
      });
    } else {
      console.log('No cron jobs found. They may need to be configured manually or will appear after deployment.');
    }
  } catch (error: any) {
    console.error('Error checking cron schedules:', error.message);
  }
}

checkCronSchedules();
