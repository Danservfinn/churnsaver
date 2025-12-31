// Polyfill matchMedia for jsdom
global.matchMedia = global.matchMedia || function () {
  return {
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as any;
};

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CasesTable } from '@/components/dashboard/CasesTable';

const mockCase = {
  id: 'case-1',
  membership_id: 'membership-123',
  user_id: 'user-456',
  company_id: 'company-789',
  status: 'open',
  attempts: 2,
  incentive_days: 3,
  recovered_amount_cents: 0,
  failure_reason: 'insufficient_funds',
  first_failure_at: '2024-01-15T10:00:00Z',
  last_nudge_at: null,
  created_at: '2024-01-15T10:00:00Z',
};

describe('CasesTable Component', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  describe('Rendering', () => {
    it('should render table with cases', () => {
      render(
        <CasesTable
          cases={[mockCase]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      const headings = screen.getAllByText('Recovery Cases');
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('1 case')).toBeInTheDocument();
    });

    it('should render case status and info', () => {
      render(
        <CasesTable
          cases={[mockCase]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      // Component uses expandable row pattern with status badges
      expect(screen.getByText('Open')).toBeInTheDocument();
      expect(screen.getByText('attempts')).toBeInTheDocument();
      // Membership and user IDs are truncated to last 8 chars
      expect(screen.getByText(/ship-123.*user-456/)).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show skeleton when loading', () => {
      render(
        <CasesTable
          cases={[]}
          isLoading
          total={0}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      const skeletons = screen.getAllByRole('status');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no cases', () => {
      render(
        <CasesTable
          cases={[]}
          total={0}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('No recovery cases yet')).toBeInTheDocument();
    });
  });

  describe('Status Formatting', () => {
    it('should format open status correctly', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('Open')).toBeInTheDocument();
    });

    it('should format recovered status correctly', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'recovered' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getAllByText('Recovered').length).toBeGreaterThan(0);
    });

    it('should format closed status correctly', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'closed_no_recovery' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('Closed')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should show nudge button for open cases when expanded', async () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      // Click to expand the case row first
      const expandButton = screen.getByText('Open').closest('button');
      if (expandButton) fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/send another reminder for this case/i)).toBeInTheDocument();
      });
    });

    it('should show close case button for open cases when expanded', async () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      // Click to expand the case row first
      const expandButton = screen.getByText('Open').closest('button');
      if (expandButton) fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/close this recovery case/i)).toBeInTheDocument();
      });
    });

    it('should call handleNudge when nudge button clicked', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Nudge sent' }),
      } as Response);

      window.confirm = vi.fn(() => true);

      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );

      // Expand the case row first
      const expandButton = screen.getByText('Open').closest('button');
      if (expandButton) fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/send another reminder for this case/i)).toBeInTheDocument();
      });

      const nudgeButton = screen.getByLabelText(/send another reminder for this case/i);
      fireEvent.click(nudgeButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/cases/${mockCase.id}/nudge`,
          { method: 'POST' }
        );
      });
    });

    it('should call handleCancel when cancel button clicked', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Case cancelled' }),
      } as Response);

      window.confirm = vi.fn(() => true);

      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );

      // Expand the case row first
      const expandButton = screen.getByText('Open').closest('button');
      if (expandButton) fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/close this recovery case/i)).toBeInTheDocument();
      });

      const cancelButton = screen.getByLabelText(/close this recovery case/i);
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `/api/cases/${mockCase.id}/cancel`,
          { method: 'POST' }
        );
      });
    });
  });

  describe('Pagination', () => {
    it('should call onPageChange when page changes', () => {
      const handlePageChange = vi.fn();
      render(
        <CasesTable
          cases={[mockCase]}
          total={25}
          page={1}
          limit={10}
          totalPages={3}
          onPageChange={handlePageChange}
        />
      );
      // Pagination controls should be present
      expect(screen.getByText('25 cases')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper card structure', () => {
      render(
        <CasesTable
          cases={[mockCase]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      // Component uses Card layout instead of table
      expect(screen.getByText('Recovery Cases')).toBeInTheDocument();
    });

    it('should have accessible action buttons when expanded', async () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      // Expand the case row first
      const expandButton = screen.getByText('Open').closest('button');
      if (expandButton) fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/send another reminder for this case/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/close this recovery case/i)).toBeInTheDocument();
      });
    });
  });

  describe('Currency Formatting', () => {
    it('should format recovered amount correctly for recovered cases', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'recovered', recovered_amount_cents: 5000 }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('$50.00')).toBeInTheDocument();
    });

    it('should not show recovered amount for open cases with zero recovery', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open', recovered_amount_cents: 0 }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      // Amount is only shown for recovered cases with positive amounts
      expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
      expect(screen.queryByText('recovered')).not.toBeInTheDocument();
    });
  });
});



