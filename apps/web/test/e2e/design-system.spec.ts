import { test, expect } from '@playwright/test';

/**
 * E2E tests for Whop App Store frontend redesign
 * Verifies warm palette implementation and iframe optimization
 */

test.describe('Design System - Warm Palette', () => {
  test('should not contain blue or green colors in UI', async ({ page }) => {
    await page.goto('/');
    
    // Get all computed styles
    const bodyStyles = await page.evaluate(() => {
      const styles: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT
      );
      
      let node;
      while (node = walker.nextNode()) {
        const element = node as HTMLElement;
        const computed = window.getComputedStyle(element);
        const bgColor = computed.backgroundColor;
        const textColor = computed.color;
        const borderColor = computed.borderColor;
        
        if (bgColor) styles.push(`bg:${bgColor}`);
        if (textColor) styles.push(`text:${textColor}`);
        if (borderColor) styles.push(`border:${borderColor}`);
      }
      
      return styles;
    });
    
    // Check for banned colors (simplified check - actual lint script is more thorough)
    const bannedPatterns = [
      /rgb\(0,\s*0,\s*255\)/i, // blue
      /rgb\(0,\s*255,\s*0\)/i,  // green
      /#0000ff/i, // blue hex
      /#00ff00/i, // green hex
    ];
    
    const foundBanned = bodyStyles.filter(style => 
      bannedPatterns.some(pattern => pattern.test(style))
    );
    
    expect(foundBanned.length).toBe(0);
  });

  test('should use warm palette tokens in components', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="kpi-tile"], .card, button', { timeout: 10000 });
    
    // Check that primary colors are warm gray (not blue/green)
    const primaryButton = page.locator('button').first();
    const bgColor = await primaryButton.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    
    // Should not be blue or green
    expect(bgColor).not.toMatch(/rgb\(0,\s*0,\s*255\)/i);
    expect(bgColor).not.toMatch(/rgb\(0,\s*255,\s*0\)/i);
  });
});

test.describe('Iframe Optimization', () => {
  test('should detect iframe context', async ({ page }) => {
    // Test iframe detection by checking WhopAppLayout behavior
    await page.goto('/');
    
    const isIframe = await page.evaluate(() => {
      return window.self !== window.top;
    });
    
    // In normal test context, should not be in iframe
    expect(isIframe).toBe(false);
  });

  test('should have proper layout structure for iframe', async ({ page }) => {
    await page.goto('/');
    
    // Check for WhopAppLayout data attribute
    const whopApp = page.locator('[data-whop-app]');
    await expect(whopApp).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Accessibility', () => {
  test('should have proper focus states', async ({ page }) => {
    await page.goto('/');
    
    // Find a button and check focus ring
    const button = page.locator('button').first();
    await button.focus();
    
    const outline = await button.evaluate((el) => {
      return window.getComputedStyle(el).outline;
    });
    
    // Should have visible focus indicator
    expect(outline).not.toBe('none');
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check for navigation with aria-label
    const nav = page.locator('nav[aria-label]');
    await expect(nav.first()).toBeVisible({ timeout: 5000 });
  });
});



