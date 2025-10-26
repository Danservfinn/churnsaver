// Consent Management Type Definitions
// Defines types for consent management system

/**
 * Consent types available in the system
 */
export type ConsentType = 'marketing' | 'analytics' | 'functional' | 'third_party' | 'legal';

/**
 * Consent status values
 */
export type ConsentStatus = 'active' | 'withdrawn' | 'expired';

/**
 * Audit action types
 */
export type AuditAction = 'granted' | 'withdrawn' | 'renewed' | 'expired' | 'updated';

/**
 * Consent template interface
 */
export interface ConsentTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  consent_type: ConsentType;
  is_active: boolean;
  is_required: boolean;
  expiration_days?: number;
  withdrawal_allowed: boolean;
  data_retention_days?: number;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

/**
 * User consent interface
 */
export interface UserConsent {
  id: string;
  user_id: string;
  company_id: string;
  template_id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  granted_at: Date;
  expires_at?: Date;
  withdrawn_at?: Date;
  withdrawal_reason?: string;
  ip_address?: string;
  user_agent?: string;
  consent_data: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Consent audit log interface
 */
export interface ConsentAuditLog {
  id: string;
  consent_id: string;
  user_id: string;
  company_id: string;
  action: AuditAction;
  previous_status?: ConsentStatus;
  new_status?: ConsentStatus;
  reason?: string;
  ip_address?: string;
  user_agent?: string;
  metadata: Record<string, any>;
  created_at: Date;
  created_by?: string;
}

/**
 * Request payload for creating a new consent
 */
export interface CreateConsentRequest {
  template_id: string;
  consent_type: ConsentType;
  expires_at?: Date;
  consent_data?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Request payload for updating a consent
 */
export interface UpdateConsentRequest {
  status?: ConsentStatus;
  expires_at?: Date;
  withdrawal_reason?: string;
  consent_data?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Request payload for withdrawing consent
 */
export interface WithdrawConsentRequest {
  reason?: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Request payload for creating a consent template
 */
export interface CreateConsentTemplateRequest {
  name: string;
  description: string;
  version?: string;
  consent_type: ConsentType;
  is_active?: boolean;
  is_required?: boolean;
  expiration_days?: number;
  withdrawal_allowed?: boolean;
  data_retention_days?: number;
}

/**
 * Request payload for updating a consent template
 */
export interface UpdateConsentTemplateRequest {
  name?: string;
  description?: string;
  version?: string;
  is_active?: boolean;
  is_required?: boolean;
  expiration_days?: number;
  withdrawal_allowed?: boolean;
  data_retention_days?: number;
}

/**
 * Response payload for consent list with pagination
 */
export interface ConsentListResponse {
  consents: UserConsent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

/**
 * Response payload for consent template list
 */
export interface ConsentTemplateListResponse {
  templates: ConsentTemplate[];
}

/**
 * Consent summary statistics
 */
export interface ConsentSummary {
  total_consents: number;
  active_consents: number;
  withdrawn_consents: number;
  expired_consents: number;
  consents_by_type: Record<ConsentType, number>;
  recent_activity: ConsentAuditLog[];
}

/**
 * Consent validation error
 */
export interface ConsentValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Consent search filters
 */
export interface ConsentSearchFilters {
  user_id?: string;
  company_id?: string;
  consent_type?: ConsentType;
  status?: ConsentStatus;
  granted_after?: Date;
  granted_before?: Date;
  expires_after?: Date;
  expires_before?: Date;
  page?: number;
  limit?: number;
}

/**
 * Consent audit search filters
 */
export interface ConsentAuditSearchFilters {
  consent_id?: string;
  user_id?: string;
  company_id?: string;
  action?: AuditAction;
  created_after?: Date;
  created_before?: Date;
  page?: number;
  limit?: number;
}

/**
 * Consent expiration reminder
 */
export interface ConsentExpirationReminder {
  consent_id: string;
  user_id: string;
  company_id: string;
  consent_type: ConsentType;
  expires_at: Date;
  days_until_expiration: number;
  template: ConsentTemplate;
}

/**
 * Consent withdrawal confirmation
 */
export interface ConsentWithdrawalConfirmation {
  consent_id: string;
  user_id: string;
  company_id: string;
  consent_type: ConsentType;
  withdrawn_at: Date;
  data_retention_days: number;
  data_deletion_scheduled_at: Date;
}

/**
 * Batch consent operation request
 */
export interface BatchConsentOperation {
  user_ids: string[];
  consent_type: ConsentType;
  operation: 'grant' | 'withdraw';
  template_id?: string;
  reason?: string;
  expires_at?: Date;
}

/**
 * Batch consent operation response
 */
export interface BatchConsentOperationResponse {
  successful_operations: string[];
  failed_operations: Array<{
    user_id: string;
    error: string;
  }>;
  total_processed: number;
  success_count: number;
  failure_count: number;
}

/**
 * Consent export data
 */
export interface ConsentExportData {
  user_id: string;
  company_id: string;
  consent_type: ConsentType;
  status: ConsentStatus;
  granted_at: Date;
  expires_at?: Date;
  withdrawn_at?: Date;
  withdrawal_reason?: string;
  last_updated: Date;
}

/**
 * Consent compliance report
 */
export interface ConsentComplianceReport {
  report_generated_at: Date;
  total_users: number;
  users_with_active_consents: number;
  compliance_percentage: number;
  consents_by_type: Record<ConsentType, {
    total: number;
    active: number;
    withdrawn: number;
    expired: number;
  }>;
  expiring_soon: number;
  expired_without_renewal: number;
  audit_trail_entries: number;
}