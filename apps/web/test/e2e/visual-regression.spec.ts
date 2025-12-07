import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('home page should match snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot for visual comparison
    await expect(page).toHaveScreenshot('home-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('dashboard page should match snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    // Wait for content to load
    await page.waitForTimeout(2000);
    
    await expect(page).toHaveScreenshot('dashboard-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('settings page should match snapshot', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    
    await page.waitForTimeout(2000);
    
    await expect(page).toHaveScreenshot('settings-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('home page hero section should match snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const hero = page.locator('section').first();
    await expect(hero).toHaveScreenshot('home-hero.png', {
      maxDiffPixels: 50,
    });
  });

  test('KPI tiles should match snapshot', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    await page.waitForSelector('.card', { timeout: 10000 });
    
    const kpiTile = page.locator('.card').first();
    if (await kpiTile.isVisible()) {
      await expect(kpiTile).toHaveScreenshot('kpi-tile.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('button variants should match snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      const firstButton = buttons.first();
      await expect(firstButton).toHaveScreenshot('button-default.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('card component should match snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const card = page.locator('.card').first();
    if (await card.isVisible()) {
      await expect(card).toHaveScreenshot('card-component.png', {
        maxDiffPixels: 50,
      });
    }
  });

  test('responsive mobile view should match snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('home-mobile.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('responsive tablet view should match snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('home-tablet.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('responsive desktop view should match snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('home-desktop.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});



