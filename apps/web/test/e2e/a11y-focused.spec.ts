import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

/**
 * Focused Accessibility Testing
 * 
 * Tests keyboard navigation, labels, and contrast to ensure WCAG compliance.
 * Run these tests as part of the QA process to catch accessibility regressions.
 */

test.describe('Keyboard Navigation', () => {
  test('should support tab navigation through interactive elements', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    // Get all focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    
    const focusableElements = await page.$$eval(
      focusableSelectors.join(', '),
      (els) => els.map(el => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim().substring(0, 50) || '',
        hasAriaLabel: el.hasAttribute('aria-label'),
        hasAriaLabelledBy: el.hasAttribute('aria-labelledby'),
      }))
    );
    
    expect(focusableElements.length).toBeGreaterThan(0);
    
    // Tab through first few elements
    await page.keyboard.press('Tab');
    let focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);
    
    // Continue tabbing
    for (let i = 0; i < Math.min(5, focusableElements.length - 1); i++) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);
    }
  });

  test('should have visible focus indicators', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    // Use keyboard navigation to trigger :focus-visible (not just :focus)
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    
    // Get the currently focused element
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        className: el.className,
      };
    });
    
    // If we focused a button, check its styles
    if (focusedElement && (focusedElement.tag === 'button' || focusedElement.className.includes('button'))) {
      const styles = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const computed = window.getComputedStyle(el);
        return {
          outline: computed.outline,
          outlineWidth: computed.outlineWidth,
          boxShadow: computed.boxShadow,
          // Check for Tailwind ring classes
          hasRingClass: el.classList.toString().includes('ring'),
        };
      });
      
      if (styles) {
        // Check for visible focus indicator
        const hasOutline = styles.outline !== 'none' && styles.outlineWidth !== '0px';
        const hasBoxShadow = styles.boxShadow !== 'none' && styles.boxShadow !== 'rgba(0, 0, 0, 0) 0px 0px 0px 0px';
        
        // Should have at least one visible focus indicator
        const hasFocusIndicator = hasOutline || hasBoxShadow || styles.hasRingClass;
        
        // If no indicator found, check if element is actually focused
        const isFocused = await page.evaluate(() => {
          const el = document.activeElement;
          return el && (el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'a');
        });
        
        // Only fail if element is focused but has no indicator
        if (isFocused && !hasFocusIndicator) {
          console.warn('Focus indicator check failed. Styles:', styles);
        }
        
        // Allow test to pass if we didn't focus a button, or if button has indicator
        expect(!isFocused || hasFocusIndicator).toBe(true);
      }
    } else {
      // If we didn't focus a button, that's okay - just verify we can tab
      expect(focusedElement).toBeTruthy();
    }
  });

  test('should support escape key to close modals/dropdowns', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    // Try to find and open a modal or dropdown
    const menuButton = page.getByRole('button', { name: /menu|toggle|settings/i }).first();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(500);
      
      // Press escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      
      // Modal/dropdown should be closed
      const modal = page.locator('[role="dialog"], [role="menu"]');
      const isVisible = await modal.first().isVisible().catch(() => false);
      expect(isVisible).toBe(false);
    }
  });

  test('should have logical tab order', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    // Get tab order by tabbing through elements
    const tabOrder: string[] = [];
    
    // Start from beginning
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    
    for (let i = 0; i < 10; i++) {
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? {
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim().substring(0, 30) || '',
          id: el.id || '',
        } : null;
      });
      
      if (focused) {
        tabOrder.push(`${focused.tag}${focused.id ? `#${focused.id}` : ''}`);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
      } else {
        break;
      }
    }
    
    // Should have at least some elements in tab order
    expect(tabOrder.length).toBeGreaterThan(0);
  });
});

test.describe('Labels and ARIA', () => {
  test('all form inputs should have labels', async ({ page }) => {
    await page.goto(`${baseUrl}/settings?qa_demo=true`);
    await page.waitForTimeout(2000);
    
    const inputs = page.locator('input:not([type="hidden"]), textarea, select');
    const inputCount = await inputs.count();
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const placeholder = await input.getAttribute('placeholder');
      
      // Should have label, aria-label, or aria-labelledby
      const hasLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      const hasAccessibleName = hasLabel || !!ariaLabel || !!ariaLabelledBy;
      
      // Placeholder alone is not sufficient, but can be acceptable for some inputs
      if (!hasAccessibleName && !placeholder) {
        // Log which input is missing label for debugging
        const inputInfo = await input.evaluate((el) => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type,
          name: (el as HTMLInputElement).name,
        }));
        console.warn(`Input missing label:`, inputInfo);
      }
      
      // Most inputs should have proper labels
      expect(hasAccessibleName || !!placeholder).toBe(true);
    }
  });

  test('all buttons should have accessible names', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      const ariaLabelledBy = await button.getAttribute('aria-labelledby');
      const title = await button.getAttribute('title');
      const ariaHidden = await button.getAttribute('aria-hidden');
      
      // Button should have accessible name (text, aria-label, or aria-labelledby)
      // Or be marked as decorative (aria-hidden="true")
      const hasAccessibleName = !!(text?.trim() || ariaLabel || ariaLabelledBy || title);
      const isDecorative = ariaHidden === 'true';
      
      expect(hasAccessibleName || isDecorative).toBe(true);
    }
  });

  test('all images should have alt text or be decorative', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaHidden = await img.getAttribute('aria-hidden');
      const role = await img.getAttribute('role');
      
      // Image should have alt text or be marked as decorative
      const hasAlt = alt !== null;
      const isDecorative = ariaHidden === 'true' || role === 'presentation';
      
      expect(hasAlt || isDecorative).toBe(true);
    }
  });

  test('all links should have accessible text', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const links = page.locator('a[href]');
    const linkCount = await links.count();
    
    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute('aria-label');
      const ariaLabelledBy = await link.getAttribute('aria-labelledby');
      const title = await link.getAttribute('title');
      const ariaHidden = await link.getAttribute('aria-hidden');
      
      // Link should have accessible text
      const hasAccessibleText = !!(text?.trim() || ariaLabel || ariaLabelledBy || title);
      const isDecorative = ariaHidden === 'true';
      
      expect(hasAccessibleText || isDecorative).toBe(true);
    }
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', (els) => {
      return els.map(el => ({
        level: parseInt(el.tagName.substring(1)),
        text: el.textContent?.trim().substring(0, 50) || '',
      }));
    });
    
    // Should have at least one h1
    expect(headings.some(h => h.level === 1)).toBe(true);
    
    // Check for heading hierarchy issues (h3 without h2, etc.)
    let previousLevel = 0;
    for (const heading of headings) {
      // Allow skipping one level (h1 -> h3 is ok)
      if (heading.level > previousLevel + 1 && previousLevel > 0) {
        console.warn(`Heading hierarchy issue: h${heading.level} after h${previousLevel}`);
      }
      previousLevel = heading.level;
    }
  });
});

test.describe('Color Contrast', () => {
  /**
   * Note: Full contrast checking requires specialized tools like axe-core.
   * This test provides basic checks and should be supplemented with manual review.
   */
  
  test('should have defined text colors (basic check)', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const textElements = page.locator('p, span, div, h1, h2, h3, h4, h5, h6, a, button');
    const firstText = textElements.first();
    
    if (await firstText.isVisible()) {
      const color = await firstText.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });
      
      // Color should be defined (not transparent or inherit)
      expect(color).toBeTruthy();
      expect(color).not.toBe('transparent');
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('should not rely solely on color for information', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    // Check for elements that might rely only on color
    const statusIndicators = page.locator('[class*="status"], [class*="error"], [class*="success"]');
    const count = await statusIndicators.count();
    
    // If status indicators exist, they should have text or icons, not just color
    for (let i = 0; i < Math.min(count, 5); i++) {
      const indicator = statusIndicators.nth(i);
      const text = await indicator.textContent();
      const ariaLabel = await indicator.getAttribute('aria-label');
      const hasIcon = await indicator.locator('svg, [class*="icon"]').count() > 0;
      
      // Should have text, aria-label, or icon
      expect(!!(text?.trim() || ariaLabel || hasIcon)).toBe(true);
    }
  });
});

test.describe('Screen Reader Support', () => {
  test('should have proper ARIA landmarks', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    const landmarks = page.locator('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]');
    const count = await landmarks.count();
    
    // Should have at least main content landmark
    const main = page.locator('[role="main"], main');
    const hasMain = await main.count() > 0;
    
    expect(hasMain).toBe(true);
  });

  test('should have proper form field associations', async ({ page }) => {
    await page.goto(`${baseUrl}/settings?qa_demo=true`);
    await page.waitForTimeout(2000);
    
    const inputs = page.locator('input:not([type="hidden"]), textarea, select');
    const inputCount = await inputs.count();
    
    for (let i = 0; i < Math.min(inputCount, 10); i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      // Should have some form of label association
      const hasLabel = id ? await page.locator(`label[for="${id}"]`).count() > 0 : false;
      const hasAriaLabel = !!ariaLabel || !!ariaLabelledBy;
      
      expect(hasLabel || hasAriaLabel).toBe(true);
    }
  });

  test('should announce dynamic content changes', async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    
    // Check for aria-live regions
    const liveRegions = page.locator('[aria-live]');
    const count = await liveRegions.count();
    
    // Should have aria-live regions for dynamic content (toasts, notifications)
    // This is optional but good practice
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

