// Settings service
// Handles loading company-specific settings with environment fallbacks

import { sqlWithRLS } from '@/lib/db-rls';
import { env, additionalEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface CompanySettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  sender_whop_user_id?: string | null;
  updated_at: string;
}

// Default settings (from environment)
const DEFAULT_SETTINGS: Omit<CompanySettings, 'company_id' | 'updated_at'> = {
  enable_push: additionalEnv.ENABLE_PUSH === 'true' || false,
  enable_dm: additionalEnv.ENABLE_DM === 'true' || false,
  incentive_days: additionalEnv.DEFAULT_INCENTIVE_DAYS || 0,
  reminder_offsets_days: (additionalEnv as any).REMINDER_OFFSETS_DAYS || [],
  sender_whop_user_id: null
};

// Get settings for a company (with fallback to defaults)
// Uses RLS to ensure tenant isolation - companyId must match authenticated context
export async function getSettingsForCompany(companyId: string): Promise<CompanySettings> {
  try {
    // Check if sender_whop_user_id column exists (migration 037 may not be applied yet)
    let hasSenderWhopUserIdColumn = false;
    try {
      const columnCheck = await sqlWithRLS.select(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_settings' AND column_name = 'sender_whop_user_id') as has_sender_id`,
        [],
        { companyId, enforceCompanyContext: false, skipRLS: true }
      );
      hasSenderWhopUserIdColumn = (columnCheck[0] as { has_sender_id: boolean })?.has_sender_id ?? false;
    } catch {
      hasSenderWhopUserIdColumn = false;
    }

    // Build SELECT query based on available columns
    const selectColumns = hasSenderWhopUserIdColumn
      ? 'company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, sender_whop_user_id, updated_at'
      : 'company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at';

    const settings = await sqlWithRLS.select<CompanySettings>(
      `SELECT ${selectColumns} FROM creator_settings WHERE company_id = $1`,
      [companyId],
      { companyId, enforceCompanyContext: true }
    );

    if (settings.length > 0) {
      // Ensure sender_whop_user_id has a default value if column doesn't exist
      return {
        ...settings[0],
        sender_whop_user_id: settings[0].sender_whop_user_id ?? null
      };
    }

    // Return defaults if no settings found
    logger.info('Using default settings for company', { companyId });
    return {
      company_id: companyId,
      ...DEFAULT_SETTINGS,
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Failed to load company settings, using defaults', {
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      company_id: companyId,
      ...DEFAULT_SETTINGS,
      updated_at: new Date().toISOString()
    };
  }
}

// Create or update settings for a company
// Uses RLS to ensure tenant isolation - companyId must match authenticated context
export async function upsertSettingsForCompany(settings: CompanySettings): Promise<boolean> {
  try {
    await sqlWithRLS.execute(
      `INSERT INTO creator_settings (
        company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (company_id) DO UPDATE SET
        enable_push = EXCLUDED.enable_push,
        enable_dm = EXCLUDED.enable_dm,
        incentive_days = EXCLUDED.incentive_days,
        reminder_offsets_days = EXCLUDED.reminder_offsets_days,
        updated_at = EXCLUDED.updated_at`,
      [
        settings.company_id,
        settings.enable_push,
        settings.enable_dm,
        settings.incentive_days,
        settings.reminder_offsets_days,
        settings.updated_at
      ],
      { companyId: settings.company_id, enforceCompanyContext: true }
    );

    logger.info('Settings updated for company', { companyId: settings.company_id });
    return true;

  } catch (error) {
    logger.error('Failed to update company settings', {
      companyId: settings.company_id,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}











