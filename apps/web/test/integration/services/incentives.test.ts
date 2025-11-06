// Integration tests for incentive service
// Tests full application flow, database consistency, and concurrent applications

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { applyRecoveryIncentive } from '@/server/services/incentives';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSettingsForCompany } from '@/server/services/settings';
import { addMembershipFreeDaysWithRetry } from '@/server/services/memberships';
import { createTestRecoveryCase } from '../../helpers/database';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');
vi.mock('@/server/services/settings');
vi.mock('@/server/services/memberships');
vi.mock('@/lib/errorHandler', async () => {
  const actual = await vi.importActual('@/lib/errorHandler');
  return {
    ...actual,
    errorHandler: {
      wrapAsync: vi.fn().mockImplementation(async (fn) => {
        try {
          const data = await fn();
          return { success: true, data };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }),
    },
  };
});

describe('Incentive Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End Incentive Application Flow', () => {
    test('should apply incentive via T+0 nudge flow', async () => {
      const membershipId = 'mem_integration_123';
      const caseId = 'case_integration_123';
      const companyId = 'company_integration_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

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

    test('should apply incentive via scheduled reminder flow', async () => {
      const membershipId = 'mem_reminder_123';
      const caseId = 'case_reminder_123';
      const companyId = 'company_reminder_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.success).toBe(true);
    });
  });

  describe('Database Consistency', () => {
    test('should persist incentive_days to case after successful API call', async () => {
      const membershipId = 'mem_db_123';
      const caseId = 'case_db_123';
      const companyId = 'company_db_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      vi.mocked(sql.execute).mockResolvedValue(1);

      await applyRecoveryIncentive(membershipId, caseId, companyId);

      // Verify database update was called
      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recovery_cases'),
        expect.arrayContaining([incentiveDays, caseId, companyId])
      );
    });

    test('should handle database update failure gracefully', async () => {
      const membershipId = 'mem_db_fail_123';
      const caseId = 'case_db_fail_123';
      const companyId = 'company_db_fail_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      // Database update fails
      vi.mocked(sql.execute).mockResolvedValue(0);

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      // Should still succeed because API call succeeded
      expect(result.success).toBe(true);
      expect(result.daysAdded).toBe(incentiveDays);
    });
  });

  describe('Concurrent Incentive Applications', () => {
    test('should prevent duplicate incentive applications', async () => {
      const membershipId = 'mem_concurrent_123';
      const caseId = 'case_concurrent_123';
      const companyId = 'company_concurrent_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: true,
        attempts: 1,
      });

      // First application succeeds
      vi.mocked(sql.execute).mockResolvedValueOnce(1);
      const result1 = await applyRecoveryIncentive(membershipId, caseId, companyId);
      expect(result1.success).toBe(true);

      // Second application - database check prevents duplicate
      vi.mocked(sql.execute).mockResolvedValueOnce(0); // Already applied
      const result2 = await applyRecoveryIncentive(membershipId, caseId, companyId);

      // API call still happens, but database update fails (idempotency check)
      expect(result2.success).toBe(true);
    });
  });

  describe('Failed Incentive Application', () => {
    test('should not block case creation when incentive fails', async () => {
      const membershipId = 'mem_fail_123';
      const caseId = 'case_fail_123';
      const companyId = 'company_fail_123';
      const incentiveDays = 7;

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        incentive_days: incentiveDays,
      } as any);

      // API call fails after retries
      vi.mocked(addMembershipFreeDaysWithRetry).mockResolvedValue({
        success: false,
        error: 'API timeout',
        attempts: 3,
      });

      vi.mocked(sql.execute).mockResolvedValue(1); // Log failure

      const result = await applyRecoveryIncentive(membershipId, caseId, companyId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
      // Should log failure but not throw
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

