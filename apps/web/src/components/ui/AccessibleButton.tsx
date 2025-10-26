import React, { forwardRef, ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from '@/lib/utils';
import { AccessibilityUtils } from '@/lib/accessibility';
import { getAriaAttributes } from '@/lib/accessibilityConfig';

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface AccessibleButtonProps 
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-pressed'?: boolean;
  'aria-controls'?: string;
  'aria-activedescendant'?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Accessible Button component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleButton 
 *   variant="primary" 
 *   size="md" 
 *   onClick={handleClick}
 *   aria-label="Submit form"
 * >
 *   Submit
 * </AccessibleButton>
 * ```
 */
const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    loading = false,
    disabled = false,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-expanded': ariaExpanded,
    'aria-pressed': ariaPressed,
    'aria-controls': ariaControls,
    'aria-activedescendant': ariaActiveDescendant,
    onClick,
    onKeyDown,
    children,
    ...props 
  }, ref) => {
    const baseClasses = buttonVariants({ variant, size });
    const classes = cn(baseClasses, className);

    // Build ARIA attributes
    const ariaProps: any = {};
    
    if (ariaLabel) {
      ariaProps['aria-label'] = ariaLabel;
    }
    
    if (ariaDescribedBy) {
      ariaProps['aria-describedby'] = ariaDescribedBy;
    }
    
    if (ariaExpanded !== undefined) {
      ariaProps['aria-expanded'] = ariaExpanded;
    }
    
    if (ariaPressed !== undefined) {
      ariaProps['aria-pressed'] = ariaPressed;
    }
    
    if (ariaControls) {
      ariaProps['aria-controls'] = ariaControls;
    }
    
    if (ariaActiveDescendant) {
      ariaProps['aria-activedescendant'] = ariaActiveDescendant;
    }
    
    if (disabled || loading) {
      ariaProps['aria-disabled'] = true;
    }
    
    if (loading) {
      ariaProps['aria-busy'] = true;
    }

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled || loading) {
        event.preventDefault();
        return;
      }
      
      // Announce action to screen readers
      const buttonLabel = ariaLabel || AccessibilityUtils.inferLabel(event.currentTarget);
      if (buttonLabel) {
        AccessibilityUtils.announceToScreenReader(`${buttonLabel} activated`);
      }
      
      if (onClick) {
        onClick(event);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      // Handle additional keyboard interactions
      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          event.currentTarget.click();
          break;
        default:
          break;
      }
      
      if (onKeyDown) {
        onKeyDown(event);
      }
    };

    return (
      <button
        className={classes}
        ref={ref}
        disabled={disabled || loading}
        type="button"
        aria-atomic="true"
        tabIndex={disabled || loading ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...ariaProps}
        {...props}
      >
        {loading && (
          <span className="sr-only" aria-live="polite">
            Loading
          </span>
        )}
        
        {loading && (
          <svg 
            className="mr-2 h-4 w-4 animate-spin" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        
        {children}
      </button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';

export { AccessibleButton, buttonVariants };
export default AccessibleButton;