// Settings service
// Handles loading company-specific settings with environment fallbacks

import { sql } from '@/lib/db';
import { env, additionalEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface CompanySettings {
  company_id: string;
  enable_push: boolean;
  enable_dm: boolean;
  incentive_days: number;
  reminder_offsets_days: number[];
  updated_at: string;
}

// Default settings (from environment)
const DEFAULT_SETTINGS: Omit<CompanySettings, 'company_id' | 'updated_at'> = {
  enable_push: additionalEnv.ENABLE_PUSH === 'true' || false,
  enable_dm: additionalEnv.ENABLE_DM === 'true' || false,
  incentive_days: additionalEnv.DEFAULT_INCENTIVE_DAYS || 0,
  reminder_offsets_days: (additionalEnv as any).REMINDER_OFFSETS_DAYS || []
};

// Get settings for a company (with fallback to defaults)
export async function getSettingsForCompany(companyId: string): Promise<CompanySettings> {
  try {
    const settings = await sql.select<CompanySettings>(
      'SELECT company_id, enable_push, enable_dm, incentive_days, reminder_offsets_days, updated_at FROM creator_settings WHERE company_id = $1',
      [companyId]
    );

    if (settings.length > 0) {
      return settings[0];
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
export async function upsertSettingsForCompany(settings: CompanySettings): Promise<boolean> {
  try {
    await sql.execute(
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
      ]
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











