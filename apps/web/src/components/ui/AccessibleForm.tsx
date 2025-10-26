import React, { forwardRef, FormHTMLAttributes, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AccessibilityUtils } from '@/lib/accessibility';
import { getAriaAttributes } from '@/lib/accessibilityConfig';

interface AccessibleFormProps extends FormHTMLAttributes<HTMLFormElement> {
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-errormessage'?: string;
  noValidate?: boolean;
  announceErrors?: boolean;
  showErrorSummary?: boolean;
}

interface FormError {
  field: string;
  message: string;
  element?: HTMLElement;
}

/**
 * Accessible Form component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleForm 
 *   onSubmit={handleSubmit}
 *   aria-label="Payment form"
 *   noValidate
 *   announceErrors
 * >
 *   <input type="text" required aria-label="Card number" />
 *   <button type="submit">Submit</button>
 * </AccessibleForm>
 * ```
 */
const AccessibleForm = forwardRef<HTMLFormElement, AccessibleFormProps>(
  ({ 
    className, 
    children, 
    onSubmit,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-errormessage': ariaErrorMessage,
    noValidate = false,
    announceErrors = true,
    showErrorSummary = true,
    ...props 
  }, ref) => {
    const [errors, setErrors] = useState<FormError[]>([]);
    const [isValidating, setIsValidating] = useState(false);

    const baseClasses = 'space-y-6';
    const classes = cn(baseClasses, className);

    // Generate unique IDs for accessibility
    const errorSummaryId = React.useId();
    const formDescriptionId = React.useId();

    // Build ARIA attributes
    const ariaProps: any = {};
    
    if (ariaLabel) {
      ariaProps['aria-label'] = ariaLabel;
    }
    
    if (ariaDescribedBy) {
      ariaProps['aria-describedby'] = ariaDescribedBy;
    }
    
    if (ariaInvalid !== undefined) {
      ariaProps['aria-invalid'] = ariaInvalid;
    }
    
    if (ariaErrorMessage) {
      ariaProps['aria-errormessage'] = ariaErrorMessage;
    }

    // Validate form fields
    const validateForm = (form: HTMLFormElement): FormError[] => {
      const formErrors: FormError[] = [];
      
      // Get all form controls
      const formControls = form.querySelectorAll('input, select, textarea, button') as NodeListOf<HTMLElement>;
      
      formControls.forEach(control => {
        // Skip buttons and controls that are not required
        const isRequired = control.hasAttribute('required') || control.hasAttribute('aria-required');
        const isButton = control.tagName.toLowerCase() === 'button';
        const isSubmitButton = control.type === 'submit';
        
        if (!isRequired && !isSubmitButton) return;
        
        const fieldErrors: string[] = [];
        
        // Check validity if browser validation is available
        if ('validity' in control) {
          const validity = (control as HTMLInputElement).validity;
          
          if (validity.valueMissing) {
            fieldErrors.push('This field is required');
          }
          
          if (validity.typeMismatch) {
            fieldErrors.push('Please enter a valid value');
          }
          
          if (validity.patternMismatch) {
            fieldErrors.push('Please match the required format');
          }
          
          if (validity.tooShort) {
            const minLength = (control as HTMLInputElement).getAttribute('minlength');
            fieldErrors.push(`Minimum length is ${minLength} characters`);
          }
          
          if (validity.tooLong) {
            const maxLength = (control as HTMLInputElement).getAttribute('maxlength');
            fieldErrors.push(`Maximum length is ${maxLength} characters`);
          }
          
          if (validity.rangeUnderflow) {
            const min = (control as HTMLInputElement).getAttribute('min');
            fieldErrors.push(`Value must be at least ${min}`);
          }
          
          if (validity.rangeOverflow) {
            const max = (control as HTMLInputElement).getAttribute('max');
            fieldErrors.push(`Value must be at most ${max}`);
          }
          
          if (validity.stepMismatch) {
            fieldErrors.push('Please enter a valid value');
          }
        }
        
        // Custom validation for required fields without browser validation
        if (isRequired && !control.value && !('validity' in control)) {
          fieldErrors.push('This field is required');
        }
        
        // Add errors to the list
        fieldErrors.forEach(error => {
          const label = AccessibilityUtils.inferLabel(control);
          formErrors.push({
            field: label || 'Unknown field',
            message: error,
            element: control
          });
        });
      });
      
      return formErrors;
    };

    // Focus first error field
    const focusFirstError = (formErrors: FormError[]) => {
      if (formErrors.length > 0 && formErrors[0].element) {
        formErrors[0].element.focus();
      }
    };

    // Announce errors to screen readers
    const announceErrors = (formErrors: FormError[]) => {
      if (formErrors.length === 0) return;
      
      const errorMessages = formErrors.map(error => `${error.field}: ${error.message}`);
      const errorMessage = `Form validation failed. ${errorMessages.join('. ')}`;
      
      AccessibilityUtils.announceToScreenReader(errorMessage, 'assertive');
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      
      const form = event.currentTarget;
      setIsValidating(true);
      
      let formErrors: FormError[] = [];
      
      if (noValidate) {
        // Custom validation
        formErrors = validateForm(form);
      } else {
        // Let browser validate first, then check for custom errors
        if (!form.checkValidity()) {
          formErrors = validateForm(form);
        }
      }
      
      setErrors(formErrors);
      
      if (formErrors.length > 0) {
        // Announce errors
        if (announceErrors) {
          announceErrors(formErrors);
        }
        
        // Focus first error field
        focusFirstError(formErrors);
        
        // Update form ARIA attributes
        form.setAttribute('aria-invalid', 'true');
        form.setAttribute('aria-errormessage', errorSummaryId);
      } else {
        // Clear errors
        setErrors([]);
        form.removeAttribute('aria-invalid');
        form.removeAttribute('aria-errormessage');
        
        // Announce success
        if (announceErrors) {
          AccessibilityUtils.announceToScreenReader('Form submitted successfully');
        }
      }
      
      setIsValidating(false);
      
      // Call onSubmit handler if form is valid or if noValidate is true
      if (formErrors.length === 0 || !noValidate) {
        if (onSubmit) {
          onSubmit(event);
        }
      }
    };

    // Clear errors when form data changes
    useEffect(() => {
      const handleInputChange = () => {
        if (errors.length > 0) {
          setErrors([]);
        }
      };
      
      const form = ref?.current;
      if (form) {
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
          input.addEventListener('input', handleInputChange);
          input.addEventListener('change', handleInputChange);
        });
        
        return () => {
          inputs.forEach(input => {
            input.removeEventListener('input', handleInputChange);
            input.removeEventListener('change', handleInputChange);
          });
        };
      }
    }, [errors.length, ref]);

    return (
      <form
        className={classes}
        ref={ref}
        noValidate={noValidate}
        onSubmit={handleSubmit}
        aria-atomic="true"
        {...ariaProps}
        {...props}
      >
        {/* Error Summary */}
        {showErrorSummary && errors.length > 0 && (
          <div
            id={errorSummaryId}
            className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md mb-6"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
          >
            <h3 className="text-lg font-semibold mb-2">
              Please correct the following errors:
            </h3>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error, index) => (
                <li key={index}>
                  <strong>{error.field}:</strong> {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Form Description */}
        {ariaDescribedBy && (
          <div
            id={formDescriptionId}
            className="sr-only"
            aria-hidden="true"
          >
            {/* Description content would go here */}
          </div>
        )}
        
        {/* Loading State */}
        {isValidating && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span>Validating form...</span>
              </div>
            </div>
          </div>
        )}
        
        {children}
      </form>
    );
  }
);

AccessibleForm.displayName = 'AccessibleForm';

export default AccessibleForm;

// Additional form field components for accessibility
export const AccessibleFormField = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    label: string;
    required?: boolean;
    error?: string;
    description?: string;
    id?: string;
  }
>(({ label, required = false, error, description, id, children, className, ...props }, ref) => {
  const fieldId = id || React.useId();
  const errorId = `${fieldId}-error`;
  const descriptionId = `${fieldId}-description`;
  
  const describedBy = [error && errorId, description && descriptionId]
    .filter(Boolean)
    .join(' ');
  
  return (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      <label
        htmlFor={fieldId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="required">
            *
          </span>
        )}
      </label>
      
      {description && (
        <p
          id={descriptionId}
          className="text-sm text-gray-500 dark:text-gray-400"
        >
          {description}
        </p>
      )}
      
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            id: fieldId,
            'aria-describedby': describedBy || undefined,
            'aria-invalid': error ? true : undefined,
            'aria-required': required,
            'aria-errormessage': error ? errorId : undefined
          });
        }
        return child;
      })}
      
      {error && (
        <p
          id={errorId}
          className="text-sm text-red-600 dark:text-red-400"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}
    </div>
  );
});

AccessibleFormField.displayName = 'AccessibleFormField';