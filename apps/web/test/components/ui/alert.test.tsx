import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

describe.skip('Alert Component', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('should render alert with children', () => {
      render(<Alert>Alert message</Alert>);
      expect(screen.getByText('Alert message')).toBeInTheDocument();
    });

    it('should render all variants', () => {
      const variants = ['default', 'destructive', 'success', 'warning', 'info'] as const;
      
      variants.forEach((variant) => {
        const { unmount } = render(<Alert variant={variant}>Test</Alert>);
        expect(screen.getByText('Test')).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Icons', () => {
    it('should show icon by default', () => {
      render(<Alert>Test</Alert>);
      const alert = screen.getByText('Test').parentElement;
      const icon = alert?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should hide icon when showIcon is false', () => {
      render(<Alert showIcon={false}>Test</Alert>);
      const alert = screen.getByText('Test').parentElement;
      const icon = alert?.querySelector('svg');
      expect(icon).not.toBeInTheDocument();
    });

    it('should show correct icon for each variant', () => {
      const { rerender } = render(<Alert variant="success">Success</Alert>);
      let alert = screen.getByText('Success').parentElement;
      expect(alert?.querySelector('svg')).toBeInTheDocument();

      rerender(<Alert variant="destructive">Error</Alert>);
      alert = screen.getByText('Error').parentElement;
      expect(alert?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have role="alert" for destructive variant', () => {
      render(<Alert variant="destructive">Error</Alert>);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have role="status" for non-destructive variants', () => {
      render(<Alert variant="success">Success</Alert>);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have aria-live="assertive" for destructive variant', () => {
      render(<Alert variant="destructive">Error</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('should have aria-live="polite" for non-destructive variants', () => {
      render(<Alert variant="success">Success</Alert>);
      const alert = screen.getByRole('status');
      expect(alert).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Subcomponents', () => {
    it('should render AlertTitle', () => {
      render(
        <Alert>
          <AlertTitle>Title</AlertTitle>
        </Alert>
      );
      const title = screen.getByText('Title');
      expect(title).toBeInTheDocument();
      expect(title.tagName).toBe('H5');
    });

    it('should render AlertDescription', () => {
      render(
        <Alert>
          <AlertDescription>Description</AlertDescription>
        </Alert>
      );
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('should render complete alert structure', () => {
      render(
        <Alert variant="success">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>Operation completed successfully</AlertDescription>
        </Alert>
      );

      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Alert className="custom-alert">Test</Alert>);
      const alert = screen.getByText('Test').parentElement;
      expect(alert).toHaveClass('custom-alert');
    });

    it('should have animation classes', () => {
      render(<Alert>Test</Alert>);
      const alert = screen.getByText('Test').parentElement;
      expect(alert?.className).toContain('animate-in');
      expect(alert?.className).toContain('fade-in');
    });
  });
});



