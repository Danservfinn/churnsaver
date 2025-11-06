// Consent Management Service
// Handles consent creation, updates, withdrawal, and audit logging for GDPR compliance

import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encrypt, decrypt } from '@/lib/encryption';
import { 
  ConsentTemplate, 
  UserConsent, 
  ConsentAuditLog, 
  CreateConsentRequest,
  UpdateConsentRequest,
  WithdrawConsentRequest,
  CreateConsentTemplateRequest,
  UpdateConsentTemplateRequest,
  ConsentSearchFilters,
  ConsentAuditSearchFilters,
  ConsentExpirationReminder,
  ConsentWithdrawalConfirmation,
  BatchConsentOperation,
  BatchConsentOperationResponse,
  ConsentSummary,
  ConsentExportData,
  ConsentComplianceReport
} from '@/types/consentManagement';

// Constants for consent management
const DEFAULT_CONSENT_VERSION = '1.0';
const DEFAULT_DATA_RETENTION_DAYS = 365;
const AUDIT_LOG_LIMIT = 100;

/**
 * Validation errors for consent operations
 */
export class ConsentValidationError extends Error {
  public details: Array<{ field: string; message: string; code: string }>;

  constructor(message: string, details: Array<{ field: string; message: string; code: string }> = []) {
    super(message);
    this.name = 'ConsentValidationError';
    this.details = details;
  }
}

/**
 * Consent Management Service
 */
export class ConsentManagementService {
  /**
   * Create a new consent record for a user
   */
  static async createConsent(
    userId: string,
    companyId: string,
    consentData: CreateConsentRequest,
    context?: { ipAddress?: string; userAgent?: string; requestId?: string }
  ): Promise<UserConsent | null> {
    try {
      logger.info('Creating new consent record', {
        userId,
        companyId,
        templateId: consentData.template_id,
        consentType: consentData.consent_type,
        requestId: context?.requestId
      });

      // Validate consent data
      await this.validateConsentRequest(userId, companyId, consentData);

      // Get template to validate and extract settings
      const template = await this.getConsentTemplate(consentData.template_id);
      if (!template || !template.is_active) {
        throw new ConsentValidationError('Invalid or inactive consent template');
      }

      if (template.consent_type !== consentData.consent_type) {
        throw new ConsentValidationError('Consent type mismatch with template');
      }

      // Check for existing active consent of same type
      const existingConsent = await this.getActiveConsent(userId, companyId, consentData.consent_type);
      if (existingConsent) {
        throw new ConsentValidationError('Active consent already exists for this type');
      }

      // Calculate expiration date if template has expiration days
      let expiresAt: Date | undefined;
      if (template.expiration_days) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + template.expiration_days);
      }

      // Encrypt sensitive consent data
      const encryptedConsentData = consentData.consent_data 
        ? await encrypt(JSON.stringify(consentData.consent_data))
        : null;

      // Create consent record with RLS context
      const newConsent = await sql.insert<UserConsent>(
        `INSERT INTO user_consents (
          id, user_id, company_id, template_id, consent_type, status,
          granted_at, expires_at, ip_address, user_agent, consent_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          randomUUID(),
          userId,
          companyId,
          consentData.template_id,
          consentData.consent_type,
          'active',
          new Date(),
          expiresAt || null,
          context?.ipAddress || null,
          context?.userAgent || null,
          encryptedConsentData || '{}'
        ],
        companyId
      );

      if (newConsent) {
        // Decrypt consent data for response
        if (newConsent.consent_data && typeof newConsent.consent_data === 'string') {
          try {
            newConsent.consent_data = JSON.parse(await decrypt(newConsent.consent_data));
          } catch (decryptError) {
            logger.warn('Failed to decrypt consent data', {
              consentId: newConsent.id,
              error: decryptError instanceof Error ? decryptError.message : String(decryptError)
            });
            newConsent.consent_data = {};
          }
        }

        logger.info('Consent record created successfully', {
          consentId: newConsent.id,
          userId,
          companyId,
          consentType: newConsent.consent_type,
          expiresAt: newConsent.expires_at
        });
      }

      return newConsent;
    } catch (error) {
      logger.error('Failed to create consent record', {
        userId,
        companyId,
        templateId: consentData.template_id,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Update an existing consent record
   */
  static async updateConsent(
    consentId: string,
    userId: string,
    companyId: string,
    updateData: UpdateConsentRequest,
    context?: { ipAddress?: string; userAgent?: string; requestId?: string }
  ): Promise<UserConsent | null> {
    try {
      logger.info('Updating consent record', {
        consentId,
        userId,
        companyId,
        requestId: context?.requestId
      });

      // Get existing consent
      const existingConsent = await this.getConsentById(consentId, userId, companyId);
      if (!existingConsent) {
        throw new ConsentValidationError('Consent record not found');
      }

      // Validate status transitions
      if (updateData.status && !this.isValidStatusTransition(existingConsent.status, updateData.status)) {
        throw new ConsentValidationError(`Invalid status transition from ${existingConsent.status} to ${updateData.status}`);
      }

      // Encrypt sensitive consent data if provided
      let encryptedConsentData: string | null = null;
      if (updateData.consent_data) {
        encryptedConsentData = await encrypt(JSON.stringify(updateData.consent_data));
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (updateData.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(updateData.status);
        
        if (updateData.status === 'withdrawn') {
          updateFields.push(`withdrawn_at = $${paramIndex++}`);
          updateValues.push(new Date());
          
          if (updateData.withdrawal_reason) {
            updateFields.push(`withdrawal_reason = $${paramIndex++}`);
            updateValues.push(updateData.withdrawal_reason);
          }
        }
      }

      if (updateData.expires_at !== undefined) {
        updateFields.push(`expires_at = $${paramIndex++}`);
        updateValues.push(updateData.expires_at);
      }

      if (encryptedConsentData !== null) {
        updateFields.push(`consent_data = $${paramIndex++}`);
        updateValues.push(encryptedConsentData);
      }

      if (context?.ipAddress) {
        updateFields.push(`ip_address = $${paramIndex++}`);
        updateValues.push(context.ipAddress);
      }

      if (context?.userAgent) {
        updateFields.push(`user_agent = $${paramIndex++}`);
        updateValues.push(context.userAgent);
      }

      if (updateFields.length === 0) {
        return existingConsent; // No updates to make
      }

      // Add WHERE parameters
      updateValues.push(consentId, userId, companyId);

      const updatedConsent = await sql.insert<UserConsent>(
        `UPDATE user_consents
         SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} AND company_id = $${paramIndex++}
         RETURNING *`,
        updateValues,
        companyId
      );

      if (updatedConsent) {
        // Decrypt consent data for response
        if (updatedConsent.consent_data && typeof updatedConsent.consent_data === 'string') {
          try {
            updatedConsent.consent_data = JSON.parse(await decrypt(updatedConsent.consent_data));
          } catch (decryptError) {
            logger.warn('Failed to decrypt consent data', {
              consentId: updatedConsent.id,
              error: decryptError instanceof Error ? decryptError.message : String(decryptError)
            });
            updatedConsent.consent_data = {};
          }
        }

        logger.info('Consent record updated successfully', {
          consentId,
          userId,
          companyId,
          previousStatus: existingConsent.status,
          newStatus: updatedConsent.status
        });
      }

      return updatedConsent;
    } catch (error) {
      logger.error('Failed to update consent record', {
        consentId,
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Withdraw consent (immediate and irreversible)
   */
  static async withdrawConsent(
    consentId: string,
    userId: string,
    companyId: string,
    withdrawalData: WithdrawConsentRequest,
    context?: { ipAddress?: string; userAgent?: string; requestId?: string }
  ): Promise<UserConsent | null> {
    try {
      logger.info('Withdrawing consent', {
        consentId,
        userId,
        companyId,
        reason: withdrawalData.reason,
        requestId: context?.requestId
      });

      // Get existing consent
      const existingConsent = await this.getConsentById(consentId, userId, companyId);
      if (!existingConsent) {
        throw new ConsentValidationError('Consent record not found');
      }

      if (existingConsent.status === 'withdrawn') {
        throw new ConsentValidationError('Consent already withdrawn');
      }

      // Get template to check if withdrawal is allowed
      const template = await this.getConsentTemplate(existingConsent.template_id);
      if (template && !template.withdrawal_allowed) {
        throw new ConsentValidationError('Consent withdrawal not allowed for this type');
      }

      // Withdraw the consent
      const withdrawnConsent = await this.updateConsent(
        consentId,
        userId,
        companyId,
        {
          status: 'withdrawn',
          withdrawal_reason: withdrawalData.reason
        },
        context
      );

      if (withdrawnConsent) {
        logger.info('Consent withdrawn successfully', {
          consentId,
          userId,
          companyId,
          reason: withdrawalData.reason
        });
      }

      return withdrawnConsent;
    } catch (error) {
      logger.error('Failed to withdraw consent', {
        consentId,
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get user consents with filtering and pagination
   */
  static async getUserConsents(
    userId: string,
    companyId: string,
    filters: ConsentSearchFilters = {},
    context?: { requestId?: string }
  ): Promise<{ consents: UserConsent[]; total: number }> {
    try {
      logger.debug('Getting user consents', {
        userId,
        companyId,
        filters,
        requestId: context?.requestId
      });

      const { query, params } = this.buildConsentSearchQuery(userId, companyId, filters);
      
      // Get total count
      const countQuery = query.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) FROM').replace(/ORDER BY .*? LIMIT .*? OFFSET .*?$/, '');
      const countResult = await sql.select<{ count: number }>(countQuery, params.slice(0, -2), companyId);
      const total = countResult[0]?.count || 0;

      // Get consents
      const consents = await sql.select<UserConsent>(query, params, companyId);

      // Decrypt consent data for each consent
      for (const consent of consents) {
        if (consent.consent_data && typeof consent.consent_data === 'string') {
          try {
            consent.consent_data = JSON.parse(await decrypt(consent.consent_data));
          } catch (decryptError) {
            logger.warn('Failed to decrypt consent data', {
              consentId: consent.id,
              error: decryptError instanceof Error ? decryptError.message : String(decryptError)
            });
            consent.consent_data = {};
          }
        }
      }

      return { consents, total };
    } catch (error) {
      logger.error('Failed to get user consents', {
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get consent by ID
   */
  static async getConsentById(
    consentId: string,
    userId: string,
    companyId: string,
    context?: { requestId?: string }
  ): Promise<UserConsent | null> {
    try {
      logger.debug('Getting consent by ID', {
        consentId,
        userId,
        companyId,
        requestId: context?.requestId
      });

      const consents = await sql.select<UserConsent>(
        `SELECT * FROM user_consents
         WHERE id = $1 AND user_id = $2 AND company_id = $3`,
        [consentId, userId, companyId],
        companyId
      );

      if (consents.length === 0) {
        return null;
      }

      const consent = consents[0];

      // Decrypt consent data
      if (consent.consent_data && typeof consent.consent_data === 'string') {
        try {
          consent.consent_data = JSON.parse(await decrypt(consent.consent_data));
        } catch (decryptError) {
          logger.warn('Failed to decrypt consent data', {
            consentId: consent.id,
            error: decryptError instanceof Error ? decryptError.message : String(decryptError)
          });
          consent.consent_data = {};
        }
      }

      return consent;
    } catch (error) {
      logger.error('Failed to get consent by ID', {
        consentId,
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get active consent for a specific type
   */
  static async getActiveConsent(
    userId: string,
    companyId: string,
    consentType: string,
    context?: { requestId?: string }
  ): Promise<UserConsent | null> {
    try {
      logger.debug('Getting active consent', {
        userId,
        companyId,
        consentType,
        requestId: context?.requestId
      });

      const consents = await sql.select<UserConsent>(
        `SELECT * FROM user_consents
         WHERE user_id = $1 AND company_id = $2 AND consent_type = $3 AND status = 'active'
         ORDER BY granted_at DESC
         LIMIT 1`,
        [userId, companyId, consentType],
        companyId
      );

      if (consents.length === 0) {
        return null;
      }

      const consent = consents[0];

      // Decrypt consent data
      if (consent.consent_data && typeof consent.consent_data === 'string') {
        try {
          consent.consent_data = JSON.parse(await decrypt(consent.consent_data));
        } catch (decryptError) {
          logger.warn('Failed to decrypt consent data', {
            consentId: consent.id,
            error: decryptError instanceof Error ? decryptError.message : String(decryptError)
          });
          consent.consent_data = {};
        }
      }

      return consent;
    } catch (error) {
      logger.error('Failed to get active consent', {
        userId,
        companyId,
        consentType,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get consent templates
   */
  static async getConsentTemplates(
    companyId?: string,
    context?: { requestId?: string }
  ): Promise<ConsentTemplate[]> {
    try {
      logger.debug('Getting consent templates', {
        companyId,
        requestId: context?.requestId
      });

      const templates = await sql.select<ConsentTemplate>(
        `SELECT * FROM consent_templates WHERE is_active = true ORDER BY consent_type, name`,
        [],
        companyId
      );

      return templates;
    } catch (error) {
      logger.error('Failed to get consent templates', {
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get consent template by ID
   */
  static async getConsentTemplate(
    templateId: string,
    context?: { requestId?: string }
  ): Promise<ConsentTemplate | null> {
    try {
      logger.debug('Getting consent template by ID', {
        templateId,
        requestId: context?.requestId
      });

      const templates = await sql.select<ConsentTemplate>(
        `SELECT * FROM consent_templates WHERE id = $1`,
        [templateId]
      );

      return templates.length > 0 ? templates[0] : null;
    } catch (error) {
      logger.error('Failed to get consent template by ID', {
        templateId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Create consent template
   */
  static async createConsentTemplate(
    templateData: CreateConsentTemplateRequest,
    context?: { requestId?: string; createdBy?: string }
  ): Promise<ConsentTemplate | null> {
    try {
      logger.info('Creating consent template', {
        name: templateData.name,
        consentType: templateData.consent_type,
        requestId: context?.requestId
      });

      // Validate template data
      await this.validateConsentTemplate(templateData);

      const newTemplate = await sql.insert<ConsentTemplate>(
        `INSERT INTO consent_templates (
          id, name, description, version, consent_type, is_active, is_required,
          expiration_days, withdrawal_allowed, data_retention_days, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          randomUUID(),
          templateData.name,
          templateData.description,
          templateData.version || DEFAULT_CONSENT_VERSION,
          templateData.consent_type,
          templateData.is_active !== undefined ? templateData.is_active : true,
          templateData.is_required !== undefined ? templateData.is_required : false,
          templateData.expiration_days || null,
          templateData.withdrawal_allowed !== undefined ? templateData.withdrawal_allowed : true,
          templateData.data_retention_days || DEFAULT_DATA_RETENTION_DAYS,
          context?.createdBy || 'system'
        ]
      );

      if (newTemplate) {
        logger.info('Consent template created successfully', {
          templateId: newTemplate.id,
          name: newTemplate.name,
          consentType: newTemplate.consent_type
        });
      }

      return newTemplate;
    } catch (error) {
      logger.error('Failed to create consent template', {
        name: templateData.name,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get consent audit log
   */
  static async getConsentAuditLog(
    consentId: string,
    userId: string,
    companyId: string,
    filters: ConsentAuditSearchFilters = {},
    context?: { requestId?: string }
  ): Promise<{ logs: ConsentAuditLog[]; total: number }> {
    try {
      logger.debug('Getting consent audit log', {
        consentId,
        userId,
        companyId,
        filters,
        requestId: context?.requestId
      });

      const { query, params } = this.buildAuditLogSearchQuery(consentId, userId, companyId, filters);
      
      // Get total count
      const countQuery = query.replace(/SELECT .*? FROM/, 'SELECT COUNT(*) FROM').replace(/ORDER BY .*? LIMIT .*? OFFSET .*?$/, '');
      const countResult = await sql.select<{ count: number }>(countQuery, params.slice(0, -2), companyId);
      const total = countResult[0]?.count || 0;

      // Get audit logs
      const logs = await sql.select<ConsentAuditLog>(query, params, companyId);

      return { logs, total };
    } catch (error) {
      logger.error('Failed to get consent audit log', {
        consentId,
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Check for expired consents and update their status
   */
  static async checkExpiredConsents(
    context?: { requestId?: string }
  ): Promise<number> {
    try {
      logger.info('Checking for expired consents', {
        requestId: context?.requestId
      });

      // Call the database function to check expired consents
      const result = await sql.execute('SELECT check_expired_consents()');

      logger.info('Expired consents check completed', {
        updatedCount: result,
        requestId: context?.requestId
      });

      return result || 0;
    } catch (error) {
      logger.error('Failed to check expired consents', {
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Get consent summary for a user
   */
  static async getConsentSummary(
    userId: string,
    companyId: string,
    context?: { requestId?: string }
  ): Promise<ConsentSummary> {
    try {
      logger.debug('Getting consent summary', {
        userId,
        companyId,
        requestId: context?.requestId
      });

      // Get consent statistics
      const stats = await sql.select<{
        total_consents: number;
        active_consents: number;
        withdrawn_consents: number;
        expired_consents: number;
      }>(
        `SELECT 
           COUNT(*) as total_consents,
           COUNT(CASE WHEN status = 'active' THEN 1 END) as active_consents,
           COUNT(CASE WHEN status = 'withdrawn' THEN 1 END) as withdrawn_consents,
           COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_consents
         FROM user_consents
         WHERE user_id = $1 AND company_id = $2`,
        [userId, companyId],
        companyId
      );

      // Get consents by type
      const byType = await sql.select<{ consent_type: string; count: number }>(
        `SELECT consent_type, COUNT(*) as count
         FROM user_consents
         WHERE user_id = $1 AND company_id = $2
         GROUP BY consent_type`,
        [userId, companyId],
        companyId
      );

      // Get recent activity
      const recentActivity = await sql.select<ConsentAuditLog>(
        `SELECT * FROM consent_audit_log
         WHERE user_id = $1 AND company_id = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId, companyId],
        companyId
      );

      const statsData = stats[0] || {
        total_consents: 0,
        active_consents: 0,
        withdrawn_consents: 0,
        expired_consents: 0
      };

      const consentsByType: Record<string, number> = {};
      byType.forEach(item => {
        consentsByType[item.consent_type] = item.count;
      });

      return {
        total_consents: statsData.total_consents,
        active_consents: statsData.active_consents,
        withdrawn_consents: statsData.withdrawn_consents,
        expired_consents: statsData.expired_consents,
        consents_by_type: consentsByType as any,
        recent_activity: recentActivity
      };
    } catch (error) {
      logger.error('Failed to get consent summary', {
        userId,
        companyId,
        error: error instanceof Error ? error.message : String(error),
        requestId: context?.requestId
      });
      throw error;
    }
  }

  /**
   * Validate consent request data
   */
  private static async validateConsentRequest(
    userId: string,
    companyId: string,
    consentData: CreateConsentRequest
  ): Promise<void> {
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (!consentData.template_id) {
      errors.push({ field: 'template_id', message: 'Template ID is required', code: 'REQUIRED' });
    }

    if (!consentData.consent_type) {
      errors.push({ field: 'consent_type', message: 'Consent type is required', code: 'REQUIRED' });
    }

    const validTypes = ['marketing', 'analytics', 'functional', 'third_party', 'legal'];
    if (consentData.consent_type && !validTypes.includes(consentData.consent_type)) {
      errors.push({ field: 'consent_type', message: 'Invalid consent type', code: 'INVALID_VALUE' });
    }

    if (errors.length > 0) {
      throw new ConsentValidationError('Validation failed', errors);
    }
  }

  /**
   * Validate consent template data
   */
  private static async validateConsentTemplate(
    templateData: CreateConsentTemplateRequest
  ): Promise<void> {
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (!templateData.name) {
      errors.push({ field: 'name', message: 'Name is required', code: 'REQUIRED' });
    }

    if (!templateData.description) {
      errors.push({ field: 'description', message: 'Description is required', code: 'REQUIRED' });
    }

    if (!templateData.consent_type) {
      errors.push({ field: 'consent_type', message: 'Consent type is required', code: 'REQUIRED' });
    }

    const validTypes = ['marketing', 'analytics', 'functional', 'third_party', 'legal'];
    if (templateData.consent_type && !validTypes.includes(templateData.consent_type)) {
      errors.push({ field: 'consent_type', message: 'Invalid consent type', code: 'INVALID_VALUE' });
    }

    if (errors.length > 0) {
      throw new ConsentValidationError('Template validation failed', errors);
    }
  }

  /**
   * Check if status transition is valid
   */
  private static isValidStatusTransition(
    fromStatus: string,
    toStatus: string
  ): boolean {
    const validTransitions: Record<string, string[]> = {
      'active': ['withdrawn', 'expired'],
      'withdrawn': [], // Withdrawal is final
      'expired': ['active'] // Can be renewed
    };

    return validTransitions[fromStatus]?.includes(toStatus) || false;
  }

  /**
   * Build consent search query
   */
  private static buildConsentSearchQuery(
    userId: string,
    companyId: string,
    filters: ConsentSearchFilters
  ): { query: string; params: any[] } {
    let query = `SELECT * FROM user_consents WHERE user_id = $1 AND company_id = $2`;
    const params: any[] = [userId, companyId];
    let paramIndex = 3;

    if (filters.consent_type) {
      query += ` AND consent_type = $${paramIndex++}`;
      params.push(filters.consent_type);
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.granted_after) {
      query += ` AND granted_at >= $${paramIndex++}`;
      params.push(filters.granted_after);
    }

    if (filters.granted_before) {
      query += ` AND granted_at <= $${paramIndex++}`;
      params.push(filters.granted_before);
    }

    if (filters.expires_after) {
      query += ` AND expires_at >= $${paramIndex++}`;
      params.push(filters.expires_after);
    }

    if (filters.expires_before) {
      query += ` AND expires_at <= $${paramIndex++}`;
      params.push(filters.expires_before);
    }

    query += ` ORDER BY granted_at DESC`;

    const limit = filters.limit || 50;
    const page = filters.page || 1;
    const offset = (page - 1) * limit;

    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    return { query, params };
  }

  /**
   * Build audit log search query
   */
  private static buildAuditLogSearchQuery(
    consentId: string,
    userId: string,
    companyId: string,
    filters: ConsentAuditSearchFilters
  ): { query: string; params: any[] } {
    let query = `SELECT * FROM consent_audit_log WHERE consent_id = $1 AND user_id = $2 AND company_id = $3`;
    const params: any[] = [consentId, userId, companyId];
    let paramIndex = 4;

    if (filters.action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(filters.action);
    }

    if (filters.created_after) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.created_after);
    }

    if (filters.created_before) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.created_before);
    }

    query += ` ORDER BY created_at DESC`;

    const limit = filters.limit || AUDIT_LOG_LIMIT;
    const page = filters.page || 1;
    const offset = (page - 1) * limit;

    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    return { query, params };
  }
}

export default ConsentManagementService;