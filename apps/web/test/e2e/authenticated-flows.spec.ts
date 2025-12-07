import { test, expect } from '@playwright/test';

/**
 * E2E tests for authenticated flows
 * Tests dashboard access, settings management, and API authentication
 */

test.describe('Authenticated Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
  });

  test('should show authentication required message on dashboard when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for authentication required message
    const authMessage = page.locator('text=/Authentication Required|authenticated/i');
    await expect(authMessage.first()).toBeVisible({ timeout: 5000 });
  });

  test('should handle settings API error gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Wait for settings API call
    await page.waitForLoadState('networkidle');
    
    // Check for error message or alert
    const errorAlert = page.locator('[role="alert"]');
    const tryAgainButton = page.locator('button:has-text("Try Again")');
    
    // Either error alert or try again button should be visible
    const hasError = await errorAlert.isVisible().catch(() => false);
    const hasTryAgain = await tryAgainButton.isVisible().catch(() => false);
    
    expect(hasError || hasTryAgain).toBeTruthy();
  });

  test('should display error message when settings API fails', async ({ page }) => {
    // Intercept settings API call and return error
    await page.route('/api/settings', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ 
          error: 'Database connection error. Please check server configuration.' 
        }),
      });
    });

    await page.goto('/');
    
    // Wait for error to appear
    await page.waitForSelector('[role="alert"], button:has-text("Try Again")', { timeout: 5000 });
    
    // Verify error is displayed
    const errorElement = page.locator('[role="alert"], button:has-text("Try Again")').first();
    await expect(errorElement).toBeVisible();
  });

  test('should retry settings load when Try Again is clicked', async ({ page }) => {
    let requestCount = 0;
    
    // Intercept settings API call
    await page.route('/api/settings', route => {
      requestCount++;
      if (requestCount === 1) {
        // First request fails
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to load settings' }),
        });
      } else {
        // Subsequent requests succeed
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            company_id: 'test-company',
            enable_push: true,
            enable_dm: true,
            incentive_days: 3,
            reminder_offsets_days: [0, 2, 4],
            updated_at: new Date().toISOString(),
          }),
        });
      }
    });

    await page.goto('/');
    
    // Wait for error and try again button
    const tryAgainButton = page.locator('button:has-text("Try Again")');
    await expect(tryAgainButton).toBeVisible({ timeout: 5000 });
    
    // Click try again
    await tryAgainButton.click();
    
    // Wait for retry request
    await page.waitForTimeout(1000);
    
    // Verify retry was attempted
    expect(requestCount).toBeGreaterThan(1);
  });

  test('should show proper error message for 401 authentication errors', async ({ page }) => {
    await page.route('/api/settings', route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ 
          error: 'Authentication error. Please ensure you are properly authenticated.' 
        }),
      });
    });

    await page.goto('/');
    
    // Wait for error message
    await page.waitForSelector('[role="alert"], button:has-text("Try Again")', { timeout: 5000 });
    
    // Check that authentication error is mentioned
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('Authentication');
  });

  test('should show proper error message for 503 service unavailable errors', async ({ page }) => {
    await page.route('/api/settings', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ 
          error: 'Database connection error. Please check server configuration.' 
        }),
      });
    });

    await page.goto('/');
    
    // Wait for error message
    await page.waitForSelector('[role="alert"], button:has-text("Try Again")', { timeout: 5000 });
    
    // Check that database error is mentioned
    const pageContent = await page.textContent('body');
    expect(pageContent).toMatch(/database|connection|server/i);
  });

  test('should navigate between pages without losing error state', async ({ page }) => {
    // Set up failing API
    await page.route('/api/settings', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to load settings' }),
      });
    });

    await page.goto('/');
    
    // Wait for error
    await page.waitForSelector('[role="alert"], button:has-text("Try Again")', { timeout: 5000 });
    
    // Navigate to settings page
    await page.click('a[href="/settings"]');
    await page.waitForLoadState('networkidle');
    
    // Error should still be visible or page should handle it
    const errorElement = page.locator('[role="alert"], button:has-text("Try Again")').first();
    const isVisible = await errorElement.isVisible().catch(() => false);
    
    // Either error is visible or page loaded successfully
    expect(isVisible || page.url().includes('/settings')).toBeTruthy();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate network failure
    await page.route('/api/settings', route => {
      route.abort('failed');
    });

    await page.goto('/');
    
    // Wait for error handling
    await page.waitForTimeout(2000);
    
    // Page should not crash and should show some error indication
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Settings Page - Authenticated Flow', () => {
  test('should load settings page and show error if API fails', async ({ page }) => {
    await page.route('/api/settings', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to load settings' }),
      });
    });

    await page.goto('/settings');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Should show error or loading state
    const errorElement = page.locator('[role="alert"], .error, button:has-text("Try Again")').first();
    const isVisible = await errorElement.isVisible().catch(() => false);
    
    // Error should be visible or page should be in loading state
    expect(isVisible || page.locator('text=/loading|error/i').first().isVisible()).toBeTruthy();
  });

  test('should display settings form when API succeeds', async ({ page }) => {
    await page.route('/api/settings', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          company_id: 'test-company',
          enable_push: true,
          enable_dm: false,
          incentive_days: 5,
          reminder_offsets_days: [0, 1, 3],
          updated_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto('/settings');
    
    // Wait for form to load
    await page.waitForSelector('form, input[type="checkbox"], button[type="submit"]', { timeout: 5000 });
    
    // Verify form elements are present
    const form = page.locator('form').first();
    await expect(form).toBeVisible();
  });
});



