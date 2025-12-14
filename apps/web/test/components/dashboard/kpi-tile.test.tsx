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
      expect(screen.getAllByText('Active Cases')[0]).toBeInTheDocument();
      expect(screen.getAllByText('10')[0]).toBeInTheDocument();
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
        expect(screen.getAllByText('Test')[0]).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Loading State', () => {
    it('should show skeleton when loading', () => {
      render(<KpiTile title="Test" value={10} isLoading={true} />);
      const skeleton = screen.getByRole('status');
      expect(skeleton).toBeInTheDocument();
    });

    it('should not show value when loading', () => {
      render(<KpiTile title="Test" value={999} isLoading={true} />);
      // screen.debug(); 
      expect(screen.queryByText('999')).not.toBeInTheDocument();
    });
  });

  describe('Value Formatting', () => {
    it('should format numeric values', () => {
      render(<KpiTile title="Count" value={1234} />);
      // 1,234 due to toLocaleString
      expect(screen.getAllByText(/1,234/)[0]).toBeInTheDocument();
    });

    it('should display percentage values with %', () => {
      render(<KpiTile title="Recovery Rate" value="50%" />);
      expect(screen.getAllByText(/50%/)[0]).toBeInTheDocument();
    });

    it('should display currency values with $', () => {
      render(<KpiTile title="Recovered Revenue" value="$100.00" />);
      expect(screen.getAllByText(/\$100/)[0]).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('should show default icon for known titles', () => {
      render(<KpiTile title="Active Cases" value={10} />);
      const icon = screen.getAllByText('Active Cases')[0].parentElement?.querySelector('svg');
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
      // Look for the trend value text, then find the icon in the same container
      const trendValue = screen.getAllByText('+5%')[0];
      const trendIcon = trendValue.parentElement?.querySelector('svg');
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
      expect(screen.getAllByText('+5%')[0]).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper structure for screen readers', () => {
      render(<KpiTile title="Active Cases" value={10} subtitle="Currently active" />);
      expect(screen.getAllByText('Active Cases')[0]).toBeInTheDocument();
      expect(screen.getByText('Currently active')).toBeInTheDocument();
    });
  });
});



