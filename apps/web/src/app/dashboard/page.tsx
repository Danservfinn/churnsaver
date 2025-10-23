'use client';

import { useEffect, useState } from 'react';
import { KpiTile } from '@/components/dashboard/KpiTile';
import { CasesTable } from '@/components/dashboard/CasesTable';

interface DashboardKPIs {
  activeCases: number;
  recoveries: number;
  recoveryRate: number;
  recoveredRevenueCents: number;
  totalCases: number;
  windowDays: number;
  calculatedAt: string;
}

interface RecoveryCase {
  id: string;
  membership_id: string;
  user_id: string;
  company_id: string;
  status: string;
  attempts: number;
  incentive_days: number;
  recovered_amount_cents: number;
  failure_reason: string | null;
  first_failure_at: string;
  last_nudge_at: string | null;
  created_at: string;
}

interface CasesResponse {
  cases: RecoveryCase[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    status?: string;
    startDate?: string;
    endDate?: string;
  };
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [casesData, setCasesData] = useState<CasesResponse | null>(null);
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch KPIs
  const fetchKpis = async () => {
    try {
      setIsLoadingKpis(true);
      const response = await fetch('/api/dashboard/kpis?window=14');
      if (response.ok) {
        const data = await response.json();
        setKpis(data);
      }
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
    } finally {
      setIsLoadingKpis(false);
    }
  };

  // Fetch cases
  const fetchCases = async (page: number = 1) => {
    try {
      setIsLoadingCases(true);
      const response = await fetch(`/api/dashboard/cases?page=${page}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setCasesData(data);
      }
    } catch (error) {
      console.error('Failed to fetch cases:', error);
    } finally {
      setIsLoadingCases(false);
    }
  };

  useEffect(() => {
    fetchKpis();
    fetchCases(1);
  }, []);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchCases(page);
  };

  const formatRevenue = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Recovery Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Monitor recovery cases and track performance metrics
          </p>
        </header>

        {/* KPI Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KpiTile
            title="Active Cases"
            value={kpis?.activeCases || 0}
            subtitle="Currently being recovered"
            isLoading={isLoadingKpis}
          />

          <KpiTile
            title="Recoveries"
            value={kpis?.recoveries || 0}
            subtitle="Successful recoveries"
            isLoading={isLoadingKpis}
          />

          <KpiTile
            title="Recovery Rate"
            value={`${kpis?.recoveryRate || 0}%`}
            subtitle={`${kpis?.windowDays || 14}-day attribution window`}
            isLoading={isLoadingKpis}
          />

          <KpiTile
            title="Recovered Revenue"
            value={kpis?.recoveredRevenueCents ? formatRevenue(kpis.recoveredRevenueCents) : '$0.00'}
            subtitle="Revenue attributed to recoveries"
            isLoading={isLoadingKpis}
          />
        </div>

        {/* Cases Table */}
        <CasesTable
          cases={casesData?.cases || []}
          isLoading={isLoadingCases}
          total={casesData?.total || 0}
          page={casesData?.page || 1}
          limit={casesData?.limit || 10}
          totalPages={casesData?.totalPages || 1}
          onPageChange={handlePageChange}
        />

        {/* Refresh Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => {
              fetchKpis();
              fetchCases(currentPage);
            }}
            disabled={isLoadingKpis || isLoadingCases}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <span>🔄</span>
            <span>Refresh Data</span>
          </button>
        </div>
      </div>
    </div>
  );
}
