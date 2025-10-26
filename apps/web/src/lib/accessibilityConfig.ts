/**
 * Accessibility configuration for WCAG 2.1 compliance
 */

export const accessibilityConfig = {
  enabled: process.env.ACCESSIBILITY_ENABLED === 'true',
  
  // Visual accessibility
  colorContrast: {
    enabled: process.env.ACCESSIBILITY_COLOR_CONTRAST === 'true',
    highContrastTheme: {
      background: '#000000',
      text: '#ffffff',
      primary: '#ffcc00',
      secondary: '#0066cc'
    },
    minimumContrastRatio: {
      normalText: 4.5, // WCAG AA standard
      largeText: 3.0,   // WCAG AA standard for large text
      nonText: 3.0      // WCAG AA standard for non-text content
    }
  },
  
  reducedMotion: {
    enabled: process.env.ACCESSIBILITY_REDUCED_MOTION === 'true',
    respectPrefersReducedMotion: true,
    animationDuration: {
      default: '0.3s',
      reduced: '0.01s' // Effectively disables animations
    }
  },
  
  // Auditory accessibility
  screenReader: {
    enabled: process.env.ACCESSIBILITY_SCREEN_READER_SUPPORT === 'true',
    announcements: {
      pageChanges: process.env.ACCESSIBILITY_PAGE_CHANGE_ANNOUNCEMENTS === 'true',
      formErrors: process.env.ACCESSIBILITY_FORM_ERROR_ANNOUNCEMENTS === 'true',
      navigationChanges: true,
      statusUpdates: true
    },
    liveRegions: {
      polite: true,
      assertive: true,
      off: false
    }
  },
  
  // Keyboard accessibility
  focusManagement: {
    enabled: process.env.ACCESSIBILITY_FOCUS_MANAGEMENT === 'true',
    visibleFocusIndicator: true,
    skipLinks: true,
    focusTrap: {
      enabled: true,
      restoreFocus: true
    }
  },
  
  keyboardNavigation: {
    enabled: process.env.ACCESSIBILITY_KEYBOARD_NAVIGATION === 'true',
    trapFocusInModals: true,
    skipLinks: true,
    arrowKeyNavigation: {
      enabled: true,
      wrapAround: true
    }
  },
  
  // ARIA support
  aria: {
    landmarks: true,
    labels: true,
    descriptions: true,
    liveRegions: true,
    expandedStates: true,
    invalidStates: true,
    requiredStates: true
  },
  
  // Testing and validation
  testing: {
    enabled: process.env.NODE_ENV === 'development' || process.env.ACCESSIBILITY_TESTING === 'true',
    axeCore: true,
    manualTesting: true,
    automatedChecks: {
      colorContrast: true,
      focusOrder: true,
      keyboardAccessibility: true,
      screenReaderCompatibility: true
    }
  },
  
  // Performance optimization
  performance: {
    debounceAnnouncements: true,
    debounceDelay: 100,
    throttleFocusEvents: true,
    throttleDelay: 16
  }
};

/**
 * Get accessibility configuration for a specific feature
 * @param {string} feature - Feature name
 * @returns {any} Feature configuration
 */
export function getAccessibilityConfig(feature: string) {
  const features = feature.split('.');
  let config: any = accessibilityConfig;
  
  for (const f of features) {
    config = config?.[f];
  }
  
  return config;
}

/**
 * Check if accessibility feature is enabled
 * @param {string} feature - Feature name
 * @returns {boolean} True if feature is enabled
 */
export function isAccessibilityFeatureEnabled(feature: string): boolean {
  const config = getAccessibilityConfig(feature);
  return config?.enabled === true;
}

/**
 * Get user's accessibility preferences
 * @returns {object} User preferences
 */
export function getUserAccessibilityPreferences() {
  if (typeof window === 'undefined') {
    return {
      reducedMotion: false,
      highContrast: false,
      screenReader: false,
      prefersDarkMode: false
    };
  }
  
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: window.matchMedia('(prefers-contrast: high)').matches,
    screenReader: window.matchMedia('(prefers-reduced-motion: reduce)').matches, // Heuristic
    prefersDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
  };
}

/**
 * Apply accessibility classes to document body based on user preferences
 */
export function applyAccessibilityClasses(): void {
  if (typeof window === 'undefined') return;
  
  const preferences = getUserAccessibilityPreferences();
  
  // Apply reduced motion class
  if (preferences.reducedMotion) {
    document.body.classList.add('reduced-motion');
  }
  
  // Apply high contrast class
  if (preferences.highContrast) {
    document.body.classList.add('high-contrast');
  }
  
  // Apply dark mode class
  if (preferences.prefersDarkMode) {
    document.body.classList.add('dark-mode');
  }
  
  // Apply screen reader class
  if (preferences.screenReader) {
    document.body.classList.add('screen-reader-active');
  }
}

/**
 * Monitor accessibility preference changes
 * @param {function} callback - Callback function when preferences change
 */
export function monitorAccessibilityPreferences(callback: (preferences: any) => void): void {
  if (typeof window === 'undefined') return;
  
  const mediaQueries = [
    { query: '(prefers-reduced-motion: reduce)', property: 'reducedMotion' },
    { query: '(prefers-contrast: high)', property: 'highContrast' },
    { query: '(prefers-color-scheme: dark)', property: 'prefersDarkMode' }
  ];
  
  mediaQueries.forEach(({ query, property }) => {
    const mediaQuery = window.matchMedia(query);
    
    const handleChange = () => {
      const preferences = getUserAccessibilityPreferences();
      callback(preferences);
    };
    
    // Listen for changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }
  });
}

/**
 * Validate color contrast against WCAG standards
 * @param {string} foreground - Foreground color (hex)
 * @param {string} background - Background color (hex)
 * @param {boolean} isLargeText - Whether text is large (18pt+ or 14pt+ bold)
 * @returns {object} Contrast validation result
 */
export function validateColorContrast(
  foreground: string, 
  background: string, 
  isLargeText: boolean = false
): {
  ratio: number;
  passes: boolean;
  level: 'AA' | 'AAA' | 'FAIL';
} {
  // Simple contrast calculation (would use proper luminance calculation in production)
  const getContrastRatio = (fg: string, bg: string): number => {
    // This is a simplified calculation - production would use proper WCAG formula
    const getLuminance = (color: string): number => {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    
    const fgLum = getLuminance(fg);
    const bgLum = getLuminance(bg);
    
    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    
    return (lighter + 0.05) / (darker + 0.05);
  };
  
  const ratio = getContrastRatio(foreground, background);
  const minimumRatio = isLargeText ? 3.0 : 4.5;
  const passes = ratio >= minimumRatio;
  
  let level: 'AA' | 'AAA' | 'FAIL';
  if (ratio >= 7.0) {
    level = 'AAA';
  } else if (ratio >= minimumRatio) {
    level = 'AA';
  } else {
    level = 'FAIL';
  }
  
  return { ratio, passes, level };
}

/**
 * Get appropriate ARIA attributes for an element
 * @param {HTMLElement} element - DOM element
 * @param {object} options - Additional options
 * @returns {object} ARIA attributes
 */
export function getAriaAttributes(element: HTMLElement, options: any = {}): Record<string, string | boolean> {
  const attributes: Record<string, string | boolean> = {};
  
  // Add role if specified or can be inferred
  if (options.role) {
    attributes.role = options.role;
  }
  
  // Add label if specified
  if (options.label) {
    attributes['aria-label'] = options.label;
  }
  
  // Add description if specified
  if (options.description) {
    attributes['aria-describedby'] = options.description;
  }
  
  // Add expanded state for toggleable elements
  if (options.expanded !== undefined) {
    attributes['aria-expanded'] = options.expanded;
  }
  
  // Add selected state for selectable elements
  if (options.selected !== undefined) {
    attributes['aria-selected'] = options.selected;
  }
  
  // Add required state for form elements
  if (options.required !== undefined) {
    attributes['aria-required'] = options.required;
  }
  
  // Add invalid state for form elements
  if (options.invalid !== undefined) {
    attributes['aria-invalid'] = options.invalid;
  }
  
  // Add busy state for loading elements
  if (options.busy !== undefined) {
    attributes['aria-busy'] = options.busy;
  }
  
  // Add disabled state
  if (options.disabled !== undefined) {
    attributes['aria-disabled'] = options.disabled;
  }
  
  return attributes;
}

/**
 * Generate unique IDs for accessibility attributes
 * @param {string} prefix - ID prefix
 * @returns {string} Unique ID
 */
export function generateAccessibilityId(prefix: string = 'acc'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

export default accessibilityConfig;