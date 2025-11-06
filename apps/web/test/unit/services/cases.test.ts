// Unit tests for case creation and management service
// Tests isolated service functions with mocked dependencies

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  createRecoveryCase,
  updateRecoveryCase,
  processPaymentFailedEvent,
  markCaseRecovered,
  markCaseRecoveredByMembership,
  hasActiveRecoveryCase,
  processPaymentSucceededEvent,
  processMembershipValidEvent,
  processMembershipInvalidEvent,
  type PaymentFailedEvent,
  type PaymentSucceededEvent,
  type MembershipValidEvent,
  type MembershipInvalidEvent,
  type RecoveryCase,
} from '@/server/services/cases';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { errorHandler } from '@/lib/errorHandler';
import { getSettingsForCompany } from '@/server/services/settings';
import { createTestRecoveryCase } from '../../helpers/database';
import { createMockErrorHandler } from '../../helpers/mocks';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');
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
vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: {
    KPI_ATTRIBUTION_WINDOW_DAYS: 30,
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
  sendImmediateRecoveryNudge: vi.fn().mockResolvedValue({
    pushSent: true,
    dmSent: true,
    incentiveApplied: false,
  }),
}));

describe('Case Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRecoveryCase', () => {
    test('should create a case with valid data', async () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
        reason: 'card_declined',
      };
      const companyId = 'company_test_123';

      const mockCase = createTestRecoveryCase({
        id: 'case_test_123',
        company_id: companyId,
        membership_id: event.membershipId,
        user_id: event.userId,
        failure_reason: event.reason,
      });

      // Mock errorHandler.wrapAsync to return success
      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      // Mock sql.insert to return the created case
      vi.mocked(sql.insert).mockResolvedValue(mockCase as any);

      const result = await createRecoveryCase(event, companyId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('case_test_123');
      expect(result?.company_id).toBe(companyId);
      expect(result?.membership_id).toBe(event.membershipId);
      expect(result?.user_id).toBe(event.userId);
      expect(result?.status).toBe('open');
      expect(result?.attempts).toBe(0);
      expect(sql.insert).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recovery_cases'),
        expect.arrayContaining([
          expect.any(String), // caseId (UUID)
          companyId,
          event.membershipId,
          event.userId,
          expect.any(Date), // first_failure_at
          'open',
          event.reason,
          0, // attempts
        ])
      );
    });

    test('should return null when database insert fails', async () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
      };
      const companyId = 'company_test_123';

      // Mock errorHandler.wrapAsync to return failure
      vi.mocked(errorHandler.wrapAsync).mockResolvedValue({
        success: false,
        error: new Error('Database error'),
      });

      const result = await createRecoveryCase(event, companyId);

      expect(result).toBeNull();
    });

    test('should use default reason when reason is not provided', async () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
        // reason not provided
      };
      const companyId = 'company_test_123';

      const mockCase = createTestRecoveryCase({
        failure_reason: 'payment_failed',
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.insert).mockResolvedValue(mockCase as any);

      await createRecoveryCase(event, companyId);

      expect(sql.insert).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.any(String),
          companyId,
          event.membershipId,
          event.userId,
          expect.any(Date),
          'open',
          'payment_failed', // default reason
          0,
        ])
      );
    });
  });

  describe('updateRecoveryCase', () => {
    test('should update case attempts and last_nudge_at', async () => {
      const existingCase: RecoveryCase = createTestRecoveryCase({
        id: 'case_test_123',
        attempts: 2,
        last_nudge_at: null,
      }) as RecoveryCase;

      const event: PaymentFailedEvent = {
        eventId: 'evt_test_456',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
        reason: 'insufficient_funds',
      };

      const updatedCase: RecoveryCase = {
        ...existingCase,
        attempts: 3,
        last_nudge_at: new Date(),
        failure_reason: event.reason,
      };

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.insert).mockResolvedValue(updatedCase as any);

      const result = await updateRecoveryCase(existingCase, event);

      expect(result).not.toBeNull();
      expect(result?.attempts).toBe(3);
      expect(result?.last_nudge_at).not.toBeNull();
      expect(sql.insert).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recovery_cases'),
        expect.arrayContaining([
          existingCase.id,
          expect.any(Date), // last_nudge_at
          event.reason,
        ])
      );
    });

    test('should return null when update fails', async () => {
      const existingCase: RecoveryCase = createTestRecoveryCase() as RecoveryCase;
      const event: PaymentFailedEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
      };

      vi.mocked(errorHandler.wrapAsync).mockResolvedValue({
        success: false,
        error: new Error('Database error'),
      });

      const result = await updateRecoveryCase(existingCase, event);

      expect(result).toBeNull();
    });
  });

  describe('processPaymentFailedEvent', () => {
    test('should create new case when no existing case found', async () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
        reason: 'card_declined',
      };
      const companyId = 'company_test_123';

      const mockCase = createTestRecoveryCase({
        id: 'case_test_123',
        company_id: companyId,
        membership_id: event.membershipId,
      });

      // Mock findExistingCase to return null (no existing case)
      vi.mocked(sql.select).mockResolvedValue([]);

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.insert).mockResolvedValue(mockCase as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const result = await processPaymentFailedEvent(event, companyId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('case_test_123');
      expect(sql.select).toHaveBeenCalled(); // findExistingCase check
    });

    test('should merge with existing case when found', async () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt_test_456',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
      };
      const companyId = 'company_test_123';

      const existingCase: RecoveryCase = createTestRecoveryCase({
        id: 'case_existing_123',
        attempts: 1,
      }) as RecoveryCase;

      const updatedCase: RecoveryCase = {
        ...existingCase,
        attempts: 2,
      };

      // Mock findExistingCase to return existing case
      vi.mocked(sql.select).mockResolvedValue([existingCase] as any);

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.insert).mockResolvedValue(updatedCase as any);

      const result = await processPaymentFailedEvent(event, companyId);

      expect(result).not.toBeNull();
      expect(result?.attempts).toBe(2);
    });
  });

  describe('markCaseRecovered', () => {
    test('should mark case as recovered with amount', async () => {
      const caseId = 'case_test_123';
      const amountCents = 2999;

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.execute).mockResolvedValue(1); // 1 row updated

      const result = await markCaseRecovered(caseId, amountCents);

      expect(result).toBe(true);
      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recovery_cases'),
        expect.arrayContaining(['recovered', amountCents, caseId, 'open'])
      );
    });

    test('should return false when case not found or already recovered', async () => {
      const caseId = 'case_test_123';
      const amountCents = 2999;

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.execute).mockResolvedValue(0); // 0 rows updated

      const result = await markCaseRecovered(caseId, amountCents);

      expect(result).toBe(false);
    });
  });

  describe('markCaseRecoveredByMembership', () => {
    test('should mark case as recovered within attribution window', async () => {
      const membershipId = 'mem_test_123';
      const amountCents = 2999;
      const successTime = new Date();
      const attributionWindowDays = 30;

      const case_: RecoveryCase = createTestRecoveryCase({
        id: 'case_test_123',
        membership_id: membershipId,
        first_failure_at: new Date(successTime.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        status: 'open',
      }) as RecoveryCase;

      // Mock finding the case
      vi.mocked(sql.select).mockResolvedValue([case_] as any);

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await markCaseRecoveredByMembership(
        membershipId,
        amountCents,
        successTime,
        attributionWindowDays
      );

      expect(result).toBe(true);
    });

    test('should reject recovery outside attribution window', async () => {
      const membershipId = 'mem_test_123';
      const amountCents = 2999;
      const successTime = new Date();
      const attributionWindowDays = 30;

      const case_: RecoveryCase = createTestRecoveryCase({
        id: 'case_test_123',
        membership_id: membershipId,
        first_failure_at: new Date(successTime.getTime() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        status: 'open',
      }) as RecoveryCase;

      vi.mocked(sql.select).mockResolvedValue([case_] as any);

      const result = await markCaseRecoveredByMembership(
        membershipId,
        amountCents,
        successTime,
        attributionWindowDays
      );

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('attribution window'),
        expect.any(Object)
      );
    });

    test('should return false when no open case found', async () => {
      const membershipId = 'mem_test_123';
      const amountCents = 2999;

      vi.mocked(sql.select).mockResolvedValue([]);

      const result = await markCaseRecoveredByMembership(membershipId, amountCents);

      expect(result).toBe(false);
    });
  });

  describe('hasActiveRecoveryCase', () => {
    test('should return true when active case exists within window', async () => {
      const membershipId = 'mem_test_123';
      const attributionWindowDays = 30;

      // hasActiveRecoveryCase returns count, not the case itself
      vi.mocked(sql.select).mockResolvedValue([{ count: 1 }] as any);

      const result = await hasActiveRecoveryCase(membershipId, attributionWindowDays);

      expect(result).toBe(true);
    });

    test('should return false when case is outside attribution window', async () => {
      const membershipId = 'mem_test_123';
      const attributionWindowDays = 30;

      vi.mocked(sql.select).mockResolvedValue([]);

      const result = await hasActiveRecoveryCase(membershipId, attributionWindowDays);

      expect(result).toBe(false);
    });
  });

  describe('processPaymentSucceededEvent', () => {
    test('should process payment succeeded and mark case recovered', async () => {
      const event: PaymentSucceededEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
        amount: 29.99,
        currency: 'usd',
      };

      const case_: RecoveryCase = createTestRecoveryCase({
        membership_id: event.membershipId,
        status: 'open',
      }) as RecoveryCase;

      vi.mocked(sql.select).mockResolvedValue([case_] as any);
      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });
      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await processPaymentSucceededEvent(event);

      expect(result).toBe(true);
    });
  });

  describe('processMembershipValidEvent', () => {
    test('should process membership valid and mark case recovered', async () => {
      const event: MembershipValidEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
      };

      const case_: RecoveryCase = createTestRecoveryCase({
        membership_id: event.membershipId,
        status: 'open',
      }) as RecoveryCase;

      vi.mocked(sql.select).mockResolvedValue([case_] as any);
      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });
      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await processMembershipValidEvent(event);

      expect(result).toBe(true);
    });
  });

  describe('processMembershipInvalidEvent', () => {
    test('should process membership invalid and create case if needed', async () => {
      const event: MembershipInvalidEvent = {
        eventId: 'evt_test_123',
        membershipId: 'mem_test_123',
        userId: 'user_test_123',
      };
      const companyId = 'company_test_123';

      // No existing case
      vi.mocked(sql.select).mockResolvedValue([]);

      const mockCase = createTestRecoveryCase({
        membership_id: event.membershipId,
      });

      vi.mocked(errorHandler.wrapAsync).mockImplementation(async (fn) => {
        const data = await fn();
        return { success: true, data };
      });

      vi.mocked(sql.insert).mockResolvedValue(mockCase as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const result = await processMembershipInvalidEvent(event, companyId);

      expect(result).toBe(true);
    });
  });
});

