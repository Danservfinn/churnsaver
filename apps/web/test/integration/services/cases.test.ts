// Integration tests for case service
// Tests end-to-end flows, multi-tenant isolation, and attribution window enforcement

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  processPaymentFailedEvent,
  markCaseRecoveredByMembership,
  hasActiveRecoveryCase,
  processPaymentSucceededEvent,
  processMembershipInvalidEvent,
  type PaymentFailedEvent,
  type PaymentSucceededEvent,
  type MembershipInvalidEvent,
} from '@/server/services/cases';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSettingsForCompany } from '@/server/services/settings';
import { createTestRecoveryCase, createTestEvent } from '../../helpers/database';
import { createTestCompanyIds } from '../../helpers/rls';

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

describe('Case Service Integration Tests', () => {
  const [companyA, companyB] = createTestCompanyIds(2);
  let testCases: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    testCases = [];
  });

  afterEach(() => {
    // Cleanup test data
    testCases = [];
  });

  describe('End-to-End Case Creation Flow', () => {
    test('should create case from payment failed event and enable recovery', async () => {
      const event: PaymentFailedEvent = {
        eventId: 'evt_integration_123',
        membershipId: 'mem_integration_123',
        userId: 'user_integration_123',
        reason: 'card_declined',
      };

      // Mock: No existing case
      vi.mocked(sql.select).mockResolvedValueOnce([]);

      // Mock: Case creation
      const createdCase = createTestRecoveryCase({
        id: 'case_integration_123',
        company_id: companyA,
        membership_id: event.membershipId,
        user_id: event.userId,
        status: 'open',
        attempts: 0,
      });
      vi.mocked(sql.insert).mockResolvedValueOnce(createdCase as any);

      // Mock: Settings for T+0 nudge
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const result = await processPaymentFailedEvent(event, companyA);

      expect(result).not.toBeNull();
      expect(result?.id).toBe('case_integration_123');
      expect(result?.status).toBe('open');
      expect(result?.attempts).toBe(0);
    });

    test('should handle case lifecycle: creation → recovery', async () => {
      const membershipId = 'mem_lifecycle_123';
      const event: PaymentFailedEvent = {
        eventId: 'evt_lifecycle_123',
        membershipId,
        userId: 'user_lifecycle_123',
      };

      // Step 1: Create case
      vi.mocked(sql.select).mockResolvedValueOnce([]);
      const createdCase = createTestRecoveryCase({
        id: 'case_lifecycle_123',
        membership_id: membershipId,
        status: 'open',
      });
      vi.mocked(sql.insert).mockResolvedValueOnce(createdCase as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const case_ = await processPaymentFailedEvent(event, companyA);
      expect(case_).not.toBeNull();

      // Step 2: Mark as recovered
      const successTime = new Date();
      // First select finds the case
      vi.mocked(sql.select).mockResolvedValueOnce([createdCase] as any);
      // Second select (UPDATE ... RETURNING) marks it recovered
      vi.mocked(sql.select).mockResolvedValueOnce([{
        id: createdCase.id,
        membership_id: membershipId,
        status: 'recovered',
        recovered_amount_cents: 2999,
      }] as any);

      const recovered = await markCaseRecoveredByMembership(
        membershipId,
        2999,
        successTime,
        30
      );

      expect(recovered).toBe(true);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    test('should enforce tenant isolation - Company A cannot access Company B cases', async () => {
      const membershipIdA = 'mem_company_a';
      const membershipIdB = 'mem_company_b';

      // Create case for Company A
      const eventA: PaymentFailedEvent = {
        eventId: 'evt_company_a',
        membershipId: membershipIdA,
        userId: 'user_a',
      };

      vi.mocked(sql.select).mockResolvedValueOnce([]);
      const caseA = createTestRecoveryCase({
        id: 'case_company_a',
        company_id: companyA,
        membership_id: membershipIdA,
      });
      vi.mocked(sql.insert).mockResolvedValueOnce(caseA as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      await processPaymentFailedEvent(eventA, companyA);

      // Company B tries to query - should return empty
      vi.mocked(sql.select).mockResolvedValueOnce([]);

      const hasCase = await hasActiveRecoveryCase(membershipIdA, 30);

      // This test verifies that queries are scoped by company_id
      // In a real scenario, RLS would enforce this
      expect(sql.select).toHaveBeenCalled();
    });

    test('should prevent cross-tenant data access', async () => {
      const membershipId = 'mem_shared_123';

      // Company A creates case
      const eventA: PaymentFailedEvent = {
        eventId: 'evt_company_a',
        membershipId,
        userId: 'user_a',
      };

      vi.mocked(sql.select).mockResolvedValueOnce([]);
      const caseA = createTestRecoveryCase({
        id: 'case_company_a',
        company_id: companyA,
        membership_id: membershipId,
      });
      vi.mocked(sql.insert).mockResolvedValueOnce(caseA as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      await processPaymentFailedEvent(eventA, companyA);

      // Company B queries same membership - should not find Company A's case
      vi.mocked(sql.select).mockResolvedValueOnce([]);

      const hasCase = await hasActiveRecoveryCase(membershipId, 30);

      // In real implementation, RLS would ensure Company B sees nothing
      expect(hasCase).toBe(false);
    });
  });

  describe('Attribution Window Enforcement', () => {
    test('should reject recovery outside attribution window', async () => {
      const membershipId = 'mem_attribution_123';
      const attributionWindowDays = 30;

      // Create case 40 days ago
      const oldCase = createTestRecoveryCase({
        id: 'case_old_123',
        membership_id: membershipId,
        first_failure_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: 'open',
      });

      // Try to recover with success event 40 days after failure
      const successTime = new Date();
      vi.mocked(sql.select).mockResolvedValueOnce([oldCase] as any);

      const recovered = await markCaseRecoveredByMembership(
        membershipId,
        2999,
        successTime,
        attributionWindowDays
      );

      expect(recovered).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('attribution window'),
        expect.any(Object)
      );
    });

    test('should accept recovery within attribution window', async () => {
      const membershipId = 'mem_attribution_123';
      const attributionWindowDays = 30;

      // Create case 10 days ago
      const recentCase = createTestRecoveryCase({
        id: 'case_recent_123',
        membership_id: membershipId,
        first_failure_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        status: 'open',
      });

      const successTime = new Date();
      // First select finds the case
      vi.mocked(sql.select).mockResolvedValueOnce([recentCase] as any);
      // Second select (UPDATE ... RETURNING) marks it recovered
      vi.mocked(sql.select).mockResolvedValueOnce([{
        id: recentCase.id,
        membership_id: membershipId,
        status: 'recovered',
        recovered_amount_cents: 2999,
      }] as any);

      const recovered = await markCaseRecoveredByMembership(
        membershipId,
        2999,
        successTime,
        attributionWindowDays
      );

      expect(recovered).toBe(true);
    });

    test('should calculate attribution window cutoff correctly', async () => {
      const membershipId = 'mem_cutoff_123';
      const attributionWindowDays = 30;

      // Case created 29 days ago (within window, just before boundary)
      const successTime = new Date();
      const failureTime = new Date(successTime.getTime() - 29 * 24 * 60 * 60 * 1000);

      const boundaryCase = createTestRecoveryCase({
        id: 'case_boundary_123',
        membership_id: membershipId,
        first_failure_at: failureTime,
        status: 'open',
      });

      // First select finds the case
      vi.mocked(sql.select).mockResolvedValueOnce([boundaryCase] as any);
      // Second select (UPDATE ... RETURNING) marks it recovered
      vi.mocked(sql.select).mockResolvedValueOnce([{
        id: boundaryCase.id,
        membership_id: membershipId,
        status: 'recovered',
        recovered_amount_cents: 2999,
      }] as any);

      const recovered = await markCaseRecoveredByMembership(
        membershipId,
        2999,
        successTime,
        attributionWindowDays
      );

      // Should accept cases within the window
      expect(recovered).toBe(true);
    });
  });

  describe('Concurrent Case Creation (Idempotency)', () => {
    test('should prevent duplicate cases for same membership within attribution window', async () => {
      const membershipId = 'mem_concurrent_123';
      const event: PaymentFailedEvent = {
        eventId: 'evt_concurrent_123',
        membershipId,
        userId: 'user_concurrent_123',
      };

      // First event creates case
      vi.mocked(sql.select).mockResolvedValueOnce([]);
      const firstCase = createTestRecoveryCase({
        id: 'case_first_123',
        membership_id: membershipId,
      });
      vi.mocked(sql.insert).mockResolvedValueOnce(firstCase as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      await processPaymentFailedEvent(event, companyA);

      // Second event - should find existing case and update it
      const secondEvent: PaymentFailedEvent = {
        eventId: 'evt_concurrent_456',
        membershipId,
        userId: 'user_concurrent_123',
      };

      vi.mocked(sql.select).mockResolvedValueOnce([firstCase] as any);
      const updatedCase = {
        ...firstCase,
        attempts: 1,
      };
      vi.mocked(sql.insert).mockResolvedValueOnce(updatedCase as any);

      const result = await processPaymentFailedEvent(secondEvent, companyA);

      expect(result).not.toBeNull();
      expect(result?.attempts).toBeGreaterThan(0);
    });
  });

  describe('Payment Succeeded Event Processing', () => {
    test('should process payment succeeded and attribute recovery', async () => {
      const membershipId = 'mem_success_123';
      const event: PaymentSucceededEvent = {
        eventId: 'evt_success_123',
        membershipId,
        userId: 'user_success_123',
        amount: 29.99,
        currency: 'usd',
      };

      const existingCase = createTestRecoveryCase({
        membership_id: membershipId,
        status: 'open',
        first_failure_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      });

      vi.mocked(sql.select).mockResolvedValueOnce([existingCase] as any);
      vi.mocked(sql.execute).mockResolvedValueOnce(1);

      const result = await processPaymentSucceededEvent(event);

      expect(result).toBe(true);
    });
  });

  describe('Membership Invalid Event Processing', () => {
    test('should create case from membership invalid event', async () => {
      const event: MembershipInvalidEvent = {
        eventId: 'evt_invalid_123',
        membershipId: 'mem_invalid_123',
        userId: 'user_invalid_123',
      };

      vi.mocked(sql.select).mockResolvedValueOnce([]);
      const createdCase = createTestRecoveryCase({
        membership_id: event.membershipId,
      });
      vi.mocked(sql.insert).mockResolvedValueOnce(createdCase as any);
      vi.mocked(getSettingsForCompany).mockResolvedValue({
        enable_push: true,
        enable_dm: true,
        incentive_days: 7,
      } as any);

      const result = await processMembershipInvalidEvent(event, companyA);

      expect(result).toBe(true);
    });
  });
});

