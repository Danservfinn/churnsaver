import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardCompanyPage from '@/app/dashboard/[companyId]/page';

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
    refreshContext: vi.fn(),
  }),
  useWhopAuth: () => ({
    isAuthenticated: true,
    userId: 'test-user-123',
  }),
  useWhopCompany: () => ({
    companyId: 'test-company-123',
  }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

describe('DashboardCompanyPage Component', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render dashboard header', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            activeCases: 5,
            recoveries: 10,
            recoveryRate: 75.5,
            recoveredRevenueCents: 50000,
            totalCases: 15,
            windowDays: 14,
            calculatedAt: new Date().toISOString(),
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cases: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 1,
            filters: {},
          }),
        } as Response);

      render(
        <DashboardCompanyPage
          params={Promise.resolve({ companyId: 'test-company-123' })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/recovery dashboard/i)).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}));

      render(
        <DashboardCompanyPage
          params={Promise.resolve({ companyId: 'test-company-123' })}
        />
      );

      expect(screen.getByText(/loading dashboard/i)).toBeInTheDocument();
    });
  });

  describe('KPI Display', () => {
    it('should display KPI tiles when data is loaded', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            activeCases: 5,
            recoveries: 10,
            recoveryRate: 75.5,
            recoveredRevenueCents: 50000,
            totalCases: 15,
            windowDays: 14,
            calculatedAt: new Date().toISOString(),
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cases: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 1,
            filters: {},
          }),
        } as Response);

      render(
        <DashboardCompanyPage
          params={Promise.resolve({ companyId: 'test-company-123' })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/active cases/i)).toBeInTheDocument();
        expect(screen.getByText(/recoveries/i)).toBeInTheDocument();
        expect(screen.getByText(/recovery rate/i)).toBeInTheDocument();
        expect(screen.getByText(/recovered revenue/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when KPI fetch fails', async () => {
      vi.mocked(global.fetch)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            cases: [],
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 1,
            filters: {},
          }),
        } as Response);

      render(
        <DashboardCompanyPage
          params={Promise.resolve({ companyId: 'test-company-123' })}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/failed to load kpis/i)).toBeInTheDocument();
      });
    });
  });

  describe('Authentication', () => {
    it('should show authentication required when not authenticated', () => {
      vi.mock('@/lib/context/whop', () => ({
        useWhop: () => ({
          refreshContext: vi.fn(),
        }),
        useWhopAuth: () => ({
          isAuthenticated: false,
          userId: null,
        }),
        useWhopCompany: () => ({
          companyId: 'test-company-123',
        }),
      }));

      render(
        <DashboardCompanyPage
          params={Promise.resolve({ companyId: 'test-company-123' })}
        />
      );

      expect(screen.getByText(/authentication required/i)).toBeInTheDocument();
    });
  });
});



