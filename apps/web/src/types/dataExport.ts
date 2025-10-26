// Data Export Type Definitions
// Defines interfaces for GDPR data export functionality

export enum ExportFormat {
  JSON = 'json',
  CSV = 'csv',
  PDF = 'pdf'
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

export enum ExportDataType {
  USERS = 'users',
  CASES = 'cases',
  EVENTS = 'events',
  RECOVERY_ACTIONS = 'recovery_actions',
  MEMBERSHIPS = 'memberships',
  SETTINGS = 'settings',
  CONSENT_RECORDS = 'consent_records'
}

export enum ExportAuditAction {
  REQUESTED = 'requested',
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DOWNLOADED = 'downloaded',
  DELETED = 'deleted',
  EXPIRED = 'expired'
}

export enum ExportActorType {
  USER = 'user',
  SYSTEM = 'system',
  ADMIN = 'admin'
}

export enum CompressionType {
  NONE = 'none',
  GZIP = 'gzip',
  ZIP = 'zip'
}

export interface DataExportRequest {
  id: string;
  user_id: string;
  company_id: string;
  request_ip?: string;
  user_agent?: string;
  export_format: ExportFormat;
  data_types: ExportDataType[];
  date_range_start?: Date;
  date_range_end?: Date;
  status: ExportStatus;
  requested_at: Date;
  processed_at?: Date;
  completed_at?: Date;
  expires_at: Date;
  error_message?: string;
  retry_count: number;
  metadata: Record<string, any>;
  file_size_bytes?: number;
  record_count?: number;
}

export interface DataExportFile {
  id: string;
  export_request_id: string;
  filename: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  encryption_key_id?: string;
  checksum: string;
  created_at: Date;
  downloaded_at?: Date;
  download_count: number;
  max_downloads: number;
  is_encrypted: boolean;
  compression_type: CompressionType;
}

export interface DataExportAuditLog {
  id: string;
  export_request_id: string;
  action: ExportAuditAction;
  actor_type: ExportActorType;
  actor_id?: string;
  ip_address?: string;
  user_agent?: string;
  details: Record<string, any>;
  created_at: Date;
}

export interface CreateExportRequestRequest {
  export_format: ExportFormat;
  data_types: ExportDataType[];
  date_range_start?: Date;
  date_range_end?: Date;
  metadata?: Record<string, any>;
}

export interface CreateExportRequestResponse {
  request_id: string;
  status: ExportStatus;
  message: string;
}

export interface ExportRequestListResponse {
  requests: DataExportRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface ExportFileDownloadResponse {
  file_id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  download_url?: string;
  file_data?: Buffer;
  checksum: string;
  download_count: number;
  max_downloads: number;
  expires_at: Date;
}

export interface ExportDataOptions {
  include_sensitive_data: boolean;
  compress_output: boolean;
  encrypt_output: boolean;
  max_records?: number;
  date_range?: {
    start: Date;
    end: Date;
  };
}

export interface ExportUserData {
  user_id: string;
  company_id: string;
  email?: string;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, any>;
}

export interface ExportCaseData {
  id: string;
  company_id: string;
  membership_id: string;
  user_id: string;
  first_failure_at: Date;
  last_nudge_at?: Date;
  attempts: number;
  incentive_days: number;
  status: string;
  failure_reason?: string;
  recovered_amount_cents: number;
  created_at: Date;
  updated_at: Date;
}

export interface ExportEventData {
  id: string;
  whop_event_id: string;
  type: string;
  membership_id: string;
  payload: Record<string, any>;
  processed_at: Date;
  created_at: Date;
}

export interface ExportRecoveryActionData {
  id: string;
  company_id: string;
  case_id: string;
  membership_id: string;
  user_id: string;
  type: string;
  channel?: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface ExportMembershipData {
  membership_id: string;
  user_id: string;
  company_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  metadata?: Record<string, any>;
}

export interface ExportSettingsData {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  updated_at: Date;
}

export interface ExportConsentRecordData {
  id: string;
  user_id: string;
  company_id: string;
  consent_type: string;
  consent_given: boolean;
  consented_at?: Date;
  revoked_at?: Date;
  ip_address?: string;
  user_agent?: string;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface ExportedData {
  users?: ExportUserData[];
  cases?: ExportCaseData[];
  events?: ExportEventData[];
  recovery_actions?: ExportRecoveryActionData[];
  memberships?: ExportMembershipData[];
  settings?: ExportSettingsData[];
  consent_records?: ExportConsentRecordData[];
  metadata: {
    export_request_id: string;
    exported_at: Date;
    data_types: ExportDataType[];
    record_counts: Record<ExportDataType, number>;
    file_size_bytes: number;
    checksum: string;
  };
}

export interface ExportProcessingOptions {
  request_id: string;
  user_id: string;
  company_id: string;
  export_format: ExportFormat;
  data_types: ExportDataType[];
  date_range_start?: Date;
  date_range_end?: Date;
  include_sensitive_data: boolean;
  compress_output: boolean;
  encrypt_output: boolean;
}

export interface ExportProcessingResult {
  success: boolean;
  file_path?: string;
  file_size_bytes?: number;
  record_count?: number;
  checksum?: string;
  error_message?: string;
}

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExportRateLimitInfo {
  can_request: boolean;
  next_allowed_at?: Date;
  existing_request_count: number;
  max_requests_per_day: number;
}

export interface ExportCleanupResult {
  deleted_requests: number;
  deleted_files: number;
  freed_space_bytes: number;
  errors: string[];
}

// Error types for data export operations
export class DataExportError extends Error {
  public code: string;
  public category: string;
  public retryable: boolean;
  public details?: any;

  constructor(
    message: string,
    code: string,
    category: string,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.name = 'DataExportError';
    this.code = code;
    this.category = category;
    this.retryable = retryable;
    this.details = details;
  }
}

// Validation schemas
export const ExportRequestValidation = {
  export_format: {
    required: true,
    enum: Object.values(ExportFormat),
    message: 'Export format must be one of: json, csv, pdf'
  },
  data_types: {
    required: true,
    type: 'array',
    minItems: 1,
    items: {
      enum: Object.values(ExportDataType)
    },
    message: 'At least one data type must be specified'
  },
  date_range: {
    optional: true,
    type: 'object',
    properties: {
      start: { type: 'string', format: 'date-time' },
      end: { type: 'string', format: 'date-time' }
    },
    message: 'Date range must be valid ISO dates with start before end'
  }
};

export const ExportLimits = {
  MAX_DATE_RANGE_DAYS: 365,
  MAX_RECORDS_PER_EXPORT: 100000,
  MAX_FILE_SIZE_MB: 100,
  MAX_DOWNLOADS_PER_FILE: 3,
  FILE_RETENTION_DAYS: 7,
  RATE_LIMIT_REQUESTS_PER_DAY: 1
};