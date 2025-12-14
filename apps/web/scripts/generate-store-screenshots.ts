import { chromium, type Browser, type Page } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'https://churnsaver-staging.vercel.app';
const SCREENSHOT_DIR = join(process.cwd(), 'docs/store-listing/screenshots');
const VIEWPORT = { width: 1920, height: 1080 };

interface ScreenshotConfig {
  name: string;
  url: string;
  description: string;
  waitForSelector?: string;
  waitTime?: number;
  fullPage?: boolean;
}

const screenshots: ScreenshotConfig[] = [
  {
    name: '01-homepage-hero',
    url: `${BASE_URL}/?qa_demo=true`,
    description: 'Homepage hero section with main CTA',
    waitForSelector: 'h1',
    fullPage: false,
  },
  {
    name: '02-homepage-features',
    url: `${BASE_URL}/?qa_demo=true`,
    description: 'Homepage features showcase section',
    waitForSelector: 'h2',
    waitTime: 3000,
    fullPage: true,
  },
  {
    name: '03-dashboard-overview',
    url: `${BASE_URL}/dashboard/demo-company?qa_demo=true`,
    description: 'Dashboard overview with KPIs and recovery cases',
    waitForSelector: 'h1, [role="main"]',
    waitTime: 5000,
    fullPage: true,
  },
  {
    name: '04-settings-page',
    url: `${BASE_URL}/settings?qa_demo=true`,
    description: 'Settings page showing configuration options',
    waitForSelector: 'form',
    waitTime: 2000,
    fullPage: true,
  },
];

async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }
}

async function takeScreenshot(
  page: Page,
  config: ScreenshotConfig
): Promise<void> {
  console.log(`📸 Taking screenshot: ${config.name} - ${config.description}`);
  
  try {
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for page to be interactive
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      // Ignore timeout, page might still be loading but that's okay
    });
    
    if (config.waitForSelector) {
      try {
        await page.waitForSelector(config.waitForSelector, { timeout: 10000 });
      } catch (error) {
        console.warn(`⚠️  Selector "${config.waitForSelector}" not found, proceeding anyway...`);
      }
    }
    
    if (config.waitTime) {
      await page.waitForTimeout(config.waitTime);
    }
    
    // Scroll to top to ensure consistent viewport
    await page.evaluate(() => window.scrollTo(0, 0));
    
    // Wait a bit for any animations to settle
    await page.waitForTimeout(500);
    
    const screenshotPath = join(SCREENSHOT_DIR, `${config.name}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: config.fullPage ?? true,
      type: 'png',
    });
    
    console.log(`✅ Saved: ${screenshotPath}`);
  } catch (error) {
    console.error(`❌ Failed to capture ${config.name}:`, error);
    throw error;
  }
}

async function generateScreenshots(): Promise<void> {
  console.log('🎬 Starting screenshot generation...');
  console.log(`📍 Base URL: ${BASE_URL}`);
  console.log(`📁 Output directory: ${SCREENSHOT_DIR}`);
  
  await ensureDir(SCREENSHOT_DIR);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  
  const page = await context.newPage();
  
  try {
    for (const config of screenshots) {
      await takeScreenshot(page, config);
      // Small delay between screenshots
      await page.waitForTimeout(1000);
    }
    
    // Create a README with screenshot descriptions
    const readmeContent = `# Store Listing Screenshots

Generated: ${new Date().toISOString()}

## Screenshots

${screenshots.map((s, i) => `### ${i + 1}. ${s.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

**File:** \`${s.name}.png\`  
**Description:** ${s.description}  
**URL:** ${s.url}

`).join('\n')}

## Usage

These screenshots are intended for Whop App Store submission. They showcase:

- Homepage with hero section and features
- Dashboard with recovery cases and KPIs
- Settings page with configuration options

## Requirements

- Format: PNG
- Resolution: 1920x1080 (or full page)
- File size: < 5MB per image

## Regenerating Screenshots

To regenerate screenshots, run:

\`\`\`bash
cd apps/web
pnpm tsx scripts/generate-store-screenshots.ts
\`\`\`

Or with custom base URL:

\`\`\`bash
SCREENSHOT_BASE_URL=https://churnsaver-staging.vercel.app pnpm tsx scripts/generate-store-screenshots.ts
\`\`\`
`;

    await writeFile(join(SCREENSHOT_DIR, 'README.md'), readmeContent);
    console.log('✅ Created README.md');
    
    console.log('\n🎉 Screenshot generation complete!');
    console.log(`📁 Screenshots saved to: ${SCREENSHOT_DIR}`);
  } catch (error) {
    console.error('❌ Error generating screenshots:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run if executed directly
if (require.main === module) {
  generateScreenshots()
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { generateScreenshots };

