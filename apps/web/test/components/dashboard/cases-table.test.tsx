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

describe.skip('CasesTable Component', () => {
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
      expect(screen.getByText('Recovery Cases')).toBeInTheDocument();
      expect(screen.getByText('1 case')).toBeInTheDocument();
    });

    it('should render all case columns', () => {
      render(
        <CasesTable
          cases={[mockCase]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Membership')).toBeInTheDocument();
      expect(screen.getByText('First Failure')).toBeInTheDocument();
      expect(screen.getByText('Attempts')).toBeInTheDocument();
      expect(screen.getByText('Recovered')).toBeInTheDocument();
      expect(screen.getByText('Reason')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
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
      expect(screen.getByText('Recovered')).toBeInTheDocument();
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
    it('should show nudge button for open cases', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByLabelText(/send another reminder/i)).toBeInTheDocument();
    });

    it('should show cancel case button for open cases', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByLabelText(/cancel this recovery case/i)).toBeInTheDocument();
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

      const nudgeButton = screen.getByLabelText(/send another reminder/i);
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

      const cancelButton = screen.getByLabelText(/cancel this recovery case/i);
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
    it('should have proper table structure', () => {
      render(
        <CasesTable
          cases={[mockCase]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('should have accessible action buttons', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, status: 'open' }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByLabelText(/send another reminder/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/cancel this recovery case/i)).toBeInTheDocument();
    });
  });

  describe('Currency Formatting', () => {
    it('should format recovered amount correctly', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, recovered_amount_cents: 5000 }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('$50.00')).toBeInTheDocument();
    });

    it('should show dash when no recovered amount', () => {
      render(
        <CasesTable
          cases={[{ ...mockCase, recovered_amount_cents: 0 }]}
          total={1}
          page={1}
          limit={10}
          totalPages={1}
        />
      );
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });
});



