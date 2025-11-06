/**
 * Accessibility utilities for WCAG 2.1 compliance
 */

export interface AccessibilityOptions {
  announcePageChanges?: boolean;
  announceFormErrors?: boolean;
  focusManagement?: boolean;
  keyboardNavigation?: boolean;
  screenReaderSupport?: boolean;
  colorContrast?: boolean;
  reducedMotion?: boolean;
}

export interface AriaAttributes {
  role?: string;
  label?: string;
  labelledby?: string;
  describedby?: string;
  expanded?: boolean;
  selected?: boolean;
  required?: boolean;
  invalid?: boolean;
  busy?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  live?: string;
  atomic?: boolean;
  relevant?: string;
}

export interface FocusableElement {
  element: HTMLElement;
  focusable: boolean;
  tabIndex: number;
}

/**
 * Accessibility utility class for WCAG 2.1 compliance
 */
export class AccessibilityUtils {
  private static liveRegion: HTMLElement | null = null;
  private static focusTrap: HTMLElement[] = [];
  private static skipLinks: HTMLElement[] = [];
  private static initialized = false;

  /**
   * Initialize accessibility features
   * @param {AccessibilityOptions} options - Accessibility options
   */
  static initialize(options: AccessibilityOptions = {}): void {
    if (this.initialized) return;
    
    this.setupFocusManagement(options.focusManagement !== false);
    this.setupKeyboardNavigation(options.keyboardNavigation !== false);
    this.setupScreenReaderSupport(options.screenReaderSupport !== false);
    this.setupColorContrast(options.colorContrast !== false);
    this.setupReducedMotion(options.reducedMotion !== false);
    this.setupPageChangeAnnouncements(options.announcePageChanges !== false);
    this.setupFormErrorAnnouncements(options.announceFormErrors !== false);
    
    this.initialized = true;
  }

  /**
   * Get appropriate ARIA attributes for element
   * @param {HTMLElement} element - Element to analyze
   * @param {string} role - ARIA role
   * @param {string} label - Accessible label
   * @returns {AriaAttributes} ARIA attributes
   */
  static getAriaAttributes(
    element: HTMLElement,
    role?: string,
    label?: string
  ): AriaAttributes {
    const attributes: AriaAttributes = {};

    // Determine role
    attributes.role = role || this.inferRole(element);

    // Determine label
    attributes.label = label || this.inferLabel(element);

    // Set other attributes based on element state
    if (element.getAttribute('aria-expanded')) {
      attributes.expanded = element.getAttribute('aria-expanded') === 'true';
    }
    
    if (element.getAttribute('aria-selected')) {
      attributes.selected = element.getAttribute('aria-selected') === 'true';
    }
    
    if (element.getAttribute('aria-required')) {
      attributes.required = element.getAttribute('aria-required') === 'true';
    }
    
    if (element.getAttribute('aria-invalid')) {
      attributes.invalid = element.getAttribute('aria-invalid') === 'true';
    }
    
    if (element.getAttribute('aria-busy')) {
      attributes.busy = element.getAttribute('aria-busy') === 'true';
    }
    
    if (element.getAttribute('aria-disabled')) {
      attributes.disabled = element.getAttribute('aria-disabled') === 'true';
    }
    
    if (element.getAttribute('aria-hidden')) {
      attributes.hidden = element.getAttribute('aria-hidden') === 'true';
    }

    return attributes;
  }

  /**
   * Setup focus management for accessibility
   * @param {boolean} enabled - Whether focus management is enabled
   */
  static setupFocusManagement(enabled: boolean = true): void {
    if (!enabled) return;

    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('focusin', this.handleFocusIn);
    document.addEventListener('focusout', this.handleFocusOut);

    // Set initial focus
    const initialFocus = this.getInitialFocusableElement();
    if (initialFocus) {
      setTimeout(() => initialFocus.focus(), 100);
    }
  }

  /**
   * Setup keyboard navigation support
   * @param {boolean} enabled - Whether keyboard navigation is enabled
   */
  static setupKeyboardNavigation(enabled: boolean = true): void {
    if (!enabled) return;

    document.addEventListener('keydown', this.handleKeyboardNavigation);

    // Add skip links for keyboard users
    this.addSkipLinks();
  }

  /**
   * Setup screen reader support
   * @param {boolean} enabled - Whether screen reader support is enabled
   */
  static setupScreenReaderSupport(enabled: boolean = true): void {
    if (!enabled) return;

    this.createLiveRegion();
  }

  /**
   * Setup color contrast support
   * @param {boolean} enabled - Whether color contrast is enabled
   */
  static setupColorContrast(enabled: boolean = true): void {
    if (!enabled) return;

    // Add high contrast class if user prefers high contrast
    if (window.matchMedia('(prefers-contrast: high)').matches) {
      document.body.classList.add('high-contrast');
    }

    // Listen for contrast preference changes
    window.matchMedia('(prefers-contrast: high)').addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.add('high-contrast');
      } else {
        document.body.classList.remove('high-contrast');
      }
    });
  }

  /**
   * Setup reduced motion support
   * @param {boolean} enabled - Whether reduced motion is enabled
   */
  static setupReducedMotion(enabled: boolean = true): void {
    if (!enabled) return;

    // Add reduced motion class if user prefers reduced motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduced-motion');
    }

    // Listen for motion preference changes
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.add('reduced-motion');
      } else {
        document.body.classList.remove('reduced-motion');
      }
    });
  }

  /**
   * Setup page change announcements
   * @param {boolean} enabled - Whether page change announcements are enabled
   */
  static setupPageChangeAnnouncements(enabled: boolean = true): void {
    if (!enabled) return;

    // Announce page changes to screen readers
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.target === document.body) {
          const title = document.title;
          if (title) {
            this.announceToScreenReader(`Page: ${title}`);
          }
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Setup form error announcements
   * @param {boolean} enabled - Whether form error announcements are enabled
   */
  static setupFormErrorAnnouncements(enabled: boolean = true): void {
    if (!enabled) return;

    // Listen for form validation errors
    document.addEventListener('invalid', (event) => {
      const element = event.target as HTMLInputElement;
      const message = element.validationMessage || 'Invalid input';
      this.announceToScreenReader(`Form error: ${message}`, 'assertive');
    }, true);
  }

  /**
   * Infer ARIA role from element
   * @param {HTMLElement} element - Element to analyze
   * @returns {string} Inferred ARIA role
   */
  static inferRole(element: HTMLElement): string {
    const tagName = element.tagName.toLowerCase();
    
    // Map HTML elements to ARIA roles
    const roleMap: Record<string, string> = {
      'button': 'button',
      'a': 'link',
      'input': (element instanceof HTMLInputElement && element.type === 'checkbox') ? 'checkbox' : 
               (element instanceof HTMLInputElement && element.type === 'radio') ? 'radio' : 
               (element instanceof HTMLInputElement && ['text', 'email', 'password'].includes(element.type)) ? 'textbox' : 
               'textbox',
      'textarea': 'textbox',
      'select': 'combobox',
      'table': 'table',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'aside': 'complementary',
      'section': 'region',
      'article': 'article',
      'h1': 'heading',
      'h2': 'heading',
      'h3': 'heading',
      'h4': 'heading',
      'h5': 'heading',
      'h6': 'heading',
      'ul': 'list',
      'ol': 'list',
      'li': 'listitem',
      'form': 'form',
      'fieldset': 'group',
      'legend': 'legend'
    };

    return roleMap[tagName] || 'generic';
  }

  /**
   * Infer accessible label from element
   * @param {HTMLElement} element - Element to analyze
   * @returns {string} Inferred label
   */
  static inferLabel(element: HTMLElement): string {
    // Check for explicit aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Check for aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = document.getElementById(labelledBy);
      if (labelElement) return labelElement.textContent || '';
    }

    // Check for associated label element
    if (element.id) {
      const labelElement = document.querySelector(`label[for="${element.id}"]`);
      if (labelElement) return labelElement.textContent || '';
    }

    // Check for placeholder
    const placeholder = (element as HTMLInputElement).placeholder;
    if (placeholder) return placeholder;

    // Check for title attribute
    const title = element.getAttribute('title');
    if (title) return title;

    // Use text content as last resort
    return element.textContent?.trim() || '';
  }

  /**
   * Get all focusable elements within a container
   * @param {HTMLElement} container - Container to search within
   * @returns {HTMLElement[]} Array of focusable elements
   */
  static getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
    const focusableSelectors = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(', ');

    const elements = Array.from(container.querySelectorAll(focusableSelectors)) as HTMLElement[];
    
    return elements.filter(element => {
      // Filter out elements that are not visible
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             element.offsetParent !== null;
    });
  }

  /**
   * Get the initial focusable element
   * @returns {HTMLElement | null} Initial focusable element
   */
  static getInitialFocusableElement(): HTMLElement | null {
    // Look for elements with autofocus
    const autofocusElement = document.querySelector('[autofocus]') as HTMLElement;
    if (autofocusElement) return autofocusElement;

    // Look for main content
    const mainElement = document.querySelector('main');
    if (mainElement) {
      const focusableInMain = this.getFocusableElements(mainElement);
      if (focusableInMain.length > 0) return focusableInMain[0];
    }

    // Get first focusable element
    const focusableElements = this.getFocusableElements();
    return focusableElements.length > 0 ? focusableElements[0] : null;
  }

  /**
   * Create a live region for screen reader announcements
   */
  static createLiveRegion(): void {
    if (this.liveRegion) return;

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'sr-only live-region';
    this.liveRegion.style.position = 'absolute';
    this.liveRegion.style.left = '-10000px';
    this.liveRegion.style.width = '1px';
    this.liveRegion.style.height = '1px';
    this.liveRegion.style.overflow = 'hidden';
    
    document.body.appendChild(this.liveRegion);
  }

  /**
   * Announce message to screen readers
   * @param {string} message - Message to announce
   * @param {string} priority - Announcement priority ('polite' or 'assertive')
   */
  static announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!this.liveRegion) {
      this.createLiveRegion();
    }

    if (this.liveRegion) {
      // Update live region priority if needed
      if (priority === 'assertive') {
        this.liveRegion.setAttribute('aria-live', 'assertive');
      } else {
        this.liveRegion.setAttribute('aria-live', 'polite');
      }

      // Clear and set message
      this.liveRegion.textContent = '';
      setTimeout(() => {
        if (this.liveRegion) {
          this.liveRegion.textContent = message;
        }
      }, 100);
    }
  }

  /**
   * Trap focus within a container
   * @param {HTMLElement} container - Container to trap focus within
   */
  static trapFocus(container: HTMLElement): void {
    const focusableElements = this.getFocusableElements(container);
    this.focusTrap = focusableElements;

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }

  /**
   * Remove focus trap
   */
  static removeFocusTrap(): void {
    this.focusTrap = [];
  }

  /**
   * Add skip links for keyboard navigation
   */
  static addSkipLinks(): void {
    const skipLinks = [
      { href: '#main', text: 'Skip to main content' },
      { href: '#navigation', text: 'Skip to navigation' }
    ];

    skipLinks.forEach(link => {
      const skipLink = document.createElement('a');
      skipLink.href = link.href;
      skipLink.textContent = link.text;
      skipLink.className = 'skip-link';
      skipLink.style.position = 'absolute';
      skipLink.style.top = '-40px';
      skipLink.style.left = '6px';
      skipLink.style.background = '#000';
      skipLink.style.color = '#fff';
      skipLink.style.padding = '8px';
      skipLink.style.textDecoration = 'none';
      skipLink.style.zIndex = '9999';
      skipLink.style.transition = 'top 0.3s';
      
      skipLink.addEventListener('focus', () => {
        skipLink.style.top = '6px';
      });
      
      skipLink.addEventListener('blur', () => {
        skipLink.style.top = '-40px';
      });

      document.body.insertBefore(skipLink, document.body.firstChild);
      this.skipLinks.push(skipLink);
    });
  }

  /**
   * Handle keyboard events for accessibility
   * @param {KeyboardEvent} event - Keyboard event
   */
  private static handleKeyDown = (event: KeyboardEvent): void => {
    // Handle Tab key navigation within focus trap
    if (event.key === 'Tab' && this.focusTrap.length > 0) {
      const firstElement = this.focusTrap[0];
      const lastElement = this.focusTrap[this.focusTrap.length - 1];

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    // Handle Escape key to close modals
    if (event.key === 'Escape') {
      const modal = document.querySelector('[role="dialog"]') as HTMLElement;
      if (modal && document.activeElement && modal.contains(document.activeElement)) {
        const closeButton = modal.querySelector('[aria-label="Close"], [aria-label="close"]') as HTMLElement;
        if (closeButton) {
          closeButton.click();
        }
      }
    }
  };

  /**
   * Handle focus in events
   * @param {FocusEvent} event - Focus event
   */
  private static handleFocusIn = (event: FocusEvent): void => {
    const element = event.target as HTMLElement;
    
    // Add focus indicator
    element.classList.add('focus-visible');
  };

  /**
   * Handle focus out events
   * @param {FocusEvent} event - Focus event
   */
  private static handleFocusOut = (event: FocusEvent): void => {
    const element = event.target as HTMLElement;
    
    // Remove focus indicator
    element.classList.remove('focus-visible');
  };

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  private static handleKeyboardNavigation = (event: KeyboardEvent): void => {
    // Handle arrow key navigation in menus and lists
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || 
        event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const element = event.target as HTMLElement;
      const role = element.getAttribute('role') || this.inferRole(element);
      
      if (role === 'menuitem' || role === 'option' || role === 'listitem') {
        // Handle arrow key navigation
        const container = element.closest('[role="menu"], [role="listbox"], [role="list"]') as HTMLElement;
        if (container) {
          const items = Array.from(container.querySelectorAll('[role="menuitem"], [role="option"], [role="listitem"]')) as HTMLElement[];
          const currentIndex = items.indexOf(element);
          
          let nextIndex = currentIndex;
          if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % items.length;
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
            nextIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
          }
          
          if (nextIndex !== currentIndex) {
            event.preventDefault();
            items[nextIndex].focus();
          }
        }
      }
    }
  };

  /**
   * Check color contrast between two colors
   * @param {string} color1 - First color (hex format)
   * @param {string} color2 - Second color (hex format)
   * @returns {number} Contrast ratio
   */
  static checkColorContrast(color1: string, color2: string): number {
    const getLuminance = (color: string): number => {
      const rgb = this.hexToRgb(color);
      if (!rgb) return 0;
      
      const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
        val = val / 255;
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      });
      
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const luminance1 = getLuminance(color1);
    const luminance2 = getLuminance(color2);
    
    const lighter = Math.max(luminance1, luminance2);
    const darker = Math.min(luminance1, luminance2);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Convert hex color to RGB
   * @param {string} hex - Hex color
   * @returns {object} RGB object
   */
  private static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  /**
   * Detect if screen reader is being used
   * @returns {boolean} True if screen reader is detected
   */
  static detectScreenReader(): boolean {
    // Check for common screen reader indicators
    if (typeof window !== 'undefined') {
      // Check for screen reader browser extensions
      const hasScreenReaderExtension = !!(
        window.speechSynthesis && 
        window.speechSynthesis.getVoices().length > 0
      );
      
      // Check for reduced motion preference (often used by screen reader users)
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
      // Check for high contrast preference
      const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
      
      return hasScreenReaderExtension || prefersReducedMotion || prefersHighContrast;
    }
    
    return false;
  }

  /**
   * Get accessibility preferences from user
   * @returns {object} User accessibility preferences
   */
  static getAccessibilityPreferences(): {
    reducedMotion: boolean;
    highContrast: boolean;
    screenReader: boolean;
    prefersDarkMode: boolean;
  } {
    return {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      highContrast: window.matchMedia('(prefers-contrast: high)').matches,
      screenReader: this.detectScreenReader(),
      prefersDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
    };
  }
}

export default AccessibilityUtils;