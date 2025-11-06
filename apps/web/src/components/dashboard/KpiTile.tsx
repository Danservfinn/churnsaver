interface KpiTileProps {
  title: string;
  value: string | number;
  subtitle?: string;
  isLoading?: boolean;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
}

export function KpiTile({ title, value, subtitle, isLoading, trend }: KpiTileProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      if (title.toLowerCase().includes('rate') || title.toLowerCase().includes('revenue')) {
        return val.toString();
      }
      return val.toLocaleString();
    }
    return val;
  };

  const getTrendIcon = () => {
    if (!trend) return null;

    switch (trend.direction) {
      case 'up':
        return <span className="text-green-500">↗</span>;
      case 'down':
        return <span className="text-red-500">↘</span>;
      case 'neutral':
        return <span className="text-gray-500">→</span>;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {title}
        </h3>
        {trend && getTrendIcon()}
      </div>

      <div className="flex items-baseline">
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {isLoading ? '--' : formatValue(value)}
        </p>
        {trend && (
          <span className={`ml-2 text-sm font-medium ${
            trend.direction === 'up' ? 'text-green-500' :
            trend.direction === 'down' ? 'text-red-500' :
            'text-gray-500'
          }`}>
            {trend.value}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}











