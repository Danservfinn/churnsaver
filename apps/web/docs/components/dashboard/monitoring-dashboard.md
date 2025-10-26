# MonitoringDashboard Component

## Overview

The `MonitoringDashboard` component provides a comprehensive real-time system monitoring interface. It displays system health, performance metrics, alerts, and operational data in an organized, auto-refreshing dashboard layout.

## Table of Contents

1. [Component Interface](#component-interface)
2. [Usage Examples](#usage-examples)
3. [Data Structure](#data-structure)
4. [Features](#features)
5. [Accessibility](#accessibility)
6. [Performance](#performance)

## Component Interface

### Props

```typescript
interface MonitoringDashboardProps {
  /**
   * Auto-refresh interval in milliseconds
   * @default 30000 (30 seconds)
   */
  refreshInterval?: number;
  
  /**
   * Enable auto-refresh on mount
   * @default true
   */
  autoRefresh?: boolean;
  
  /**
   * Custom CSS class names
   */
  className?: string;
  
  /**
   * Additional dashboard configuration
   */
  config?: {
    showSystemInfo?: boolean;
    showAlerts?: boolean;
    showMetrics?: boolean;
    compactMode?: boolean;
  };
  
  /**
   * Event handlers
   */
  onAlertClick?: (alert: Alert) => void;
  onMetricClick?: (metric: Metric) => void;
  onRefresh?: (timestamp: Date) => void;
  onError?: (error: Error) => void;
}
```

### Default Props

```typescript
const defaultProps: MonitoringDashboardProps = {
  refreshInterval: 30000,
  autoRefresh: true,
  config: {
    showSystemInfo: true,
    showAlerts: true,
    showMetrics: true,
    compactMode: false
  }
};
```

## Usage Examples

### Basic Usage

```typescript
import MonitoringDashboard from '@/components/dashboard/MonitoringDashboard';

function DashboardPage() {
  return (
    <div className="p-6">
      <MonitoringDashboard />
    </div>
  );
}
```

### With Custom Configuration

```typescript
import MonitoringDashboard from '@/components/dashboard/MonitoringDashboard';

function CustomDashboard() {
  const handleAlertClick = (alert: Alert) => {
    console.log('Alert clicked:', alert);
    // Navigate to alert details or trigger action
  };

  const handleError = (error: Error) => {
    console.error('Dashboard error:', error);
    // Show error notification
  };

  return (
    <MonitoringDashboard
      refreshInterval={60000} // 1 minute refresh
      autoRefresh={true}
      config={{
        showSystemInfo: true,
        showAlerts: true,
        showMetrics: true,
        compactMode: false
      }}
      onAlertClick={handleAlertClick}
      onError={handleError}
      className="custom-dashboard"
    />
  );
}
```

### Compact Mode

```typescript
import MonitoringDashboard from '@/components/dashboard/MonitoringDashboard';

function CompactDashboard() {
  return (
    <MonitoringDashboard
      config={{
        compactMode: true,
        showSystemInfo: false,
        showAlerts: true,
        showMetrics: true
      }}
      refreshInterval={120000} // 2 minutes
      autoRefresh={false} // Manual refresh only
    />
  );
}
```

### With Error Handling

```typescript
import MonitoringDashboard from '@/components/dashboard/MonitoringDashboard';
import { useState } from 'react';

function RobustDashboard() {
  const [dashboardError, setDashboardError] = useState<Error | null>(null);

  const handleError = (error: Error) => {
    setDashboardError(error);
    // Log to monitoring service
    logError('dashboard_error', error);
  };

  const handleRetry = () => {
    setDashboardError(null);
    // Force refresh
    window.location.reload();
  };

  if (dashboardError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700">Dashboard Error</span>
          </div>
          <p className="text-red-600 mt-2">{dashboardError.message}</p>
          <button
            onClick={handleRetry}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <MonitoringDashboard
      onError={handleError}
      onRefresh={(timestamp) => {
        console.log('Dashboard refreshed at:', timestamp);
      }}
    />
  );
}
```

## Data Structure

### DashboardData

```typescript
interface DashboardData {
  timestamp: string;
  overview: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    version: string;
    environment: string;
    activeAlertsCount: number;
    totalRequests: number;
    avgResponseTime: number;
  };
  metrics: {
    http: {
      requestsTotal: number;
      avgResponseTime: number;
      errorRate: number;
      requestsPerMinute: number;
    };
    webhooks: {
      eventsProcessed: number;
      successRate: number;
      processingTime: number;
      eventsPerHour: number;
    };
    database: {
      activeConnections: number;
      avgQueryTime: number;
      slowQueries: number;
      connectionUtilization: number;
    };
    business: {
      recoveryCases: number;
      remindersSent: number;
      reminderSuccessRate: number;
      activeCompanies: number;
    };
    queue: {
      depth: number;
      processingTime: number;
      throughput: number;
      failedJobs: number;
    };
    external: {
      apiCalls: number;
      successRate: number;
      avgResponseTime: number;
    };
  };
  alerts: {
    active: Alert[];
    recent: Alert[];
  };
  health: {
    database: HealthStatus;
    webhooks: HealthStatus;
    queue: HealthStatus;
    external: HealthStatus;
  };
}
```

### Alert Structure

```typescript
interface Alert {
  id: string;
  ruleName: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  message: string;
  timestamp: string;
  metricName: string;
  currentValue: number;
  threshold: number;
  resolved?: boolean;
  duration?: number;
}
```

### HealthStatus

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  [key: string]: any;
}
```

## Features

### Auto-Refresh

The dashboard automatically refreshes data at configurable intervals:

```typescript
// Auto-refresh configuration
const refreshConfig = {
  interval: 30000, // 30 seconds
  enabled: true,
  onError: (error) => console.error('Refresh failed:', error),
  onSuccess: (data) => console.log('Data refreshed:', data)
};
```

### Real-time Updates

Components update in real-time without full page refresh:

- **Metrics Updates**: Incremental data changes
- **Status Changes**: Live health status updates
- **Alert Notifications**: New alerts appear immediately
- **Performance Data**: Rolling window updates

### Responsive Design

The dashboard adapts to different screen sizes:

- **Desktop**: Full grid layout with all metrics
- **Tablet**: Condensed layout with grouped metrics
- **Mobile**: Stacked layout with swipeable sections

### Interactive Elements

- **Clickable Metrics**: Click any metric card for details
- **Alert Actions**: Click alerts for resolution options
- **Refresh Control**: Manual refresh with loading state
- **Settings Toggle**: Show/hide different dashboard sections

## Accessibility

### Keyboard Navigation

Full keyboard navigation support:

```typescript
// Keyboard shortcuts
const keyboardShortcuts = {
  'r': () => refreshDashboard(),
  'a': () => focusAlerts(),
  'm': () => focusMetrics(),
  'h': () => focusHealth(),
  'Escape': () => closeDetails()
};
```

### Screen Reader Support

Comprehensive screen reader support:

- **Semantic HTML**: Proper heading hierarchy
- **ARIA Labels**: Descriptive labels for interactive elements
- **Live Regions**: Dynamic content announcements
- **Focus Management**: Logical tab order and focus trapping

### Color Contrast

All interface elements meet WCAG AA contrast requirements:

- **Status Indicators**: High contrast colors
- **Text Colors**: Minimum 4.5:1 contrast ratio
- **Interactive Elements**: Clear visual feedback
- **Error States**: Distinct error indication

## Performance

### Optimization Techniques

The dashboard uses several performance optimizations:

#### Memoization

```typescript
// Expensive calculations are memoized
const processedMetrics = useMemo(() => {
  return processMetricsData(rawMetrics);
}, [rawMetrics]);

// Event handlers are stable
const handleRefresh = useCallback(() => {
  refreshDashboard();
}, [refreshDashboard]);
```

#### Virtualization

Large datasets use virtual scrolling:

```typescript
// Virtualized alert list
const VirtualizedAlertList = ({ alerts }) => (
  <FixedSizeList
    height={400}
    itemCount={alerts.length}
    itemSize={60}
    itemData={alerts}
  >
    {({ index, style, data }) => (
      <div style={style}>
        <AlertItem alert={data[index]} />
      </div>
    )}
  </FixedSizeList>
);
```

#### Data Fetching

Efficient data fetching patterns:

```typescript
// Incremental updates
const fetchDashboardData = async (lastUpdate?: string) => {
  const url = lastUpdate 
    ? `/api/monitoring/dashboard?since=${lastUpdate}`
    : '/api/monitoring/dashboard';
    
  const response = await fetch(url);
  return response.json();
};

// Request cancellation
useEffect(() => {
  const controller = new AbortController();
  
  fetchData(controller.signal);
  
  return () => controller.abort();
}, [refreshInterval]);
```

### Bundle Optimization

- **Code Splitting**: Dashboard loaded on demand
- **Tree Shaking**: Unused code eliminated
- **Asset Optimization**: Images and fonts optimized
- **Service Worker**: Offline capability

## Styling

### CSS Custom Properties

The dashboard uses CSS custom properties for theming:

```css
:root {
  --dashboard-bg: #ffffff;
  --dashboard-border: #e5e7eb;
  --dashboard-text: #374151;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
}

[data-theme="dark"] {
  --dashboard-bg: #1f2937;
  --dashboard-border: #374151;
  --dashboard-text: #f9fafb;
}
```

### Responsive Breakpoints

```css
/* Mobile */
.dashboard {
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}

/* Tablet */
.dashboard {
  @media (min-width: 769px) and (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
  }
}

/* Desktop */
.dashboard {
  @media (min-width: 1025px) {
    grid-template-columns: repeat(4, 1fr);
    gap: 2rem;
  }
}
```

## Testing

### Unit Tests

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MonitoringDashboard } from '@/components/dashboard/MonitoringDashboard';

describe('MonitoringDashboard', () => {
  test('renders dashboard with initial data', async () => {
    const mockData = createMockDashboardData();
    
    render(<MonitoringDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('System Status')).toBeInTheDocument();
      expect(screen.getByText('Uptime')).toBeInTheDocument();
      expect(screen.getByText('Requests')).toBeInTheDocument();
    });
  });

  test('handles auto-refresh', async () => {
    jest.useFakeTimers();
    
    render(<MonitoringDashboard refreshInterval={5000} />);
    
    // Wait for first refresh
    jest.advanceTimersByTime(5000);
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/monitoring/dashboard');
    });
  });

  test('handles refresh errors', async () => {
    const onError = jest.fn();
    
    render(<MonitoringDashboard onError={onError} />);
    
    // Simulate network error
    fetch.mockRejectOnce(new Error('Network error'));
    
    fireEvent.click(screen.getByText('Refresh'));
    
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Network error'
        })
      );
    });
  });
});
```

### Integration Tests

```typescript
import { render, screen } from '@testing-library/react';
import { MonitoringDashboard } from '@/components/dashboard/MonitoringDashboard';

describe('MonitoringDashboard Integration', () => {
  test('integrates with real API', async () => {
    // Mock real API responses
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(realDashboardData)
      })
    );

    render(<MonitoringDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('healthy')).toBeInTheDocument();
      expect(screen.getByText('125')).toBeInTheDocument(); // active companies
    });
  });
});
```

### Accessibility Tests

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

describe('MonitoringDashboard Accessibility', () => {
  test('should not have accessibility violations', async () => {
    const { container } = render(<MonitoringDashboard />);
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  test('supports keyboard navigation', () => {
    render(<MonitoringDashboard />);
    
    const refreshButton = screen.getByText('Refresh');
    refreshButton.focus();
    
    fireEvent.keyDown(refreshButton, { key: 'Enter' });
    
    expect(fetch).toHaveBeenCalled();
  });
});
```

## Troubleshooting

### Common Issues

1. **Dashboard Not Loading**
   - Check API endpoint availability
   - Verify network connectivity
   - Review browser console for errors

2. **Data Not Updating**
   - Verify auto-refresh is enabled
   - Check WebSocket connection
   - Review rate limiting headers

3. **Performance Issues**
   - Monitor memory usage
   - Check for memory leaks
   - Optimize data fetching

4. **Mobile Layout Issues**
   - Test on actual devices
   - Check responsive breakpoints
   - Verify touch interactions

### Debug Mode

Enable debug mode for detailed logging:

```typescript
// Enable debug logging
<MonitoringDashboard 
  debug={true}
  onDebugLog={(message, data) => {
    console.log('Dashboard Debug:', message, data);
  }}
/>
```

---

**Last Updated**: 2025-10-25  
**Version**: 1.0.0