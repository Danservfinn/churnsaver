// User Deletion Tests
// Comprehensive tests for GDPR "right to be forgotten" functionality

import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { userDeletionService } from '@/server/services/userDeletion';
import {
  UserDeletionStatus,
  UserDeletionErrorType,
  createUserDeletionError,
  DEFAULT_USER_DELETION_OPTIONS
} from '@/types/userDeletion';
import type {
  UserDeletionRequest,
  DeletedUser,
  CreateUserDeletionRequestInput,
  DeletionDataSummary
} from '@/types/userDeletion';

// Mock logger to avoid console output in tests
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    security: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock encryption
jest.mock('@/lib/encryption', () => ({
  encrypt: jest.fn().mockResolvedValue('encrypted_data'),
  decrypt: jest.fn().mockResolvedValue('decrypted_data')
}));

describe('User Deletion Service', () => {
  const testUserId = 'test_user_123';
  const testCompanyId = 'test_company_456';
  const testRequestId = 'test_request_789';

  beforeEach(async () => {
    // Clean up test data before each test
    await cleanupTestData();
    
    // Set up test user and company data
    await setupTestData();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTestData();
  });

  describe('canRequestDeletion', () => {
    it('should allow deletion request for new user', async () => {
      const result = await userDeletionService.canRequestDeletion(testUserId, testCompanyId);
      
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.existingRequest).toBeUndefined();
    });

    it('should deny deletion request when user has pending request', async () => {
      // Create a pending deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      const result = await userDeletionService.canRequestDeletion(testUserId, testCompanyId);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Deletion request already in progress');
      expect(result.existingRequest).toBeDefined();
      expect(result.existingRequest?.status).toBe('pending');
    });

    it('should deny deletion request when user has processing request', async () => {
      // Create a processing deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'processing']
      );

      const result = await userDeletionService.canRequestDeletion(testUserId, testCompanyId);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Deletion request already in progress');
    });

    it('should deny deletion request within 24 hours of completed request', async () => {
      // Create a completed deletion request within last 24 hours
      const recentTime = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status, requested_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testRequestId, testUserId, testCompanyId, true, 'completed', recentTime, recentTime]
      );

      const result = await userDeletionService.canRequestDeletion(testUserId, testCompanyId);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded: Only 1 deletion request per 24 hours');
    });

    it('should allow deletion request after 24 hours of completed request', async () => {
      // Create a completed deletion request more than 24 hours ago
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status, requested_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testRequestId, testUserId, testCompanyId, true, 'completed', oldTime, oldTime]
      );

      const result = await userDeletionService.canRequestDeletion(testUserId, testCompanyId);
      
      expect(result.allowed).toBe(true);
    });
  });

  describe('createDeletionRequest', () => {
    it('should create deletion request with valid input', async () => {
      const input: CreateUserDeletionRequestInput = {
        userId: testUserId,
        companyId: testCompanyId,
        consentGiven: true,
        requestIp: '192.168.1.1',
        userAgent: 'Test Browser',
        metadata: { reason: 'Test deletion' }
      };

      const result = await userDeletionService.createDeletionRequest(input);
      
      expect(result).toBeDefined();
      expect(result.userId).toBe(testUserId);
      expect(result.companyId).toBe(testCompanyId);
      expect(result.consentGiven).toBe(true);
      expect(result.status).toBe('pending');
      expect(result.requestIp).toBe('192.168.1.1');
      expect(result.userAgent).toBe('Test Browser');
      expect(result.metadata).toEqual({ reason: 'Test deletion' });
    });

    it('should throw error for missing consent', async () => {
      const input: CreateUserDeletionRequestInput = {
        userId: testUserId,
        companyId: testCompanyId,
        consentGiven: false
      };

      await expect(userDeletionService.createDeletionRequest(input))
        .rejects.toThrow('Explicit consent is required for data deletion');
    });

    it('should throw error for missing user ID', async () => {
      const input: CreateUserDeletionRequestInput = {
        userId: '',
        companyId: testCompanyId,
        consentGiven: true
      };

      await expect(userDeletionService.createDeletionRequest(input))
        .rejects.toThrow('User ID is required');
    });

    it('should throw error for missing company ID', async () => {
      const input: CreateUserDeletionRequestInput = {
        userId: testUserId,
        companyId: '',
        consentGiven: true
      };

      await expect(userDeletionService.createDeletionRequest(input))
        .rejects.toThrow('Company ID is required');
    });

    it('should throw error when rate limited', async () => {
      // Create existing pending request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      const input: CreateUserDeletionRequestInput = {
        userId: testUserId,
        companyId: testCompanyId,
        consentGiven: true
      };

      await expect(userDeletionService.createDeletionRequest(input))
        .rejects.toThrow('Deletion request already in progress');
    });
  });

  describe('getDeletionRequest', () => {
    it('should return deletion request by ID', async () => {
      // Create a deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      const result = await userDeletionService.getDeletionRequest(testRequestId);
      
      expect(result).toBeDefined();
      expect(result?.id).toBe(testRequestId);
      expect(result?.userId).toBe(testUserId);
      expect(result?.companyId).toBe(testCompanyId);
      expect(result?.status).toBe('pending');
    });

    it('should return null for non-existent request', async () => {
      const result = await userDeletionService.getDeletionRequest('non_existent_id');
      
      expect(result).toBeNull();
    });
  });

  describe('getUserDeletionRequests', () => {
    it('should return all deletion requests for user', async () => {
      // Create multiple deletion requests
      const requestIds = ['req1', 'req2', 'req3'];
      for (const requestId of requestIds) {
        await sql.execute(
          `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status, requested_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
          [requestId, testUserId, testCompanyId, true, 'completed', new Date()]
        );
      }

      const results = await userDeletionService.getUserDeletionRequests(testUserId, testCompanyId);
      
      expect(results).toHaveLength(3);
      expect(results.map(r => r.id)).toEqual(expect.arrayContaining(requestIds));
      expect(results[0].userId).toBe(testUserId);
      expect(results[0].companyId).toBe(testCompanyId);
    });

    it('should return empty array for user with no requests', async () => {
      const results = await userDeletionService.getUserDeletionRequests('no_requests_user', testCompanyId);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('deleteUserData', () => {
    beforeEach(async () => {
      // Set up test data for deletion
      await sql.execute(
        `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
        ['case1', testCompanyId, 'membership1', testUserId, new Date(), 'open']
      );

      await sql.execute(
        `INSERT INTO events (id, whop_event_id, type, membership_id, user_id, company_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['event1', 'whop_event_1', 'payment_failed', 'membership1', testUserId, testCompanyId, '{}']
      );

      await sql.execute(
        `INSERT INTO recovery_actions (id, company_id, case_id, membership_id, user_id, type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
        ['action1', testCompanyId, 'case1', 'membership1', testUserId, 'nudge_push']
      );
    });

    it('should delete all user data successfully', async () => {
      const result = await userDeletionService.deleteUserData(testUserId, testCompanyId);
      
      expect(result.success).toBe(true);
      expect(result.deletedRecords).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
      expect(result.dataSummary.recoveryCasesCount).toBe(1);
      expect(result.dataSummary.eventsCount).toBe(1);
      expect(result.dataSummary.recoveryActionsCount).toBe(1);
      expect(result.dataSummary.deletedTables).toContain('recovery_cases');
      expect(result.dataSummary.deletedTables).toContain('events');
      expect(result.dataSummary.deletedTables).toContain('recovery_actions');
    });

    it('should handle deletion with no data', async () => {
      const result = await userDeletionService.deleteUserData('no_data_user', testCompanyId);
      
      expect(result.success).toBe(true);
      expect(result.deletedRecords).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.dataSummary.totalRecordsDeleted).toBe(0);
    });

    it('should handle partial deletion failures', async () => {
      // Mock a database error for one table
      const originalExecute = sql.execute;
      sql.execute = jest.fn().mockImplementation((query, params) => {
        if (query.includes('recovery_cases')) {
          throw new Error('Database connection failed');
        }
        return originalExecute.call(sql, query, params);
      });

      const result = await userDeletionService.deleteUserData(testUserId, testCompanyId);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to delete from recovery_cases');

      // Restore original function
      sql.execute = originalExecute;
    });
  });

  describe('createDeletedUserRecord', () => {
    it('should create audit record for deleted user', async () => {
      const dataSummary: DeletionDataSummary = {
        recoveryCasesCount: 5,
        eventsCount: 10,
        recoveryActionsCount: 15,
        jobQueueCount: 2,
        otherDataCount: 0,
        deletedTables: ['recovery_cases', 'events', 'recovery_actions'],
        totalRecordsDeleted: 32
      };

      const result = await userDeletionService.createDeletedUserRecord(
        testUserId,
        testCompanyId,
        testRequestId,
        'User requested deletion',
        dataSummary
      );
      
      expect(result).toBeDefined();
      expect(result.originalUserId).toBe(testUserId);
      expect(result.originalCompanyId).toBe(testCompanyId);
      expect(result.deletionRequestId).toBe(testRequestId);
      expect(result.deletedBy).toBe('system');
      expect(result.deletionReason).toBe('User requested deletion');
      expect(result.dataSummary).toEqual(dataSummary);
      expect(result.retentionExpiry).toBeInstanceOf(Date);
    });
  });

  describe('processDeletionRequest', () => {
    it('should process deletion request successfully', async () => {
      // Create a deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
           VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      // Set up test data
      await sql.execute(
        `INSERT INTO recovery_cases (id, company_id, membership_id, user_id, first_failure_at, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
        ['case1', testCompanyId, 'membership1', testUserId, new Date(), 'open']
      );

      const result = await userDeletionService.processDeletionRequest(testRequestId);
      
      expect(result.success).toBe(true);
      expect(result.deletedRecords).toBeGreaterThan(0);
      
      // Check that request status was updated
      const updatedRequest = await userDeletionService.getDeletionRequest(testRequestId);
      expect(updatedRequest?.status).toBe('completed');
      
      // Check that audit record was created
      const auditRecords = await sql.select(
        `SELECT * FROM deleted_users WHERE original_user_id = $1`,
        [testUserId]
      );
      expect(auditRecords).toHaveLength(1);
    });

    it('should handle non-existent deletion request', async () => {
      await expect(userDeletionService.processDeletionRequest('non_existent_id'))
        .rejects.toThrow('Deletion request not found');
    });

    it('should handle processing errors gracefully', async () => {
      // Create a deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
           VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      // Mock deletion to fail
      const originalDeleteUserData = userDeletionService.deleteUserData;
      userDeletionService.deleteUserData = jest.fn().mockResolvedValue({
        success: false,
        deletedRecords: 0,
        errors: ['Simulated deletion error'],
        dataSummary: {} as DeletionDataSummary,
        auditRecordId: 'audit_id'
      });

      const result = await userDeletionService.processDeletionRequest(testRequestId);
      
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Simulated deletion error');
      
      // Check that request status was updated to failed
      const updatedRequest = await userDeletionService.getDeletionRequest(testRequestId);
      expect(updatedRequest?.status).toBe('failed');
      expect(updatedRequest?.errorMessage).toContain('Simulated deletion error');

      // Restore original function
      userDeletionService.deleteUserData = originalDeleteUserData;
    });
  });

  describe('updateDeletionRequestStatus', () => {
    it('should update request status successfully', async () => {
      // Create a deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
           VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      await userDeletionService.updateDeletionRequestStatus(
        testRequestId,
        UserDeletionStatus.PROCESSING
      );

      const updatedRequest = await userDeletionService.getDeletionRequest(testRequestId);
      expect(updatedRequest?.status).toBe('processing');
      expect(updatedRequest?.processedAt).toBeInstanceOf(Date);
    });

    it('should update request status with error message', async () => {
      // Create a deletion request
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
           VALUES ($1, $2, $3, $4, $5)`,
        [testRequestId, testUserId, testCompanyId, true, 'pending']
      );

      await userDeletionService.updateDeletionRequestStatus(
        testRequestId,
        UserDeletionStatus.FAILED,
        'Test error message'
      );

      const updatedRequest = await userDeletionService.getDeletionRequest(testRequestId);
      expect(updatedRequest?.status).toBe('failed');
      expect(updatedRequest?.errorMessage).toBe('Test error message');
      expect(updatedRequest?.completedAt).toBeInstanceOf(Date);
      expect(updatedRequest?.retryCount).toBe(1);
    });
  });
});

describe('User Deletion API Endpoint', () => {
  const testUserId = 'api_test_user_123';
  const testCompanyId = 'api_test_company_456';

  beforeEach(async () => {
    await cleanupTestData();
    await setupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST /api/user/delete', () => {
    it('should create deletion request with valid consent', async () => {
      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
          'X-User-Id': testUserId,
          'X-Company-Id': testCompanyId
        },
        body: JSON.stringify({
          consent: true,
          reason: 'User requested data deletion'
        })
      });

      // Mock auth middleware to return test context
      const mockAuthContext = {
        auth: {
          userId: testUserId,
          companyId: testCompanyId,
          isAuthenticated: true
        }
      };

      const response = await requireAuth((req, context) => {
        // Import and call the actual handler
        const { handleDeleteRequest } = require('@/app/api/user/delete/route');
        return handleDeleteRequest(req as NextRequest, mockAuthContext);
      })(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.requestId).toBeDefined();
      expect(data.message).toContain('Deletion request received');
    });

    it('should reject request without consent', async () => {
      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
          'X-User-Id': testUserId,
          'X-Company-Id': testCompanyId
        },
        body: JSON.stringify({
          consent: false,
          reason: 'User requested data deletion'
        })
      });

      const mockAuthContext = {
        auth: {
          userId: testUserId,
          companyId: testCompanyId,
          isAuthenticated: true
        }
      };

      const response = await requireAuth((req, context) => {
        const { handleDeleteRequest } = require('@/app/api/user/delete/route');
        return handleDeleteRequest(req as NextRequest, mockAuthContext);
      })(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Explicit consent is required');
    });

    it('should reject request with invalid body', async () => {
      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
          'X-User-Id': testUserId,
          'X-Company-Id': testCompanyId
        },
        body: JSON.stringify({
          consent: 'not_a_boolean'
        })
      });

      const mockAuthContext = {
        auth: {
          userId: testUserId,
          companyId: testCompanyId,
          isAuthenticated: true
        }
      };

      const response = await requireAuth((req, context) => {
        const { handleDeleteRequest } = require('@/app/api/user/delete/route');
        return handleDeleteRequest(req as NextRequest, mockAuthContext);
      })(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Consent must be a boolean value');
    });
  });

  describe('GET /api/user/delete', () => {
    it('should return deletion request status', async () => {
      // Create a deletion request
      const requestId = 'status_test_request';
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
           VALUES ($1, $2, $3, $4, $5)`,
        [requestId, testUserId, testCompanyId, true, 'pending']
      );

      const request = new NextRequest(`http://localhost:3000/api/user/delete?requestId=${requestId}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid_token',
          'X-User-Id': testUserId,
          'X-Company-Id': testCompanyId
        }
      });

      const mockAuthContext = {
        auth: {
          userId: testUserId,
          companyId: testCompanyId,
          isAuthenticated: true
        }
      };

      const response = await requireAuth((req, context) => {
        const { handleGetStatus } = require('@/app/api/user/delete/route');
        return handleGetStatus(req as NextRequest, mockAuthContext);
      })(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.requestId).toBe(requestId);
      expect(data.data.status).toBe('pending');
    });

    it('should return latest request when no requestId provided', async () => {
      // Create multiple deletion requests
      const requestIds = ['req1', 'req2'];
      for (const requestId of requestIds) {
        await sql.execute(
          `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status, requested_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
          [requestId, testUserId, testCompanyId, true, 'completed', new Date()]
        );
      }

      const request = new NextRequest('http://localhost:3000/api/user/delete', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid_token',
          'X-User-Id': testUserId,
          'X-Company-Id': testCompanyId
        }
      });

      const mockAuthContext = {
        auth: {
          userId: testUserId,
          companyId: testCompanyId,
          isAuthenticated: true
        }
      };

      const response = await requireAuth((req, context) => {
        const { handleGetStatus } = require('@/app/api/user/delete/route');
        return handleGetStatus(req as NextRequest, mockAuthContext);
      })(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.requestId).toBe(requestIds[1]); // Latest request
    });

    it('should deny access to other user requests', async () => {
      const otherUserId = 'other_user_789';
      const requestId = 'unauthorized_request';
      
      // Create deletion request for other user
      await sql.execute(
        `INSERT INTO user_deletion_requests (id, user_id, company_id, consent_given, status)
           VALUES ($1, $2, $3, $4, $5)`,
        [requestId, otherUserId, testCompanyId, true, 'pending']
      );

      const request = new NextRequest(`http://localhost:3000/api/user/delete?requestId=${requestId}`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer valid_token',
          'X-User-Id': testUserId,
          'X-Company-Id': testCompanyId
        }
      });

      const mockAuthContext = {
        auth: {
          userId: testUserId,
          companyId: testCompanyId,
          isAuthenticated: true
        }
      };

      const response = await requireAuth((req, context) => {
        const { handleGetStatus } = require('@/app/api/user/delete/route');
        return handleGetStatus(req as NextRequest, mockAuthContext);
      })(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('Access denied');
    });
  });
});

// Helper functions for test setup and cleanup
async function setupTestData(): Promise<void> {
  // Create test company if needed
  await sql.execute(
    `INSERT INTO creator_settings (company_id, enable_push, enable_dm)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id) DO NOTHING`,
    [testCompanyId, true, true]
  );
}

async function cleanupTestData(): Promise<void> {
  // Clean up test data
  const tables = [
    'deleted_users',
    'user_deletion_requests',
    'recovery_actions',
    'events',
    'recovery_cases',
    'creator_settings'
  ];

  for (const table of tables) {
    await sql.execute(`DELETE FROM ${table} WHERE user_id LIKE '%test%' OR company_id LIKE '%test%'`);
  }
}

describe('User Deletion Error Handling', () => {
  it('should create proper error types', () => {
    const error = createUserDeletionError(
      UserDeletionErrorType.RATE_LIMITED,
      'Rate limit exceeded',
      { retryAfter: 3600 }
    );

    expect(error.type).toBe(UserDeletionErrorType.RATE_LIMITED);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.details).toEqual({ retryAfter: 3600 });
    expect(error.retryable).toBe(false);
  });

  it('should mark certain errors as retryable', () => {
    const retryableErrors = [
      UserDeletionErrorType.DATABASE_ERROR,
      UserDeletionErrorType.SYSTEM_ERROR,
      UserDeletionErrorType.ENCRYPTION_ERROR
    ];

    retryableErrors.forEach(errorType => {
      const error = createUserDeletionError(errorType, 'Test error');
      expect(error.retryable).toBe(true);
    });
  });

  it('should mark other errors as non-retryable', () => {
    const nonRetryableErrors = [
      UserDeletionErrorType.RATE_LIMITED,
      UserDeletionErrorType.INVALID_CONSENT,
      UserDeletionErrorType.VALIDATION_ERROR,
      UserDeletionErrorType.DELETION_IN_PROGRESS
    ];

    nonRetryableErrors.forEach(errorType => {
      const error = createUserDeletionError(errorType, 'Test error');
      expect(error.retryable).toBe(false);
    });
  });
});

describe('User Deletion Configuration', () => {
  it('should use default options when none provided', () => {
    const service = new (userDeletionService as any).constructor();
    expect(service.options).toEqual(DEFAULT_USER_DELETION_OPTIONS);
  });

  it('should merge custom options with defaults', () => {
    const customOptions = {
      enableLogging: false,
      retentionDays: 60
    };

    const service = new (userDeletionService as any).constructor(customOptions);
    expect(service.options.enableLogging).toBe(false);
    expect(service.options.retentionDays).toBe(60);
    expect(service.options.enableAuditTrail).toBe(true); // Default value
    expect(service.options.maxRetries).toBe(3); // Default value
  });
});