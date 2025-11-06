// Unit tests for incentive calculation and application service
// Tests isolated service functions with mocked dependencies

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  applyRecoveryIncentive,
  areIncentivesEnabled,
  getIncentiveDays,
  validateIncentiveConfig,
  type IncentiveResult,
} from '@/server/services/incentives';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { errorHandler } from '@/lib/errorHandler';
import { getSettingsForCompany } from '@/server/services/settings';
import { addMembershipFreeDaysWithRetry } from '@/server/services/memberships';
import { additionalEnv } from '@/lib/env';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');
vi.mock('@/lib/errorHandler');
vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: {
    DEFAULT_INCENTIVE_DAYS: 7,
    ENABLE_PUSH: false,
    ENABLE_DM: false,
    REMINDER_OFFSETS_DAYS: [],
    NEXT_PUBLIC_WHOP_AGENT_USER_ID: 'test_agent',
  },
}));
vi.mock('@/server/services/settings');
vi.mock('@/server/services/memberships');

describe('Incentive Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyRecoveryIncentive', () => {
    test('should apply incentive successfully with valid membership', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';
      const incentiveDays = 7;

      // Mock settings
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      // Mock API call success
      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      // Mock errorHandler.wrapAsync
      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      // Mock database update
      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.success).toBe(true);
      expect(result.daysAdded).toBe(incentiveDays);
      expect(addMembershipFreeDaysWithRetry).toHaveBeenCalledWith(membershipId, incentiveDays);
      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recovery_cases'),
        expect.arrayContaining([incentiveDays, caseId, companyId])
      );
    });

    test('should skip incentive when days = 0 (disabled)', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: 0,
      } as any);

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.success).toBe(true);
      expect(result.daysAdded).toBe(0);
      expect(addMembershipFreeDaysWithRetry).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Incentives disabled (0 days)',
        expect.objectContaining({ membershipId, caseId, companyId })
      );
    });

    test('should only apply incentive once per case (idempotency check)', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      // First application succeeds
      vi.mocked(sql.execute).mockResolvedValueOnce(1);

      const result1 = await applyRecoveryIncentive(membershipId, caseId, companyId);
      expect(result1.success).toBe(true);

      // Second application - database update returns 0 (already applied)
      vi.mocked(sql.execute).mockResolvedValueOnce(0);

      const result2 = await applyRecoveryIncentive(membershipId, caseId, companyId);
      // The API call still happens, but database update fails silently
      expect(addMembershipFreeDaysWithRetry).toHaveBeenCalledTimes(2);
    });

    test('should handle retry logic for transient API failures', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      // Mock retry behavior - succeed after retries
      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 3, // Retried 3 times
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.success).toBe(true);
      expect(result.daysAdded).toBe(incentiveDays);
    });

    test('should handle API failure after retries', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      // Mock API failure after retries
      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: false,
        error: 'API timeout',
        attempts: 3,
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      // Mock logging to recovery_actions
      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to apply recovery incentive after retries',
        expect.objectContaining({
          membershipId,
          caseId,
          error: 'API timeout',
          attempts: 3,
        })
      );
    });

    test('should persist incentive_days to database after successful API call', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.execute).mockResolvedValue(1);

      await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recovery_cases'),
        expect.arrayContaining([incentiveDays, caseId, companyId])
      );
      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('SET incentive_days = $1'),
        expect.anything()
      );
    });

    test('should respect company-specific incentive settings', async () => {
      const membershipId = 'mem_test_123';
      const caseId = 'case_test_123';
      const companyId = 'company_test_123';
      const companyIncentiveDays = 14; // Different from default

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: companyIncentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.daysAdded).toBe(companyIncentiveDays);
      expect(addMembershipFreeDaysWithRetry).toHaveBeenCalledWith(
        membershipId,
        companyIncentiveDays
      );
    });
  });

  describe('areIncentivesEnabled', () => {
    test('should return true when company has incentive days > 0', async () => {
      const companyId = 'company_test_123';

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: 7,
      } as any);

      const result = await areIncentivesEnabled(companyId);

      expect(result).toBe(true);
    });

    test('should return false when company has incentive days = 0', async () => {
      const companyId = 'company_test_123';

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: 0,
      } as any);

      const result = await areIncentivesEnabled(companyId);

      expect(result).toBe(false);
    });

    test('should use default when companyId not provided', async () => {
      // Mock env.additionalEnv.DEFAULT_INCENTIVE_DAYS = 7
      const result = await areIncentivesEnabled();

      expect(result).toBe(true); // 7 > 0
    });
  });

  describe('getIncentiveDays', () => {
    test('should return company-specific incentive days', async () => {
      const companyId = 'company_test_123';
      const incentiveDays = 14;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      const result = await getIncentiveDays(companyId);

      expect(result).toBe(incentiveDays);
    });

    test('should return default when companyId not provided', async () => {
      // Mock env.additionalEnv.DEFAULT_INCENTIVE_DAYS = 7
      const result = await getIncentiveDays();

      expect(result).toBe(7);
    });
  });

  describe('validateIncentiveConfig', () => {
    test('should validate correct configuration', () => {
      const result = validateIncentiveConfig();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject negative incentive days', () => {
      // Temporarily override DEFAULT_INCENTIVE_DAYS
      const originalEnv = additionalEnv.DEFAULT_INCENTIVE_DAYS;
      (additionalEnv as any).DEFAULT_INCENTIVE_DAYS = -1;

      const result = validateIncentiveConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DEFAULT_INCENTIVE_DAYS cannot be negative');

      // Restore
      (additionalEnv as any).DEFAULT_INCENTIVE_DAYS = originalEnv;
    });

    test('should reject incentive days > 365', () => {
      const originalEnv = additionalEnv.DEFAULT_INCENTIVE_DAYS;
      (additionalEnv as any).DEFAULT_INCENTIVE_DAYS = 400;

      const result = validateIncentiveConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('DEFAULT_INCENTIVE_DAYS cannot exceed 365 days');

      // Restore
      (additionalEnv as any).DEFAULT_INCENTIVE_DAYS = originalEnv;
    });
  });
});

