// Data Export Functionality Tests
// Comprehensive test suite for GDPR data export functionality

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { initDb, closeDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  createExportRequest,
  listExportRequests,
  getExportRequest,
  getExportFile,
  deleteExportRequest,
  checkExportRateLimit,
  cleanupExpiredExports,
  validateExportRequest,
  DataExportError,
  ExportFormat,
  ExportStatus,
  ExportDataType,
  CompressionType
} from '@/server/services/dataExport';

// Mock data for testing
const mockUserId = 'test-user-123';
const mockCompanyId = 'test-company-456';
const mockRequestId = 'test-request-789';

describe('Data Export Service', () => {
  beforeEach(async () => {
    // Initialize test database
    await initDb();
    
    // Clean up any existing test data
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await cleanupTestData();
  });

  describe('validateExportRequest', () => {
    it('should validate a correct export request', () => {
      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.CASES, ExportDataType.EVENTS],
        date_range_start: new Date('2024-01-01'),
        date_range_end: new Date('2024-01-31'),
        metadata: { test: true }
      };

      const result = validateExportRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid export format', () => {
      const request = {
        export_format: 'invalid' as ExportFormat,
        data_types: [ExportDataType.CASES],
        metadata: {}
      };

      const result = validateExportRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid export format: invalid');
    });

    it('should reject empty data types', () => {
      const request = {
        export_format: ExportFormat.JSON,
        data_types: [],
        metadata: {}
      };

      const result = validateExportRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one data type must be specified');
    });

    it('should reject invalid date range', () => {
      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.CASES],
        date_range_start: new Date('2024-01-31'),
        date_range_end: new Date('2024-01-01'),
        metadata: {}
      };

      const result = validateExportRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Date range start must be before end date');
    });

    it('should reject date range exceeding limit', () => {
      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.CASES],
        date_range_start: new Date('2024-01-01'),
        date_range_end: new Date('2025-01-02'), // More than 1 year
        metadata: {}
      };

      const result = validateExportRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Date range cannot exceed 365 days');
    });

    it('should generate warnings for large data exports', () => {
      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.EVENTS],
        metadata: {}
      };

      const result = validateExportRequest(request);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Events export may contain large amounts of data');
    });
  });

  describe('checkExportRateLimit', () => {
    it('should allow request when no previous requests exist', async () => {
      const result = await checkExportRateLimit(mockUserId, mockCompanyId);

      expect(result.can_request).toBe(true);
      expect(result.existing_request_count).toBe(0);
      expect(result.next_allowed_at).toBeUndefined();
    });

    it('should deny request when pending request exists', async () => {
      // Create a pending export request
      await createMockExportRequest({
        status: ExportStatus.PENDING,
        user_id: mockUserId,
        company_id: mockCompanyId
      });

      const result = await checkExportRateLimit(mockUserId, mockCompanyId);

      expect(result.can_request).toBe(false);
      expect(result.next_allowed_at).toBeDefined();
    });

    it('should deny request when recent completed request exists', async () => {
      // Create a completed export request from 1 hour ago
      await createMockExportRequest({
        status: ExportStatus.COMPLETED,
        user_id: mockUserId,
        company_id: mockCompanyId,
        requested_at: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      });

      const result = await checkExportRateLimit(mockUserId, mockCompanyId);

      expect(result.can_request).toBe(true); // Should allow since it's more than 24 hours
      
      // Create a completed export request from 1 hour ago
      await createMockExportRequest({
        status: ExportStatus.COMPLETED,
        user_id: mockUserId,
        company_id: mockCompanyId,
        requested_at: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
      });

      const result2 = await checkExportRateLimit(mockUserId, mockCompanyId);

      expect(result2.can_request).toBe(false); // Should deny since it's less than 24 hours
      expect(result2.next_allowed_at).toBeDefined();
    });
  });

  describe('createExportRequest', () => {
    it('should create a valid export request', async () => {
      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.CASES],
        metadata: { test: true }
      };

      const result = await createExportRequest(
        mockUserId,
        mockCompanyId,
        request,
        '127.0.0.1',
        'test-user-agent'
      );

      expect(result.request_id).toBeDefined();
      expect(result.status).toBe(ExportStatus.PENDING);
      expect(result.message).toContain('Export request created successfully');

      // Verify request was created in database
      const exportRequest = await getExportRequest(result.request_id, mockUserId, mockCompanyId);
      expect(exportRequest).toBeTruthy();
      expect(exportRequest?.export_format).toBe(ExportFormat.JSON);
      expect(exportRequest?.data_types).toEqual([ExportDataType.CASES]);
    });

    it('should reject request when rate limited', async () => {
      // Create a pending export request first
      await createMockExportRequest({
        status: ExportStatus.PENDING,
        user_id: mockUserId,
        company_id: mockCompanyId
      });

      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.CASES],
        metadata: {}
      };

      await expect(
        createExportRequest(mockUserId, mockCompanyId, request)
      ).rejects.toThrow(DataExportError);

      try {
        await createExportRequest(mockUserId, mockCompanyId, request);
      } catch (error) {
        expect(error).toBeInstanceOf(DataExportError);
        expect((error as DataExportError).code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });

    it('should reject invalid request', async () => {
      const request = {
        export_format: 'invalid' as ExportFormat,
        data_types: [ExportDataType.CASES],
        metadata: {}
      };

      await expect(
        createExportRequest(mockUserId, mockCompanyId, request)
      ).rejects.toThrow(DataExportError);

      try {
        await createExportRequest(mockUserId, mockCompanyId, request);
      } catch (error) {
        expect(error).toBeInstanceOf(DataExportError);
        expect((error as DataExportError).code).toBe('INVALID_REQUEST');
      }
    });
  });

  describe('listExportRequests', () => {
    it('should list export requests for user', async () => {
      // Create test export requests
      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.PENDING
      });

      const result = await listExportRequests(mockUserId, mockCompanyId);

      expect(result.requests).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should paginate results correctly', async () => {
      // Create multiple test export requests
      for (let i = 0; i < 15; i++) {
        await createMockExportRequest({
          user_id: mockUserId,
          company_id: mockCompanyId,
          status: ExportStatus.COMPLETED
        });
      }

      const result = await listExportRequests(mockUserId, mockCompanyId, 10, 5);

      expect(result.requests).toHaveLength(10);
      expect(result.total).toBe(15);
      expect(result.page).toBe(1); // (5 / 10) + 1 = 1
      expect(result.limit).toBe(10);
    });

    it('should only return requests for specific user', async () => {
      // Create export requests for different users
      await createMockExportRequest({
        user_id: 'other-user',
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      const result = await listExportRequests(mockUserId, mockCompanyId);

      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].user_id).toBe(mockUserId);
    });
  });

  describe('getExportRequest', () => {
    it('should return export request when found', async () => {
      const createdRequest = await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      const result = await getExportRequest(
        createdRequest.id,
        mockUserId,
        mockCompanyId
      );

      expect(result).toBeTruthy();
      expect(result?.id).toBe(createdRequest.id);
      expect(result?.user_id).toBe(mockUserId);
      expect(result?.company_id).toBe(mockCompanyId);
    });

    it('should return null when not found', async () => {
      const result = await getExportRequest(
        'non-existent-id',
        mockUserId,
        mockCompanyId
      );

      expect(result).toBeNull();
    });

    it('should return null for wrong user', async () => {
      const createdRequest = await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      const result = await getExportRequest(
        createdRequest.id,
        'wrong-user',
        mockCompanyId
      );

      expect(result).toBeNull();
    });

    it('should return null for wrong company', async () => {
      const createdRequest = await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      const result = await getExportRequest(
        createdRequest.id,
        mockUserId,
        'wrong-company'
      );

      expect(result).toBeNull();
    });
  });

  describe('deleteExportRequest', () => {
    it('should delete export request when authorized', async () => {
      const createdRequest = await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      const result = await deleteExportRequest(
        createdRequest.id,
        mockUserId,
        mockCompanyId
      );

      expect(result).toBe(true);

      // Verify request is deleted
      const deletedRequest = await getExportRequest(
        createdRequest.id,
        mockUserId,
        mockCompanyId
      );

      expect(deletedRequest).toBeNull();
    });

    it('should return false when request not found', async () => {
      const result = await deleteExportRequest(
        'non-existent-id',
        mockUserId,
        mockCompanyId
      );

      expect(result).toBe(false);
    });

    it('should return false when not authorized', async () => {
      const createdRequest = await createMockExportRequest({
        user_id: 'other-user',
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      const result = await deleteExportRequest(
        createdRequest.id,
        mockUserId,
        mockCompanyId
      );

      expect(result).toBe(false);

      // Verify original request still exists
      const originalRequest = await getExportRequest(
        createdRequest.id,
        'other-user',
        mockCompanyId
      );

      expect(originalRequest).toBeTruthy();
    });
  });

  describe('cleanupExpiredExports', () => {
    it('should clean up expired exports', async () => {
      // Create expired export requests
      const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED,
        expires_at: expiredDate
      });

      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.PENDING,
        expires_at: expiredDate
      });

      const result = await cleanupExpiredExports();

      expect(result.deleted_requests).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should not affect non-expired exports', async () => {
      // Create non-expired export requests
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now
      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED,
        expires_at: futureDate
      });

      const result = await cleanupExpiredExports();

      expect(result.deleted_requests).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error by closing connection
      await closeDb();

      const request = {
        export_format: ExportFormat.JSON,
        data_types: [ExportDataType.CASES],
        metadata: {}
      };

      await expect(
        createExportRequest(mockUserId, mockCompanyId, request)
      ).rejects.toThrow(DataExportError);

      try {
        await createExportRequest(mockUserId, mockCompanyId, request);
      } catch (error) {
        expect(error).toBeInstanceOf(DataExportError);
        expect((error as DataExportError).category).toBe('system');
        expect((error as DataExportError).retryable).toBe(true);
      }

      // Reinitialize for subsequent tests
      await initDb();
    });

    it('should handle validation errors with details', async () => {
      const request = {
        export_format: 'invalid' as ExportFormat,
        data_types: [],
        metadata: {}
      };

      try {
        await createExportRequest(mockUserId, mockCompanyId, request);
      } catch (error) {
        expect(error).toBeInstanceOf(DataExportError);
        expect((error as DataExportError).code).toBe('INVALID_REQUEST');
        expect((error as DataExportError).details).toBeDefined();
        expect((error as DataExportError).details.errors).toBeDefined();
      }
    });
  });

  describe('Security and Compliance', () => {
    it('should enforce rate limiting for export requests', async () => {
      // Create first request
      await createMockExportRequest({
        user_id: mockUserId,
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED,
        requested_at: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
      });

      // First request should be denied (less than 24 hours)
      const rateLimit1 = await checkExportRateLimit(mockUserId, mockCompanyId);
      expect(rateLimit1.can_request).toBe(false);

      // Second request should also be denied
      const rateLimit2 = await checkExportRateLimit(mockUserId, mockCompanyId);
      expect(rateLimit2.can_request).toBe(false);
    });

    it('should respect user isolation', async () => {
      // Create requests for different users
      await createMockExportRequest({
        user_id: 'user1',
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      await createMockExportRequest({
        user_id: 'user2',
        company_id: mockCompanyId,
        status: ExportStatus.COMPLETED
      });

      // Each user should only see their own requests
      const user1Requests = await listExportRequests('user1', mockCompanyId);
      const user2Requests = await listExportRequests('user2', mockCompanyId);

      expect(user1Requests.requests).toHaveLength(1);
      expect(user2Requests.requests).toHaveLength(1);
      expect(user1Requests.requests[0].user_id).toBe('user1');
      expect(user2Requests.requests[0].user_id).toBe('user2');
    });

    it('should enforce company isolation', async () => {
      // Create requests for different companies
      await createMockExportRequest({
        user_id: mockUserId,
        company_id: 'company1',
        status: ExportStatus.COMPLETED
      });

      await createMockExportRequest({
        user_id: mockUserId,
        company_id: 'company2',
        status: ExportStatus.COMPLETED
      });

      // Each company should only see their own requests
      const company1Requests = await listExportRequests(mockUserId, 'company1');
      const company2Requests = await listExportRequests(mockUserId, 'company2');

      expect(company1Requests.requests).toHaveLength(1);
      expect(company2Requests.requests).toHaveLength(1);
      expect(company1Requests.requests[0].company_id).toBe('company1');
      expect(company2Requests.requests[0].company_id).toBe('company2');
    });
  });
});

// Helper functions for testing
async function createMockExportRequest(overrides: any = {}) {
  const defaultRequest = {
    id: mockRequestId + Math.random().toString(36).substr(2, 9),
    user_id: mockUserId,
    company_id: mockCompanyId,
    export_format: ExportFormat.JSON,
    data_types: [ExportDataType.CASES],
    status: ExportStatus.PENDING,
    requested_at: new Date(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    metadata: {}
  };

  const request = { ...defaultRequest, ...overrides };

  await sql.execute(`
    INSERT INTO data_export_requests (
      id, user_id, company_id, export_format, data_types,
      status, requested_at, expires_at, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
  `, [
    request.id,
    request.user_id,
    request.company_id,
    request.export_format,
    request.data_types,
    request.status,
    request.requested_at,
    request.expires_at,
    JSON.stringify(request.metadata)
  ]);

  return request;
}

async function cleanupTestData() {
  try {
    await sql.execute('DELETE FROM data_export_requests WHERE user_id LIKE $1', [`${mockUserId}%`]);
    await sql.execute('DELETE FROM data_export_files WHERE export_request_id IN (SELECT id FROM data_export_requests WHERE user_id LIKE $1)', [`${mockUserId}%`]);
    await sql.execute('DELETE FROM data_export_audit_log WHERE export_request_id IN (SELECT id FROM data_export_requests WHERE user_id LIKE $1)', [`${mockUserId}%`]);
  } catch (error) {
    logger.error('Failed to cleanup test data', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}