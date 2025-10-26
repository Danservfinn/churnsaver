import React, { forwardRef, HTMLAttributes, useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { AccessibilityUtils } from '@/lib/accessibility';
import { getAriaAttributes } from '@/lib/accessibilityConfig';

interface AccessibleNavigationProps extends HTMLAttributes<HTMLElement> {
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  collapsible?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  skipLinks?: boolean;
  landmark?: boolean;
}

interface AccessibleNavItemProps extends HTMLAttributes<HTMLAnchorElement | HTMLButtonElement> {
  href?: string;
  active?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  submenu?: boolean;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

interface AccessibleNavGroupProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  collapsible?: boolean;
}

interface AccessibleBreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: Array<{
    label: string;
    href?: string;
    current?: boolean;
  }>;
}

/**
 * Accessible Navigation component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleNavigation 
 *   label="Main navigation"
 *   orientation="horizontal"
 *   landmark
 * >
 *   <nav>
 *     <ul>
 *       <li><AccessibleNavItem href="/">Home</AccessibleNavItem></li>
 *       <li><AccessibleNavItem href="/about" active>About</AccessibleNavItem></li>
 *       <li><AccessibleNavItem href="/contact">Contact</AccessibleNavItem></li>
 *     </ul>
 *   </nav>
 * </AccessibleNavigation>
 * ```
 */
const AccessibleNavigation = forwardRef<HTMLElement, AccessibleNavigationProps>(
  ({ 
    className, 
    children, 
    label, 
    orientation = 'horizontal',
    collapsible = false,
    defaultExpanded = true,
    onToggle,
    skipLinks = true,
    landmark = false,
    ...props 
  }, ref) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    const [currentItem, setCurrentItem] = useState<string | null>(null);
    const navRef = useRef<HTMLElement>(null);
    
    const navId = React.useId();
    const labelId = `${navId}-label`;

    const baseClasses = 'relative';
    const classes = cn(baseClasses, className);

    // Build ARIA attributes
    const ariaProps: any = {
      role: landmark ? 'navigation' : undefined,
      'aria-label': label,
      'aria-labelledby': label ? labelId : undefined,
      'aria-orientation': orientation,
      'aria-expanded': collapsible ? expanded : undefined,
      'aria-collapsed': collapsible ? !expanded : undefined
    };

    // Handle keyboard navigation
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!navRef.current) return;
      
      const focusableElements = AccessibilityUtils.getFocusableElements(navRef.current);
      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      
      let nextIndex = currentIndex;
      
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          if (orientation === 'horizontal' || orientation === 'vertical') {
            event.preventDefault();
            nextIndex = (currentIndex + 1) % focusableElements.length;
          }
          break;
          
        case 'ArrowLeft':
        case 'ArrowUp':
          if (orientation === 'horizontal' || orientation === 'vertical') {
            event.preventDefault();
            nextIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
          }
          break;
          
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
          
        case 'End':
          event.preventDefault();
          nextIndex = focusableElements.length - 1;
          break;
          
        default:
          return;
      }
      
      if (nextIndex !== currentIndex && focusableElements[nextIndex]) {
        focusableElements[nextIndex].focus();
      }
    };

    // Handle expand/collapse
    const handleToggle = () => {
      const newExpanded = !expanded;
      setExpanded(newExpanded);
      
      if (onToggle) {
        onToggle(newExpanded);
      }
      
      // Announce to screen readers
      AccessibilityUtils.announceToScreenReader(
        `Navigation ${newExpanded ? 'expanded' : 'collapsed'}`
      );
    };

    // Set up keyboard navigation
    useEffect(() => {
      if (navRef.current) {
        navRef.current.addEventListener('keydown', handleKeyDown);
        
        return () => {
          if (navRef.current) {
            navRef.current.removeEventListener('keydown', handleKeyDown);
          }
        };
      }
    }, [orientation]);

    // Add skip links if enabled
    useEffect(() => {
      if (skipLinks && landmark) {
        AccessibilityUtils.addSkipLinks();
      }
    }, [skipLinks, landmark]);

    return (
      <>
        {/* Navigation Label */}
        {label && (
          <div id={labelId} className="sr-only">
            {label}
          </div>
        )}
        
        {/* Skip Links */}
        {skipLinks && (
          <div className="sr-only">
            <a
              href="#main-content"
              className="absolute top-0 left-0 -translate-y-full focus:translate-y-0 bg-blue-600 text-white px-4 py-2 z-50 focus:outline-none"
            >
              Skip to main content
            </a>
          </div>
        )}
        
        <nav
          ref={navRef}
          className={classes}
          {...ariaProps}
          {...props}
        >
          {/* Toggle Button for Collapsible Navigation */}
          {collapsible && (
            <button
              type="button"
              onClick={handleToggle}
              className="flex items-center space-x-2 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-ring"
              aria-expanded={expanded}
              aria-controls={navId}
            >
              <span className="sr-only">Toggle navigation</span>
              
              {/* Hamburger Icon */}
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                {expanded ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </>
                )}
              </svg>
            </button>
          )}
          
          {/* Navigation Content */}
          <div
            id={navId}
            className={cn(
              'transition-all duration-300 ease-in-out',
              collapsible && !expanded ? 'hidden' : 'block'
            )}
            aria-hidden={collapsible ? !expanded : undefined}
          >
            {children}
          </div>
        </nav>
      </>
    );
  }
);

AccessibleNavigation.displayName = 'AccessibleNavigation';

// Accessible Nav Item component
export const AccessibleNavItem = forwardRef<HTMLAnchorElement | HTMLButtonElement, AccessibleNavItemProps>(
  ({ 
    className, 
    children, 
    href, 
    active = false, 
    disabled = false, 
    icon, 
    badge, 
    submenu = false, 
    expanded = false, 
    onToggle, 
    onClick,
    ...props 
  }, ref) => {
    const itemRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
    const [isExpanded, setIsExpanded] = useState(expanded);
    
    const baseClasses = 'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';
    const classes = cn(
      baseClasses,
      {
        'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200': active,
        'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700': !active && !disabled,
        'text-gray-400 cursor-not-allowed opacity-50': disabled
      },
      className
    );

    // Build ARIA attributes
    const ariaProps: any = {
      'aria-current': active ? 'page' : undefined,
      'aria-disabled': disabled,
      'aria-expanded': submenu ? isExpanded : undefined,
      'aria-haspopup': submenu ? true : undefined
    };

    const handleClick = (event: React.MouseEvent) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      
      if (submenu && onToggle) {
        const newExpanded = !isExpanded;
        setIsExpanded(newExpanded);
        onToggle(newExpanded);
        
        // Announce to screen readers
        AccessibilityUtils.announceToScreenReader(
          `Submenu ${newExpanded ? 'expanded' : 'collapsed'}`
        );
      }
      
      if (onClick) {
        onClick(event);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        (event.currentTarget as HTMLElement).click();
      }
      
      if (submenu && event.key === 'ArrowRight') {
        event.preventDefault();
        if (!isExpanded && onToggle) {
          setIsExpanded(true);
          onToggle(true);
        }
      }
      
      if (submenu && event.key === 'ArrowLeft' && isExpanded) {
        event.preventDefault();
        if (onToggle) {
          setIsExpanded(false);
          onToggle(false);
        }
      }
    };

    const commonProps = {
      ref,
      className: classes,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      ...ariaProps,
      ...props
    };

    if (href) {
      return (
        <a href={href} {...commonProps} ref={ref as React.Ref<HTMLAnchorElement>}>
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span>{children}</span>
          {badge && <span className="ml-auto">{badge}</span>}
          {submenu && (
            <span className="ml-auto">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </span>
          )}
        </a>
      );
    }

    return (
      <button
        type="button"
        {...commonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span>{children}</span>
        {badge && <span className="ml-auto">{badge}</span>}
        {submenu && (
          <span className="ml-auto">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </span>
        )}
      </button>
    );
  }
);

AccessibleNavItem.displayName = 'AccessibleNavItem';

// Accessible Nav Group component
export const AccessibleNavGroup = forwardRef<HTMLDivElement, AccessibleNavGroupProps>(
  ({ 
    className, 
    children, 
    label, 
    expanded = true, 
    onToggle, 
    collapsible = false,
    ...props 
  }, ref) => {
    const [isExpanded, setIsExpanded] = useState(expanded);
    const groupId = React.useId();
    
    const baseClasses = 'space-y-1';
    const classes = cn(baseClasses, className);

    const handleToggle = () => {
      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      
      if (onToggle) {
        onToggle(newExpanded);
      }
      
      // Announce to screen readers
      AccessibilityUtils.announceToScreenReader(
        `${label} ${newExpanded ? 'expanded' : 'collapsed'}`
      );
    };

    return (
      <div ref={ref} className="space-y-2" {...props}>
        {/* Group Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {label}
          </h3>
          
          {collapsible && (
            <button
              type="button"
              onClick={handleToggle}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-ring rounded p-1"
              aria-expanded={isExpanded}
              aria-controls={groupId}
            >
              <span className="sr-only">Toggle {label}</span>
              <svg
                className="h-4 w-4 transition-transform"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
        
        {/* Group Content */}
        <div
          id={groupId}
          className={cn(
            'transition-all duration-200 ease-in-out',
            collapsible && !isExpanded ? 'hidden' : 'block'
          )}
          aria-hidden={collapsible ? !isExpanded : undefined}
        >
          <div className={classes}>
            {children}
          </div>
        </div>
      </div>
    );
  }
);

AccessibleNavGroup.displayName = 'AccessibleNavGroup';

// Accessible Breadcrumb component
export const AccessibleBreadcrumb = forwardRef<HTMLElement, AccessibleBreadcrumbProps>(
  ({ className, items, ...props }, ref) => {
    const breadcrumbId = React.useId();
    
    const baseClasses = 'flex items-center space-x-2 text-sm';
    const classes = cn(baseClasses, className);

    return (
      <nav
        ref={ref}
        id={breadcrumbId}
        className={classes}
        aria-label="Breadcrumb navigation"
        {...props}
      >
        <ol className="flex items-center space-x-2">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isCurrent = item.current || isLast;
            
            return (
              <li key={index} className="flex items-center space-x-2">
                {index > 0 && (
                  <span className="text-gray-400" aria-hidden="true">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                )}
                
                {item.href && !isCurrent ? (
                  <a
                    href={item.href}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    {item.label}
                  </a>
                ) : (
                  <span
                    className={cn(
                      'text-gray-600 dark:text-gray-400',
                      isCurrent && 'text-gray-900 dark:text-white font-medium'
                    )}
                    aria-current={isCurrent ? 'page' : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }
);

AccessibleBreadcrumb.displayName = 'AccessibleBreadcrumb';

export { 
  AccessibleNavigation, 
  AccessibleNavItem, 
  AccessibleNavGroup, 
  AccessibleBreadcrumb 
};
export default AccessibleNavigation;