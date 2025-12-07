import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HomePage from '@/app/page';

// Mock Next.js components
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/context/whop', () => ({
  useWhop: () => ({
    companyId: 'test-company-123',
  }),
}));

describe('HomePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render hero section', () => {
      render(<HomePage />);
      expect(screen.getByText(/stop churn/i)).toBeInTheDocument();
      expect(screen.getByText(/save revenue/i)).toBeInTheDocument();
    });

    it('should render feature showcase', () => {
      render(<HomePage />);
      expect(screen.getByText(/everything you need/i)).toBeInTheDocument();
      expect(screen.getByText(/push notifications/i)).toBeInTheDocument();
      expect(screen.getByText(/direct messages/i)).toBeInTheDocument();
      expect(screen.getByText(/smart incentives/i)).toBeInTheDocument();
      expect(screen.getByText(/analytics & insights/i)).toBeInTheDocument();
    });

    it('should render CTA section', () => {
      render(<HomePage />);
      expect(screen.getByText(/ready to/i)).toBeInTheDocument();
      expect(screen.getByText(/get started/i)).toBeInTheDocument();
    });
  });

  describe('Settings Toggle', () => {
    it('should toggle settings preview when button clicked', () => {
      render(<HomePage />);
      const settingsButton = screen.getByText(/configure settings/i);
      
      // Settings should not be visible initially
      expect(screen.queryByText(/quick settings/i)).not.toBeInTheDocument();
      
      // Click to show settings
      fireEvent.click(settingsButton);
      expect(screen.getByText(/quick settings/i)).toBeInTheDocument();
      
      // Click again to hide
      fireEvent.click(settingsButton);
      expect(screen.queryByText(/quick settings/i)).not.toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('should have dashboard link', () => {
      render(<HomePage />);
      const dashboardLink = screen.getByText(/view dashboard/i).closest('a');
      expect(dashboardLink).toHaveAttribute('href', '/dashboard/test-company-123');
    });

    it('should have settings link in CTA', () => {
      render(<HomePage />);
      const settingsLink = screen.getByText(/configure settings/i).closest('a');
      expect(settingsLink).toHaveAttribute('href', '/settings');
    });
  });

  describe('Animated Counter', () => {
    it('should display animated counter in hero', () => {
      render(<HomePage />);
      expect(screen.getByText(/join/i)).toBeInTheDocument();
      expect(screen.getByText(/creators recovering revenue/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(<HomePage />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1.textContent).toContain('Stop Churn');
    });

    it('should have accessible buttons', () => {
      render(<HomePage />);
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
      buttons.forEach(button => {
        expect(button).toBeInTheDocument();
      });
    });
  });
});



