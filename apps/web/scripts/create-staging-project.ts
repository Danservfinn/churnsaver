#!/usr/bin/env tsx
/**
 * Create a new Vercel staging project and configure it
 */

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'dannys-projects-de68569e';
const STAGING_PROJECT_NAME = process.env.STAGING_PROJECT_NAME || 'churnsaver-staging';
const GIT_REPO = 'Danservfinn/churnsaver';

if (!VERCEL_TOKEN) {
  console.error('❌ Missing VERCEL_TOKEN in environment');
  process.exit(1);
}

async function createStagingProject() {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${VERCEL_TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (VERCEL_TEAM_ID) {
    headers['x-vercel-team-id'] = VERCEL_TEAM_ID;
  }

  try {
    // Step 1: Create the project
    console.log(`🚀 Creating staging project: ${STAGING_PROJECT_NAME}...`);
    
    const createUrl = 'https://api.vercel.com/v9/projects';
    const createBody = {
      name: STAGING_PROJECT_NAME,
      framework: 'nextjs',
      gitRepository: {
        type: 'github',
        repo: GIT_REPO,
      },
      buildCommand: 'pnpm run build',
      installCommand: 'pnpm install',
      rootDirectory: 'apps/web',
    };

    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(createBody),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`❌ Failed to create project: ${createResponse.status} ${errorText}`);
      
      // Check if project already exists
      if (createResponse.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message?.includes('already exists') || errorData.error?.code === 'PROJECT_ALREADY_EXISTS') {
            console.log(`⚠️  Project ${STAGING_PROJECT_NAME} already exists, continuing with configuration...`);
            // Get existing project
            const getUrl = `https://api.vercel.com/v9/projects/${STAGING_PROJECT_NAME}`;
            const getResponse = await fetch(getUrl, { headers });
            if (getResponse.ok) {
              const project = await getResponse.json();
              console.log(`✅ Found existing project: ${project.name}`);
              console.log(`   Project ID: ${project.id}`);
              console.log(`   URL: ${project.targets?.production?.url || 'N/A'}`);
              return project;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
      throw new Error(`Failed to create project: ${createResponse.status}`);
    }

    const project = await createResponse.json();
    console.log(`✅ Project created successfully!`);
    console.log(`   Project ID: ${project.id}`);
    console.log(`   Name: ${project.name}`);
    console.log(`   URL: ${project.targets?.production?.url || 'N/A'}`);

    // Step 2: Update project settings (root directory, etc.)
    console.log(`\n⚙️  Configuring project settings...`);
    
    const updateUrl = `https://api.vercel.com/v9/projects/${project.id}`;
    const updateBody = {
      rootDirectory: 'apps/web',
      framework: 'nextjs',
      buildCommand: 'pnpm run build',
      installCommand: 'pnpm install',
      outputDirectory: '.next',
    };

    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateBody),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.warn(`⚠️  Failed to update project settings: ${updateResponse.status} ${errorText}`);
      console.warn(`   You may need to set Root Directory manually in the Vercel dashboard`);
    } else {
      console.log(`✅ Project settings updated`);
    }

    console.log(`\n📋 Next steps:`);
    console.log(`   1. Set environment variables (use add-vercel-env-vars.ts with VERCEL_PROJECT_ID=${STAGING_PROJECT_NAME})`);
    console.log(`   2. Deploy: vercel --prod --cwd apps/web`);
    console.log(`   3. Verify: https://${STAGING_PROJECT_NAME}.vercel.app/api/health`);

    return project;
  } catch (error: any) {
    console.error('❌ Error creating staging project:', error.message);
    process.exit(1);
  }
}

createStagingProject();

