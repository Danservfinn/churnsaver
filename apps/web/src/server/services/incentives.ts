// Incentive service
// Handles adding free days to memberships as recovery incentives

import { env } from '@/lib/env';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { addMembershipFreeDaysWithRetry } from './memberships';
import { getSettingsForCompany } from './settings';

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
  try {
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
    const result = await addMembershipFreeDaysWithRetry(membershipId, incentiveDays);

    if (result.success) {
      // Persist incentive_days in the recovery case to track that incentive was applied
      try {
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
      } catch (persistError) {
        logger.error('Failed to persist incentive_days to recovery case', {
          caseId,
          incentiveDays,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        });
        // Don't fail the whole operation if persistence fails - incentive was applied
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
        error: result.error,
        attempts: result.attempts,
      });

      // Log failure to recovery_actions for audit and potential reattempt
      try {
        await sql.execute(
          `INSERT INTO recovery_actions (company_id, case_id, membership_id, user_id, type, metadata)
           VALUES ($1, $2, $3, (SELECT user_id FROM recovery_cases WHERE id = $2), 'incentive_failed', $4)`,
          [companyId, caseId, membershipId, JSON.stringify({
            error: result.error,
            attempts: result.attempts,
            incentiveDays,
            canRetry: true
          })]
        );
      } catch (logError) {
        logger.error('Failed to log incentive failure', {
          caseId,
          error: logError instanceof Error ? logError.message : String(logError),
        });
      }

      return {
        success: false,
        error: result.error || 'Failed to add free days after retries',
      };
    }
  } catch (error) {
    logger.error('Recovery incentive error', {
      membershipId,
      caseId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Incentive service error',
    };
  }
}

// Check if incentives are enabled for a company
export async function areIncentivesEnabled(companyId?: string): Promise<boolean> {
  if (!companyId) {
    return env.DEFAULT_INCENTIVE_DAYS > 0;
  }

  const companySettings = await getSettingsForCompany(companyId);
  return companySettings.incentive_days > 0;
}

// Get the configured incentive amount for a company
export async function getIncentiveDays(companyId?: string): Promise<number> {
  if (!companyId) {
    return env.DEFAULT_INCENTIVE_DAYS;
  }

  const companySettings = await getSettingsForCompany(companyId);
  return companySettings.incentive_days;
}

// Validate incentive configuration
export function validateIncentiveConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (env.DEFAULT_INCENTIVE_DAYS < 0) {
    errors.push('DEFAULT_INCENTIVE_DAYS cannot be negative');
  }

  if (env.DEFAULT_INCENTIVE_DAYS > 365) {
    errors.push('DEFAULT_INCENTIVE_DAYS cannot exceed 365 days');
  }

  // Could add more validation here for company-specific settings

  return {
    valid: errors.length === 0,
    errors,
  };
}





