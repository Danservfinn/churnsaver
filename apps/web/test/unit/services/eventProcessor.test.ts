// Unit tests for event processing and attribution service
// Tests isolated service functions with mocked dependencies

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  processWebhookEvent,
  processUnprocessedEvents,
  processEventById,
  type ProcessedEvent,
} from '@/server/services/eventProcessor';
import {
  processPaymentFailedEvent,
  processPaymentSucceededEvent,
  processMembershipValidEvent,
  processMembershipInvalidEvent,
} from '@/server/services/cases';
import { logger } from '@/lib/logger';
import { createTestEvent } from '../../helpers/database';
import { createPaymentFailedWebhook, createPaymentSucceededWebhook } from '../../helpers/webhooks';

// Mock dependencies
vi.mock('@/lib/logger');
vi.mock('@/lib/db', () => ({
  sql: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
  initDb: vi.fn().mockResolvedValue(undefined),
}));
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

describe('Event Processor Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processWebhookEvent', () => {
    test('should route payment_failed events to case creation', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      const mockCase = { id: 'case_test_123' };
      vi.mocked(processPaymentFailedEvent).mockResolvedValue(mockCase as any);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(processPaymentFailedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: webhookPayload.id,
          membershipId: webhookPayload.data.membership_id,
        }),
        companyId
      );
    });

    test('should route payment_succeeded events to recovery attribution', async () => {
      const webhookPayload = createPaymentSucceededWebhook();
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: webhookPayload.id,
        type: 'payment_succeeded',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      vi.mocked(processPaymentSucceededEvent).mockResolvedValue(true);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(processPaymentSucceededEvent).toHaveBeenCalled();
      // Verify it was called with the correct event data structure
      const callArgs = vi.mocked(processPaymentSucceededEvent).mock.calls[0];
      expect(callArgs[0]).toHaveProperty('eventId', webhookPayload.id);
      expect(callArgs[0]).toHaveProperty('membershipId', webhookPayload.data.membership_id);
    });

    test('should route membership_went_valid events to recovery attribution', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_123',
        type: 'membership_went_valid',
        membership_id: 'mem_test_123',
        payload: {
          id: 'evt_test_123',
          type: 'membership_went_valid',
          data: {
            membership_id: 'mem_test_123',
            user_id: 'user_test_123',
            membership: {
              id: 'mem_test_123',
              user_id: 'user_test_123',
            },
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      vi.mocked(processMembershipValidEvent).mockResolvedValue(true);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(processMembershipValidEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_test_123',
          membershipId: 'mem_test_123',
        }),
        event.event_created_at
      );
    });

    test('should route membership_went_invalid events to case creation', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_123',
        type: 'membership_went_invalid',
        membership_id: 'mem_test_123',
        payload: {
          id: 'evt_test_123',
          type: 'membership_went_invalid',
          data: {
            membership_id: 'mem_test_123',
            user_id: 'user_test_123',
            membership: {
              id: 'mem_test_123',
              user_id: 'user_test_123',
            },
          },
        },
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      vi.mocked(processMembershipInvalidEvent).mockResolvedValue(true);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(processMembershipInvalidEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_test_123',
          membershipId: 'mem_test_123',
        }),
        companyId
      );
    });

    test('should skip unsupported event types gracefully', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_123',
        type: 'unsupported_event_type',
        membership_id: 'mem_test_123',
        payload: {},
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true); // Not an error, just skipped
      expect(logger.info).toHaveBeenCalledWith(
        'Skipping unsupported event type',
        expect.objectContaining({
          eventId: 'evt_test_123',
          type: 'unsupported_event_type',
        })
      );
      expect(processPaymentFailedEvent).not.toHaveBeenCalled();
      expect(processPaymentSucceededEvent).not.toHaveBeenCalled();
    });

    test('should handle event extraction failures', async () => {
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: 'evt_test_123',
        type: 'payment_failed',
        membership_id: 'mem_test_123',
        payload: null as any, // Invalid payload
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not extract payment failed event data',
        expect.objectContaining({ eventId: 'evt_test_123' })
      );
    });

    test('should handle processing errors gracefully', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload,
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

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

    test('should extract event data from string payload', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: JSON.stringify(webhookPayload), // String payload
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      const mockCase = { id: 'case_test_123' };
      vi.mocked(processPaymentFailedEvent).mockResolvedValue(mockCase as any);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(processPaymentFailedEvent).toHaveBeenCalled();
    });

    test('should extract event data from object payload', async () => {
      const webhookPayload = createPaymentFailedWebhook();
      const event: ProcessedEvent = {
        id: 'test-event-id',
        whop_event_id: webhookPayload.id,
        type: 'payment_failed',
        membership_id: webhookPayload.data.membership_id,
        payload: webhookPayload, // Object payload
        processed_at: null as any,
        event_created_at: new Date(),
      };
      const companyId = 'company_test_123';

      const mockCase = { id: 'case_test_123' };
      vi.mocked(processPaymentFailedEvent).mockResolvedValue(mockCase as any);

      const result = await processWebhookEvent(event, companyId);

      expect(result).toBe(true);
      expect(processPaymentFailedEvent).toHaveBeenCalled();
    });
  });

  describe('processUnprocessedEvents', () => {
    test('should process multiple unprocessed events', async () => {
      const companyId = 'company_test_123';

      const { sql } = await import('@/lib/db');
      const events = [
        createTestEvent({ id: 'event_1', type: 'payment_failed', whop_event_id: 'evt_1' }),
        createTestEvent({ id: 'event_2', type: 'payment_succeeded', whop_event_id: 'evt_2' }),
      ];
      
      // First call: get unprocessed events
      vi.mocked(sql.select).mockResolvedValueOnce(events as any);

      // Mock the underlying case processing functions
      vi.mocked(processPaymentFailedEvent).mockResolvedValue({ id: 'case_1' } as any);
      vi.mocked(processPaymentSucceededEvent).mockResolvedValue(true);

      // Mock sql.execute for updating processed flags (called twice, once per event)
      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await processUnprocessedEvents(companyId);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    test('should handle mixed success and failure', async () => {
      const companyId = 'company_test_123';

      const { sql } = await import('@/lib/db');
      const events = [
        createTestEvent({ id: 'event_1', type: 'payment_failed', whop_event_id: 'evt_1' }),
        createTestEvent({ id: 'event_2', type: 'payment_failed', whop_event_id: 'evt_2' }),
      ];
      
      // First call: get unprocessed events
      vi.mocked(sql.select).mockResolvedValueOnce(events as any);

      // Mock one success, one failure
      vi.mocked(processPaymentFailedEvent)
        .mockResolvedValueOnce({ id: 'case_1' } as any)
        .mockResolvedValueOnce(null); // null indicates failure

      vi.mocked(sql.execute).mockResolvedValue(1);

      const result = await processUnprocessedEvents(companyId);

      expect(result.processed).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('processEventById', () => {
    test('should process event by ID', async () => {
      const eventId = 'evt_test_123';
      const companyId = 'company_test_123';

      const { sql, initDb } = await import('@/lib/db');
      const event = createTestEvent({ 
        id: 'event_test_123', 
        type: 'payment_failed', 
        whop_event_id: eventId,
        membership_id: 'mem_test_123',
      });
      
      // Mock initDb (called first)
      vi.mocked(initDb).mockResolvedValue(undefined);
      // Mock sql.select to find the event
      vi.mocked(sql.select).mockResolvedValue([event] as any);

      vi.mocked(processPaymentFailedEvent).mockResolvedValue({ id: 'case_1' } as any);

      const result = await processEventById(eventId, companyId);

      expect(result).toBe(true);
      expect(processPaymentFailedEvent).toHaveBeenCalled();
    });

    test('should return false when event not found', async () => {
      const eventId = 'event_not_found';
      const companyId = 'company_test_123';

      const { sql } = await import('@/lib/db');
      vi.mocked(sql.select).mockResolvedValue([]);

      const result = await processEventById(eventId, companyId);

      expect(result).toBe(false);
      expect(processPaymentFailedEvent).not.toHaveBeenCalled();
    });
  });
});

