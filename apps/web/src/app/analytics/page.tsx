'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Lock,
  Sparkles,
  Bell,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWhop, useWhopCompany } from '@/lib/context/whop';
import { cn } from '@/lib/utils';

interface AnalyticsSummary {
  totalRecovered: number;
  recoveryRate: number;
  totalRevenue: number;
  avgRecoveryHours: number;
}

interface CompanySnapshot {
  company_id: string;
  snapshot_date: string;
  total_cases: number;
  active_cases: number;
  recovered_cases: number;
  closed_no_recovery: number;
  recovery_rate: number | null;
  avg_recovery_hours: number | null;
  recovered_revenue_cents: number;
  push_sent: number;
  dm_sent: number;
}

interface AnalyticsData {
  trends: CompanySnapshot[];
  summary: AnalyticsSummary;
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendDirection,
  color = 'primary',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: typeof TrendingUp;
  trend?: string;
  trendDirection?: 'up' | 'down';
  color?: 'primary' | 'green' | 'blue' | 'orange';
}) {
  const colorClasses = {
    primary: 'from-primary/20 to-orange-600/5 text-primary',
    green: 'from-green-500/20 to-green-600/5 text-green-400',
    blue: 'from-blue-500/20 to-blue-600/5 text-blue-400',
    orange: 'from-orange-500/20 to-orange-600/5 text-orange-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-premium rounded-xl p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center',
          colorClasses[color]
        )}>
          <Icon className="h-6 w-6" />
        </div>
        {trend && (
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            trendDirection === 'up' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          )}>
            {trendDirection === 'up' ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend}
          </div>
        )}
      </div>

      <h3 className="text-sm font-medium text-muted-foreground mb-1">{title}</h3>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </motion.div>
  );
}

function TrendChart({ data, label }: { data: number[]; label: string }) {
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  return (
    <div className="h-32">
      <div className="flex items-end justify-between h-full gap-1">
        {data.map((value, index) => {
          const height = ((value - min) / range) * 100;
          return (
            <motion.div
              key={index}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(height, 5)}%` }}
              transition={{ delay: index * 0.05 }}
              className="flex-1 bg-gradient-to-t from-primary to-primary/50 rounded-t-sm min-h-[4px]"
              title={`${label}: ${value}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function ChannelBreakdown({
  pushSent,
  dmSent,
}: {
  pushSent: number;
  dmSent: number;
}) {
  const total = pushSent + dmSent;
  const pushPercent = total > 0 ? (pushSent / total) * 100 : 50;
  const dmPercent = total > 0 ? (dmSent / total) * 100 : 50;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Push</p>
            <p className="text-xs text-muted-foreground">{pushSent} sent</p>
          </div>
        </div>
        <span className="text-sm font-medium text-blue-400">{pushPercent.toFixed(0)}%</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">DM</p>
            <p className="text-xs text-muted-foreground">{dmSent} sent</p>
          </div>
        </div>
        <span className="text-sm font-medium text-green-400">{dmPercent.toFixed(0)}%</span>
      </div>

      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${pushPercent}%` }}
        />
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${dmPercent}%` }}
        />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [days, setDays] = useState(30);

  const { getAuthHeaders } = useWhop();
  const { companyId, isLoading: isAuthLoading } = useWhopCompany();
  const router = useRouter();

  const fetchAnalytics = async () => {
    if (!companyId || companyId === 'unknown') return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analytics/trends?days=${days}`, {
        headers: getAuthHeaders({ companyId }),
      });

      if (response.status === 403) {
        setAccessDenied(true);
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading && companyId && companyId !== 'unknown') {
      fetchAnalytics();
    }
  }, [companyId, isAuthLoading, days]);

  if (isAuthLoading || (isLoading && !data)) {
    return (
      <div className="min-h-screen">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-hero-gradient opacity-50" />
          <div className="relative container mx-auto px-4 py-12">
            <Skeleton className="h-12 w-64 mb-4" />
            <Skeleton className="h-6 w-96" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-premium rounded-xl p-6">
                <Skeleton className="h-12 w-12 rounded-xl mb-4" />
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card-premium rounded-2xl p-8 max-w-md text-center"
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Lock className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Upgrade Required</h2>
          <p className="text-muted-foreground mb-6">
            Analytics is available on Pro and Max plans.
            Upgrade to unlock detailed insights into your recovery performance.
          </p>
          <Button
            onClick={() => router.push('/pricing')}
            size="lg"
            className="gap-2"
          >
            View Plans
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </div>
    );
  }

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const formatHours = (hours: number) => {
    if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    }
    return `${(hours / 24).toFixed(1)}d`;
  };

  // Aggregate totals from trends
  const totalPushSent = data?.trends.reduce((sum, t) => sum + (t.push_sent || 0), 0) || 0;
  const totalDmSent = data?.trends.reduce((sum, t) => sum + (t.dm_sent || 0), 0) || 0;

  // Get trend data for charts
  const recoveryTrend = data?.trends.map((t) => t.recovered_cases) || [];
  const revenueTrend = data?.trends.map((t) => t.recovered_revenue_cents / 100) || [];

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient opacity-50" />
        <div className="absolute inset-0 bg-mesh-gradient opacity-30" />

        <div className="relative container mx-auto px-4 py-12 md:py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-primary/20 mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Analytics</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                Pro
              </Badge>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                  Recovery <span className="text-gradient">Insights</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl">
                  Track your payment recovery performance over time.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value))}
                  className="px-4 py-2 rounded-lg border border-white/10 bg-zinc-900/50 text-foreground text-sm"
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                </select>
                <Button
                  onClick={fetchAnalytics}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  className="gap-2"
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* KPI Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Recovered"
            value={data?.summary.totalRecovered.toString() || '0'}
            subtitle="Successful recoveries"
            icon={TrendingUp}
            color="green"
          />
          <MetricCard
            title="Recovery Rate"
            value={`${data?.summary.recoveryRate.toFixed(1) || 0}%`}
            subtitle="Of closed cases"
            icon={BarChart3}
            color="blue"
          />
          <MetricCard
            title="Revenue Recovered"
            value={formatCurrency(data?.summary.totalRevenue || 0)}
            subtitle="Total amount saved"
            icon={DollarSign}
            color="primary"
          />
          <MetricCard
            title="Avg Recovery Time"
            value={formatHours(data?.summary.avgRecoveryHours || 0)}
            subtitle="Time to recover"
            icon={Clock}
            color="orange"
          />
        </div>

        {/* Charts Row */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recovery Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card-premium rounded-xl p-6 lg:col-span-2"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Recovery Trend
            </h3>
            <TrendChart data={recoveryTrend.reverse()} label="Recoveries" />
            <p className="text-xs text-muted-foreground mt-4">
              Daily recoveries over the last {days} days
            </p>
          </motion.div>

          {/* Channel Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card-premium rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Channel Breakdown
            </h3>
            <ChannelBreakdown pushSent={totalPushSent} dmSent={totalDmSent} />
          </motion.div>
        </div>

        {/* Period Info */}
        {data?.period && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Showing data from {data.period.startDate} to {data.period.endDate}
          </p>
        )}
      </div>
    </div>
  );
}
