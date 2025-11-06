// Incentive service
// Handles adding free days to memberships as recovery incentives

import { env, additionalEnv } from '@/lib/env';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { addMembershipFreeDaysWithRetry } from './memberships';
import { getSettingsForCompany } from './settings';
import {
  errorHandler,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  createDatabaseError,
  createExternalApiError,
  createBusinessLogicError,
  AppError
} from '@/lib/errorHandler';

export interface IncentiveResult {
  success: boolean;
  daysAdded?: number;
  error?: string;
}

// Main incentive function - add free days to a membership with retry/backoff
export async function applyRecoveryIncentive(
  membershipId: string,
  caseId: string,
  companyId: string
): Promise<IncentiveResult> {
  const result = await errorHandler.wrapAsync(
    async () => {
      // Get per-company incentive settings
      const companySettings = await getSettingsForCompany(companyId);
      const incentiveDays = companySettings.incentive_days;

      // Skip if no incentive days configured
      if (incentiveDays <= 0) {
        logger.info('Incentives disabled (0 days)', { membershipId, caseId, companyId });
        return { success: true, daysAdded: 0 };
      }

      logger.info('Applying recovery incentive', {
        membershipId,
        caseId,
        companyId,
        incentiveDays,
      });

      // Add free days via Whop API with retry/backoff
      const apiResult = await addMembershipFreeDaysWithRetry(membershipId, incentiveDays);

      if (apiResult.success) {
        // Persist incentive_days in the recovery case to track that incentive was applied
        const persistResult = await errorHandler.wrapAsync(
          async () => {
            await sql.execute(
              `UPDATE recovery_cases
               SET incentive_days = $1, updated_at = NOW()
               WHERE id = $2 AND company_id = $3 AND incentive_days = 0`,
              [incentiveDays, caseId, companyId]
            );

            logger.info('Recovery incentive persisted to case', {
              caseId,
              incentiveDays
            });
          },
          ErrorCode.DATABASE_QUERY_ERROR,
          { caseId, incentiveDays, companyId }
        );

        if (!persistResult.success) {
          // Log but don't fail - incentive was applied to membership
          logger.warn('Failed to persist incentive to database, but API call succeeded', {
            caseId,
            incentiveDays
          });
        }

        logger.info('Recovery incentive applied successfully', {
          membershipId,
          caseId,
          daysAdded: incentiveDays,
        });

        return {
          success: true,
          daysAdded: incentiveDays,
        };
      } else {
        logger.error('Failed to apply recovery incentive after retries', {
          membershipId,
          caseId,
          error: apiResult.error,
          attempts: apiResult.attempts,
        });

        // Log failure to recovery_actions for audit and potential reattempt
        const logResult = await errorHandler.wrapAsync(
          async () => {
            await sql.execute(
              `INSERT INTO recovery_actions (company_id, case_id, membership_id, user_id, type, metadata)
               VALUES ($1, $2, $3, (SELECT user_id FROM recovery_cases WHERE id = $2), 'incentive_failed', $4)`,
              [companyId, caseId, membershipId, JSON.stringify({
                error: apiResult.error,
                attempts: apiResult.attempts,
                incentiveDays,
                canRetry: true
              })]
            );
          },
          ErrorCode.DATABASE_QUERY_ERROR,
          { caseId, membershipId, companyId }
        );

        if (!logResult.success) {
          logger.warn('Failed to log incentive failure to audit table', {
            caseId,
            membershipId
          });
        }

        return {
          success: false,
          error: apiResult.error || 'Failed to add free days after retries',
        };
      }
    },
    ErrorCode.EXTERNAL_API_ERROR,
    { membershipId, caseId, companyId }
  );

  if (!result.success) {
    // Error already logged by errorHandler
    return {
      success: false,
      error: result.error!.message
    };
  }

  return result.data!;
}

// Check if incentives are enabled for a company
export async function areIncentivesEnabled(companyId?: string): Promise<boolean> {
  if (!companyId) {
    return additionalEnv.DEFAULT_INCENTIVE_DAYS > 0;
  }

  const companySettings = await getSettingsForCompany(companyId);
  return companySettings.incentive_days > 0;
}

// Get the configured incentive amount for a company
export async function getIncentiveDays(companyId?: string): Promise<number> {
  if (!companyId) {
    return additionalEnv.DEFAULT_INCENTIVE_DAYS;
  }

  const companySettings = await getSettingsForCompany(companyId);
  return companySettings.incentive_days;
}

// Validate incentive configuration
export function validateIncentiveConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (additionalEnv.DEFAULT_INCENTIVE_DAYS < 0) {
    errors.push('DEFAULT_INCENTIVE_DAYS cannot be negative');
  }

  if (additionalEnv.DEFAULT_INCENTIVE_DAYS > 365) {
    errors.push('DEFAULT_INCENTIVE_DAYS cannot exceed 365 days');
  }

  // Could add more validation here for company-specific settings

  return {
    valid: errors.length === 0,
    errors,
  };
}











