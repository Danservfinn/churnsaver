'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { KpiTile } from '@/components/dashboard/KpiTile';
import { CasesTable } from '@/components/dashboard/CasesTable';
import { useWhop, useWhopAuth } from '@/lib/context/whop';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Download, RefreshCw, Settings, TrendingUp, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { isQaDemoClient } from '@/lib/qaDemo';

interface DashboardKPIs {
  activeCases: number;
  recoveries: number;
  organicRecoveries: number;
  recoveryRate: number;
  recoveredRevenueCents: number;
  organicRevenueCents: number;
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
  recovery_type: string | null;
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

interface ExperienceInfo {
  id: string;
  company_id: string;
  name?: string;
}

export default function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}) {
  const { experienceId } = use(params);
  const { isAuthenticated, userId } = useWhopAuth();
  const { refreshContext, getAuthHeaders } = useWhop();
  const router = useRouter();

  const { addToast } = useToast();
  const [experienceInfo, setExperienceInfo] = useState<ExperienceInfo | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [casesData, setCasesData] = useState<CasesResponse | null>(null);
  const [isLoadingExperience, setIsLoadingExperience] = useState(true);
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [experienceError, setExperienceError] = useState<string | null>(null);
  const isDemo = isQaDemoClient();

  // Fetch experience info to get company_id
  useEffect(() => {
    const fetchExperience = async () => {
      try {
        setIsLoadingExperience(true);
        setExperienceError(null);

        // Call our API to get experience info (which fetches from Whop SDK)
        const response = await fetch(`/api/experiences/${experienceId}`, {
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          setExperienceInfo(data);
          setCompanyId(data.company_id);
          logger.info('Experience info loaded', {
            experienceId,
            companyId: data.company_id,
          });
        } else {
          // If API doesn't exist yet, try to extract company from experience ID pattern
          // or use a fallback approach
          logger.warn('Failed to fetch experience info', {
            experienceId,
            status: response.status,
          });

          // For now, set a placeholder - we'll need to create the API endpoint
          setExperienceError('Unable to load experience info');
        }
      } catch (error) {
        logger.error('Error fetching experience', {
          experienceId,
          error: error instanceof Error ? error.message : String(error),
        });
        setExperienceError('Failed to load experience');
      } finally {
        setIsLoadingExperience(false);
      }
    };

    if (experienceId) {
      fetchExperience();
    }
  }, [experienceId, getAuthHeaders]);

  // Fetch KPIs when we have company ID
  const fetchKpis = async () => {
    if (!companyId) return;

    try {
      setIsLoadingKpis(true);
      setKpiError(null);
      const response = await fetch('/api/dashboard/kpis?window=14', {
        headers: getAuthHeaders({ companyId }),
      });
      if (response.ok) {
        const data = await response.json();
        setKpis(data);
      } else {
        const errorMessage = `Failed to load KPIs: ${response.status}`;
        setKpiError(errorMessage);
        addToast({
          type: 'error',
          title: 'Failed to load KPIs',
          message: 'Unable to fetch dashboard metrics. Please try again.',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch KPIs';
      setKpiError(errorMessage);
      addToast({
        type: 'error',
        title: 'Failed to load KPIs',
        message: 'Unable to fetch dashboard metrics. Please try again.',
      });
    } finally {
      setIsLoadingKpis(false);
    }
  };

  // Fetch cases when we have company ID
  const fetchCases = async (page: number = 1) => {
    if (!companyId) return;

    try {
      setIsLoadingCases(true);
      setCasesError(null);
      const response = await fetch(`/api/dashboard/cases?page=${page}&limit=10`, {
        headers: getAuthHeaders({ companyId }),
      });
      if (response.ok) {
        const data = await response.json();
        setCasesData(data);
      } else {
        const errorMessage = `Failed to load cases: ${response.status}`;
        setCasesError(errorMessage);
        addToast({
          type: 'error',
          title: 'Failed to load cases',
          message: 'Unable to fetch recovery cases. Please try again.',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch cases';
      setCasesError(errorMessage);
      addToast({
        type: 'error',
        title: 'Failed to load cases',
        message: 'Unable to fetch recovery cases. Please try again.',
      });
    } finally {
      setIsLoadingCases(false);
    }
  };

  // Fetch data when we have company ID
  useEffect(() => {
    if (companyId) {
      fetchKpis();
      fetchCases(1);
    }
  }, [companyId]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchCases(page);
  };

  const formatRevenue = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleExportCSV = () => {
    if (isDemo) {
      const rows = [
        ['id', 'status', 'attempts', 'incentive_days', 'recovered_amount_cents', 'first_failure_at'],
        ['demo-case-1', 'open', '2', '3', '0', '2025-12-01T12:00:00Z'],
        ['demo-case-2', 'recovered', '1', '7', '8200', '2025-11-30T12:00:00Z'],
      ];
      const csv = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'demo-cases.csv';
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const params = new URLSearchParams();
    if (casesData?.filters.status) {
      params.append('status', casesData.filters.status);
    }
    if (casesData?.filters.startDate) {
      params.append('startDate', casesData.filters.startDate);
    }
    if (casesData?.filters.endDate) {
      params.append('endDate', casesData.filters.endDate);
    }

    const exportUrl = `/api/cases/export?${params.toString()}`;
    window.open(exportUrl, '_blank');
  };

  // Show loading state while fetching experience info
  if (isLoadingExperience) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading experience...</p>
        </div>
      </div>
    );
  }

  // Show error if experience fetch failed
  if (experienceError && !companyId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <CardTitle>Unable to Load Experience</CardTitle>
            <CardDescription>
              {experienceError}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Experience ID: <code className="bg-muted px-2 py-1 rounded">{experienceId}</code>
            </p>
            <Button onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isDemo && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Demo data is shown. Actions like export use mock data; connect a real Whop session to see live metrics.
          </AlertDescription>
        </Alert>
      )}

      {/* Welcome Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Recovery Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor recovery cases and track performance metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </Link>
          <Button
            onClick={handleExportCSV}
            size="sm"
            className="gap-2"
            aria-label="Export cases to CSV"
            data-testid="export-csv-button"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      {/* Experience & Company Info */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="font-medium">Experience:</span>
        <code className="px-2 py-1 bg-muted rounded text-xs font-mono">
          {experienceId}
        </code>
        {companyId && (
          <>
            <span className="font-medium">Company:</span>
            <code className="px-2 py-1 bg-muted rounded text-xs font-mono">
              {companyId}
            </code>
          </>
        )}
        {userId && (
          <>
            <span className="font-medium">User:</span>
            <code className="px-2 py-1 bg-muted rounded text-xs font-mono">
              {userId.slice(-8)}
            </code>
          </>
        )}
      </div>

      {/* Error Messages */}
      {kpiError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{kpiError}</AlertDescription>
        </Alert>
      )}

      {/* KPI Tiles */}
      {isLoadingKpis ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((key) => (
            <Card key={key} className="p-4">
              <Skeleton className="h-5 w-24 mb-3" />
              <Skeleton className="h-10 w-20 mb-2" />
              <Skeleton className="h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile
            title="Active Cases"
            value={kpis?.activeCases || 0}
            subtitle="Currently being recovered"
            isLoading={isLoadingKpis}
            variant="warning"
            data-testid="kpi-active-cases"
          />

          <KpiTile
            title="Recoveries"
            value={kpis?.recoveries || 0}
            subtitle="Successful recoveries"
            isLoading={isLoadingKpis}
            variant="success"
            data-testid="kpi-recoveries"
          />

          <KpiTile
            title="Recovery Rate"
            value={`${kpis?.recoveryRate || 0}%`}
            subtitle={`${kpis?.windowDays || 14}-day attribution window`}
            isLoading={isLoadingKpis}
            variant="info"
            data-testid="kpi-recovery-rate"
          />

          <KpiTile
            title="Recovered Revenue"
            value={kpis?.recoveredRevenueCents ? formatRevenue(kpis.recoveredRevenueCents) : '$0.00'}
            subtitle="Revenue attributed to recoveries"
            isLoading={isLoadingKpis}
            variant="success"
            data-testid="kpi-recovered-revenue"
          />
        </div>
      )}

      {/* Cases Error */}
      {casesError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{casesError}</AlertDescription>
        </Alert>
      )}

      {/* Cases Table */}
      {!casesError && (
        <>
          {isLoadingCases ? (
            <Card className="p-6 space-y-4">
              {[1, 2, 3].map((row) => (
                <div key={row} className="grid grid-cols-3 gap-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </Card>
          ) : (casesData?.cases?.length ?? 0) === 0 ? (
            <Card className="p-6">
              <CardTitle className="text-lg mb-2">No recovery cases yet</CardTitle>
              <CardDescription>
                Cases will appear when payment failures occur. Connect to Whop and retry once traffic is flowing.
              </CardDescription>
            </Card>
          ) : (
            <CasesTable
              cases={casesData?.cases || []}
              isLoading={isLoadingCases}
              total={casesData?.total || 0}
              page={casesData?.page || 1}
              limit={casesData?.limit || 10}
              totalPages={casesData?.totalPages || 1}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button
          onClick={() => {
            fetchKpis();
            fetchCases(currentPage);
          }}
          disabled={isLoadingKpis || isLoadingCases}
          variant="outline"
          className="gap-2"
          data-testid="refresh-data-button"
        >
          <RefreshCw className={`h-4 w-4 ${(isLoadingKpis || isLoadingCases) ? 'animate-spin' : ''}`} />
          Refresh Data
        </Button>
      </div>
    </div>
  );
}
