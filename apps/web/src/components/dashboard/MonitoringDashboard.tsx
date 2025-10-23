// Real-time Monitoring Dashboard Component
// Provides comprehensive system monitoring with live updates

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Database, 
  ExternalLink,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';

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
    active: Array<{
      id: string;
      ruleName: string;
      severity: string;
      message: string;
      timestamp: string;
      metricName: string;
      currentValue: number;
      threshold: number;
    }>;
    recent: Array<{
      id: string;
      ruleName: string;
      severity: string;
      message: string;
      timestamp: string;
      resolved: boolean;
      duration: number;
    }>;
  };
  health: {
    database: any;
    webhooks: any;
    queue: any;
    external: any;
  };
}

export default function MonitoringDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/monitoring/dashboard');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const dashboardData = await response.json();
      setData(dashboardData);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'unhealthy': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-4 h-4" />;
      case 'degraded': return <AlertCircle className="w-4 h-4" />;
      case 'unhealthy': return <AlertCircle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'P0': return 'bg-red-100 text-red-800 border-red-200';
      case 'P1': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'P2': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'P3': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700">Error loading dashboard: {error}</span>
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-auto"
              onClick={fetchData}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Dashboard</h1>
          <p className="text-gray-600">
            Real-time system monitoring and alerting
            {lastUpdated && (
              <span className="ml-2 text-sm text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-blue-50' : ''}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            {getStatusIcon(data.overview.status)}
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Badge className={getStatusColor(data.overview.status)}>
                {data.overview.status.toUpperCase()}
              </Badge>
              <span className="text-2xl font-bold">
                {data.overview.activeAlertsCount}
              </span>
            </div>
            <p className="text-xs text-gray-600">Active alerts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="w-4 h-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(data.overview.uptime)}
            </div>
            <p className="text-xs text-gray-600">
              Version {data.overview.version} • {data.overview.environment}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests</CardTitle>
            <Activity className="w-4 h-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(data.metrics.http.requestsPerMinute)}/min
            </div>
            <p className="text-xs text-gray-600">
              {data.metrics.http.errorRate.toFixed(1)}% error rate • {data.metrics.http.avgResponseTime}ms avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Companies</CardTitle>
            <Users className="w-4 h-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.metrics.business.activeCompanies}
            </div>
            <p className="text-xs text-gray-600">
              {data.metrics.business.recoveryCases} recovery cases • {data.metrics.business.remindersSent} reminders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* HTTP Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              HTTP Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-lg font-semibold">{formatNumber(data.metrics.http.requestsTotal)}</div>
                <p className="text-sm text-gray-600">Total Requests</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.http.avgResponseTime}ms</div>
                <p className="text-sm text-gray-600">Avg Response Time</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.http.requestsPerMinute}</div>
                <p className="text-sm text-gray-600">Requests/Minute</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.http.errorRate.toFixed(1)}%</div>
                <p className="text-sm text-gray-600">Error Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="w-5 h-5 mr-2" />
              Webhook Processing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-lg font-semibold">{formatNumber(data.metrics.webhooks.eventsProcessed)}</div>
                <p className="text-sm text-gray-600">Events Processed</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.webhooks.successRate.toFixed(1)}%</div>
                <p className="text-sm text-gray-600">Success Rate</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.webhooks.processingTime}ms</div>
                <p className="text-sm text-gray-600">Processing Time</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.webhooks.eventsPerHour}</div>
                <p className="text-sm text-gray-600">Events/Hour</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="w-5 h-5 mr-2" />
              Database Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-lg font-semibold">{data.metrics.database.activeConnections}</div>
                <p className="text-sm text-gray-600">Active Connections</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.database.avgQueryTime}ms</div>
                <p className="text-sm text-gray-600">Avg Query Time</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.database.slowQueries}</div>
                <p className="text-sm text-gray-600">Slow Queries</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.database.connectionUtilization}%</div>
                <p className="text-sm text-gray-600">Connection Utilization</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job Queue Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Job Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-lg font-semibold">{data.metrics.queue.depth}</div>
                <p className="text-sm text-gray-600">Queue Depth</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.queue.processingTime}ms</div>
                <p className="text-sm text-gray-600">Processing Time</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.queue.throughput}</div>
                <p className="text-sm text-gray-600">Throughput/min</p>
              </div>
              <div>
                <div className="text-lg font-semibold">{data.metrics.queue.failedJobs}</div>
                <p className="text-sm text-gray-600">Failed Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                Active Alerts ({data.alerts.active.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.alerts.active.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p>No active alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.alerts.active.map((alert) => (
                  <div key={alert.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge className={getSeverityColor(alert.severity)}>
                            {alert.severity}
                          </Badge>
                          <span className="text-sm font-medium">{alert.ruleName}</span>
                        </div>
                        <p className="text-sm text-gray-600">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {alert.metricName}: {alert.currentValue} (threshold: {alert.threshold})
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Recent Alerts ({data.alerts.recent.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.alerts.recent.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No recent alerts</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {data.alerts.recent.map((alert) => (
                  <div key={alert.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge className={getSeverityColor(alert.severity)} variant="outline">
                            {alert.severity}
                          </Badge>
                          <span className="text-sm font-medium">{alert.ruleName}</span>
                          {alert.resolved && (
                            <Badge variant="outline" className="text-green-600 border-green-200">
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(alert.timestamp).toLocaleString()} • {alert.duration}m duration
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-3">
              <Database className="w-5 h-5" />
              <div>
                <div className="font-medium">Database</div>
                <Badge className={getStatusColor(data.health.database.status || 'unknown')}>
                  {data.health.database.status || 'Unknown'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Zap className="w-5 h-5" />
              <div>
                <div className="font-medium">Webhooks</div>
                <Badge className={getStatusColor(data.health.webhooks.status || 'unknown')}>
                  {data.health.webhooks.status || 'Unknown'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5" />
              <div>
                <div className="font-medium">Job Queue</div>
                <Badge className={getStatusColor(data.health.queue.status || 'unknown')}>
                  {data.health.queue.status || 'Unknown'}
                </Badge>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <ExternalLink className="w-5 h-5" />
              <div>
                <div className="font-medium">External Services</div>
                <Badge className={getStatusColor(data.health.external.status || 'unknown')}>
                  {data.health.external.status || 'Unknown'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}