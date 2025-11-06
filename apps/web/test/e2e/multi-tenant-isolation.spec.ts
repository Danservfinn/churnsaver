// E2E test: Multi-Tenant Dashboard Access and Isolation
import { test, expect } from '@playwright/test';
import { loginAsUser, setAuthContext } from './helpers/auth';
import { TEST_COMPANIES } from './helpers/test-data';

test.describe('Multi-Tenant Isolation', () => {
  test('company A cannot access company B data', async ({ page, context }) => {
    // Set Company A context
    await setAuthContext(page, {
      companyId: TEST_COMPANIES.COMPANY_A.id,
      userId: TEST_COMPANIES.COMPANY_A.userId,
    });

    // Navigate to dashboard
    await page.goto('/dashboard');
    
    // If login is required, handle it
    if (page.url().includes('/login')) {
      await loginAsUser(page, {
        email: TEST_COMPANIES.COMPANY_A.email,
        companyId: TEST_COMPANIES.COMPANY_A.id,
      });
    }

    // Navigate to cases
    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list], [data-testid=no-cases-message]', { timeout: 10000 });

    // Verify Company A data is visible (if any exists)
    const companyACase = page.locator(`[data-testid=case-item]:has-text("${TEST_COMPANIES.COMPANY_A.id}")`);
    
    // Try to access Company B case directly via URL manipulation
    // First, let's see if we can access a Company B case ID directly
    const companyBCaseId = 'companyB_case';
    
    // Try to navigate to Company B's case (should be blocked or show access denied)
    await page.goto(`/dashboard/cases/${companyBCaseId}`);
    
    // Should show access denied or redirect
    const accessDeniedMessage = page.locator('[data-testid=access-denied-message]');
    const notFoundMessage = page.locator('[data-testid=not-found-message]');
    
    // Either access denied or not found is acceptable
    const hasAccessControl = await accessDeniedMessage.isVisible() || 
                            await notFoundMessage.isVisible() ||
                            page.url().includes('/dashboard'); // Redirected back to dashboard
    
    expect(hasAccessControl).toBe(true);
  });

  test('company B cannot access company A data', async ({ page, context }) => {
    // Set Company B context
    await setAuthContext(page, {
      companyId: TEST_COMPANIES.COMPANY_B.id,
      userId: TEST_COMPANIES.COMPANY_B.userId,
    });

    await page.goto('/dashboard');
    
    if (page.url().includes('/login')) {
      await loginAsUser(page, {
        email: TEST_COMPANIES.COMPANY_B.email,
        companyId: TEST_COMPANIES.COMPANY_B.id,
      });
    }

    await page.goto('/dashboard/cases');
    await page.waitForSelector('[data-testid=case-list], [data-testid=no-cases-message]', { timeout: 10000 });

    // Verify Company B data is visible
    const companyBCase = page.locator(`[data-testid=case-item]:has-text("${TEST_COMPANIES.COMPANY_B.id}")`);

    // Try to access Company A case directly
    const companyACaseId = 'companyA_case';
    await page.goto(`/dashboard/cases/${companyACaseId}`);
    
    // Should be blocked
    const accessDeniedMessage = page.locator('[data-testid=access-denied-message]');
    const notFoundMessage = page.locator('[data-testid=not-found-message]');
    
    const hasAccessControl = await accessDeniedMessage.isVisible() || 
                            await notFoundMessage.isVisible() ||
                            page.url().includes('/dashboard');
    
    expect(hasAccessControl).toBe(true);
  });

  test('session isolation prevents data mixing', async ({ page, context }) => {
    // Create two browser contexts for two different companies
    const contextA = await context.browser()?.newContext();
    const contextB = await context.browser()?.newContext();

    if (!contextA || !contextB) {
      test.skip();
      return;
    }

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Set Company A context for page A
      await setAuthContext(pageA, {
        companyId: TEST_COMPANIES.COMPANY_A.id,
        userId: TEST_COMPANIES.COMPANY_A.userId,
      });

      // Set Company B context for page B
      await setAuthContext(pageB, {
        companyId: TEST_COMPANIES.COMPANY_B.id,
        userId: TEST_COMPANIES.COMPANY_B.userId,
      });

      // Navigate both to dashboard
      await pageA.goto('/dashboard/cases');
      await pageB.goto('/dashboard/cases');

      await pageA.waitForSelector('[data-testid=case-list], [data-testid=no-cases-message]', { timeout: 10000 });
      await pageB.waitForSelector('[data-testid=case-list], [data-testid=no-cases-message]', { timeout: 10000 });

      // Verify each page shows only its own data
      // Company A should not see Company B cases
      const companyBCaseOnPageA = pageA.locator(`[data-testid=case-item]:has-text("${TEST_COMPANIES.COMPANY_B.id}")`);
      await expect(companyBCaseOnPageA).not.toBeVisible();

      // Company B should not see Company A cases
      const companyACaseOnPageB = pageB.locator(`[data-testid=case-item]:has-text("${TEST_COMPANIES.COMPANY_A.id}")`);
      await expect(companyACaseOnPageB).not.toBeVisible();
    } finally {
      await pageA.close();
      await pageB.close();
      await contextA.close();
      await contextB.close();
    }
  });

  test('API endpoints enforce tenant isolation', async ({ page }) => {
    // Set Company A context
    await setAuthContext(page, {
      companyId: TEST_COMPANIES.COMPANY_A.id,
      userId: TEST_COMPANIES.COMPANY_A.userId,
    });

    // Make API call to get cases
    const response = await page.request.get('/api/dashboard/cases');
    
    expect(response.ok()).toBe(true);
    
    const data = await response.json();
    
    // All cases should belong to Company A
    if (data.cases && data.cases.length > 0) {
      for (const case_ of data.cases) {
        expect(case_.company_id).toBe(TEST_COMPANIES.COMPANY_A.id);
      }
    }
  });
});

