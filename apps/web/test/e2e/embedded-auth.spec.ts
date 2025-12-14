import { test, expect } from '@playwright/test';
import { chromium } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://churnsaver-staging.vercel.app';

/**
 * Embedded Auth Testing
 * 
 * NOTE: Whop embedded authentication is complex and may not be fully automatable.
 * This test suite attempts automation where possible but falls back to manual testing
 * for scenarios that require real Whop context.
 * 
 * For reliable testing, use QA demo bypass mode (?qa_demo=true) or manual testing
 * within the actual Whop embedded context.
 */

test.describe('Embedded Auth Tests (QA Demo Mode)', () => {
  // Use QA demo bypass for automated testing
  test('should load dashboard with QA demo bypass', async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/demo-company?qa_demo=true`);
    
    // Should load without auth gate
    await page.waitForTimeout(2000);
    
    // Check for dashboard content (KPIs or cases table)
    const dashboardContent = page.locator('h1, [data-testid="kpi-tile"], .card, table');
    const count = await dashboardContent.count();
    
    // Should have some dashboard content
    expect(count).toBeGreaterThan(0);
  });

  test('should load settings with QA demo bypass', async ({ page }) => {
    await page.goto(`${baseUrl}/settings?qa_demo=true`);
    
    await page.waitForTimeout(2000);
    
    // Check for settings form
    const settingsForm = page.locator('form, [data-testid="settings-form"]');
    const formVisible = await settingsForm.first().isVisible().catch(() => false);
    
    // Should show settings form or loading state
    expect(formVisible || await page.locator('text=/loading|settings/i').first().isVisible()).toBeTruthy();
  });

  test('should have company context in QA demo mode', async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/demo-company?qa_demo=true`);
    
    await page.waitForTimeout(2000);
    
    // Check that companyId is not unknown/placeholder
    const pageContent = await page.textContent('body');
    const hasPlaceholder = pageContent?.includes('unknown') || 
                          pageContent?.includes('dev_app_id_placeholder') ||
                          pageContent?.includes('anonymous');
    
    expect(hasPlaceholder).toBeFalsy();
  });
});

test.describe('Embedded Auth - Manual Testing Checklist', () => {
  /**
   * These tests are skipped by default as they require manual execution
   * within the actual Whop embedded context.
   * 
   * To run manually:
   * 1. Launch the app from within Whop dashboard
   * 2. Verify the checks below
   * 3. Document results in QA matrix
   */
  
  test.skip('MANUAL: Dashboard loads with real Whop auth', async ({ page }) => {
    // Manual test: Launch from Whop and verify:
    // - Company context loads correctly
    // - No "unknown" or placeholder companyId
    // - KPIs display with real data
    // - Cases table shows real cases
  });

  test.skip('MANUAL: Settings persist with real Whop auth', async ({ page }) => {
    // Manual test: 
    // - Update settings
    // - Refresh page
    // - Verify settings persist
  });

  test.skip('MANUAL: Navigation works in embedded context', async ({ page }) => {
    // Manual test:
    // - Navigate between dashboard and settings
    // - Verify smooth transitions
    // - Verify no auth errors
  });
});

test.describe('StorageState Evaluation', () => {
  /**
   * Attempt to create a storageState for Whop authentication.
   * This may not be feasible if Whop uses complex OAuth flows or
   * iframe-based authentication that Playwright cannot capture.
   */
  
  test('evaluate storageState feasibility', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
      // Attempt to navigate to Whop login (if accessible)
      // This is likely to fail as Whop auth is complex
      await page.goto('https://whop.com/login', { timeout: 5000 });
      
      // If we can reach login, try to capture auth flow
      // Note: This is unlikely to work fully due to OAuth complexity
      const cookies = await context.cookies();
      const localStorage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            items[key] = window.localStorage.getItem(key) || '';
          }
        }
        return items;
      });
      
      // Log what we captured (for debugging)
      console.log('Cookies captured:', cookies.length);
      console.log('LocalStorage keys:', Object.keys(localStorage).length);
      
      // If we have meaningful auth data, we could save storageState
      // For now, we'll document that manual testing is required
      
    } catch (error) {
      // Expected - Whop auth is not easily automatable
      console.log('StorageState capture not feasible:', error);
    } finally {
      await context.close();
    }
  });
});

test.describe('API Endpoint Auth Gating', () => {
  /**
   * Test that API endpoints properly gate requests without auth
   */
  
  test('dashboard KPIs endpoint requires auth', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/dashboard/kpis`);
    
    // Should return 400, 401, 403, or redirect (all indicate auth required)
    expect([400, 401, 403, 302]).toContain(response.status());
  });

  test('dashboard cases endpoint requires auth', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/dashboard/cases`);
    
    // Should return 400, 401, 403, or redirect (all indicate auth required)
    expect([400, 401, 403, 302]).toContain(response.status());
  });

  test('settings endpoint requires auth', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/settings`);
    
    // Should return 400, 401, 403, or redirect (all indicate auth required)
    expect([400, 401, 403, 302]).toContain(response.status());
  });

  test('subscription endpoint requires auth', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/subscription`);
    
    // Should return 400, 401, 403, or redirect (all indicate auth required)
    expect([400, 401, 403, 302]).toContain(response.status());
  });
});

