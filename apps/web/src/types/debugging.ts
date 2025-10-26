// Type definitions for debugging functionality

/**
 * Debug levels supported by the system
 */
export enum DebugLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Debug session status
 */
export enum DebugSessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  EXPIRED = 'expired'
}

/**
 * Debug environment types
 */
export enum DebugEnvironment {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production'
}

/**
 * Debug log categories
 */
export enum DebugCategory {
  API = 'api',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
  SYSTEM = 'system',
  RATE_LIMIT = 'rate_limit',
  NETWORK = 'network',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  WEBHOOK = 'webhook',
  SCHEDULER = 'scheduler',
  JOB_QUEUE = 'job_queue',
  ERROR_RECOVERY = 'error_recovery'
}

/**
 * Debug session interface
 */
export interface DebugSession {
  id: string;
  sessionId: string;
  userId: string;
  companyId: string;
  title: string;
  description?: string;
  debugLevel: DebugLevel;
  status: DebugSessionStatus;
  environment: DebugEnvironment;
  filters: Record<string, any>;
  metadata: Record<string, any>;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Debug log entry interface
 */
export interface DebugLog {
  id: string;
  sessionId: string;
  userId: string;
  companyId: string;
  level: DebugLevel;
  category: DebugCategory;
  message: string;
  data: Record<string, any>;
  requestId?: string;
  endpoint?: string;
  method?: string;
  queryDurationMs?: number;
  queryText?: string;
  queryParams?: Record<string, any>;
  stackTrace?: string;
  filePath?: string;
  lineNumber?: number;
  functionName?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

/**
 * Debug report interface
 */
export interface DebugReport {
  id: string;
  sessionId: string;
  userId: string;
  companyId: string;
  title: string;
  summary?: string;
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByCategory: Record<string, number>;
  errorsCount: number;
  warningsCount: number;
  performanceMetrics: DebugPerformanceMetrics;
  recommendations: string[];
  reportData: Record<string, any>;
  generatedAt: Date;
  createdAt: Date;
}

/**
 * Debug performance metrics
 */
export interface DebugPerformanceMetrics {
  avgQueryDuration?: number;
  maxQueryDuration?: number;
  totalQueries?: number;
  slowQueries?: number;
  errorRate?: number;
  sessionDurationHours?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

/**
 * Debug session creation request
 */
export interface CreateDebugSessionRequest {
  title: string;
  description?: string;
  debugLevel: DebugLevel;
  environment?: DebugEnvironment;
  filters?: Record<string, any>;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

/**
 * Debug session update request
 */
export interface UpdateDebugSessionRequest {
  title?: string;
  description?: string;
  debugLevel?: DebugLevel;
  status?: DebugSessionStatus;
  filters?: Record<string, any>;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

/**
 * Debug log creation request
 */
export interface CreateDebugLogRequest {
  sessionId: string;
  level: DebugLevel;
  category: DebugCategory;
  message: string;
  data?: Record<string, any>;
  requestId?: string;
  endpoint?: string;
  method?: string;
  queryDurationMs?: number;
  queryText?: string;
  queryParams?: Record<string, any>;
  stackTrace?: string;
  filePath?: string;
  lineNumber?: number;
  functionName?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Debug log query parameters
 */
export interface DebugLogQuery {
  sessionId?: string;
  level?: DebugLevel;
  category?: DebugCategory;
  requestId?: string;
  endpoint?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'level' | 'category';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Debug session query parameters
 */
export interface DebugSessionQuery {
  userId?: string;
  companyId?: string;
  status?: DebugSessionStatus;
  environment?: DebugEnvironment;
  debugLevel?: DebugLevel;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Debug report query parameters
 */
export interface DebugReportQuery {
  sessionId?: string;
  userId?: string;
  companyId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'generatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Debug configuration
 */
export interface DebugConfig {
  enabled: boolean;
  level: DebugLevel;
  environment: DebugEnvironment;
  maxSessionDuration: number; // in hours
  maxLogsPerSession: number;
  dataRetentionDays: number;
  enablePerformanceTracking: boolean;
  enableStackTraceCapture: boolean;
  enableQueryLogging: boolean;
  enableSensitiveDataRedaction: boolean;
  sensitiveDataPatterns: string[];
  allowedIps: string[];
  rateLimitPerMinute: number;
}

/**
 * Debug statistics
 */
export interface DebugStatistics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  expiredSessions: number;
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByCategory: Record<string, number>;
  averageSessionDuration: number;
  mostActiveCategories: Array<{ category: string; count: number }>;
  recentErrors: Array<{ message: string; timestamp: Date; count: number }>;
  performanceMetrics: DebugPerformanceMetrics;
}

/**
 * Debug filter options
 */
export interface DebugFilterOptions {
  levels?: DebugLevel[];
  categories?: DebugCategory[];
  endpoints?: string[];
  methods?: string[];
  users?: string[];
  companies?: string[];
  timeRange?: {
    startDate: Date;
    endDate: Date;
  };
  keywords?: string[];
  minQueryDuration?: number;
  maxQueryDuration?: number;
  hasStackTrace?: boolean;
  hasQueryData?: boolean;
}

/**
 * Debug export options
 */
export interface DebugExportOptions {
  format: 'json' | 'csv' | 'txt';
  includeSensitiveData: boolean;
  compress: boolean;
  filters: DebugFilterOptions;
  fields?: string[];
}

/**
 * Debug export result
 */
export interface DebugExportResult {
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  format: string;
  expiresAt: Date;
  recordCount: number;
}

/**
 * Debug alert configuration
 */
export interface DebugAlertConfig {
  enabled: boolean;
  errorThreshold: number;
  warningThreshold: number;
  performanceThreshold: number;
  alertChannels: string[];
  cooldownMinutes: number;
  conditions: Array<{
    type: 'error_rate' | 'performance' | 'log_volume' | 'specific_error';
    threshold: number;
    timeWindow: number; // in minutes
    enabled: boolean;
  }>;
}

/**
 * Debug alert notification
 */
export interface DebugAlertNotification {
  id: string;
  sessionId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

/**
 * Debug context for service operations
 */
export interface DebugContext {
  sessionId?: string;
  userId: string;
  companyId: string;
  requestId?: string;
  environment: DebugEnvironment;
  ipAddress?: string;
  userAgent?: string;
  permissions: string[];
}

/**
 * Debug service options
 */
export interface DebugServiceOptions {
  enablePerformanceTracking: boolean;
  enableSensitiveDataRedaction: boolean;
  enableStackTraceCapture: boolean;
  enableQueryLogging: boolean;
  maxLogDataSize: number;
  redactionPatterns: Array<{
    pattern: RegExp;
    replacement: string;
  }>;
}