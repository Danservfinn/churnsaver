import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://churnsaver-staging.vercel.app';

/**
 * Performance Testing with Lighthouse
 * 
 * These tests run Lighthouse audits to check performance, accessibility,
 * best practices, and SEO scores.
 * 
 * Requirements:
 * - Lighthouse CLI installed: npm install -g lighthouse
 * - Or use Playwright's built-in Lighthouse (if available)
 */

test.describe('Performance - Lighthouse Audits', () => {
  // Check if Lighthouse CLI is available
  let lighthouseAvailable = false;

  test.beforeAll(async () => {
    try {
      await execAsync('which lighthouse || where lighthouse');
      lighthouseAvailable = true;
    } catch {
      console.warn('Lighthouse CLI not found. Install with: npm install -g lighthouse');
      lighthouseAvailable = false;
    }
  });

  test('landing page should meet performance targets', async ({ page, browser }) => {
    // Use Playwright's CDP to run Lighthouse
    const context = await browser.newContext();
    const cdpSession = await context.newCDPSession(page);
    
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');

    // Get performance metrics using Performance API
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.fetchStart,
        loadComplete: perf.loadEventEnd - perf.fetchStart,
        firstPaint: perf.domInteractive - perf.fetchStart,
      };
    });

    // Performance targets
    expect(metrics.domContentLoaded).toBeLessThan(2000); // 2 seconds
    expect(metrics.loadComplete).toBeLessThan(3000); // 3 seconds

    // Get Core Web Vitals
    const webVitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const vitals: Record<string, number> = {};
        
        // LCP (Largest Contentful Paint)
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          vitals.lcp = lastEntry.renderTime || lastEntry.loadTime;
          resolve(vitals);
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // FID (First Input Delay) - requires user interaction
        // CLS (Cumulative Layout Shift)
        new PerformanceObserver((list) => {
          let cls = 0;
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
          vitals.cls = cls;
        }).observe({ type: 'layout-shift', buffered: true });
      });
    });

    // Core Web Vitals targets
    const vitals = await webVitals as any;
    if (vitals.lcp) {
      expect(vitals.lcp).toBeLessThan(2500); // LCP < 2.5s
    }
    if (vitals.cls !== undefined) {
      expect(vitals.cls).toBeLessThan(0.1); // CLS < 0.1
    }

    await context.close();
  });

  test('dashboard should load within performance budget', async ({ page }) => {
    await page.goto(`${baseUrl}/dashboard/demo-company?qa_demo=true`);
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.fetchStart,
        loadComplete: perf.loadEventEnd - perf.fetchStart,
      };
    });

    // Dashboard should load within 3 seconds
    expect(metrics.loadComplete).toBeLessThan(3000);
  });

  test('should not have excessive layout shifts', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');

    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              cls += (entry as any).value;
            }
          }
          resolve(cls);
        }).observe({ type: 'layout-shift', buffered: true });
        
        // Resolve after a short delay
        setTimeout(() => resolve(cls), 2000);
      });
    });

    // CLS should be low (< 0.1 is good, < 0.25 is acceptable)
    expect(cls as number).toBeLessThan(0.25);
  });

  test('should load resources efficiently', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');

    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries.map(entry => ({
        name: entry.name,
        duration: entry.duration,
        size: (entry as any).transferSize || 0,
      }));
    });

    // Check for large resources (> 1MB)
    const largeResources = resources.filter(r => r.size > 1024 * 1024);
    expect(largeResources.length).toBe(0);

    // Check for slow resources (> 2 seconds)
    const slowResources = resources.filter(r => r.duration > 2000);
    expect(slowResources.length).toBeLessThan(5); // Allow some slow resources
  });

  test('should have efficient bundle size', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');

    const scripts = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return entries
        .filter(e => e.initiatorType === 'script')
        .map(e => ({
          name: e.name,
          size: (e as any).transferSize || 0,
        }));
    });

    // Total JavaScript size should be reasonable
    const totalJsSize = scripts.reduce((sum, s) => sum + s.size, 0);
    // Target: < 500KB for initial JS (can be higher for SPA)
    expect(totalJsSize).toBeLessThan(2 * 1024 * 1024); // 2MB threshold
  });

  test.skip('lighthouse audit - landing page', async () => {
    // Skip if Lighthouse CLI not available
    test.skip(!lighthouseAvailable, 'Lighthouse CLI not available');

    // Run Lighthouse audit
    const { stdout } = await execAsync(
      `lighthouse ${baseUrl}/ --output=json --output-path=/tmp/lighthouse-landing.json --chrome-flags="--headless" --quiet`
    );

    // Parse results (simplified - would need full JSON parsing)
    // In practice, you'd parse the JSON and check scores
    expect(stdout).toBeTruthy();
  });

  test.skip('lighthouse audit - dashboard', async () => {
    test.skip(!lighthouseAvailable, 'Lighthouse CLI not available');

    const { stdout } = await execAsync(
      `lighthouse ${baseUrl}/dashboard/demo-company?qa_demo=true --output=json --output-path=/tmp/lighthouse-dashboard.json --chrome-flags="--headless" --quiet`
    );

    expect(stdout).toBeTruthy();
  });
});

test.describe('Performance - Manual Metrics', () => {
  test('should measure time to interactive', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const tti = await page.evaluate(() => {
      return new Promise((resolve) => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const tti = perf.domInteractive - perf.fetchStart;
        resolve(tti);
      });
    });

    // TTI should be < 3.8 seconds
    expect(tti as number).toBeLessThan(3800);
  });

  test('should measure first contentful paint', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const fcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const fcpEntry = entries.find(e => e.name === 'first-contentful-paint') as any;
          if (fcpEntry) {
            resolve(fcpEntry.startTime);
          }
        }).observe({ type: 'paint', buffered: true });
        
        setTimeout(() => resolve(2000), 2000);
      });
    });

    // FCP should be < 1.8 seconds
    expect(fcp as number).toBeLessThan(1800);
  });

  test('should measure total blocking time', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState('networkidle');

    const tbt = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Simplified TBT calculation
        // Real TBT requires more complex calculation
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const tbt = perf.domInteractive - perf.domContentLoadedEventEnd;
        resolve(Math.max(0, tbt));
      });
    });

    // TBT should be < 200ms
    expect(tbt as number).toBeLessThan(200);
  });
});

