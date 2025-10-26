// User Deletion Service
// Implements GDPR "right to be forgotten" functionality

import { sql, getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt } from '@/lib/encryption';
import {
  IUserDeletionService,
  UserDeletionRequest,
  DeletedUser,
  CreateUserDeletionRequestInput,
  UserDeletionResponse,
  DeletionResult,
  RateLimitCheckResult,
  DeletionDataSummary,
  UserDeletionStatus,
  UserDeletionErrorType,
  createUserDeletionError,
  UserDeletionRequestDBResult,
  DeletedUserDBResult,
  DEFAULT_USER_DELETION_OPTIONS,
  UserDeletionServiceOptions
} from '@/types/userDeletion';

/**
 * User Deletion Service Implementation
 */
export class UserDeletionService implements IUserDeletionService {
  private options: Required<UserDeletionServiceOptions>;

  constructor(options: UserDeletionServiceOptions = {}) {
    this.options = { ...DEFAULT_USER_DELETION_OPTIONS, ...options };
  }

  /**
   * Check if user can request deletion (rate limiting)
   */
  async canRequestDeletion(userId: string, companyId: string): Promise<RateLimitCheckResult> {
    try {
      const result = await sql.select<{ can_request: boolean; reason?: string }>(
        `SELECT can_request_user_deletion($1, $2) as can_request`,
        [userId, companyId]
      );

      if (!result[0]?.can_request) {
        // Get existing request details
        const existingRequest = await sql.select<UserDeletionRequestDBResult>(
          `SELECT * FROM user_deletion_requests 
           WHERE user_id = $1 AND company_id = $2 
           AND status IN ('pending', 'processing')
           ORDER BY requested_at DESC LIMIT 1`,
          [userId, companyId]
        );

        return {
          allowed: false,
          reason: existingRequest.length > 0 
            ? 'Deletion request already in progress'
            : 'Rate limit exceeded: Only 1 deletion request per 24 hours',
          existingRequest: existingRequest.length > 0 ? this.mapDbRequestToType(existingRequest[0]) : undefined
        };
      }

      return { allowed: true };

    } catch (error) {
      logger.error('Error checking deletion request rate limit', {
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Fail closed for security
      return {
        allowed: false,
        reason: 'System error occurred while checking rate limit'
      };
    }
  }

  /**
   * Create a new user deletion request
   */
  async createDeletionRequest(input: CreateUserDeletionRequestInput): Promise<UserDeletionRequest> {
    try {
      // Validate input
      this.validateDeletionRequestInput(input);

      // Check rate limiting
      const rateLimitCheck = await this.canRequestDeletion(input.userId, input.companyId);
      if (!rateLimitCheck.allowed) {
        throw createUserDeletionError(
          UserDeletionErrorType.RATE_LIMITED,
          rateLimitCheck.reason || 'Rate limit exceeded',
          { existingRequest: rateLimitCheck.existingRequest }
        );
      }

      // Create deletion request using database function
      const result = await sql.select<{ id: string }>(
        `SELECT create_user_deletion_request($1, $2, $3, $4, $5, $6) as id`,
        [
          input.userId,
          input.companyId,
          input.requestIp || null,
          input.userAgent || null,
          input.consentGiven,
          JSON.stringify(input.metadata || {})
        ]
      );

      if (!result[0]?.id) {
        throw createUserDeletionError(
          UserDeletionErrorType.DATABASE_ERROR,
          'Failed to create deletion request'
        );
      }

      // Get the created request
      const request = await this.getDeletionRequest(result[0].id);
      if (!request) {
        throw createUserDeletionError(
          UserDeletionErrorType.DATABASE_ERROR,
          'Failed to retrieve created deletion request'
        );
      }

      logger.info('User deletion request created', {
        requestId: request.id,
        userId: input.userId,
        companyId: input.companyId,
        consentGiven: input.consentGiven,
        requestIp: input.requestIp
      });

      return request;

    } catch (error) {
      if (error instanceof Error && 'type' in error) {
        throw error; // Re-throw UserDeletionError
      }

      logger.error('Error creating user deletion request', {
        userId: input.userId,
        companyId: input.companyId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw createUserDeletionError(
        UserDeletionErrorType.DATABASE_ERROR,
        'Failed to create deletion request',
        { originalError: error }
      );
    }
  }

  /**
   * Process user deletion request
   */
  async processDeletionRequest(requestId: string): Promise<DeletionResult> {
    try {
      // Get the request
      const request = await this.getDeletionRequest(requestId);
      if (!request) {
        throw createUserDeletionError(
          UserDeletionErrorType.USER_NOT_FOUND,
          'Deletion request not found'
        );
      }

      // Update status to processing
      await this.updateDeletionRequestStatus(requestId, UserDeletionStatus.PROCESSING);

      logger.info('Starting user deletion processing', {
        requestId,
        userId: request.userId,
        companyId: request.companyId
      });

      // Delete user data from all tables
      const deletionResult = await this.deleteUserData(request.userId, request.companyId);

      if (deletionResult.success) {
        // Update status to completed
        await this.updateDeletionRequestStatus(requestId, UserDeletionStatus.COMPLETED);

        // Create audit record
        if (this.options.enableAuditTrail) {
          await this.createDeletedUserRecord(
            request.userId,
            request.companyId,
            requestId,
            'User requested deletion via API',
            deletionResult.dataSummary
          );
        }

        logger.info('User deletion completed successfully', {
          requestId,
          userId: request.userId,
          companyId: request.companyId,
          deletedRecords: deletionResult.deletedRecords,
          auditRecordId: deletionResult.auditRecordId
        });

      } else {
        // Update status to failed
        await this.updateDeletionRequestStatus(
          requestId,
          UserDeletionStatus.FAILED,
          deletionResult.errors.join('; ')
        );

        logger.error('User deletion failed', {
          requestId,
          userId: request.userId,
          companyId: request.companyId,
          errors: deletionResult.errors
        });
      }

      return deletionResult;

    } catch (error) {
      // Update status to failed
      await this.updateDeletionRequestStatus(
        requestId,
        UserDeletionStatus.FAILED,
        error instanceof Error ? error.message : String(error)
      );

      logger.error('Error processing user deletion request', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw createUserDeletionError(
        UserDeletionErrorType.SYSTEM_ERROR,
        'Failed to process deletion request',
        { originalError: error }
      );
    }
  }

  /**
   * Get deletion request by ID
   */
  async getDeletionRequest(requestId: string): Promise<UserDeletionRequest | null> {
    try {
      const result = await sql.select<UserDeletionRequestDBResult>(
        `SELECT * FROM user_deletion_requests WHERE id = $1`,
        [requestId]
      );

      return result.length > 0 ? this.mapDbRequestToType(result[0]) : null;

    } catch (error) {
      logger.error('Error getting deletion request', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  }

  /**
   * Get deletion requests for user
   */
  async getUserDeletionRequests(userId: string, companyId: string): Promise<UserDeletionRequest[]> {
    try {
      const results = await sql.select<UserDeletionRequestDBResult>(
        `SELECT * FROM user_deletion_requests 
         WHERE user_id = $1 AND company_id = $2 
         ORDER BY requested_at DESC`,
        [userId, companyId]
      );

      return results.map(result => this.mapDbRequestToType(result));

    } catch (error) {
      logger.error('Error getting user deletion requests', {
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });

      return [];
    }
  }

  /**
   * Update deletion request status
   */
  async updateDeletionRequestStatus(
    requestId: string,
    status: UserDeletionStatus,
    errorMessage?: string
  ): Promise<void> {
    try {
      await sql.execute(
        `SELECT update_deletion_request_status($1, $2, $3)`,
        [requestId, status, errorMessage || null]
      );

      if (this.options.enableLogging) {
        logger.info('Deletion request status updated', {
          requestId,
          status,
          errorMessage
        });
      }

    } catch (error) {
      logger.error('Error updating deletion request status', {
        requestId,
        status,
        errorMessage,
        error: error instanceof Error ? error.message : String(error)
      });

      throw createUserDeletionError(
        UserDeletionErrorType.DATABASE_ERROR,
        'Failed to update deletion request status',
        { originalError: error }
      );
    }
  }

  /**
   * Create audit record for deleted user
   */
  async createDeletedUserRecord(
    originalUserId: string,
    originalCompanyId: string,
    deletionRequestId?: string,
    deletionReason?: string,
    dataSummary?: DeletionDataSummary
  ): Promise<DeletedUser> {
    try {
      const result = await sql.select<{ id: string }>(
        `SELECT create_deleted_user_record($1, $2, $3, $4, $5, $6) as id`,
        [
          originalUserId,
          originalCompanyId,
          deletionRequestId || null,
          'system',
          deletionReason || 'User requested deletion',
          JSON.stringify(dataSummary || {})
        ]
      );

      if (!result[0]?.id) {
        throw createUserDeletionError(
          UserDeletionErrorType.DATABASE_ERROR,
          'Failed to create deleted user record'
        );
      }

      // Get the created record
      const deletedUser = await this.getDeletedUserRecord(result[0].id);
      if (!deletedUser) {
        throw createUserDeletionError(
          UserDeletionErrorType.DATABASE_ERROR,
          'Failed to retrieve created deleted user record'
        );
      }

      if (this.options.enableLogging) {
        logger.info('Deleted user audit record created', {
          auditRecordId: deletedUser.id,
          originalUserId,
          originalCompanyId,
          deletionRequestId
        });
      }

      return deletedUser;

    } catch (error) {
      if (error instanceof Error && 'type' in error) {
        throw error; // Re-throw UserDeletionError
      }

      logger.error('Error creating deleted user record', {
        originalUserId,
        originalCompanyId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw createUserDeletionError(
        UserDeletionErrorType.DATABASE_ERROR,
        'Failed to create deleted user record',
        { originalError: error }
      );
    }
  }

  /**
   * Delete user data from all tables
   */
  async deleteUserData(userId: string, companyId: string): Promise<DeletionResult> {
    const errors: string[] = [];
    const deletedTables: string[] = [];
    let totalRecordsDeleted = 0;

    try {
      // Begin transaction for atomic deletion
      const client = getDb().pool;
      const pgClient = await client.connect();

      try {
        await pgClient.query('BEGIN');

        // Delete in correct order to handle foreign key constraints
        const deletionSteps = [
          {
            table: 'recovery_actions',
            query: 'DELETE FROM recovery_actions WHERE user_id = $1 AND company_id = $2',
            description: 'recovery actions'
          },
          {
            table: 'events',
            query: 'DELETE FROM events WHERE user_id = $1 AND company_id = $2',
            description: 'events'
          },
          {
            table: 'recovery_cases',
            query: 'DELETE FROM recovery_cases WHERE user_id = $1 AND company_id = $2',
            description: 'recovery cases'
          },
          {
            table: 'job_queue',
            query: 'DELETE FROM job_queue WHERE user_id = $1 AND company_id = $2',
            description: 'job queue entries'
          }
        ];

        const dataSummary: DeletionDataSummary = {
          recoveryCasesCount: 0,
          eventsCount: 0,
          recoveryActionsCount: 0,
          jobQueueCount: 0,
          otherDataCount: 0,
          deletedTables: [],
          totalRecordsDeleted: 0
        };

        for (const step of deletionSteps) {
          try {
            // Count records before deletion
            const countResult = await pgClient.query(
              `SELECT COUNT(*) as count FROM ${step.table} WHERE user_id = $1 AND company_id = $2`,
              [userId, companyId]
            );
            const count = parseInt(countResult.rows[0]?.count || '0');

            if (count > 0) {
              // Delete records
              const deleteResult = await pgClient.query(step.query, [userId, companyId]);
              const deletedCount = deleteResult.rowCount || 0;

              totalRecordsDeleted += deletedCount;
              deletedTables.push(step.table);

              // Update data summary
              switch (step.table) {
                case 'recovery_cases':
                  dataSummary.recoveryCasesCount = deletedCount;
                  break;
                case 'events':
                  dataSummary.eventsCount = deletedCount;
                  break;
                case 'recovery_actions':
                  dataSummary.recoveryActionsCount = deletedCount;
                  break;
                case 'job_queue':
                  dataSummary.jobQueueCount = deletedCount;
                  break;
              }

              logger.info(`Deleted records from ${step.description}`, {
                userId,
                companyId,
                table: step.table,
                deletedCount,
                totalCount: count
              });
            }

          } catch (stepError) {
            const error = stepError instanceof Error ? stepError.message : String(stepError);
            errors.push(`Failed to delete from ${step.table}: ${error}`);
            logger.error(`Error deleting from ${step.table}`, {
              userId,
              companyId,
              table: step.table,
              error
            });
          }
        }

        dataSummary.deletedTables = deletedTables;
        dataSummary.totalRecordsDeleted = totalRecordsDeleted;

        // Commit transaction
        await pgClient.query('COMMIT');

        const auditRecordId = await this.createAuditRecordId(userId, companyId);

        return {
          success: errors.length === 0,
          deletedRecords: totalRecordsDeleted,
          errors,
          dataSummary,
          auditRecordId
        };

      } catch (transactionError) {
        await pgClient.query('ROLLBACK');
        throw transactionError;
      } finally {
        pgClient.release();
      }

    } catch (error) {
      logger.error('Error deleting user data', {
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw createUserDeletionError(
        UserDeletionErrorType.DATABASE_ERROR,
        'Failed to delete user data',
        { originalError: error }
      );
    }
  }

  /**
   * Validate deletion request input
   */
  private validateDeletionRequestInput(input: CreateUserDeletionRequestInput): void {
    if (!input.userId || input.userId.trim().length === 0) {
      throw createUserDeletionError(
        UserDeletionErrorType.VALIDATION_ERROR,
        'User ID is required'
      );
    }

    if (!input.companyId || input.companyId.trim().length === 0) {
      throw createUserDeletionError(
        UserDeletionErrorType.VALIDATION_ERROR,
        'Company ID is required'
      );
    }

    if (!input.consentGiven) {
      throw createUserDeletionError(
        UserDeletionErrorType.INVALID_CONSENT,
        'Explicit consent is required for data deletion'
      );
    }
  }

  /**
   * Map database result to type
   */
  private mapDbRequestToType(dbResult: UserDeletionRequestDBResult): UserDeletionRequest {
    return {
      id: dbResult.id,
      userId: dbResult.user_id,
      companyId: dbResult.company_id,
      requestIp: dbResult.request_ip,
      userAgent: dbResult.user_agent,
      consentGiven: dbResult.consent_given,
      status: dbResult.status as UserDeletionStatus,
      requestedAt: dbResult.requested_at,
      processedAt: dbResult.processed_at,
      completedAt: dbResult.completed_at,
      errorMessage: dbResult.error_message,
      retryCount: dbResult.retry_count,
      metadata: dbResult.metadata || {}
    };
  }

  /**
   * Get deleted user record by ID
   */
  private async getDeletedUserRecord(id: string): Promise<DeletedUser | null> {
    try {
      const result = await sql.select<DeletedUserDBResult>(
        `SELECT * FROM deleted_users WHERE id = $1`,
        [id]
      );

      if (result.length === 0) {
        return null;
      }

      const dbResult = result[0];
      return {
        id: dbResult.id,
        originalUserId: dbResult.original_user_id,
        originalCompanyId: dbResult.original_company_id,
        deletionRequestId: dbResult.deletion_request_id,
        deletedAt: dbResult.deleted_at,
        deletedBy: dbResult.deleted_by,
        deletionReason: dbResult.deletion_reason,
        dataSummary: dbResult.data_summary || {},
        retentionExpiry: dbResult.retention_expiry,
        complianceNotes: dbResult.compliance_notes
      };

    } catch (error) {
      logger.error('Error getting deleted user record', {
        id,
        error: error instanceof Error ? error.message : String(error)
      });

      return null;
    }
  }

  /**
   * Create audit record ID for tracking
   */
  private async createAuditRecordId(userId: string, companyId: string): Promise<string> {
    try {
      const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Encrypt sensitive information for audit
      const encryptedData = await encrypt(
        JSON.stringify({ userId, companyId, timestamp: new Date().toISOString() })
      );

      logger.info('Created audit record ID', {
        auditId,
        userId,
        companyId
      });

      return auditId;

    } catch (error) {
      logger.error('Error creating audit record ID', {
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Fallback to simple ID
      return `audit_${Date.now()}`;
    }
  }
}

// Export singleton instance
export const userDeletionService = new UserDeletionService();
export default userDeletionService;