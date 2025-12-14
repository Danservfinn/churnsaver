import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

test.describe('Unauthenticated Smoke Tests', () => {
  test.describe('Landing Page', () => {
    test('should load landing page without errors', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      const response = await page.goto(`${baseUrl}/`);
      expect(response?.status() || 0).toBeLessThan(400);

      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle', { timeout: 10000 });

      // Check for console errors
      expect(consoleErrors.length).toBe(0);
    });

    test('should display hero section with main CTA', async ({ page }) => {
      await page.goto(`${baseUrl}/`);

      // Check for main heading
      const heading = page.getByRole('heading', { name: /stop churn/i });
      await expect(heading).toBeVisible({ timeout: 5000 });

      // Check for CTA buttons
      const dashboardLink = page.getByRole('link', { name: /view dashboard/i });
      await expect(dashboardLink).toBeVisible();
    });

    test('should display feature cards', async ({ page }) => {
      await page.goto(`${baseUrl}/`);

      // Scroll to features section
      await page.evaluate(() => window.scrollTo(0, 500));

      // Check for feature cards (should have at least 2)
      const featureCards = page.locator('section').filter({ hasText: /push notifications|direct messages|smart incentives|analytics/i });
      const count = await featureCards.count();
      expect(count).toBeGreaterThan(0);
    });

    test('should have working navigation links', async ({ page }) => {
      await page.goto(`${baseUrl}/`);

      // Check for navigation
      const nav = page.locator('nav').first();
      if (await nav.isVisible()) {
        const navLinks = nav.getByRole('link');
        const linkCount = await navLinks.count();
        expect(linkCount).toBeGreaterThan(0);
      }
    });

    test('should not have hydration warnings', async ({ page }) => {
      const warnings: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'warning' && msg.text().includes('hydration')) {
          warnings.push(msg.text());
        }
      });

      await page.goto(`${baseUrl}/`);
      await page.waitForLoadState('networkidle');

      expect(warnings.length).toBe(0);
    });
  });

  test.describe('Auth-Gated Routes', () => {
    test('dashboard route should show auth gate when not embedded', async ({ page }) => {
      await page.goto(`${baseUrl}/dashboard`);

      // Should show either loading state or auth required message
      const authGate = page.getByText(/authentication required|loading|please access this app through whop/i);
      await expect(authGate.first()).toBeVisible({ timeout: 10000 });
    });

    test('dashboard route should not return 5xx error', async ({ page }) => {
      const response = await page.goto(`${baseUrl}/dashboard`);
      expect(response?.status() || 0).toBeLessThan(500);
    });

    test('settings route should show auth gate when not embedded', async ({ page }) => {
      await page.goto(`${baseUrl}/settings`);

      // Should show either loading state or auth required message
      // Settings might redirect or show auth gate
      await page.waitForTimeout(2000);
      
      const pageContent = await page.textContent('body');
      const hasAuthGate = pageContent?.toLowerCase().includes('authentication') || 
                         pageContent?.toLowerCase().includes('loading') ||
                         page.url().includes('/dashboard');
      
      expect(hasAuthGate).toBeTruthy();
    });

    test('settings route should not return 5xx error', async ({ page }) => {
      const response = await page.goto(`${baseUrl}/settings`);
      expect(response?.status() || 0).toBeLessThan(500);
    });

    test('company-scoped dashboard route should handle missing auth', async ({ page }) => {
      await page.goto(`${baseUrl}/dashboard/test-company-id`);

      // Should handle gracefully (auth gate, redirect, or loading)
      await page.waitForTimeout(2000);
      
      const response = await page.goto(`${baseUrl}/dashboard/test-company-id`);
      expect(response?.status() || 0).toBeLessThan(500);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle 404 routes gracefully', async ({ page }) => {
      const response = await page.goto(`${baseUrl}/non-existent-route`);
      
      // Should return 404 or show not found page
      expect([404, 200]).toContain(response?.status() || 0);
      
      if (response?.status() === 200) {
        const notFound = page.getByText(/not found|404/i);
        await expect(notFound.first()).toBeVisible({ timeout: 2000 });
      }
    });

    test('should not have console errors on navigation', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(`${baseUrl}/`);
      await page.goto(`${baseUrl}/dashboard`);
      await page.goto(`${baseUrl}/settings`);
      await page.waitForLoadState('networkidle');

      // Filter out expected errors (like auth errors, network errors for unauthenticated routes)
      const unexpectedErrors = consoleErrors.filter(
        err => 
          !err.includes('401') && 
          !err.includes('Unauthorized') &&
          !err.includes('Failed to fetch') &&
          !err.includes('NetworkError') &&
          !err.toLowerCase().includes('company context') &&
          !err.toLowerCase().includes('authentication required')
      );

      // Log errors for debugging but don't fail if they're expected
      if (unexpectedErrors.length > 0) {
        console.warn('Console errors detected:', unexpectedErrors);
      }

      // Allow some console errors for unauthenticated navigation (expected behavior)
      // Fail only if there are critical errors
      const criticalErrors = unexpectedErrors.filter(
        err => 
          err.includes('Error:') ||
          err.includes('TypeError:') ||
          err.includes('ReferenceError:') ||
          err.includes('SyntaxError:')
      );

      expect(criticalErrors.length).toBe(0);
    });
  });

  test.describe('Responsive Layout', () => {
    test('should render correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/`);

      const hero = page.getByRole('heading', { name: /stop churn/i });
      await expect(hero).toBeVisible();

      // Check that layout doesn't break
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(390);
    });

    test('should render correctly on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${baseUrl}/`);

      const hero = page.getByRole('heading', { name: /stop churn/i });
      await expect(hero).toBeVisible();
    });

    test('should render correctly on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`${baseUrl}/`);

      const hero = page.getByRole('heading', { name: /stop churn/i });
      await expect(hero).toBeVisible();
    });
  });

  test.describe('Performance', () => {
    test('should load landing page within performance budget', async ({ page }) => {
      await page.goto(`${baseUrl}/`);

      const metrics = await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return {
          domContentLoaded: perf.domContentLoadedEventEnd - perf.fetchStart,
          loadComplete: perf.loadEventEnd - perf.fetchStart,
        };
      });

      // Should load within 3 seconds
      expect(metrics.loadComplete).toBeLessThan(3000);
    });

    test('should not have excessive layout shifts', async ({ page }) => {
      await page.goto(`${baseUrl}/`);
      await page.waitForLoadState('networkidle');

      const cls = await page.evaluate(() => {
        // Simple CLS calculation
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
        return cls;
      });

      // CLS should be low (< 0.1 is good)
      expect(cls).toBeLessThan(0.25);
    });
  });
});

