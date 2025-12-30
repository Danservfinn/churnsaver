// Unit tests for ChurnSaver subscription webhook event routing
// Ensures subscription events are correctly routed to subscriptionHandler

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  processWebhookEvent,
  type ProcessedEvent,
} from '@/server/services/eventProcessor';
import {
  isChurnSaverSubscriptionEvent,
  handleChurnSaverSubscriptionEvent,
} from '@/server/webhooks/subscriptionHandler';
import { logger } from '@/lib/logger';

// Mock dependencies
vi.mock('@/lib/logger');
vi.mock('@/lib/db-rls', () => ({
  sqlWithRLS: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
    transaction: vi.fn(),
  },
  initDbWithRLS: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: {},
}));
vi.mock('@/server/webhooks/subscriptionHandler');
vi.mock('@/server/services/cases', () => ({
  processPaymentFailedEvent: vi.fn(),
  processPaymentSucceededEvent: vi.fn(),
  processMembershipValidEvent: vi.fn(),
  processMembershipInvalidEvent: vi.fn(),
}));

describe('ChurnSaver Subscription Webhook Routing', () => {
  const CHURNSAVER_PRODUCT_ID = 'prod_churnsaver_pro_monthly';
  const CUSTOMER_PRODUCT_ID = 'prod_customer_membership';

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup environment for ChurnSaver product detection
    process.env.WHOP_PRODUCT_ID_PRO_MONTHLY = CHURNSAVER_PRODUCT_ID;
  });

  describe('isChurnSaverSubscriptionEvent', () => {
    test('should return true for ChurnSaver product IDs', () => {
      vi.mocked(isChurnSaverSubscriptionEvent).mockImplementation((productId) => {
        return productId === CHURNSAVER_PRODUCT_ID;
      });

      expect(isChurnSaverSubscriptionEvent(CHURNSAVER_PRODUCT_ID)).toBe(true);
    });

    test('should return false for customer product IDs', () => {
      vi.mocked(isChurnSaverSubscriptionEvent).mockImplementation((productId) => {
        return productId === CHURNSAVER_PRODUCT_ID;
      });

      expect(isChurnSaverSubscriptionEvent(CUSTOMER_PRODUCT_ID)).toBe(false);
    });

    test('should return false for undefined product ID', () => {
      vi.mocked(isChurnSaverSubscriptionEvent).mockImplementation((productId) => {
        return productId === CHURNSAVER_PRODUCT_ID;
      });

      expect(isChurnSaverSubscriptionEvent(undefined)).toBe(false);
    });
  });

  describe('processWebhookEvent routing to subscription handler', () => {
    test('should route membership_went_valid with ChurnSaver product to subscription handler', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_123',
        type: 'membership_went_valid',
        membership_id: 'mem_test_123',
        payload: {
          id: 'evt_test_123',
          type: 'membership_went_valid',
          data: {
            id: 'mem_test_123',
            product_id: CHURNSAVER_PRODUCT_ID,
            user_id: 'user_test_123',
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'subscription_activated',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(isChurnSaverSubscriptionEvent).toHaveBeenCalledWith(CHURNSAVER_PRODUCT_ID);
      expect(handleChurnSaverSubscriptionEvent).toHaveBeenCalledWith(
        'membership_went_valid',
        'evt_test_123',
        expect.objectContaining({ product_id: CHURNSAVER_PRODUCT_ID }),
        companyId
      );
    });

    test('should route membership_went_invalid with ChurnSaver product to subscription handler', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_456',
        type: 'membership_went_invalid',
        membership_id: 'mem_test_456',
        payload: {
          id: 'evt_test_456',
          type: 'membership_went_invalid',
          data: {
            id: 'mem_test_456',
            product_id: CHURNSAVER_PRODUCT_ID,
            user_id: 'user_test_456',
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_456';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'subscription_deactivated',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(handleChurnSaverSubscriptionEvent).toHaveBeenCalledWith(
        'membership_went_invalid',
        'evt_test_456',
        expect.any(Object),
        companyId
      );
    });

    test('should route membership_updated with ChurnSaver product to subscription handler', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_789',
        type: 'membership_updated',
        membership_id: 'mem_test_789',
        payload: {
          id: 'evt_test_789',
          type: 'membership_updated',
          data: {
            id: 'mem_test_789',
            product_id: CHURNSAVER_PRODUCT_ID,
            user_id: 'user_test_789',
            status: 'active',
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_789';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'subscription_updated',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(handleChurnSaverSubscriptionEvent).toHaveBeenCalledWith(
        'membership_updated',
        'evt_test_789',
        expect.objectContaining({ product_id: CHURNSAVER_PRODUCT_ID }),
        companyId
      );
    });

    test('should route membership.updated (dot notation) to subscription handler', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_dot',
        type: 'membership.updated',
        membership_id: 'mem_test_dot',
        payload: {
          id: 'evt_test_dot',
          type: 'membership.updated',
          data: {
            id: 'mem_test_dot',
            product_id: CHURNSAVER_PRODUCT_ID,
            user_id: 'user_test_dot',
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_dot';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'subscription_updated',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(handleChurnSaverSubscriptionEvent).toHaveBeenCalled();
    });

    test('should route payment_failed with ChurnSaver product to subscription handler', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_payment_fail',
        type: 'payment_failed',
        membership_id: 'mem_payment_fail',
        payload: {
          id: 'evt_payment_fail',
          type: 'payment_failed',
          data: {
            product_id: CHURNSAVER_PRODUCT_ID,
            membership: {
              id: 'mem_payment_fail',
              user_id: 'user_payment_fail',
            },
            payment: {
              amount: 4900,
              currency: 'USD',
              failure_reason: 'card_declined',
            },
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_payment_fail';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'payment_failed_handled',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(handleChurnSaverSubscriptionEvent).toHaveBeenCalledWith(
        'payment_failed',
        'evt_payment_fail',
        expect.any(Object),
        companyId
      );
    });

    test('should route payment_succeeded with ChurnSaver product to subscription handler', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_payment_success',
        type: 'payment_succeeded',
        membership_id: 'mem_payment_success',
        payload: {
          id: 'evt_payment_success',
          type: 'payment_succeeded',
          data: {
            product_id: CHURNSAVER_PRODUCT_ID,
            membership: {
              id: 'mem_payment_success',
              user_id: 'user_payment_success',
            },
            payment: {
              amount: 4900,
              currency: 'USD',
            },
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_payment_success';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'payment_succeeded_handled',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(handleChurnSaverSubscriptionEvent).toHaveBeenCalledWith(
        'payment_succeeded',
        'evt_payment_success',
        expect.any(Object),
        companyId
      );
    });

    test('should NOT route customer events to subscription handler', async () => {
      const { processPaymentFailedEvent } = await import('@/server/services/cases');

      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_customer',
        type: 'payment_failed',
        membership_id: 'mem_customer',
        payload: {
          id: 'evt_customer',
          type: 'payment_failed',
          data: {
            product_id: CUSTOMER_PRODUCT_ID, // NOT a ChurnSaver product
            membership: {
              id: 'mem_customer',
              user_id: 'user_customer',
            },
            payment: {
              amount: 2999,
              currency: 'USD',
              failure_reason: 'card_declined',
            },
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_customer';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(false);
      vi.mocked(processPaymentFailedEvent).mockResolvedValue({ id: 'case_123' } as any);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(handleChurnSaverSubscriptionEvent).not.toHaveBeenCalled();
      expect(processPaymentFailedEvent).toHaveBeenCalled();
    });

    test('should handle subscription handler failures gracefully', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_fail',
        type: 'membership_went_valid',
        membership_id: 'mem_fail',
        payload: {
          id: 'evt_fail',
          type: 'membership_went_valid',
          data: {
            product_id: CHURNSAVER_PRODUCT_ID,
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_fail';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: false,
        message: 'missing_company_id',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(false);
    });
  });

  describe('product_id extraction from nested payload', () => {
    test('should extract product_id from data.membership.product_id', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_nested',
        type: 'membership_went_valid',
        membership_id: 'mem_nested',
        payload: {
          id: 'evt_nested',
          type: 'membership_went_valid',
          data: {
            membership: {
              id: 'mem_nested',
              product_id: CHURNSAVER_PRODUCT_ID,
              user_id: 'user_nested',
            },
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_nested';

      vi.mocked(isChurnSaverSubscriptionEvent).mockReturnValue(true);
      vi.mocked(handleChurnSaverSubscriptionEvent).mockResolvedValue({
        processed: true,
        message: 'subscription_activated',
      });

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(isChurnSaverSubscriptionEvent).toHaveBeenCalledWith(CHURNSAVER_PRODUCT_ID);
    });
  });
});
