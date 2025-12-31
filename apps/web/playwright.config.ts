import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Churn Saver E2E tests
 * Track: D1 - E2E Infrastructure Setup
 */

// Vercel Deployment Protection bypass secret
// This allows E2E tests to access preview deployments
const VERCEL_PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'churnsaver-e2e-bypass-2025';

// Check if we're testing against a Vercel deployment (not localhost)
const isVercelDeployment = (process.env.E2E_BASE_URL || '').includes('vercel.app');

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }]
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Add Vercel protection bypass header for preview deployments
    ...(isVercelDeployment && {
      extraHTTPHeaders: {
        'x-vercel-protection-bypass': VERCEL_PROTECTION_BYPASS,
      },
    }),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
  // Only start webServer for local testing (not when E2E_BASE_URL is set to remote)
  ...(isVercelDeployment ? {} : {
    webServer: {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  }),
});
