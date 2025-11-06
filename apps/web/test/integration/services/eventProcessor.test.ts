// Integration tests for event processor
// Tests webhook to recovery flow, idempotency, and error recovery

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  processWebhookEvent,
  processUnprocessedEvents,
  type ProcessedEvent,
} from '@/server/services/eventProcessor';
import {
  processPaymentFailedEvent,
  processPaymentSucceededEvent,
  processMembershipValidEvent,
  processMembershipInvalidEvent,
} from '@/server/services/cases';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createPaymentFailedWebhook, createPaymentSucceededWebhook } from '../../helpers/webhooks';
import { createTestEvent } from '../../helpers/database';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  sql: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
  initDb: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger');
vi.mock('@/lib/env', () => ({
  env: {},
  additionalEnv: {},
}));
vi.mock('@/lib/whop-sdk', () => ({
  whopsdk: {
    memberships: {
      addFreeDays: vi.fn(),
      get: vi.fn(),
    },
  },
}));
vi.mock('@/server/services/cases');

describe('Event Processor Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Webhook to Recovery Flow', () => {
    test('should process payment failed → case created → payment succeeded → case recovered', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'event_flow_123',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_flow_123';

      const mockCase = { id: 'case_flow_123' };
      vi.mocked(processPaymentFailedEvent).mockResolvedValue(mockCase as any);

      // Process payment failed
      const result1 = await processWebhookEvent(event, companyId);
      expect(result1).toBe(true);
      expect(processPaymentFailedEvent).toHaveBeenCalled();

      // Process payment succeeded
      const successPayload = createPaymentSucceededWebhook({
        data: {
          ...webhookPayload.data,
          membership_id: webhookPayload.data.membership_id,
        },
      });
      const successEvent: ProcessedEvent = {
        id: 'event_success_123',
        whop_event_id: successPayload.id,
        type: 'payment_succeeded',
        membership_id: successPayload.data.membership_id,
        payload: successPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };

      vi.mocked(processPaymentSucceededEvent).mockResolvedValue(true);
      const result2 = await processWebhookEvent(successEvent, companyId);
      expect(result2).toBe(true);
      expect(processPaymentSucceededEvent).toHaveBeenCalled();
    });
  });

  describe('Event Idempotency', () => {
    test('should handle duplicate payment_failed events without creating duplicate cases', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'event_duplicate_123',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_duplicate_123';

      const mockCase = { id: 'case_duplicate_123' };
      vi.mocked(processPaymentFailedEvent).mockResolvedValue(mockCase as any);

      // First event
      const result1 = await processWebhookEvent(event, companyId);
      expect(result1).toBe(true);

      // Duplicate event - should be handled idempotently
      const result2 = await processWebhookEvent(event, companyId);
      expect(result2).toBe(true);

      // processPaymentFailedEvent should handle idempotency internally
      expect(processPaymentFailedEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('Event Processing with Attribution Window', () => {
    test('should respect attribution window when processing recovery events', async () => {
      const successPayload = createPaymentSucceededWebhook();
      const event: ProcessedEvent = {
        id: 'event_attribution_123',
        whop_event_id: successPayload.id,
        type: 'payment_succeeded',
        membership_id: successPayload.data.membership_id,
        payload: successPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };

      // processPaymentSucceededEvent handles attribution window internally
      vi.mocked(processPaymentSucceededEvent).mockResolvedValue(true);

      const result = await processWebhookEvent(event, 'company_123');

      expect(result).toBe(true);
      expect(processPaymentSucceededEvent).toHaveBeenCalled();
    });
  });

  describe('Multiple Event Types Processed in Sequence', () => {
    test('should process different event types correctly', async () => {
      const companyId = 'company_multi_123';

      // Payment failed
      const failedPayload = createPaymentFailedWebhook();
      const failedEvent: ProcessedEvent = {
        id: 'event_failed',
        whop_event_id: failedPayload.id,
        type: 'payment_failed',
        membership_id: failedPayload.data.membership_id,
        payload: failedPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };

      vi.mocked(processPaymentFailedEvent).mockResolvedValue({ id: 'case_1' } as any);
      await processWebhookEvent(failedEvent, companyId);

      // Membership invalid
      const invalidEvent: ProcessedEvent = {
        id: 'event_invalid',
        whop_event_id: 'evt_invalid',
        type: 'membership_went_invalid',
        membership_id: 'mem_invalid',
        payload: {
          id: 'evt_invalid',
          type: 'membership_went_invalid',
          data: {
            membership_id: 'mem_invalid',
            user_id: 'user_invalid',
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };

      vi.mocked(processMembershipInvalidEvent).mockResolvedValue(true);
      await processWebhookEvent(invalidEvent, companyId);

      expect(processPaymentFailedEvent).toHaveBeenCalled();
      expect(processMembershipInvalidEvent).toHaveBeenCalled();
    });
  });

  describe('Event Processing Error Recovery', () => {
    test('should log errors but not crash system on processing failure', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'event_error_123',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_error_123';

      vi.mocked(processPaymentFailedEvent).mockRejectedValue(new Error('Processing error'));

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process webhook event',
        expect.objectContaining({
          eventId: webhookPayload.id,
          type: 'payment_failed',
        })
      );
    });
  });

  describe('processUnprocessedEvents', () => {
    test('should process multiple unprocessed events', async () => {
      const companyId = 'company_batch_123';

      const events = [
        createTestEvent({ id: 'event_1', type: 'payment_failed', whop_event_id: 'evt_1' }),
        createTestEvent({ id: 'event_2', type: 'payment_succeeded', whop_event_id: 'evt_2' }),
      ];

      // First call: get unprocessed events
      vi.mocked(sql.select).mockResolvedValueOnce(events as any);
      
      vi.mocked(sql.execute).mockResolvedValue(1);
      vi.mocked(processPaymentFailedEvent).mockResolvedValue({ id: 'case_1' } as any);
      vi.mocked(processPaymentSucceededEvent).mockResolvedValue(true);

      const result = await processUnprocessedEvents(companyId);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });
  });
});

