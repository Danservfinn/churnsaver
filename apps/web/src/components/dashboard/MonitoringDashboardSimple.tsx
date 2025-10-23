// Simple Real-time Monitoring Dashboard Component
// Provides comprehensive system monitoring with live updates using basic HTML/CSS

'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Database, 
  ExternalLink,
  RefreshCw,
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

export default function MonitoringDashboardSimple() {
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
            <button 
              className="ml-auto px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              onClick={fetchData}
            >
              Retry
            </button>
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
          <button
            className={`px-3 py-1 text-sm border rounded ${
              autoRefresh ? 'bg-blue-50 border-blue-200' : 'border-gray-300'
            }`}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`w-4 h-4 inline mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </button>
          <button 
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            onClick={fetchData}
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">System Status</span>
            {getStatusIcon(data.overview.status)}
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(data.overview.status)}`}>
              {data.overview.status.toUpperCase()}
            </span>
            <span className="text-2xl font-bold">
              {data.overview.activeAlertsCount}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">Active alerts</p>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Uptime</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold">
            {formatDuration(data.overview.uptime)}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Version {data.overview.version} • {data.overview.environment}
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Requests</span>
            <Activity className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold">
            {formatNumber(data.metrics.http.requestsPerMinute)}/min
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {data.metrics.http.errorRate.toFixed(1)}% error rate • {data.metrics.http.avgResponseTime}ms avg
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Active Companies</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold">
            {data.metrics.business.activeCompanies}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {data.metrics.business.recoveryCases} recovery cases • {data.metrics.business.remindersSent} reminders
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* HTTP Metrics */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            HTTP Performance
          </h3>
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
        </div>

        {/* Webhook Metrics */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Zap className="w-5 h-5 mr-2" />
            Webhook Processing
          </h3>
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
        </div>

        {/* Database Metrics */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Database className="w-5 h-5 mr-2" />
            Database Performance
          </h3>
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
        </div>

        {/* Job Queue Metrics */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Job Queue
          </h3>
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
        </div>
      </div>

      {/* Alerts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Alerts */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            Active Alerts ({data.alerts.active.length})
          </h3>
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
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                          {alert.severity}
                        </span>
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
        </div>

        {/* Recent Alerts */}
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Recent Alerts ({data.alerts.recent.length})
          </h3>
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
                        <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                          {alert.severity}
                        </span>
                        <span className="text-sm font-medium">{alert.ruleName}</span>
                        {alert.resolved && (
                          <span className="px-2 py-1 rounded text-xs font-medium border text-green-600 border-green-200">
                            Resolved
                          </span>
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
        </div>
      </div>

      {/* Health Status */}
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Activity className="w-5 h-5 mr-2" />
          System Health
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center space-x-3">
            <Database className="w-5 h-5" />
            <div>
              <div className="font-medium">Database</div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(data.health.database.status || 'unknown')}`}>
                {data.health.database.status || 'Unknown'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Zap className="w-5 h-5" />
            <div>
              <div className="font-medium">Webhooks</div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(data.health.webhooks.status || 'unknown')}`}>
                {data.health.webhooks.status || 'Unknown'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Clock className="w-5 h-5" />
            <div>
              <div className="font-medium">Job Queue</div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(data.health.queue.status || 'unknown')}`}>
                {data.health.queue.status || 'Unknown'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <ExternalLink className="w-5 h-5" />
            <div>
              <div className="font-medium">External Services</div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(data.health.external.status || 'unknown')}`}>
                {data.health.external.status || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}