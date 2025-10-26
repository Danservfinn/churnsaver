// Shared helpers for job queue processing and validation
// Reusable company context validation and event processing status updates

import { sql } from '../../../lib/db';
import { logger } from '../../../lib/logger';
import { CompanyContext } from './jobTypes';

/**
 * Validate company context for RLS security
 */
export async function assertCompanyContext(companyId?: string): Promise<CompanyContext> {
  if (!companyId) {
    const error = 'Company context required for tenant-scoped operations';
    logger.error('Company context validation failed', { error });
    return {
      companyId: '',
      isValid: false,
      error
    };
  }

  try {
    // Validate company exists
    const company = await sql.select<{ id: string }>(
      'SELECT id FROM companies WHERE id = $1',
      [companyId]
    );

    if (company.length === 0) {
      const error = `Company ${companyId} not found`;
      logger.error('Company validation failed', { companyId, error });
      return {
        companyId,
        isValid: false,
        error
      };
    }

    return {
      companyId,
      isValid: true
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Company context validation error', {
      companyId,
      error: errorMessage
    });
    return {
      companyId,
      isValid: false,
      error: errorMessage
    };
  }
}

/**
 * Update event processing status in the ledger
 */
export async function updateEventProcessingStatus(
  eventId: string,
  companyId: string,
  success: boolean,
  error?: string
): Promise<boolean> {
  try {
    const result = await sql.execute(
      `UPDATE events SET processed = $1, error = $2 WHERE whop_event_id = $3 AND company_id = $4`,
      [success, success ? null : (error || 'processing_failed'), eventId, companyId]
    );

    const updated = result > 0;
    if (updated) {
      logger.debug('Event processing status updated', {
        eventId,
        companyId,
        success,
        error: success ? null : error
      });
    } else {
      logger.warn('Event processing status update failed - event not found', {
        eventId,
        companyId
      });
    }

    return updated;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update event processing status', {
      eventId,
      companyId,
      error: errorMessage
    });
    return false;
  }
}

/**
 * Check if event has already been processed
 */
export async function isEventProcessed(eventId: string, companyId: string): Promise<boolean> {
  try {
    const existingEvent = await sql.select(
      `SELECT processed FROM events WHERE whop_event_id = $1 AND company_id = $2`,
      [eventId, companyId]
    );

    return existingEvent.length > 0 && (existingEvent[0] as { processed: boolean }).processed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to check event processing status', {
      eventId,
      companyId,
      error: errorMessage
    });
    return false; // Assume not processed on error to avoid duplicates
  }
}

/**
 * Create processed event object for webhook processing
 */
export function createProcessedEvent(
  eventId: string,
  eventType: string,
  membershipId: string,
  payload: string,
  eventCreatedAt: string
) {
  return {
    id: eventId,
    whop_event_id: eventId,
    type: eventType,
    membership_id: membershipId,
    payload,
    processed_at: new Date(),
    event_created_at: new Date(eventCreatedAt)
  };
}

/**
 * Calculate processing metrics for job completion
 */
export function calculateJobMetrics(
  processingTimes: number[],
  successful: number,
  failed: number,
  skipped: number = 0
) {
  const totalJobs = successful + failed + skipped;
  const totalProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0);
  const averageProcessingTime = totalJobs > 0 ? totalProcessingTime / totalJobs : 0;

  return {
    totalJobs,
    successfulJobs: successful,
    failedJobs: failed,
    skippedJobs: skipped,
    averageProcessingTime,
    totalProcessingTime
  };
}