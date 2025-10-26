// User Deletion Types
// Type definitions for GDPR "right to be forgotten" functionality

/**
 * User deletion request status
 */
export enum UserDeletionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * User deletion request interface
 */
export interface UserDeletionRequest {
  id: string;
  userId: string;
  companyId: string;
  requestIp?: string;
  userAgent?: string;
  consentGiven: boolean;
  status: UserDeletionStatus;
  requestedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  metadata: Record<string, any>;
}

/**
 * Deleted user audit record interface
 */
export interface DeletedUser {
  id: string;
  originalUserId: string;
  originalCompanyId: string;
  deletionRequestId?: string;
  deletedAt: Date;
  deletedBy?: string;
  deletionReason?: string;
  dataSummary: Record<string, any>;
  retentionExpiry: Date;
  complianceNotes?: string;
}

/**
 * User deletion request input
 */
export interface CreateUserDeletionRequestInput {
  userId: string;
  companyId: string;
  consentGiven: boolean;
  requestIp?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * User deletion response
 */
export interface UserDeletionResponse {
  requestId: string;
  status: UserDeletionStatus;
  message: string;
  estimatedCompletionTime?: Date;
}

/**
 * User deletion service options
 */
export interface UserDeletionServiceOptions {
  enableLogging?: boolean;
  enableAuditTrail?: boolean;
  retentionDays?: number;
  maxRetries?: number;
}

/**
 * Data summary for audit trail
 */
export interface DeletionDataSummary {
  recoveryCasesCount: number;
  eventsCount: number;
  recoveryActionsCount: number;
  jobQueueCount: number;
  otherDataCount: number;
  deletedTables: string[];
  totalRecordsDeleted: number;
}

/**
 * Deletion operation result
 */
export interface DeletionResult {
  success: boolean;
  deletedRecords: number;
  errors: string[];
  dataSummary: DeletionDataSummary;
  auditRecordId: string;
}

/**
 * Rate limit check result
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  nextAllowedAt?: Date;
  existingRequest?: UserDeletionRequest;
}

/**
 * User deletion error types
 */
export enum UserDeletionErrorType {
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_CONSENT = 'INVALID_CONSENT',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  DELETION_IN_PROGRESS = 'DELETION_IN_PROGRESS',
  DATABASE_ERROR = 'DATABASE_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

/**
 * User deletion error interface
 */
export interface UserDeletionError extends Error {
  type: UserDeletionErrorType;
  code: string;
  details?: Record<string, any>;
  retryable: boolean;
}

/**
 * User deletion service interface
 */
export interface IUserDeletionService {
  /**
   * Check if user can request deletion (rate limiting)
   */
  canRequestDeletion(userId: string, companyId: string): Promise<RateLimitCheckResult>;
  
  /**
   * Create a new user deletion request
   */
  createDeletionRequest(input: CreateUserDeletionRequestInput): Promise<UserDeletionRequest>;
  
  /**
   * Process user deletion request
   */
  processDeletionRequest(requestId: string): Promise<DeletionResult>;
  
  /**
   * Get deletion request by ID
   */
  getDeletionRequest(requestId: string): Promise<UserDeletionRequest | null>;
  
  /**
   * Get deletion requests for user
   */
  getUserDeletionRequests(userId: string, companyId: string): Promise<UserDeletionRequest[]>;
  
  /**
   * Update deletion request status
   */
  updateDeletionRequestStatus(
    requestId: string, 
    status: UserDeletionStatus, 
    errorMessage?: string
  ): Promise<void>;
  
  /**
   * Create audit record for deleted user
   */
  createDeletedUserRecord(
    originalUserId: string,
    originalCompanyId: string,
    deletionRequestId?: string,
    deletionReason?: string,
    dataSummary?: DeletionDataSummary
  ): Promise<DeletedUser>;
  
  /**
   * Delete user data from all tables
   */
  deleteUserData(userId: string, companyId: string): Promise<DeletionResult>;
}

/**
 * API request/response types for user deletion endpoint
 */
export interface DeleteUserRequest {
  consent: boolean;
  reason?: string;
}

export interface DeleteUserResponse {
  success: boolean;
  requestId: string;
  message: string;
  status: UserDeletionStatus;
  estimatedCompletionTime?: Date;
}

export interface GetDeletionStatusResponse {
  requestId: string;
  status: UserDeletionStatus;
  requestedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
  estimatedCompletionTime?: Date;
}

/**
 * Database query result types
 */
export interface UserDeletionRequestDBResult {
  id: string;
  user_id: string;
  company_id: string;
  request_ip?: string;
  user_agent?: string;
  consent_given: boolean;
  status: string;
  requested_at: Date;
  processed_at?: Date;
  completed_at?: Date;
  error_message?: string;
  retry_count: number;
  metadata: Record<string, any>;
}

export interface DeletedUserDBResult {
  id: string;
  original_user_id: string;
  original_company_id: string;
  deletion_request_id?: string;
  deleted_at: Date;
  deleted_by?: string;
  deletion_reason?: string;
  data_summary: Record<string, any>;
  retention_expiry: Date;
  compliance_notes?: string;
}

/**
 * Type guards
 */
export function isValidUserDeletionStatus(status: string): status is UserDeletionStatus {
  return Object.values(UserDeletionStatus).includes(status as UserDeletionStatus);
}

export function isUserDeletionError(error: any): error is UserDeletionError {
  return error && typeof error === 'object' && 'type' in error && 'code' in error;
}

/**
 * Error factory functions
 */
export function createUserDeletionError(
  type: UserDeletionErrorType,
  message: string,
  details?: Record<string, any>
): UserDeletionError {
  const error = new Error(message) as UserDeletionError;
  error.type = type;
  error.code = type;
  error.details = details;
  error.retryable = [
    UserDeletionErrorType.DATABASE_ERROR,
    UserDeletionErrorType.SYSTEM_ERROR,
    UserDeletionErrorType.ENCRYPTION_ERROR
  ].includes(type);
  
  return error;
}

/**
 * Default service options
 */
export const DEFAULT_USER_DELETION_OPTIONS: Required<UserDeletionServiceOptions> = {
  enableLogging: true,
  enableAuditTrail: true,
  retentionDays: 30,
  maxRetries: 3
};