import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, Activity, DollarSign, Target, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiTileProps {
  title: string;
  value: string | number;
  subtitle?: string;
  isLoading?: boolean;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'info';
}

const iconMap: Record<string, React.ReactNode> = {
  'active cases': <Activity className="h-5 w-5" />,
  'recoveries': <CheckCircle2 className="h-5 w-5" />,
  'recovery rate': <Target className="h-5 w-5" />,
  'recovered revenue': <DollarSign className="h-5 w-5" />,
};

export function KpiTile({ title, value, subtitle, isLoading, trend, icon, variant = 'default' }: KpiTileProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    return val;
  };

  const getTrendIcon = () => {
    if (!trend) return null;

    switch (trend.direction) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-success-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-danger-500" />;
      case 'neutral':
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getIconStyles = () => {
    switch (variant) {
      case 'success':
        return 'bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success-400';
      case 'warning':
        return 'bg-warning-100 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400';
      case 'info':
        return 'bg-accent-100 text-accent-600 dark:bg-accent-900/30 dark:text-accent-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const displayIcon = icon || iconMap[title.toLowerCase()];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {displayIcon && (
          <div className={cn('p-2 rounded-lg', getIconStyles())}>
            {displayIcon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          {isLoading ? (
            <Skeleton className="h-8 w-24" role="status" />
          ) : (
            <p className="text-2xl font-bold text-foreground">
              {formatValue(value)}
            </p>
          )}
          {trend && !isLoading && (
            <span className={cn(
              "text-sm font-medium flex items-center gap-1",
              trend.direction === 'up' ? 'text-success-600 dark:text-success-400' :
              trend.direction === 'down' ? 'text-danger-600 dark:text-danger-400' :
              'text-muted-foreground'
            )}>
              {getTrendIcon()}
              {trend.value}
            </span>
          )}
        </div>
        {subtitle && !isLoading && (
          <p className="text-xs text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
