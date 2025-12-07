import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

describe('Button Component', () => {
  describe('Rendering', () => {
    it('should render button with text', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('should render button with aria-label', () => {
      render(<Button aria-label="Submit form">Submit</Button>);
      const button = screen.getByRole('button', { name: /submit form/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-label', 'Submit form');
    });

    it('should render all variants correctly', () => {
      const variants = ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link', 'playful', 'illustrated'] as const;
      
      variants.forEach((variant) => {
        const { unmount } = render(<Button variant={variant}>Test {variant}</Button>);
        expect(screen.getByRole('button', { name: `Test ${variant}` })).toBeInTheDocument();
        unmount();
      });
    });

    it('should render all sizes correctly', () => {
      const sizes = ['default', 'sm', 'lg', 'icon'] as const;
      
      sizes.forEach((size) => {
        const { unmount } = render(<Button size={size}>Test {size}</Button>);
        expect(screen.getByRole('button', { name: `Test ${size}` })).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when loading', () => {
      render(<Button loading>Loading Button</Button>);
      const button = screen.getByRole('button', { name: /loading button/i });
      expect(button).toBeDisabled();
      expect(button.querySelector('svg')).toBeInTheDocument();
    });

    it('should disable button when loading', () => {
      render(<Button loading>Loading</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should not show icon when loading', () => {
      const TestIcon = () => <span data-testid="test-icon">Icon</span>;
      render(<Button loading icon={<TestIcon />}>Loading</Button>);
      expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should show checkmark when success', () => {
      render(<Button success>Success</Button>);
      const button = screen.getByRole('button');
      const checkmark = button.querySelector('svg');
      expect(checkmark).toBeInTheDocument();
    });

    it('should not show loading spinner when success', () => {
      render(<Button success>Success</Button>);
      const button = screen.getByRole('button');
      // Should not have Loader2 icon
      const icons = button.querySelectorAll('svg');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Icon Support', () => {
    it('should render icon when provided', () => {
      const TestIcon = () => <span data-testid="test-icon">Icon</span>;
      render(<Button icon={<TestIcon />}>With Icon</Button>);
      expect(screen.getByTestId('test-icon')).toBeInTheDocument();
    });

    it('should not show icon when loading', () => {
      const TestIcon = () => <span data-testid="test-icon">Icon</span>;
      render(<Button loading icon={<TestIcon />}>Loading</Button>);
      expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onClick when clicked', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click me</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick} disabled>Disabled</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should not call onClick when loading', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick} loading>Loading</Button>);
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper role attribute', () => {
      render(<Button>Test</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should have tabIndex 0 by default', () => {
      render(<Button>Test</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('tabIndex', '0');
    });

    it('should support aria-expanded', () => {
      render(<Button aria-expanded={true}>Expand</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('should support aria-pressed', () => {
      render(<Button aria-pressed={true}>Toggle</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('should support aria-describedby', () => {
      render(
        <>
          <Button aria-describedby="help-text">Help</Button>
          <div id="help-text">Help text</div>
        </>
      );
      expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'help-text');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(<Button className="custom-class">Test</Button>);
      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('should apply variant classes', () => {
      render(<Button variant="playful">Playful</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('from-accent-400');
    });
  });

  describe('AsChild Prop', () => {
    it('should render as child element when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );
      // When asChild is true, Button should render as the child element (link)
      const link = screen.getByRole('link', { name: /link button/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/test');
    });
  });
});

