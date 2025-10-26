/**
 * Accessibility Compliance Tests
 * Tests WCAG 2.1 compliance and accessibility features
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { AccessibilityUtils } from '../src/lib/accessibility';

describe('Accessibility Compliance Tests', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeAll(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost:3000',
      pretendToBeVisual: true,
      resources: 'usable'
    });
    document = dom.window.document;
    window = dom.window;

    // Mock window.matchMedia
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {}
    });
  });

  afterAll(() => {
    dom.window.close();
  });

  describe('ARIA Attributes', () => {
    it('should infer correct ARIA roles for common elements', () => {
      const button = document.createElement('button');
      const link = document.createElement('a');
      link.setAttribute('href', '#');
      const input = document.createElement('input');
      input.type = 'text';

      expect(AccessibilityUtils.inferRole(button)).toBe('button');
      expect(AccessibilityUtils.inferRole(link)).toBe('link');
      expect(AccessibilityUtils.inferRole(input)).toBe('textbox');
    });

    it('should get appropriate ARIA attributes for elements', () => {
      const button = document.createElement('button');
      button.textContent = 'Click me';

      const attributes = AccessibilityUtils.getAriaAttributes(button);

      expect(attributes.role).toBe('button');
      expect(attributes.label).toBe('Click me');
    });

    it('should handle explicit aria-label', () => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Custom label');

      const attributes = AccessibilityUtils.getAriaAttributes(button, undefined, 'Custom label');

      expect(attributes.label).toBe('Custom label');
    });
  });

  describe('Color Contrast', () => {
    it('should calculate color contrast ratio correctly', () => {
      // Pure white and black should have maximum contrast
      const ratio = AccessibilityUtils.checkColorContrast('#FFFFFF', '#000000');
      expect(ratio).toBeGreaterThan(20);
    });

    it('should detect poor contrast', () => {
      // Similar colors should have low contrast
      const ratio = AccessibilityUtils.checkColorContrast('#CCCCCC', '#DDDDDD');
      expect(ratio).toBeLessThan(3);
    });
  });

  describe('Focusable Elements', () => {
    it('should identify focusable elements correctly', () => {
      const container = document.createElement('div');

      const button = document.createElement('button');
      const link = document.createElement('a');
      link.setAttribute('href', '#');
      const hiddenButton = document.createElement('button');
      hiddenButton.style.display = 'none';

      container.appendChild(button);
      container.appendChild(link);
      container.appendChild(hiddenButton);

      const focusable = AccessibilityUtils.getFocusableElements(container);

      expect(focusable).toHaveLength(2);
      expect(focusable).toContain(button);
      expect(focusable).toContain(link);
      expect(focusable).not.toContain(hiddenButton);
    });
  });

  describe('Screen Reader Support', () => {
    it('should create live region for announcements', () => {
      AccessibilityUtils.createLiveRegion();

      const liveRegion = document.querySelector('.live-region');
      expect(liveRegion).toBeTruthy();
      expect(liveRegion?.getAttribute('aria-live')).toBe('polite');
      expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');
    });

    it('should announce messages to screen readers', () => {
      AccessibilityUtils.createLiveRegion();
      AccessibilityUtils.announceToScreenReader('Test announcement');

      const liveRegion = document.querySelector('.live-region') as HTMLElement;
      expect(liveRegion?.textContent).toBe('Test announcement');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should add skip links for keyboard users', () => {
      AccessibilityUtils.addSkipLinks();

      const skipLinks = document.querySelectorAll('a.skip-link');
      expect(skipLinks).toHaveLength(2);

      const mainSkipLink = skipLinks[0] as HTMLAnchorElement;
      const navSkipLink = skipLinks[1] as HTMLAnchorElement;

      expect(mainSkipLink.getAttribute('href')).toBe('#main');
      expect(navSkipLink.getAttribute('href')).toBe('#navigation');
    });
  });

  describe('Accessibility Preferences', () => {
    it('should detect accessibility preferences', () => {
      const preferences = AccessibilityUtils.getAccessibilityPreferences();

      expect(preferences).toHaveProperty('reducedMotion');
      expect(preferences).toHaveProperty('highContrast');
      expect(preferences).toHaveProperty('screenReader');
      expect(preferences).toHaveProperty('prefersDarkMode');

      // All should be boolean values
      Object.values(preferences).forEach(value => {
        expect(typeof value).toBe('boolean');
      });
    });
  });

  describe('Focus Management', () => {
    it('should get initial focusable element', () => {
      const button = document.createElement('button');
      button.setAttribute('autofocus', '');
      document.body.appendChild(button);

      const initialFocus = AccessibilityUtils.getInitialFocusableElement();
      expect(initialFocus).toBe(button);

      document.body.removeChild(button);
    });

    it('should find first focusable element when no autofocus', () => {
      const container = document.createElement('div');
      const button = document.createElement('button');
      const input = document.createElement('input');

      container.appendChild(button);
      container.appendChild(input);
      document.body.appendChild(container);

      const initialFocus = AccessibilityUtils.getInitialFocusableElement();
      expect(initialFocus).toBe(button);

      document.body.removeChild(container);
    });
  });

  describe('WCAG Compliance Checks', () => {
    it('should validate minimum contrast ratios', () => {
      // Test WCAG AA normal text (4.5:1)
      const normalTextRatio = AccessibilityUtils.checkColorContrast('#767676', '#FFFFFF');
      expect(normalTextRatio).toBeGreaterThanOrEqual(4.5);

      // Test WCAG AA large text (3:1)
      const largeTextRatio = AccessibilityUtils.checkColorContrast('#959595', '#FFFFFF');
      expect(largeTextRatio).toBeGreaterThanOrEqual(3);
    });

    it('should validate button accessibility', () => {
      const button = document.createElement('button');
      button.textContent = 'Accessible Button';

      const attributes = AccessibilityUtils.getAriaAttributes(button);

      expect(attributes.role).toBe('button');
      expect(attributes.label).toBe('Accessible Button');
    });

    it('should validate form input accessibility', () => {
      const input = document.createElement('input');
      input.type = 'email';
      input.placeholder = 'Enter email';

      const attributes = AccessibilityUtils.getAriaAttributes(input);

      expect(attributes.role).toBe('textbox');
      expect(attributes.label).toBe('Enter email');
    });

    it('should validate link accessibility', () => {
      const link = document.createElement('a');
      link.setAttribute('href', 'https://example.com');
      link.textContent = 'Visit Example';

      const attributes = AccessibilityUtils.getAriaAttributes(link);

      expect(attributes.role).toBe('link');
      expect(attributes.label).toBe('Visit Example');
    });
  });
});