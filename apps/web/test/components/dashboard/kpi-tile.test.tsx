import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KpiTile } from '@/components/dashboard/KpiTile';

describe('KpiTile Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render with title and value', () => {
      render(<KpiTile title="Active Cases" value={10} />);
      expect(screen.getByText('Active Cases')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      render(<KpiTile title="Test" value={5} subtitle="Test subtitle" />);
      expect(screen.getByText('Test subtitle')).toBeInTheDocument();
    });

    it('should render all variants', () => {
      const variants = ['default', 'success', 'warning', 'info'] as const;
      
      variants.forEach((variant) => {
        const { unmount } = render(
          <KpiTile title="Test" value={10} variant={variant} />
        );
        expect(screen.getByText('Test')).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Loading State', () => {
    it('should show skeleton when loading', () => {
      render(<KpiTile title="Test" value={10} isLoading />);
      const skeleton = screen.getByRole('status');
      expect(skeleton).toBeInTheDocument();
    });

    it('should not show value when loading', () => {
      render(<KpiTile title="Test" value={10} isLoading />);
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });
  });

  describe('Value Formatting', () => {
    it('should format numeric values', () => {
      render(<KpiTile title="Count" value={1234} />);
      expect(screen.getByText(/1234/)).toBeInTheDocument();
    });

    it('should display percentage values with %', () => {
      render(<KpiTile title="Recovery Rate" value="50%" />);
      expect(screen.getByText(/50/)).toBeInTheDocument();
      expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('should display currency values with $', () => {
      render(<KpiTile title="Recovered Revenue" value="$100.00" />);
      expect(screen.getByText(/\$100/)).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('should show default icon for known titles', () => {
      render(<KpiTile title="Active Cases" value={10} />);
      const icon = screen.getByText('Active Cases').parentElement?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should show custom icon when provided', () => {
      const CustomIcon = () => <span data-testid="custom-icon">Icon</span>;
      render(<KpiTile title="Test" value={10} icon={<CustomIcon />} />);
      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });
  });

  describe('Trend Display', () => {
    it('should show trend indicator when provided', () => {
      render(
        <KpiTile
          title="Test"
          value={10}
          trend={{ direction: 'up', value: '+5%' }}
        />
      );
      const trendIcon = screen.getByText('Test').parentElement?.querySelector('svg');
      expect(trendIcon).toBeInTheDocument();
    });

    it('should display trend value', () => {
      render(
        <KpiTile
          title="Test"
          value={10}
          trend={{ direction: 'up', value: '+5%' }}
        />
      );
      expect(screen.getByText('+5%')).toBeInTheDocument();
    });
  });

  describe('Confetti Animation', () => {
    it('should trigger confetti for high recovery rate', async () => {
      const { rerender } = render(
        <KpiTile title="Recovery Rate" value={45} />
      );
      
      rerender(<KpiTile title="Recovery Rate" value={50} />);
      
      await waitFor(() => {
        // Confetti component should be rendered
        const confetti = document.querySelector('[data-testid*="confetti"]');
        expect(confetti || document.querySelector('canvas')).toBeTruthy();
      }, { timeout: 1500 });
    });

    it('should trigger confetti for increasing recoveries', async () => {
      const { rerender } = render(
        <KpiTile title="Recoveries" value={10} />
      );
      
      rerender(<KpiTile title="Recoveries" value={15} />);
      
      await waitFor(() => {
        // Confetti should appear
        const confetti = document.querySelector('[data-testid*="confetti"]');
        expect(confetti || document.querySelector('canvas')).toBeTruthy();
      }, { timeout: 1500 });
    });
  });

  describe('Sparkle Effect', () => {
    it('should show sparkle for high values', () => {
      render(<KpiTile title="Recovery Rate" value="60%" />);
      const sparkle = screen.getByText('Recovery Rate').parentElement?.parentElement?.querySelector('svg');
      expect(sparkle).toBeInTheDocument();
    });

    it('should not show sparkle for low values', () => {
      render(<KpiTile title="Recovery Rate" value="30%" />);
      const sparkle = screen.getByText('Recovery Rate').parentElement?.parentElement?.querySelector('.animate-pulse');
      expect(sparkle).toBeFalsy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper structure for screen readers', () => {
      render(<KpiTile title="Active Cases" value={10} subtitle="Currently active" />);
      expect(screen.getByText('Active Cases')).toBeInTheDocument();
      expect(screen.getByText('Currently active')).toBeInTheDocument();
    });
  });
});



