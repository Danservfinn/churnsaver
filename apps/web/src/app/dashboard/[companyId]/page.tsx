'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { KpiTile } from '@/components/dashboard/KpiTile';
import { CasesTable } from '@/components/dashboard/CasesTable';
import { TimePeriodSelector } from '@/components/dashboard/TimePeriodSelector';
import { useWhop, useWhopAuth, useWhopCompany } from '@/lib/context/whop';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Download, RefreshCw, TrendingUp, AlertCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { isQaDemoClient } from '@/lib/qaDemo';

// Demo token access for screenshots/testing
const DEMO_TOKEN = 'churnsaver_demo_2024';
const DEMO_COMPANY_IDS = ['biz_demo_staging', 'biz_demo_empty'];

function isDemoTokenAccess(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('demo_token');
  const companyId = window.location.pathname.split('/').pop();
  return token === DEMO_TOKEN && !!companyId && DEMO_COMPANY_IDS.includes(companyId);
}

function getDemoTokenParam(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const token = params.get('demo_token');
  return token === DEMO_TOKEN ? `&demo_token=${DEMO_TOKEN}` : '';
}

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

type StatusFilter = 'all' | 'open' | 'recovered' | 'closed_no_recovery';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'closed_no_recovery', label: 'Lost' },
];

export default function DashboardCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId: urlCompanyId } = use(params);
  const { isAuthenticated, userId, isLoading: isAuthLoading } = useWhopAuth();
  const { companyId: contextCompanyId } = useWhopCompany();
  const { refreshContext, getAuthHeaders } = useWhop();
  const router = useRouter();

  const { addToast } = useToast();
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [casesData, setCasesData] = useState<CasesResponse | null>(null);
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [companyIdMismatch, setCompanyIdMismatch] = useState(false);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(30); // Default: This Billing Period
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const isDemo = isQaDemoClient();
  const isDemoToken = isDemoTokenAccess();

  // Validate companyId from URL matches context (when context provides a real company ID)
  useEffect(() => {
    const contextHasRealCompanyId =
      contextCompanyId && contextCompanyId !== 'unknown' && contextCompanyId !== 'anonymous';

    if (contextHasRealCompanyId && urlCompanyId && contextCompanyId !== urlCompanyId) {
      setCompanyIdMismatch(true);
      router.replace(`/dashboard/${contextCompanyId}`);
    } else {
      setCompanyIdMismatch(false);
    }
  }, [contextCompanyId, urlCompanyId, router]);

  // Fetch KPIs
  const fetchKpis = async () => {
    try {
      setIsLoadingKpis(true);
      setKpiError(null);
      const demoParam = getDemoTokenParam();
      const response = await fetch(
        `/api/dashboard/kpis?window=${windowDays}&companyId=${encodeURIComponent(urlCompanyId)}${demoParam}`,
        {
          headers: getAuthHeaders({ companyId: urlCompanyId }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        setKpis(data);
      } else {
        const errorMessage = `Failed to load KPIs: ${response.status} ${response.statusText}`;
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
      logger.error('Failed to fetch KPIs', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoadingKpis(false);
    }
  };

  // Fetch cases
  const fetchCases = async (page: number = 1) => {
    try {
      setIsLoadingCases(true);
      setCasesError(null);
      const demoParam = getDemoTokenParam();
      const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const response = await fetch(
        `/api/dashboard/cases?page=${page}&limit=10${statusParam}&companyId=${encodeURIComponent(urlCompanyId)}${demoParam}`,
        {
          headers: getAuthHeaders({ companyId: urlCompanyId }),
        }
      );
      if (response.ok) {
        const data = await response.json();
        setCasesData(data);
      } else {
        const errorMessage = `Failed to load cases: ${response.status} ${response.statusText}`;
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
      logger.error('Failed to fetch cases', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoadingCases(false);
    }
  };

  // Fetch data when URL companyId is available, no mismatch, and authenticated (or demo mode)
  useEffect(() => {
    if (urlCompanyId && !companyIdMismatch && (isAuthenticated || isDemoToken)) {
      fetchKpis();
    }
  }, [urlCompanyId, companyIdMismatch, windowDays, isAuthenticated, isDemoToken]);

  useEffect(() => {
    if (urlCompanyId && !companyIdMismatch && (isAuthenticated || isDemoToken)) {
      setCurrentPage(1);
      fetchCases(1);
    }
  }, [urlCompanyId, companyIdMismatch, statusFilter, isAuthenticated, isDemoToken]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchCases(page);
  };

  const handleCaseUpdated = () => {
    fetchKpis();
    fetchCases(currentPage);
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
    params.append('companyId', urlCompanyId);
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

  // Show loading state only while we're waiting for URL params
  if (!urlCompanyId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Show company ID mismatch error
  if (companyIdMismatch) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <CardTitle>Company ID Mismatch</CardTitle>
            <CardDescription>Redirecting to the correct company dashboard...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show loading state while authentication context is being fetched
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Show authentication required message (unless in dev/demo mode)
  const isDevMode =
    contextCompanyId === 'dev-company' ||
    urlCompanyId === 'dev-company' ||
    isDemo ||
    isDemoToken;
  if (!isAuthenticated && !isDevMode) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="text-5xl mb-4">🔒</div>
            <CardTitle>Authentication Required</CardTitle>
            <CardDescription>
              You need to be authenticated to access the dashboard. Please access this app through
              Whop.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={refreshContext}>Retry Authentication</Button>
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
            Demo data is shown. Actions like export use mock data; connect a real Whop session to
            see live metrics.
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
          <TimePeriodSelector
            value={windowDays}
            onChange={setWindowDays}
            disabled={isLoadingKpis}
          />
          <Button
            onClick={handleExportCSV}
            size="sm"
            variant="outline"
            className="gap-2"
            aria-label="Export cases to CSV"
            data-testid="export-csv-button"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </header>

      {/* Company Info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="font-medium">Company:</span>
        <code className="px-2 py-1 bg-muted rounded text-xs font-mono">{urlCompanyId}</code>
        {userId && (
          <>
            <span className="font-medium">User:</span>
            <code className="px-2 py-1 bg-muted rounded text-xs font-mono">{userId.slice(-8)}</code>
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

      {/* KPI Tiles - Grouped by category (Miller's Law - chunking) */}
      {isLoadingKpis ? (
        <div className="space-y-4">
          {/* Loading skeleton for grouped KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((key) => (
              <Card key={key} className="p-4">
                <Skeleton className="h-5 w-24 mb-3" />
                <Skeleton className="h-10 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[3, 4].map((key) => (
              <Card key={key} className="p-4">
                <Skeleton className="h-5 w-24 mb-3" />
                <Skeleton className="h-10 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Cases Group - Current recovery activity */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Recovery Activity
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
          </div>

          {/* Performance Group - Results and metrics */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Performance
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <KpiTile
                title="Recovery Rate"
                value={`${kpis?.recoveryRate || 0}%`}
                subtitle={`${kpis?.windowDays || windowDays}-day window`}
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
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Filter className="h-4 w-4 text-muted-foreground mr-2" />
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              statusFilter === filter.value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

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
              {kpis && kpis.recoveries > 0 && statusFilter === 'open' ? (
                <>
                  <CardTitle className="text-lg mb-2 flex items-center gap-2">
                    <span className="text-2xl">🎉</span> All caught up!
                  </CardTitle>
                  <CardDescription className="space-y-2">
                    <p>
                      You&apos;ve successfully recovered{' '}
                      <strong>
                        {kpis.recoveries} {kpis.recoveries === 1 ? 'case' : 'cases'}
                      </strong>{' '}
                      worth <strong>{formatRevenue(kpis.recoveredRevenueCents)}</strong> in the
                      last {kpis.windowDays} days.
                    </p>
                    <p className="text-muted-foreground">
                      No active recovery cases right now. New cases will appear when payment
                      failures occur.
                    </p>
                  </CardDescription>
                </>
              ) : (
                <>
                  <CardTitle className="text-lg mb-2">
                    {statusFilter === 'all'
                      ? 'No recovery cases yet'
                      : `No ${statusFilter === 'closed_no_recovery' ? 'lost' : statusFilter} cases`}
                  </CardTitle>
                  <CardDescription>
                    {statusFilter === 'all'
                      ? 'Cases will appear when payment failures occur. Connect to Whop and retry once traffic is flowing.'
                      : `No cases match the "${statusFilter === 'closed_no_recovery' ? 'Lost' : statusFilter}" filter.`}
                  </CardDescription>
                </>
              )}
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
              onCaseUpdated={handleCaseUpdated}
              companyId={urlCompanyId}
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
          <RefreshCw
            className={`h-4 w-4 ${isLoadingKpis || isLoadingCases ? 'animate-spin' : ''}`}
          />
          Refresh Data
        </Button>
      </div>
    </div>
  );
}
