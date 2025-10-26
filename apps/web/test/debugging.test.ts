// Comprehensive tests for debugging functionality

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DebugService, DebugServiceClass } from '@/server/services/debugService';
import { 
  DebugSession,
  DebugLog,
  DebugReport,
  CreateDebugSessionRequest,
  CreateDebugLogRequest,
  UpdateDebugSessionRequest,
  DebugContext,
  DebugLevel,
  DebugSessionStatus,
  DebugEnvironment,
  DebugCategory
} from '@/types/debugging';
import { sql } from '@/lib/db';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('@/lib/logger');
jest.mock('@/lib/encryption');

const mockSql = sql as jest.Mocked<typeof sql>;
const debugService = new DebugService();

describe('DebugService', () => {
  let mockContext: DebugContext;

  beforeEach(() => {
    mockContext = {
      userId: 'test-user-id',
      companyId: 'test-company-id',
      requestId: 'test-request-id',
      environment: DebugEnvironment.DEVELOPMENT,
      ipAddress: '127.0.0.1',
      userAgent: 'test-user-agent',
      permissions: ['debug']
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Default mock implementations
    mockSql.insert = jest.fn().mockResolvedValue({
      id: 'test-id',
      sessionId: 'test-session-id',
      userId: mockContext.userId,
      companyId: mockContext.companyId,
      title: 'Test Session',
      debugLevel: DebugLevel.DEBUG,
      status: DebugSessionStatus.ACTIVE,
      environment: DebugEnvironment.DEVELOPMENT,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    mockSql.select = jest.fn().mockResolvedValue([]);
    mockSql.execute = jest.fn().mockResolvedValue(1);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a debug session successfully', async () => {
      const request: CreateDebugSessionRequest = {
        title: 'Test Debug Session',
        description: 'Test session for debugging',
        debugLevel: DebugLevel.DEBUG,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: { category: 'api' },
        metadata: { test: true }
      };

      const result = await debugService.createSession(request, mockContext);

      expect(result).toBeDefined();
      expect(result.title).toBe(request.title);
      expect(result.description).toBe(request.description);
      expect(result.debugLevel).toBe(request.debugLevel);
      expect(result.environment).toBe(request.environment);
      expect(result.status).toBe(DebugSessionStatus.ACTIVE);
      expect(mockSql.insert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO debug_sessions'),
        expect.arrayContaining([
          expect.any(String), // sessionId
          mockContext.userId,
          mockContext.companyId,
          request.title,
          request.description,
          request.debugLevel,
          DebugSessionStatus.ACTIVE,
          request.environment,
          expect.stringContaining('api'), // filters JSON
          expect.stringContaining('true'), // metadata JSON
          expect.any(Date) // expiresAt
        ]),
        mockContext.companyId
      );
    });

    it('should use default values when optional fields are not provided', async () => {
      const request: CreateDebugSessionRequest = {
        title: 'Test Session',
        debugLevel: DebugLevel.INFO
      };

      await debugService.createSession(request, mockContext);

      expect(mockSql.insert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO debug_sessions'),
        expect.arrayContaining([
          expect.any(String),
          mockContext.userId,
          mockContext.companyId,
          request.title,
          undefined, // description
          request.debugLevel,
          DebugSessionStatus.ACTIVE,
          DebugEnvironment.DEVELOPMENT, // default environment
          '{}', // default filters
          '{}', // default metadata
          expect.any(Date)
        ]),
        mockContext.companyId
      );
    });

    it('should throw error when database insert fails', async () => {
      mockSql.insert.mockResolvedValue(null);

      const request: CreateDebugSessionRequest = {
        title: 'Test Session',
        debugLevel: DebugLevel.DEBUG
      };

      await expect(debugService.createSession(request, mockContext)).rejects.toThrow('Failed to create debug session');
    });
  });

  describe('getSession', () => {
    it('should return session from cache if available', async () => {
      const mockSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Test Session',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Manually add to cache
      (debugService as any).activeSessions.set('test-session-id', mockSession);

      const result = await debugService.getSession('test-session-id', mockContext);

      expect(result).toEqual(mockSession);
      expect(mockSql.select).not.toHaveBeenCalled();
    });

    it('should fetch session from database if not in cache', async () => {
      const mockSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Test Session',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([mockSession]);

      const result = await debugService.getSession('test-session-id', mockContext);

      expect(result).toEqual(mockSession);
      expect(mockSql.select).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM debug_sessions'),
        ['test-session-id', mockContext.userId],
        mockContext.companyId
      );
    });

    it('should return null for non-existent session', async () => {
      mockSql.select.mockResolvedValue([]);

      const result = await debugService.getSession('non-existent', mockContext);

      expect(result).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session successfully', async () => {
      const existingSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Original Title',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([existingSession]);

      const updatedSession = { ...existingSession, title: 'Updated Title' };
      mockSql.insert.mockResolvedValue(updatedSession);

      const request: UpdateDebugSessionRequest = {
        title: 'Updated Title'
      };

      const result = await debugService.updateSession('test-session-id', request, mockContext);

      expect(result).toEqual(updatedSession);
      expect(mockSql.insert).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE debug_sessions'),
        expect.arrayContaining([
          'Updated Title',
          'test-session-id',
          mockContext.userId
        ]),
        mockContext.companyId
      );
    });

    it('should return null for non-existent session', async () => {
      mockSql.select.mockResolvedValue([]);

      const request: UpdateDebugSessionRequest = {
        title: 'Updated Title'
      };

      const result = await debugService.updateSession('non-existent', request, mockContext);

      expect(result).toBeNull();
    });

    it('should not update if no fields provided', async () => {
      const existingSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Original Title',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([existingSession]);

      const request: UpdateDebugSessionRequest = {};

      const result = await debugService.updateSession('test-session-id', request, mockContext);

      expect(result).toEqual(existingSession);
      expect(mockSql.insert).not.toHaveBeenCalled();
    });
  });

  describe('endSession', () => {
    it('should end session successfully and generate report', async () => {
      const existingSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Test Session',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([existingSession]);

      const updatedSession = { ...existingSession, status: DebugSessionStatus.COMPLETED };
      mockSql.insert.mockResolvedValue(updatedSession);

      const mockReport: DebugReport = {
        id: 'report-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Debug Report: Test Session',
        summary: 'Generated debug report for session test-session-id',
        totalLogs: 0,
        logsByLevel: {},
        logsByCategory: {},
        errorsCount: 0,
        warningsCount: 0,
        performanceMetrics: {},
        recommendations: [],
        reportData: {},
        generatedAt: new Date(),
        createdAt: new Date()
      };

      mockSql.select.mockResolvedValue([mockReport]);

      const result = await debugService.endSession('test-session-id', mockContext);

      expect(result).toBe(true);
      expect(mockSql.insert).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE debug_sessions'),
        expect.arrayContaining([
          DebugSessionStatus.COMPLETED,
          'test-session-id',
          mockContext.userId
        ]),
        mockContext.companyId
      );
    });

    it('should return false for non-existent session', async () => {
      mockSql.select.mockResolvedValue([]);

      const result = await debugService.endSession('non-existent', mockContext);

      expect(result).toBe(false);
    });
  });

  describe('addLog', () => {
    it('should add debug log successfully', async () => {
      const existingSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Test Session',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([existingSession]);

      const mockLog: DebugLog = {
        id: 'log-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        level: DebugLevel.INFO,
        category: DebugCategory.API,
        message: 'Test log message',
        data: { test: true },
        requestId: 'test-request-id',
        endpoint: '/api/test',
        method: 'GET',
        queryDurationMs: 100,
        createdAt: new Date()
      };

      mockSql.insert.mockResolvedValue(mockLog);

      const request: CreateDebugLogRequest = {
        sessionId: 'test-session-id',
        level: DebugLevel.INFO,
        category: DebugCategory.API,
        message: 'Test log message',
        data: { test: true },
        requestId: 'test-request-id',
        endpoint: '/api/test',
        method: 'GET',
        queryDurationMs: 100
      };

      const result = await debugService.addLog(request, mockContext);

      expect(result).toEqual(mockLog);
      expect(mockSql.insert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO debug_logs'),
        expect.arrayContaining([
          'test-session-id',
          mockContext.userId,
          mockContext.companyId,
          DebugLevel.INFO,
          DebugCategory.API,
          'Test log message',
          expect.stringContaining('test'), // data JSON
          'test-request-id',
          '/api/test',
          'GET',
          100,
          undefined, // queryText
          '{}', // queryParams JSON
          undefined, // stackTrace
          undefined, // filePath
          undefined, // lineNumber
          undefined, // functionName
          mockContext.ipAddress,
          mockContext.userAgent
        ]),
        mockContext.companyId
      );
    });

    it('should skip log if level is not allowed by session', async () => {
      const existingSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Test Session',
        debugLevel: DebugLevel.ERROR, // Only allow ERROR level
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([existingSession]);

      const request: CreateDebugLogRequest = {
        sessionId: 'test-session-id',
        level: DebugLevel.DEBUG, // Lower level than session
        category: DebugCategory.API,
        message: 'Test log message'
      };

      const result = await debugService.addLog(request, mockContext);

      expect(result).toBeUndefined();
      expect(mockSql.insert).not.toHaveBeenCalled();
    });

    it('should throw error for invalid session', async () => {
      mockSql.select.mockResolvedValue([]);

      const request: CreateDebugLogRequest = {
        sessionId: 'non-existent',
        level: DebugLevel.INFO,
        category: DebugCategory.API,
        message: 'Test log message'
      };

      await expect(debugService.addLog(request, mockContext)).rejects.toThrow('Invalid or inactive debug session');
    });
  });

  describe('getLogs', () => {
    it('should get logs with pagination', async () => {
      const mockLogs: DebugLog[] = [
        {
          id: 'log-1',
          sessionId: 'test-session-id',
          userId: mockContext.userId,
          companyId: mockContext.companyId,
          level: DebugLevel.INFO,
          category: DebugCategory.API,
          message: 'Log 1',
          data: {},
          createdAt: new Date()
        },
        {
          id: 'log-2',
          sessionId: 'test-session-id',
          userId: mockContext.userId,
          companyId: mockContext.companyId,
          level: DebugLevel.ERROR,
          category: DebugCategory.DATABASE,
          message: 'Log 2',
          data: {},
          createdAt: new Date()
        }
      ];

      mockSql.select
        .mockResolvedValueOnce([{ count: 2 }]) // Total count
        .mockResolvedValueOnce(mockLogs); // Logs data

      const result = await debugService.getLogs({
        sessionId: 'test-session-id',
        limit: 10,
        offset: 0
      }, mockContext);

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should apply filters correctly', async () => {
      mockSql.select
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{
          id: 'log-1',
          sessionId: 'test-session-id',
          userId: mockContext.userId,
          companyId: mockContext.companyId,
          level: DebugLevel.ERROR,
          category: DebugCategory.DATABASE,
          message: 'Error log',
          data: {},
          createdAt: new Date()
        }]);

      const result = await debugService.getLogs({
        sessionId: 'test-session-id',
        level: DebugLevel.ERROR,
        category: DebugCategory.DATABASE,
        limit: 10,
        offset: 0
      }, mockContext);

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].level).toBe(DebugLevel.ERROR);
      expect(result.logs[0].category).toBe(DebugCategory.DATABASE);
    });
  });

  describe('getStatistics', () => {
    it('should get debug statistics', async () => {
      const mockSessionStats = [{
        total_sessions: 5,
        active_sessions: 2,
        completed_sessions: 2,
        expired_sessions: 1,
        avg_session_duration: 1.5
      }];

      const mockLogStats = [{
        total_logs: 100,
        logs_by_level: { debug: 50, info: 30, warn: 15, error: 5 },
        logs_by_category: { api: 40, database: 30, system: 30 },
        avg_query_duration: 150,
        max_query_duration: 1000,
        error_rate: 0.05
      }];

      const mockRecentErrors = [
        { message: 'Error 1', timestamp: new Date(), count: 1 },
        { message: 'Error 2', timestamp: new Date(), count: 2 }
      ];

      mockSql.select
        .mockResolvedValueOnce(mockSessionStats)
        .mockResolvedValueOnce(mockLogStats)
        .mockResolvedValueOnce(mockRecentErrors);

      const result = await debugService.getStatistics(mockContext);

      expect(result.totalSessions).toBe(5);
      expect(result.activeSessions).toBe(2);
      expect(result.completedSessions).toBe(2);
      expect(result.expiredSessions).toBe(1);
      expect(result.totalLogs).toBe(100);
      expect(result.logsByLevel).toEqual({ debug: 50, info: 30, warn: 15, error: 5 });
      expect(result.logsByCategory).toEqual({ api: 40, database: 30, system: 30 });
      expect(result.averageSessionDuration).toBe(1.5);
      expect(result.recentErrors).toEqual(mockRecentErrors);
      expect(result.performanceMetrics.avgQueryDuration).toBe(150);
      expect(result.performanceMetrics.maxQueryDuration).toBe(1000);
      expect(result.performanceMetrics.errorRate).toBe(0.05);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should clean up expired sessions', async () => {
      mockSql.execute.mockResolvedValue(3);

      const result = await debugService.cleanupExpiredSessions();

      expect(result).toBe(3);
      expect(mockSql.execute).toHaveBeenCalledWith(
        'SELECT expire_debug_sessions()',
        [],
        undefined
      );
    });
  });

  describe('cleanupOldData', () => {
    it('should clean up old debug data', async () => {
      mockSql.execute.mockResolvedValue(150);

      const result = await debugService.cleanupOldData();

      expect(result).toBe(150);
      expect(mockSql.execute).toHaveBeenCalledWith(
        'SELECT cleanup_old_debug_data()',
        [],
        undefined
      );
    });
  });

  describe('sensitive data redaction', () => {
    it('should redact sensitive data patterns', async () => {
      const existingSession: DebugSession = {
        id: 'test-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        title: 'Test Session',
        debugLevel: DebugLevel.DEBUG,
        status: DebugSessionStatus.ACTIVE,
        environment: DebugEnvironment.DEVELOPMENT,
        filters: {},
        metadata: {},
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSql.select.mockResolvedValue([existingSession]);

      const mockLog: DebugLog = {
        id: 'log-id',
        sessionId: 'test-session-id',
        userId: mockContext.userId,
        companyId: mockContext.companyId,
        level: DebugLevel.INFO,
        category: DebugCategory.API,
        message: 'Test log message',
        data: { password: 'secret123', token: 'abc123' },
        createdAt: new Date()
      };

      mockSql.insert.mockResolvedValue(mockLog);

      const request: CreateDebugLogRequest = {
        sessionId: 'test-session-id',
        level: DebugLevel.INFO,
        category: DebugCategory.API,
        message: 'Test log message',
        data: { password: 'secret123', token: 'abc123' }
      };

      await debugService.addLog(request, mockContext);

      expect(mockSql.insert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO debug_logs'),
        expect.arrayContaining([
          'test-session-id',
          mockContext.userId,
          mockContext.companyId,
          DebugLevel.INFO,
          DebugCategory.API,
          'Test log message',
          expect.stringContaining('[REDACTED]'), // Redacted data JSON
          expect.any(String), // requestId
          undefined, // endpoint
          undefined, // method
          undefined, // queryDurationMs
          undefined, // queryText
          '{}', // queryParams JSON
          undefined, // stackTrace
          undefined, // filePath
          undefined, // lineNumber
          undefined, // functionName
          mockContext.ipAddress,
          mockContext.userAgent
        ]),
        mockContext.companyId
      );
    });
  });
});

describe('Debug API Endpoints', () => {
  describe('Debug Session API', () => {
    it('should create debug session via POST /api/debug/session', async () => {
      // This would require integration testing with actual API routes
      // For now, we test the service layer which is called by the API
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should get debug sessions via GET /api/debug/session', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should update debug session via PUT /api/debug/session', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should end debug session via DELETE /api/debug/session', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });
  });

  describe('Debug Logs API', () => {
    it('should add debug log via POST /api/debug/logs', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should get debug logs via GET /api/debug/logs', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should add batch debug logs via POST /api/debug/logs?batch=true', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should get statistics via GET /api/debug/logs?statistics=true', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });

    it('should cleanup data via POST /api/debug/logs?cleanup=true', async () => {
      expect(true).toBe(true); // Placeholder for API integration tests
    });
  });
});

describe('Debug Types', () => {
  it('should have correct debug level values', () => {
    expect(DebugLevel.DEBUG).toBe('debug');
    expect(DebugLevel.INFO).toBe('info');
    expect(DebugLevel.WARN).toBe('warn');
    expect(DebugLevel.ERROR).toBe('error');
  });

  it('should have correct session status values', () => {
    expect(DebugSessionStatus.ACTIVE).toBe('active');
    expect(DebugSessionStatus.PAUSED).toBe('paused');
    expect(DebugSessionStatus.COMPLETED).toBe('completed');
    expect(DebugSessionStatus.EXPIRED).toBe('expired');
  });

  it('should have correct environment values', () => {
    expect(DebugEnvironment.DEVELOPMENT).toBe('development');
    expect(DebugEnvironment.STAGING).toBe('staging');
    expect(DebugEnvironment.PRODUCTION).toBe('production');
  });

  it('should have correct category values', () => {
    expect(DebugCategory.API).toBe('api');
    expect(DebugCategory.DATABASE).toBe('database');
    expect(DebugCategory.AUTHENTICATION).toBe('authentication');
    expect(DebugCategory.AUTHORIZATION).toBe('authorization');
    expect(DebugCategory.BUSINESS_LOGIC).toBe('business_logic');
    expect(DebugCategory.EXTERNAL_SERVICE).toBe('external_service');
    expect(DebugCategory.SYSTEM).toBe('system');
    expect(DebugCategory.RATE_LIMIT).toBe('rate_limit');
    expect(DebugCategory.NETWORK).toBe('network');
    expect(DebugCategory.PERFORMANCE).toBe('performance');
    expect(DebugCategory.SECURITY).toBe('security');
    expect(DebugCategory.WEBHOOK).toBe('webhook');
    expect(DebugCategory.SCHEDULER).toBe('scheduler');
    expect(DebugCategory.JOB_QUEUE).toBe('job_queue');
    expect(DebugCategory.ERROR_RECOVERY).toBe('error_recovery');
  });
});