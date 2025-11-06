'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  Globe,
  Activity,
  Eye,
  EyeOff
} from 'lucide-react';
import { formatDuration, formatNumber } from '@/lib/common/formatters';

interface SecurityDashboardData {
  timestamp: string;
  summary: {
    totalEvents: number;
    criticalEvents: number;
    highSeverityEvents: number;
    activeAlerts: number;
    uniqueIPs: number;
    unusualPatterns: number;
    sessionInvalidations: number;
    timeWindow: string;
  };
  metrics: {
    authentication: {
      successfulLogins: number;
      failedAttempts: number;
      rateLimitHits: number;
      suspiciousIPs: number;
    };
    authorization: {
      policyViolations: number;
      privilegeEscalations: number;
      accessDenied: number;
    };
    system: {
      webhookFailures: number;
      databaseErrors: number;
      apiRateLimits: number;
      serviceDegradations: number;
    };
  };
  alerts: Array<{
    id: string;
    category: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    type: string;
    description: string;
    timestamp: string;
    ip?: string;
    userId?: string;
    resolved: boolean;
    resolvedAt?: string;
    resolvedBy?: string;
  }>;
  events: Array<{
    id: string;
    timestamp: string;
    category: string;
    severity: string;
    type: string;
    description: string;
    ip?: string;
    userAgent?: string;
    userId?: string;
    endpoint?: string;
  }>;
  threatIndicators: {
    suspiciousIPs: Array<{
      ip: string;
      eventCount: number;
      lastSeen: string;
      categories: string[];
    }>;
    geographicAnomalies: Array<{
      ip: string;
      country: string;
      region: string;
      eventCount: number;
      userId: string;
    }>;
    userAgents: Array<{
      userAgent: string;
      count: number;
      isSuspicious: boolean;
    }>;
  };
  systemHealth: {
    authentication: { status: 'healthy' | 'degraded' | 'unhealthy'; latency: number };
    database: { status: 'healthy' | 'degraded' | 'unhealthy'; connections: number };
    webhooks: { status: 'healthy' | 'degraded' | 'unhealthy'; successRate: number };
    rateLimiter: { status: 'healthy' | 'degraded' | 'unhealthy'; activeLimits: number };
  };
  sessionManagement: {
    activeSessions: number;
    recentInvalidations: number;
    suspiciousSessions: number;
    lastInvalidation: string;
  };
}

export default function SecurityMonitoringDashboard() {
  const [data, setData] = useState<SecurityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'alerts' | 'events' | 'threats' | 'health'>('overview');
  const [eventFilters, setEventFilters] = useState({
    category: 'all',
    severity: 'all',
    search: '',
    timeRange: '24h'
  });
  const [alertFilters, setAlertFilters] = useState({
    status: 'all',
    severity: 'all',
    search: ''
  });

  const fetchData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/dashboard/security?includeAlerts=true&includeEvents=true&includeThreats=true');
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
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const resolveAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/dashboard/security/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to resolve alert');
      }
      await fetchData(); // Refresh data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve alert');
    }
  };

  const getSeverityColor = (severity: string): string => {
    const colors = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200',
      info: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[severity as keyof typeof colors] || colors.info;
  };

  const getStatusColor = (status: string): string => {
    const colors = {
      healthy: 'text-green-600 bg-green-100',
      degraded: 'text-yellow-600 bg-yellow-100',
      unhealthy: 'text-red-600 bg-red-100'
    };
    return colors[status as keyof typeof colors] || colors.healthy;
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      healthy: <CheckCircle className="w-4 h-4" />,
      degraded: <AlertTriangle className="w-4 h-4" />,
      unhealthy: <AlertCircle className="w-4 h-4" />
    };
    return icons[status as keyof typeof icons] || icons.healthy;
  };

  const filteredEvents = data?.events.filter(event => {
    if (eventFilters.category !== 'all' && event.category !== eventFilters.category) return false;
    if (eventFilters.severity !== 'all' && event.severity !== eventFilters.severity) return false;
    if (eventFilters.search && !event.description.toLowerCase().includes(eventFilters.search.toLowerCase())) return false;
    return true;
  }) || [];

  const filteredAlerts = data?.alerts.filter(alert => {
    if (alertFilters.status !== 'all') {
      if (alertFilters.status === 'resolved' && !alert.resolved) return false;
      if (alertFilters.status === 'active' && alert.resolved) return false;
    }
    if (alertFilters.severity !== 'all' && alert.severity !== alertFilters.severity) return false;
    if (alertFilters.search && !alert.description.toLowerCase().includes(alertFilters.search.toLowerCase())) return false;
    return true;
  }) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin" />
        <span className="ml-2">Loading security dashboard...</span>
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

  if (!data) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Shield className="w-8 h-8 mr-3 text-red-600" />
            Security Monitoring Dashboard
          </h1>
          <p className="text-gray-600 mt-1">
            Real-time security monitoring and threat detection
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

      {/* Navigation Tabs */}
      <div className="flex space-x-1 border-b">
        {[
          { key: 'overview', label: 'Overview', icon: Activity },
          { key: 'alerts', label: 'Alerts', icon: AlertCircle },
          { key: 'events', label: 'Events', icon: Clock },
          { key: 'threats', label: 'Threats', icon: Eye },
          { key: 'health', label: 'System Health', icon: Database }
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSelectedTab(key as any)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center ${
              selectedTab === key
                ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4 mr-2" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Events</CardTitle>
                <Activity className="w-4 h-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(data.summary.totalEvents)}</div>
                <p className="text-xs text-gray-600">Last {data.summary.timeWindow}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
                {data.summary.activeAlerts > 0 ? <AlertCircle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.activeAlerts}</div>
                <p className="text-xs text-gray-600">Critical: {data.summary.criticalEvents}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Suspicious IPs</CardTitle>
                <Globe className="w-4 h-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.uniqueIPs}</div>
                <p className="text-xs text-gray-600">Unique IPs monitored</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Session Activity</CardTitle>
                <Users className="w-4 h-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.sessionManagement.activeSessions}</div>
                <p className="text-xs text-gray-600">{data.sessionManagement.recentInvalidations} invalidations</p>
              </CardContent>
            </Card>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  Authentication Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-lg font-semibold">{formatNumber(data.metrics.authentication.successfulLogins)}</div>
                    <p className="text-sm text-gray-600">Successful Logins</p>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-red-600">{data.metrics.authentication.failedAttempts}</div>
                    <p className="text-sm text-gray-600">Failed Attempts</p>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-orange-600">{data.metrics.authentication.rateLimitHits}</div>
                    <p className="text-sm text-gray-600">Rate Limit Hits</p>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-red-600">{data.metrics.authentication.suspiciousIPs}</div>
                    <p className="text-sm text-gray-600">Suspicious IPs</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="w-5 h-5 mr-2" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <div>
                      <div className="font-medium">Auth Service</div>
                      <Badge className={getStatusColor(data.systemHealth.authentication.status)}>
                        {data.systemHealth.authentication.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div>
                      <div className="font-medium">Database</div>
                      <Badge className={getStatusColor(data.systemHealth.database.status)}>
                        {data.systemHealth.database.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div>
                      <div className="font-medium">Webhooks</div>
                      <Badge className={getStatusColor(data.systemHealth.webhooks.status)}>
                        {data.systemHealth.webhooks.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div>
                      <div className="font-medium">Rate Limiter</div>
                      <Badge className={getStatusColor(data.systemHealth.rateLimiter.status)}>
                        {data.systemHealth.rateLimiter.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {selectedTab === 'alerts' && (
        <div className="space-y-6">
          {/* Alert Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Alert Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search alerts..."
                    value={alertFilters.search}
                    onChange={(e) => setAlertFilters(prev => ({ ...prev, search: e.target.value }))}
                  />
                </div>
                <Select value={alertFilters.status} onValueChange={(value) => setAlertFilters(prev => ({ ...prev, status: value }))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={alertFilters.severity} onValueChange={(value) => setAlertFilters(prev => ({ ...prev, severity: value }))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severity</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Alerts Table */}
          <Card>
            <CardHeader>
              <CardTitle>Security Alerts ({filteredAlerts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAlerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Badge className={getSeverityColor(alert.severity)}>
                          {alert.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{alert.category}</TableCell>
                      <TableCell className="max-w-md truncate">{alert.description}</TableCell>
                      <TableCell>{new Date(alert.timestamp).toLocaleString()}</TableCell>
                      <TableCell>
                        {alert.resolved ? (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            Resolved
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {!alert.resolved && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resolveAlert(alert.id)}
                          >
                            Resolve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedTab === 'events' && (
        <div className="space-y-6">
          {/* Event Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Event Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search events..."
                    value={eventFilters.search}
                    onChange={(e) => setEventFilters(prev => ({ ...prev, search: e.target.value }))}
                  />
                </div>
                <Select value={eventFilters.category} onValueChange={(value) => setEventFilters(prev => ({ ...prev, category: value }))}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="authentication">Authentication</SelectItem>
                    <SelectItem value="authorization">Authorization</SelectItem>
                    <SelectItem value="rate_limit">Rate Limit</SelectItem>
                    <SelectItem value="intrusion">Intrusion</SelectItem>
                    <SelectItem value="anomaly">Anomaly</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={eventFilters.severity} onValueChange={(value) => setEventFilters(prev => ({ ...prev, severity: value }))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severity</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Events Table */}
          <Card>
            <CardHeader>
              <CardTitle>Security Events ({filteredEvents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.slice(0, 100).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{new Date(event.timestamp).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(event.severity)}>
                          {event.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>{event.category}</TableCell>
                      <TableCell>{event.type}</TableCell>
                      <TableCell className="max-w-md truncate">{event.description}</TableCell>
                      <TableCell>{event.ip || '-'}</TableCell>
                      <TableCell>{event.userId || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedTab === 'threats' && (
        <div className="space-y-6">
          {/* Threat Indicators */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="w-5 h-5 mr-2" />
                  Suspicious IPs ({data.threatIndicators.suspiciousIPs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Event Count</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead>Categories</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.threatIndicators.suspiciousIPs.slice(0, 10).map((ip) => (
                      <TableRow key={ip.ip}>
                        <TableCell className="font-mono">{ip.ip}</TableCell>
                        <TableCell>{ip.eventCount}</TableCell>
                        <TableCell>{new Date(ip.lastSeen).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {ip.categories.map((cat) => (
                              <Badge key={cat} variant="outline" className="text-xs">
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Eye className="w-5 h-5 mr-2" />
                  Suspicious User Agents ({data.threatIndicators.userAgents.filter(ua => ua.isSuspicious).length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Agent</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.threatIndicators.userAgents.filter(ua => ua.isSuspicious).slice(0, 10).map((ua, index) => (
                      <TableRow key={index}>
                        <TableCell className="max-w-xs truncate font-mono text-xs">{ua.userAgent}</TableCell>
                        <TableCell>{ua.count}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            Suspicious
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {selectedTab === 'health' && (
        <div className="space-y-6">
          {/* System Health Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  Authentication Service
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <Badge className={getStatusColor(data.systemHealth.authentication.status)}>
                    {data.systemHealth.authentication.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average Latency:</span>
                  <span className="font-mono">{data.systemHealth.authentication.latency}ms</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="w-5 h-5 mr-2" />
                  Database
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <Badge className={getStatusColor(data.systemHealth.database.status)}>
                    {data.systemHealth.database.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Active Connections:</span>
                  <span className="font-mono">{data.systemHealth.database.connections}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" />
                  Webhook Processing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <Badge className={getStatusColor(data.systemHealth.webhooks.status)}>
                    {data.systemHealth.webhooks.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Success Rate:</span>
                  <span className="font-mono">{data.systemHealth.webhooks.successRate.toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Rate Limiter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <Badge className={getStatusColor(data.systemHealth.rateLimiter.status)}>
                    {data.systemHealth.rateLimiter.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Active Limits:</span>
                  <span className="font-mono">{data.systemHealth.rateLimiter.activeLimits}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Session Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Session Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{data.sessionManagement.activeSessions}</div>
                  <p className="text-sm text-gray-600">Active Sessions</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600">{data.sessionManagement.recentInvalidations}</div>
                  <p className="text-sm text-gray-600">Recent Invalidations</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{data.sessionManagement.suspiciousSessions}</div>
                  <p className="text-sm text-gray-600">Suspicious Sessions</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600">
                  Last invalidation: {new Date(data.sessionManagement.lastInvalidation).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}