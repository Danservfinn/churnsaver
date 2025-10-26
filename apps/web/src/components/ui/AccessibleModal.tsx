import React, { forwardRef, HTMLAttributes, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AccessibilityUtils } from '@/lib/accessibility';
import { getAriaAttributes } from '@/lib/accessibilityConfig';

interface AccessibleModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocus?: string;
  restoreFocus?: string;
  preventClose?: boolean;
}

interface AccessibleModalHeaderProps extends HTMLAttributes<HTMLDivElement> {
  onClose: () => void;
  closeLabel?: string;
  showCloseButton?: boolean;
}

interface AccessibleModalFooterProps extends HTMLAttributes<HTMLDivElement> {
  actions?: React.ReactNode;
}

/**
 * Accessible Modal component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleModal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Confirm Action"
 *   description="Are you sure you want to proceed?"
 *   size="md"
 * >
 *   <p>Modal content goes here</p>
 *   <AccessibleModalFooter actions={
 *     <>
 *       <button onClick={handleClose}>Cancel</button>
 *       <button onClick={handleConfirm}>Confirm</button>
 *     </>
 *   } />
 * </AccessibleModal>
 * ```
 */
const AccessibleModal = forwardRef<HTMLDivElement, AccessibleModalProps>(
  ({ 
    className, 
    children, 
    isOpen, 
    onClose, 
    title, 
    description,
    size = 'md',
    closeOnEscape = true,
    closeOnBackdrop = true,
    initialFocus,
    restoreFocus,
    preventClose = false,
    ...props 
  }, ref) => {
    const [previousFocus, setPreviousFocus] = useState<HTMLElement | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    
    const modalId = React.useId();
    const titleId = `${modalId}-title`;
    const descriptionId = `${modalId}-description`;

    const sizeClasses = {
      sm: 'max-w-md',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl'
    };

    const baseClasses = 'fixed inset-0 z-50 overflow-y-auto';
    const modalClasses = cn(
      'relative bg-white dark:bg-gray-800 rounded-lg shadow-xl',
      sizeClasses[size],
      className
    );

    // Build ARIA attributes
    const ariaProps: any = {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': description ? descriptionId : undefined,
      'aria-hidden': !isOpen
    };

    // Handle focus management
    const trapFocus = () => {
      if (modalRef.current) {
        AccessibilityUtils.trapFocus(modalRef.current);
      }
    };

    const removeFocusTrap = () => {
      AccessibilityUtils.removeFocusTrap();
    };

    // Handle escape key
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape && !preventClose) {
        event.preventDefault();
        onClose();
      }
    };

    // Handle backdrop click
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === overlayRef.current && closeOnBackdrop && !preventClose) {
        onClose();
      }
    };

    // Set initial focus
    const setInitialFocus = () => {
      if (initialFocus) {
        const element = document.getElementById(initialFocus);
        if (element) {
          element.focus();
          return;
        }
      }
      
      // Focus first focusable element in modal
      if (modalRef.current) {
        const focusableElements = AccessibilityUtils.getFocusableElements(modalRef.current);
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        }
      }
    };

    // Restore focus
    const restorePreviousFocus = () => {
      if (restoreFocus) {
        const element = document.getElementById(restoreFocus);
        if (element) {
          element.focus();
          return;
        }
      }
      
      if (previousFocus) {
        previousFocus.focus();
      }
    };

    // Handle modal open
    useEffect(() => {
      if (isOpen) {
        // Store current focus
        setPreviousFocus(document.activeElement as HTMLElement);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Add event listeners
        document.addEventListener('keydown', handleEscapeKey);
        document.addEventListener('click', handleBackdropClick);
        
        // Trap focus and set initial focus
        setTimeout(() => {
          trapFocus();
          setInitialFocus();
        }, 100);
        
        // Announce to screen readers
        AccessibilityUtils.announceToScreenReader(`Modal opened: ${title}`);
      } else {
        // Restore body scroll
        document.body.style.overflow = '';
        
        // Remove event listeners
        document.removeEventListener('keydown', handleEscapeKey);
        document.removeEventListener('click', handleBackdropClick);
        
        // Remove focus trap and restore focus
        removeFocusTrap();
        restorePreviousFocus();
        
        // Announce to screen readers
        AccessibilityUtils.announceToScreenReader(`Modal closed: ${title}`);
      }
    }, [isOpen]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        document.removeEventListener('keydown', handleEscapeKey);
        document.removeEventListener('click', handleBackdropClick);
        document.body.style.overflow = '';
        removeFocusTrap();
      };
    }, []);

    if (!isOpen) {
      return null;
    }

    return (
      <div
        ref={overlayRef}
        className={baseClasses}
        role="presentation"
        onClick={handleBackdropClick}
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            ref={modalRef}
            className={modalClasses}
            {...ariaProps}
            {...props}
          >
            {/* Modal Header */}
            <AccessibleModalHeader
              onClose={onClose}
              closeLabel="Close modal"
              showCloseButton={!preventClose}
            >
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
            </AccessibleModalHeader>

            {/* Modal Description */}
            {description && (
              <div id={descriptionId} className="px-6 pb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {description}
                </p>
              </div>
            )}

            {/* Modal Content */}
            <div className="px-6 pb-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

AccessibleModal.displayName = 'AccessibleModal';

// Accessible Modal Header component
export const AccessibleModalHeader = forwardRef<HTMLDivElement, AccessibleModalHeaderProps>(
  ({ 
    className, 
    children, 
    onClose, 
    closeLabel = 'Close modal',
    showCloseButton = true,
    ...props 
  }, ref) => {
    const baseClasses = 'flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700';
    const classes = cn(baseClasses, className);

    const handleClose = () => {
      AccessibilityUtils.announceToScreenReader('Modal closing');
      onClose();
    };

    return (
      <div
        ref={ref}
        className={classes}
        {...props}
      >
        <div className="flex-1">
          {children}
        </div>
        
        {showCloseButton && (
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md p-1"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <span className="sr-only">{closeLabel}</span>
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }
);

AccessibleModalHeader.displayName = 'AccessibleModalHeader';

// Accessible Modal Footer component
export const AccessibleModalFooter = forwardRef<HTMLDivElement, AccessibleModalFooterProps>(
  ({ 
    className, 
    children, 
    actions, 
    ...props 
  }, ref) => {
    const baseClasses = 'flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-b-lg';
    const classes = cn(baseClasses, className);

    return (
      <div
        ref={ref}
        className={classes}
        role="dialog" // For screen reader context
        {...props}
      >
        {actions && (
          <div className="flex space-x-3">
            {actions}
          </div>
        )}
        
        {children}
      </div>
    );
  }
);

AccessibleModalFooter.displayName = 'AccessibleModalFooter';

// Modal Content component for better structure
export const AccessibleModalContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const baseClasses = 'space-y-4';
    const classes = cn(baseClasses, className);

    return (
      <div
        ref={ref}
        className={classes}
        role="document"
        {...props}
      >
        {children}
      </div>
    );
  }
);

AccessibleModalContent.displayName = 'AccessibleModalContent';

// Modal Trigger component
export const AccessibleModalTrigger = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & {
  modalId: string;
  openLabel?: string;
}>(
  ({ 
    className, 
    children, 
    modalId,
    openLabel = 'Open modal',
    onClick,
    ...props 
  }, ref) => {
    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Announce to screen readers
      AccessibilityUtils.announceToScreenReader(openLabel);
      
      if (onClick) {
        onClick(event);
      }
    };

    return (
      <button
        ref={ref}
        className={className}
        aria-haspopup="dialog"
        aria-controls={modalId}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    );
  }
);

AccessibleModalTrigger.displayName = 'AccessibleModalTrigger';

export { 
  AccessibleModal, 
  AccessibleModalHeader, 
  AccessibleModalFooter, 
  AccessibleModalContent,
  AccessibleModalTrigger 
};
export default AccessibleModal;