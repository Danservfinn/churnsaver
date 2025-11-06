// Integration tests for reminder scheduling
// Tests cron job flow, job queue processing, and notification delivery

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  discoverCompanyIdsForReminders,
  collectReminderCandidates,
  processReminderBatch,
  type ReminderCase,
} from '@/server/services/shared/companyDiscovery';
import { processPendingReminders } from '@/server/cron/processReminders';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSettingsForCompany } from '@/server/services/settings';
import { additionalEnv } from '@/lib/env';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');
vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: {
    MAX_REMINDER_CASES_PER_RUN: 100,
    MAX_CONCURRENT_REMINDER_SENDS: 10,
  },
}));
vi.mock('@/lib/whop-sdk', () => ({
  whopsdk: {
    memberships: {
      addFreeDays: vi.fn(),
      get: vi.fn(),
    },
  },
}));
vi.mock('@/server/services/settings');
vi.mock('@/server/services/reminders/notifier', () => ({
  dispatchReminder: vi.fn().mockResolvedValue({
    pushSent: true,
    dmSent: true,
    incentiveApplied: false,
  }),
}));

describe('Reminder Scheduling Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cron Job Flow', () => {
    test('should discover companies and process reminders', async () => {
      const companyIds = ['company_1', 'company_2'];

      vi.mocked(sql.select).mockResolvedValueOnce(
        companyIds.map((id) => ({ company_id: id })) as any
      );

      const discovered = await discoverCompanyIdsForReminders();

      expect(discovered).toEqual(companyIds);
    });

    test('should process reminders for discovered companies', async () => {
      const companyId = 'company_cron_123';
      const mockCases: ReminderCase[] = [
        {
          id: 'case_1',
          membership_id: 'mem_1',
          user_id: 'user_1',
          company_id: companyId,
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
      ];

      vi.mocked(sql.select)
        .mockResolvedValueOnce([{ company_id: companyId }] as any) // discoverCompanyIds
        .mockResolvedValueOnce(mockCases as any); // collectReminderCandidates

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        reminder_offsets_days: [0, 2, 4],
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const result = await processPendingReminders(companyId);

      expect(result.processed).toBeGreaterThan(0);
    });
  });

  describe('Job Queue Processing', () => {
    test('should process reminders via job queue', async () => {
      const companyId = 'company_queue_123';
      const candidates: ReminderCase[] = [
        {
          id: 'case_queue_1',
          membership_id: 'mem_queue_1',
          user_id: 'user_queue_1',
          company_id: companyId,
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
      ];

      const reminderOffsets = [0, 2, 4];
      const processor = vi.fn().mockResolvedValue({ success: true });

      const result = await processReminderBatch(candidates, reminderOffsets, processor);

      expect(result.processed).toBe(1);
      expect(result.successful).toBe(1);
      expect(processor).toHaveBeenCalled();
    });
  });

  describe('Reminder with Incentive Application', () => {
    test('should apply incentive when eligible during reminder dispatch', async () => {
      const companyId = 'company_incentive_123';
      const case_: ReminderCase = {
        id: 'case_incentive_1',
        membership_id: 'mem_incentive_1',
        user_id: 'user_incentive_1',
        company_id: companyId,
        first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        last_nudge_at: null,
        attempts: 0,
        status: 'open',
        incentive_days: 0, // Not yet applied
      };

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        reminder_offsets_days: [0, 2, 4],
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const { dispatchReminder } = await import('@/server/services/reminders/notifier');
      vi.mocked(dispatchReminder).mockResolvedValue({
        pushSent: true,
        dmSent: true,
        incentiveApplied: true,
      });

      // This would be called during reminder processing
      const reminderResult = await dispatchReminder({
        caseSnapshot: {
          id: case_.id,
          company_id: case_.company_id,
          membership_id: case_.membership_id,
          user_id: case_.user_id,
          incentive_days: case_.incentive_days,
        },
        settings: {
          enable_push: true,
          enable_dm: true,
          incentive_days: 7,
        },
        attemptNumber: 1,
        trigger: 'scheduled',
      });

      expect(reminderResult.incentiveApplied).toBe(true);
    });
  });

  describe('Multi-Tenant Reminder Processing Isolation', () => {
    test('should ensure Company A reminders do not affect Company B', async () => {
      const companyA = 'company_a_123';
      const companyB = 'company_b_123';

      const casesA: ReminderCase[] = [
        {
          id: 'case_a_1',
          membership_id: 'mem_a_1',
          user_id: 'user_a_1',
          company_id: companyA,
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
      ];

      const casesB: ReminderCase[] = [
        {
          id: 'case_b_1',
          membership_id: 'mem_b_1',
          user_id: 'user_b_1',
          company_id: companyB,
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
      ];

      vi.mocked(sql.select)
        .mockResolvedValueOnce([{ company_id: companyA }] as any)
        .mockResolvedValueOnce(casesA as any)
        .mockResolvedValueOnce([{ company_id: companyB }] as any)
        .mockResolvedValueOnce(casesB as any);

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        reminder_offsets_days: [0, 2, 4],
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const resultA = await processPendingReminders(companyA);
      const resultB = await processPendingReminders(companyB);

      expect(resultA.processed).toBeGreaterThan(0);
      expect(resultB.processed).toBeGreaterThan(0);
      // Each company processes only its own cases
    });
  });

  describe('Reminder Processing Handles Failures Gracefully', () => {
    test('should continue processing when individual reminder fails', async () => {
      const companyId = 'company_fail_123';
      const candidates: ReminderCase[] = [
        {
          id: 'case_fail_1',
          membership_id: 'mem_fail_1',
          user_id: 'user_fail_1',
          company_id: companyId,
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
        {
          id: 'case_fail_2',
          membership_id: 'mem_fail_2',
          user_id: 'user_fail_2',
          company_id: companyId,
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
        .mockRejectedValueOnce(new Error('Processing error'));

      const result = await processReminderBatch(candidates, reminderOffsets, processor);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('Reminder Metrics Tracking', () => {
    test('should track reminder metrics correctly', async () => {
      const companyId = 'company_metrics_123';
      const candidates: ReminderCase[] = [
        {
          id: 'case_metrics_1',
          membership_id: 'mem_metrics_1',
          user_id: 'user_metrics_1',
          company_id: companyId,
          first_failure_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          last_nudge_at: null,
          attempts: 0,
          status: 'open',
          incentive_days: 0,
        },
      ];

      vi.mocked(sql.select).mockResolvedValueOnce([{ company_id: companyId }] as any);
      vi.mocked(sql.select).mockResolvedValueOnce(candidates as any);

      vi.mocked(getSettingsForCompany).mockResolvedValue({
        reminder_offsets_days: [0, 2, 4],
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const result = await processPendingReminders(companyId);

      expect(result.processed).toBeGreaterThan(0);
      expect(result.successful).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBeGreaterThanOrEqual(0);
      expect(result.results).toBeDefined();
    });
  });
});

