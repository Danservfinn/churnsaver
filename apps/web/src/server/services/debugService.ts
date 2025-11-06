// Debug Service
// Provides comprehensive debugging functionality for API endpoints, database operations, and background jobs

import { v4 as uuidv4 } from 'uuid';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt, decrypt } from '@/lib/encryption';
import { 
  DebugSession, 
  DebugLog, 
  DebugReport, 
  CreateDebugSessionRequest, 
  UpdateDebugSessionRequest, 
  CreateDebugLogRequest,
  DebugLogQuery,
  DebugSessionQuery,
  DebugReportQuery,
  DebugContext,
  DebugServiceOptions,
  DebugLevel,
  DebugSessionStatus,
  DebugEnvironment,
  DebugCategory,
  DebugStatistics,
  DebugPerformanceMetrics
} from '@/types/debugging';

/**
 * Default debug service configuration
 */
const DEFAULT_DEBUG_OPTIONS: DebugServiceOptions = {
  enablePerformanceTracking: true,
  enableSensitiveDataRedaction: true,
  enableStackTraceCapture: true,
  enableQueryLogging: true,
  maxLogDataSize: 1024 * 1024, // 1MB
  redactionPatterns: [
    { pattern: /password/i, replacement: '[REDACTED]' },
    { pattern: /token/i, replacement: '[REDACTED]' },
    { pattern: /secret/i, replacement: '[REDACTED]' },
    { pattern: /key/i, replacement: '[REDACTED]' },
    { pattern: /auth/i, replacement: '[REDACTED]' },
    { pattern: /credit.?card/i, replacement: '[REDACTED]' },
    { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, replacement: '[CARD]' },
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/, replacement: '[SSN]' },
    { pattern: /email/i, replacement: '[EMAIL]' }
  ]
};

/**
 * Debug Service class
 */
export class DebugService {
  private options: DebugServiceOptions;
  private activeSessions = new Map<string, DebugSession>();

  constructor(options: Partial<DebugServiceOptions> = {}) {
    this.options = { ...DEFAULT_DEBUG_OPTIONS, ...options };
  }

  /**
   * Create a new debug session
   */
  async createSession(
    request: CreateDebugSessionRequest,
    context: DebugContext
  ): Promise<DebugSession> {
    try {
      const sessionId = `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expiresAt = request.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default

      const session = await sql.insert<DebugSession>(
        `INSERT INTO debug_sessions (
          session_id, user_id, company_id, title, description, debug_level, 
          status, environment, filters, metadata, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          sessionId,
          context.userId,
          context.companyId,
          request.title,
          request.description,
          request.debugLevel,
          DebugSessionStatus.ACTIVE,
          request.environment || DebugEnvironment.DEVELOPMENT,
          JSON.stringify(request.filters || {}),
          JSON.stringify(request.metadata || {}),
          expiresAt
        ],
        context.companyId
      );

      if (!session) {
        throw new Error('Failed to create debug session');
      }

      // Cache active session
      this.activeSessions.set(sessionId, session);

      logger.info('Debug session created', {
        sessionId,
        userId: context.userId,
        companyId: context.companyId,
        debugLevel: request.debugLevel,
        environment: request.environment || DebugEnvironment.DEVELOPMENT
      });

      return session;
    } catch (error) {
      logger.error('Failed to create debug session', {
        error: error instanceof Error ? error.message : String(error),
        userId: context.userId,
        companyId: context.companyId
      });
      throw error;
    }
  }

  /**
   * Get debug session by ID
   */
  async getSession(sessionId: string, context: DebugContext): Promise<DebugSession | null> {
    try {
      // Check cache first
      if (this.activeSessions.has(sessionId)) {
        return this.activeSessions.get(sessionId)!;
      }

      const sessions = await sql.select<DebugSession>(
        `SELECT * FROM debug_sessions 
         WHERE session_id = $1 AND user_id = $2`,
        [sessionId, context.userId],
        context.companyId
      );

      if (sessions.length === 0) {
        return null;
      }

      const session = sessions[0];

      // Cache if active
      if (session.status === DebugSessionStatus.ACTIVE) {
        this.activeSessions.set(sessionId, session);
      }

      return session;
    } catch (error) {
      logger.error('Failed to get debug session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Update debug session
   */
  async updateSession(
    sessionId: string,
    request: UpdateDebugSessionRequest,
    context: DebugContext
  ): Promise<DebugSession | null> {
    try {
      const existingSession = await this.getSession(sessionId, context);
      if (!existingSession) {
        return null;
      }

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (request.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(request.title);
      }
      if (request.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(request.description);
      }
      if (request.debugLevel !== undefined) {
        updateFields.push(`debug_level = $${paramIndex++}`);
        updateValues.push(request.debugLevel);
      }
      if (request.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(request.status);
      }
      if (request.filters !== undefined) {
        updateFields.push(`filters = $${paramIndex++}`);
        updateValues.push(JSON.stringify(request.filters));
      }
      if (request.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex++}`);
        updateValues.push(JSON.stringify(request.metadata));
      }
      if (request.expiresAt !== undefined) {
        updateFields.push(`expires_at = $${paramIndex++}`);
        updateValues.push(request.expiresAt);
      }

      if (updateFields.length === 0) {
        return existingSession;
      }

      updateValues.push(sessionId, context.userId);

      const updatedSession = await sql.insert<DebugSession>(
        `UPDATE debug_sessions 
         SET ${updateFields.join(', ')}
         WHERE session_id = $${paramIndex++} AND user_id = $${paramIndex++}
         RETURNING *`,
        updateValues,
        context.companyId
      );

      if (!updatedSession) {
        throw new Error('Failed to update debug session');
      }

      // Update cache
      this.activeSessions.set(sessionId, updatedSession);

      logger.info('Debug session updated', {
        sessionId,
        userId: context.userId,
        companyId: context.companyId,
        updateFields: updateFields.length
      });

      return updatedSession;
    } catch (error) {
      logger.error('Failed to update debug session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * End debug session
   */
  async endSession(sessionId: string, context: DebugContext): Promise<boolean> {
    try {
      const updatedSession = await this.updateSession(
        sessionId,
        { status: DebugSessionStatus.COMPLETED },
        context
      );

      if (!updatedSession) {
        return false;
      }

      // Remove from cache
      this.activeSessions.delete(sessionId);

      // Generate debug report
      await this.generateReport(sessionId, context);

      logger.info('Debug session ended', {
        sessionId,
        userId: context.userId,
        companyId: context.companyId
      });

      return true;
    } catch (error) {
      logger.error('Failed to end debug session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Add debug log entry
   */
  async addLog(request: CreateDebugLogRequest, context: DebugContext): Promise<DebugLog> {
    try {
      // Validate session exists and is active
      const session = await this.getSession(request.sessionId, context);
      if (!session || session.status !== DebugSessionStatus.ACTIVE) {
        throw new Error('Invalid or inactive debug session');
      }

      // Check if log level is allowed by session
      if (!this.isLogLevelAllowed(request.level, session.debugLevel)) {
        throw new Error('Log level not allowed for this session'); // Skip log if level not allowed
      }

      // Redact sensitive data
      const redactedData = this.options.enableSensitiveDataRedaction 
        ? this.redactSensitiveData(request.data || {})
        : request.data;

      // Redact query parameters
      const redactedQueryParams = this.options.enableSensitiveDataRedaction 
        ? this.redactSensitiveData(request.queryParams || {})
        : request.queryParams;

      const log = await sql.insert<DebugLog>(
        `INSERT INTO debug_logs (
          session_id, user_id, company_id, level, category, message, data,
          request_id, endpoint, method, query_duration_ms, query_text, query_params,
          stack_trace, file_path, line_number, function_name, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *`,
        [
          request.sessionId,
          context.userId,
          context.companyId,
          request.level,
          request.category,
          request.message,
          JSON.stringify(redactedData),
          request.requestId || context.requestId,
          request.endpoint,
          request.method,
          request.queryDurationMs,
          request.queryText,
          JSON.stringify(redactedQueryParams),
          request.stackTrace,
          request.filePath,
          request.lineNumber,
          request.functionName,
          request.ipAddress || context.ipAddress,
          request.userAgent || context.userAgent
        ],
        context.companyId
      );

      if (!log) {
        throw new Error('Failed to create debug log');
      }

      // Log to system logger for critical issues
      if (request.level === DebugLevel.ERROR) {
        logger.error('Debug error logged', {
          sessionId: request.sessionId,
          message: request.message,
          category: request.category,
          userId: context.userId
        });
      }

      return log;
    } catch (error) {
      logger.error('Failed to add debug log', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: request.sessionId,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Get debug logs with pagination and filtering
   */
  async getLogs(query: DebugLogQuery, context: DebugContext): Promise<{
    logs: DebugLog[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (query.sessionId) {
        conditions.push(`session_id = $${paramIndex++}`);
        values.push(query.sessionId);
      }
      if (query.level) {
        conditions.push(`level = $${paramIndex++}`);
        values.push(query.level);
      }
      if (query.category) {
        conditions.push(`category = $${paramIndex++}`);
        values.push(query.category);
      }
      if (query.requestId) {
        conditions.push(`request_id = $${paramIndex++}`);
        values.push(query.requestId);
      }
      if (query.endpoint) {
        conditions.push(`endpoint = $${paramIndex++}`);
        values.push(query.endpoint);
      }
      if (query.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(query.startDate);
      }
      if (query.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(query.endDate);
      }

      // Add user and company context for RLS
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(context.userId);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await sql.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM debug_logs ${whereClause}`,
        values,
        context.companyId
      );
      const total = countResult[0]?.count || 0;

      // Add pagination
      const limit = Math.min(query.limit || 100, 1000); // Max 1000 per request
      const offset = query.offset || 0;
      values.push(limit, offset);

      // Add ORDER BY
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';
      const orderBy = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

      const logs = await sql.select<DebugLog>(
        `SELECT * FROM debug_logs 
         ${whereClause} 
         ${orderBy} 
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values,
        context.companyId
      );

      return {
        logs,
        total,
        hasMore: offset + logs.length < total
      };
    } catch (error) {
      logger.error('Failed to get debug logs', {
        error: error instanceof Error ? error.message : String(error),
        query,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Get debug sessions with pagination and filtering
   */
  async getSessions(query: DebugSessionQuery, context: DebugContext): Promise<{
    sessions: DebugSession[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (query.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(query.userId);
      }
      if (query.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(query.status);
      }
      if (query.environment) {
        conditions.push(`environment = $${paramIndex++}`);
        values.push(query.environment);
      }
      if (query.debugLevel) {
        conditions.push(`debug_level = $${paramIndex++}`);
        values.push(query.debugLevel);
      }
      if (query.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(query.startDate);
      }
      if (query.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(query.endDate);
      }

      // Add user context for RLS
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(context.userId);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await sql.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM debug_sessions ${whereClause}`,
        values,
        context.companyId
      );
      const total = countResult[0]?.count || 0;

      // Add pagination
      const limit = Math.min(query.limit || 50, 500); // Max 500 per request
      const offset = query.offset || 0;
      values.push(limit, offset);

      // Add ORDER BY
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';
      const orderBy = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

      const sessions = await sql.select<DebugSession>(
        `SELECT * FROM debug_sessions 
         ${whereClause} 
         ${orderBy} 
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values,
        context.companyId
      );

      return {
        sessions,
        total,
        hasMore: offset + sessions.length < total
      };
    } catch (error) {
      logger.error('Failed to get debug sessions', {
        error: error instanceof Error ? error.message : String(error),
        query,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Generate debug report for a session
   */
  async generateReport(sessionId: string, context: DebugContext): Promise<DebugReport | null> {
    try {
      // Call database function to generate report
      const reports = await sql.select<DebugReport>(
        `SELECT * FROM generate_debug_report($1)`,
        [sessionId],
        context.companyId
      );

      if (reports.length === 0) {
        return null;
      }

      const report = reports[0];

      logger.info('Debug report generated', {
        sessionId,
        reportId: report.id,
        userId: context.userId,
        companyId: context.companyId
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate debug report', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Get debug reports with pagination and filtering
   */
  async getReports(query: DebugReportQuery, context: DebugContext): Promise<{
    reports: DebugReport[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const conditions = [];
      const values = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (query.sessionId) {
        conditions.push(`session_id = $${paramIndex++}`);
        values.push(query.sessionId);
      }
      if (query.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(query.userId);
      }
      if (query.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(query.startDate);
      }
      if (query.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(query.endDate);
      }

      // Add user context for RLS
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(context.userId);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await sql.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM debug_reports ${whereClause}`,
        values,
        context.companyId
      );
      const total = countResult[0]?.count || 0;

      // Add pagination
      const limit = Math.min(query.limit || 50, 500); // Max 500 per request
      const offset = query.offset || 0;
      values.push(limit, offset);

      // Add ORDER BY
      const sortBy = query.sortBy || 'generatedAt';
      const sortOrder = query.sortOrder || 'desc';
      const orderBy = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;

      const reports = await sql.select<DebugReport>(
        `SELECT * FROM debug_reports 
         ${whereClause} 
         ${orderBy} 
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        values,
        context.companyId
      );

      return {
        reports,
        total,
        hasMore: offset + reports.length < total
      };
    } catch (error) {
      logger.error('Failed to get debug reports', {
        error: error instanceof Error ? error.message : String(error),
        query,
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Get debug statistics
   */
  async getStatistics(context: DebugContext): Promise<DebugStatistics> {
    try {
      // Get session statistics
      const sessionStats = await sql.select<{
        total_sessions: number;
        active_sessions: number;
        completed_sessions: number;
        expired_sessions: number;
        avg_session_duration: number;
      }>(
        `SELECT 
           COUNT(*) as total_sessions,
           COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
           COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_sessions,
           AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) as avg_session_duration
         FROM debug_sessions 
         WHERE user_id = $1`,
        [context.userId],
        context.companyId
      );

      // Get log statistics
      const logStats = await sql.select<{
        total_logs: number;
        logs_by_level: Record<string, number>;
        logs_by_category: Record<string, number>;
        avg_query_duration: number;
        max_query_duration: number;
        error_rate: number;
      }>(
        `SELECT 
           COUNT(*) as total_logs,
           jsonb_object_agg(level, level_count) as logs_by_level,
           jsonb_object_agg(category, category_count) as logs_by_category,
           AVG(query_duration_ms) as avg_query_duration,
           MAX(query_duration_ms) as max_query_duration,
           COUNT(CASE WHEN level = 'error' THEN 1 END)::float / COUNT(*) as error_rate
         FROM (
           SELECT 
             level,
             category,
             query_duration_ms,
             COUNT(*) as level_count,
             COUNT(*) as category_count
           FROM debug_logs 
           WHERE user_id = $1
           GROUP BY level, category, query_duration_ms
         ) AS grouped_logs`,
        [context.userId],
        context.companyId
      );

      // Get recent errors
      const recentErrors = await sql.select<{
        message: string;
        timestamp: Date;
        count: number;
      }>(
        `SELECT 
           message,
           created_at as timestamp,
           COUNT(*) as count
         FROM debug_logs 
         WHERE user_id = $1 AND level = 'error' 
           AND created_at > NOW() - INTERVAL '24 hours'
         GROUP BY message, created_at
         ORDER BY created_at DESC
         LIMIT 10`,
        [context.userId],
        context.companyId
      );

      const sessionStat = sessionStats[0] || {};
      const logStat = logStats[0] || {};

      return {
        totalSessions: sessionStat.total_sessions || 0,
        activeSessions: sessionStat.active_sessions || 0,
        completedSessions: sessionStat.completed_sessions || 0,
        expiredSessions: sessionStat.expired_sessions || 0,
        totalLogs: logStat.total_logs || 0,
        logsByLevel: logStat.logs_by_level || {},
        logsByCategory: logStat.logs_by_category || {},
        averageSessionDuration: sessionStat.avg_session_duration || 0,
        mostActiveCategories: Object.entries(logStat.logs_by_category || {})
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        recentErrors,
        performanceMetrics: {
          avgQueryDuration: logStat.avg_query_duration || 0,
          maxQueryDuration: logStat.max_query_duration || 0,
          errorRate: logStat.error_rate || 0,
          sessionDurationHours: sessionStat.avg_session_duration || 0
        }
      };
    } catch (error) {
      logger.error('Failed to get debug statistics', {
        error: error instanceof Error ? error.message : String(error),
        userId: context.userId
      });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await sql.execute(
        `SELECT expire_debug_sessions()`,
        [],
        undefined
      );

      logger.info('Expired debug sessions cleanup completed', {
        affectedSessions: result
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup expired debug sessions', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Clean up old debug data
   */
  async cleanupOldData(): Promise<number> {
    try {
      const result = await sql.execute(
        `SELECT cleanup_old_debug_data()`,
        [],
        undefined
      );

      logger.info('Debug data cleanup completed', {
        affectedRecords: result
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup old debug data', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Check if log level is allowed by session debug level
   */
  private isLogLevelAllowed(logLevel: DebugLevel, sessionLevel: DebugLevel): boolean {
    const levelHierarchy = {
      [DebugLevel.DEBUG]: 0,
      [DebugLevel.INFO]: 1,
      [DebugLevel.WARN]: 2,
      [DebugLevel.ERROR]: 3
    };

    return levelHierarchy[logLevel] >= levelHierarchy[sessionLevel];
  }

  /**
   * Redact sensitive data from object
   */
  private redactSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.redactSensitiveData(item));
    }

    const redacted: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        let redactedValue = value;
        for (const { pattern, replacement } of this.options.redactionPatterns) {
          redactedValue = redactedValue.replace(pattern, replacement);
        }
        redacted[key] = redactedValue;
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }

    return redacted;
  }

  /**
   * Get active debug session from cache
   */
  getActiveSession(sessionId: string): DebugSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Clear expired sessions from cache
   */
  clearExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.expiresAt < now || session.status !== DebugSessionStatus.ACTIVE) {
        this.activeSessions.delete(sessionId);
      }
    }
  }
}

// Export singleton instance
export const debugService = new DebugService();

// Export class for testing
export { DebugService as DebugServiceClass };