import { test, expect } from '@playwright/test';

test.describe('Frontend User Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Set up test environment
    await page.goto('/');
  });

  test.describe('Home Page', () => {
    test('should load home page successfully', async ({ page }) => {
      await expect(page).toHaveTitle(/churn/i);
      await expect(page.locator('h1')).toBeVisible();
    });

    test('should display hero section', async ({ page }) => {
      const hero = page.locator('section').first();
      await expect(hero).toBeVisible();
      await expect(page.getByText(/stop churn/i)).toBeVisible();
    });

    test('should toggle settings preview', async ({ page }) => {
      const settingsButton = page.getByRole('button', { name: /configure settings/i });
      await settingsButton.click();
      
      await expect(page.getByText(/quick settings/i)).toBeVisible();
      
      await settingsButton.click();
      await expect(page.getByText(/quick settings/i)).not.toBeVisible();
    });

    test('should navigate to dashboard from CTA', async ({ page }) => {
      const dashboardLink = page.getByRole('link', { name: /view dashboard/i });
      await dashboardLink.click();
      
      // Should navigate to dashboard (may require auth)
      await page.waitForURL(/dashboard/, { timeout: 5000 });
    });
  });

  test.describe('Dashboard Page', () => {
    test('should load dashboard page', async ({ page }) => {
      await page.goto('/dashboard');
      
      // May show loading or auth required
      const loadingOrAuth = page.locator('text=/loading|authentication required/i');
      await expect(loadingOrAuth.first()).toBeVisible({ timeout: 10000 });
    });

    test('should display KPI tiles when loaded', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Wait for KPIs to load
      await page.waitForSelector('[data-testid="kpi-tile"], .card', { timeout: 10000 });
      
      const kpiTiles = page.locator('.card');
      const count = await kpiTiles.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between pages', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to settings
      const settingsLink = page.getByRole('link', { name: /settings/i }).first();
      if (await settingsLink.isVisible()) {
        await settingsLink.click();
        await page.waitForURL(/settings/, { timeout: 5000 });
      }
    });

    test('should have accessible navigation', async ({ page }) => {
      await page.goto('/');
      
      const nav = page.locator('nav');
      if (await nav.isVisible()) {
        await expect(nav).toHaveAttribute('aria-label');
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/');
      
      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();
    });

    test('should have focus indicators', async ({ page }) => {
      await page.goto('/');
      
      const button = page.getByRole('button').first();
      await button.focus();
      
      const outline = await button.evaluate((el) => {
        return window.getComputedStyle(el).outline;
      });
      
      expect(outline).not.toBe('none');
    });

    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('/');
      
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A', 'INPUT']).toContain(focused);
    });
  });

  test.describe('Responsive Design', () => {
    test('should be responsive on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      
      const hero = page.locator('section').first();
      await expect(hero).toBeVisible();
    });

    test('should be responsive on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/');
      
      const hero = page.locator('section').first();
      await expect(hero).toBeVisible();
    });

    test('should be responsive on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');
      
      const hero = page.locator('section').first();
      await expect(hero).toBeVisible();
    });
  });

  test.describe('Error States', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      await page.route('**/api/**', route => route.abort());
      
      await page.goto('/dashboard');
      
      // Should show error message or loading state
      await page.waitForTimeout(2000);
      const errorOrLoading = page.locator('text=/error|loading|failed/i');
      const count = await errorOrLoading.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Performance', () => {
    test('should load within performance budget', async ({ page }) => {
      await page.goto('/');
      
      const performanceMetrics = await page.evaluate(() => {
        return {
          loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
          domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        };
      });
      
      // Should load within 3 seconds
      expect(performanceMetrics.loadTime).toBeLessThan(3000);
    });
  });
});



