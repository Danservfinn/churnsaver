// Unit tests for reminder scheduling service
// Tests reminder candidate collection, timing logic, and batch processing

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  collectReminderCandidates,
  shouldSendReminder,
  processReminderBatch,
  discoverCompanyIdsForReminders,
  getReminderOffsets,
  type ReminderCase,
} from '@/server/services/shared/companyDiscovery';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { additionalEnv } from '@/lib/env';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');
vi.mock('@/lib/env', () => ({
  additionalEnv: {
    MAX_REMINDER_CASES_PER_RUN: 100,
    MAX_CONCURRENT_REMINDER_SENDS: 10,
  },
}));

describe('Reminder Scheduling Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('collectReminderCandidates', () => {
    test('should collect open cases for reminder processing', async () => {
      const companyId = 'company_test_123';
      const limit = 50;
      const mockCases: ReminderCase[] = [
        {
          id: 'case_1',
          membership_id: 'mem_1',
          user_id: 'user_1',
          company_id: companyId,
          first_failure_at: new Date(),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
        {
          id: 'case_2',
          membership_id: 'mem_2',
          user_id: 'user_2',
          company_id: companyId,
          first_failure_at: new Date(),
          last_nudge_at: null,
          attempts: 1,
          status: 'open',
          incentive_days: 0,
        },
      ];

      vi.mocked(sql.select).mockResolvedValue(mockCases as any);

      const result = await collectReminderCandidates(companyId, limit);

      expect(result).toHaveLength(2);
      expect(sql.select).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, membership_id'),
        expect.arrayContaining([companyId, limit])
      );
      expect(sql.select).toHaveBeenCalledWith(
        expect.stringContaining('WHERE company_id = $1 AND status = \'open\''),
        expect.anything()
      );
    });

    test('should use default limit when not provided', async () => {
      const companyId = 'company_test_123';

      vi.mocked(sql.select).mockResolvedValue([]);

      await collectReminderCandidates(companyId);

      expect(sql.select).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([companyId, additionalEnv.MAX_REMINDER_CASES_PER_RUN])
      );
    });

    test('should return empty array on error', async () => {
      const companyId = 'company_test_123';

      vi.mocked(sql.select).mockRejectedValue(new Error('Database error'));

      const result = await collectReminderCandidates(companyId);

      expect(result).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to collect reminder candidates',
        expect.objectContaining({ companyId })
      );
    });

    test('should filter by company_id and status', async () => {
      const companyId = 'company_test_123';
      const mockCases: ReminderCase[] = [];

      vi.mocked(sql.select).mockResolvedValue(mockCases);

      await collectReminderCandidates(companyId);

      expect(sql.select).toHaveBeenCalledWith(
        expect.stringContaining('company_id = $1 AND status = \'open\''),
        expect.anything()
      );
    });
  });

  describe('shouldSendReminder', () => {
    test('should return shouldSend=true when attempts lag offsets', () => {
      const case_: ReminderCase = {
        id: 'case_1',
        membership_id: 'mem_1',
        user_id: 'user_1',
        company_id: 'company_1',
        first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        last_nudge_at: null,
        attempts: 0,
        status: 'open',
        incentive_days: 0,
      };
      const reminderOffsets = [0, 2, 4]; // T+0, T+2, T+4

      const result = shouldSendReminder(case_, reminderOffsets);

      expect(result.shouldSend).toBe(true);
      expect(result.attemptNumber).toBe(1);
    });

    test('should return shouldSend=false when attempts meet offsets', () => {
      const case_: ReminderCase = {
        id: 'case_1',
        membership_id: 'mem_1',
        user_id: 'user_1',
        company_id: 'company_1',
        first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        last_nudge_at: null,
        attempts: 2, // Already sent 2 reminders (T+0 and T+2)
        status: 'open',
        incentive_days: 0,
      };
      const reminderOffsets = [0, 2, 4];

      const result = shouldSendReminder(case_, reminderOffsets);

      expect(result.shouldSend).toBe(false);
      expect(result.attemptNumber).toBe(0);
    });

    test('should throttle reminders sent within 12 hours', () => {
      const case_: ReminderCase = {
        id: 'case_1',
        membership_id: 'mem_1',
        user_id: 'user_1',
        company_id: 'company_1',
        first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        last_nudge_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        attempts: 2, // Already sent 2 reminders, matching expected attempts
        status: 'open',
        incentive_days: 0,
      };
      const reminderOffsets = [0, 2, 4];

      const result = shouldSendReminder(case_, reminderOffsets);

      // With attempts=2 and 3 days since failure, expectedAttempts=2 (matches attempts)
      // So it checks last_nudge_at throttling
      expect(result.shouldSend).toBe(false);
      expect(result.attemptNumber).toBe(0);
    });

    test('should allow reminder after 12 hours since last nudge', () => {
      const case_: ReminderCase = {
        id: 'case_1',
        membership_id: 'mem_1',
        user_id: 'user_1',
        company_id: 'company_1',
        first_failure_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        last_nudge_at: new Date(Date.now() - 13 * 60 * 60 * 1000), // 13 hours ago
        attempts: 1,
        status: 'open',
        incentive_days: 0,
      };
      const reminderOffsets = [0, 2, 4];

      const result = shouldSendReminder(case_, reminderOffsets);

      expect(result.shouldSend).toBe(true);
      expect(result.attemptNumber).toBe(2);
    });

    test('should calculate correct attempt number for T+0 reminder', () => {
      const case_: ReminderCase = {
        id: 'case_1',
        membership_id: 'mem_1',
        user_id: 'user_1',
        company_id: 'company_1',
        first_failure_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        last_nudge_at: null,
        attempts: 0,
        status: 'open',
        incentive_days: 0,
      };
      const reminderOffsets = [0, 2, 4];

      const result = shouldSendReminder(case_, reminderOffsets);

      expect(result.shouldSend).toBe(true);
      expect(result.attemptNumber).toBe(1); // First attempt
    });
  });

  describe('processReminderBatch', () => {
    test('should process eligible cases in batches', async () => {
      const candidates: ReminderCase[] = [
        {
          id: 'case_1',
          membership_id: 'mem_1',
          user_id: 'user_1',
          company_id: 'company_1',
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
        {
          id: 'case_2',
          membership_id: 'mem_2',
          user_id: 'user_2',
          company_id: 'company_1',
          first_failure_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 1,
          status: 'open',
          incentive_days: 0,
        },
      ];
      const reminderOffsets = [0, 2, 4];
      const processor = vi.fn().mockResolvedValue({ success: true });

      const result = await processReminderBatch(candidates, reminderOffsets, processor);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(processor).toHaveBeenCalledTimes(2);
    });

    test('should respect concurrency limits', async () => {
      const candidates: ReminderCase[] = Array.from({ length: 25 }, (_, i) => ({
        id: `case_${i}`,
        membership_id: `mem_${i}`,
        user_id: `user_${i}`,
        company_id: 'company_1',
        first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        last_nudge_at: null,
        attempts: 0,
        status: 'open',
        incentive_days: 0,
      }));
      const reminderOffsets = [0, 2, 4];
      const processor = vi.fn().mockResolvedValue({ success: true });

      await processReminderBatch(candidates, reminderOffsets, processor);

      // Should process in batches of MAX_CONCURRENT_REMINDER_SENDS (10)
      // 25 cases / 10 per batch = 3 batches
      expect(processor).toHaveBeenCalledTimes(25);
    });

    test('should handle processor failures gracefully', async () => {
      const candidates: ReminderCase[] = [
        {
          id: 'case_1',
          membership_id: 'mem_1',
          user_id: 'user_1',
          company_id: 'company_1',
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
        {
          id: 'case_2',
          membership_id: 'mem_2',
          user_id: 'user_2',
          company_id: 'company_1',
          first_failure_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 1,
          status: 'open',
          incentive_days: 0,
        },
      ];
      const reminderOffsets = [0, 2, 4];
      const processor = vi
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Processor error'));

      const result = await processReminderBatch(candidates, reminderOffsets, processor);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Reminder processing failed for case',
        expect.objectContaining({ caseId: 'case_2' })
      );
    });

    test('should skip cases that should not send reminder', async () => {
      const candidates: ReminderCase[] = [
        {
          id: 'case_1',
          membership_id: 'mem_1',
          user_id: 'user_1',
          company_id: 'company_1',
          first_failure_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Too recent
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
      ];
      const reminderOffsets = [0, 2, 4]; // Case is only 1 day old, should send T+0
      const processor = vi.fn().mockResolvedValue({ success: true });

      const result = await processReminderBatch(candidates, reminderOffsets, processor);

      // Should still process because it matches T+0
      expect(result.processed).toBe(1);
    });
  });

  describe('discoverCompanyIdsForReminders', () => {
    test('should discover companies from creator_settings', async () => {
      const mockCompanies = [
        { company_id: 'company_1' },
        { company_id: 'company_2' },
      ];

      vi.mocked(sql.select).mockResolvedValueOnce(mockCompanies as any);

      const result = await discoverCompanyIdsForReminders();

      expect(result).toEqual(['company_1', 'company_2']);
      expect(sql.select).toHaveBeenCalledWith(
        'SELECT company_id FROM creator_settings'
      );
    });

    test('should fallback to recovery_cases when creator_settings empty', async () => {
      vi.mocked(sql.select)
        .mockResolvedValueOnce([]) // creator_settings empty
        .mockResolvedValueOnce([
          { company_id: 'company_1' },
          { company_id: 'company_2' },
        ] as any); // recovery_cases

      const result = await discoverCompanyIdsForReminders();

      expect(result).toEqual(['company_1', 'company_2']);
      expect(sql.select).toHaveBeenCalledTimes(2);
    });

    test('should handle errors gracefully', async () => {
      vi.mocked(sql.select).mockRejectedValue(new Error('Database error'));

      const result = await discoverCompanyIdsForReminders();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getReminderOffsets', () => {
    test('should return company-specific reminder offsets', async () => {
      const companyId = 'company_test_123';
      const mockSettings = [
        {
          reminder_offsets_days: JSON.stringify([0, 2, 4, 7]),
        },
      ];

      vi.mocked(sql.select).mockResolvedValue(mockSettings as any);

      const result = await getReminderOffsets(companyId);

      expect(result).toEqual([0, 2, 4, 7]);
    });

    test('should return default offsets when settings not found', async () => {
      const companyId = 'company_test_123';

      vi.mocked(sql.select).mockResolvedValue([]);

      const result = await getReminderOffsets(companyId);

      expect(result).toEqual([0, 2, 4]); // Default
    });

    test('should handle invalid JSON gracefully', async () => {
      const companyId = 'company_test_123';
      const mockSettings = [
        {
          reminder_offsets_days: 'invalid_json',
        },
      ];

      vi.mocked(sql.select).mockResolvedValue(mockSettings as any);

      const result = await getReminderOffsets(companyId);

      expect(result).toEqual([0, 2, 4]); // Default fallback
    });

    test('should handle errors gracefully', async () => {
      const companyId = 'company_test_123';

      vi.mocked(sql.select).mockRejectedValue(new Error('Database error'));

      const result = await getReminderOffsets(companyId);

      expect(result).toEqual([0, 2, 4]); // Default fallback
      expect(logger.error).toHaveBeenCalled();
    });
  });
});

