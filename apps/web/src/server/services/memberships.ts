// Membership management service
// Handles Whop API interactions for membership operations

import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export interface MembershipDetails {
  id: string;
  user_id: string;
  product_id: string;
  status: string;
  manage_url?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  // Add other fields as needed
}

export interface MembershipOperationResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface MembershipManageUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Base API request helper (exported for use by notification providers)
export async function whopApiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const baseURL = 'https://api.whop.com/api/v5/app';
  const url = `${baseURL}${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${env.WHOP_APP_SECRET}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Whop API request failed', {
        endpoint,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Whop API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Whop API request error', {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Get membership details and extract manage URL
export async function getMembershipDetails(
  membershipId: string
): Promise<MembershipDetails | null> {
  try {
    logger.info('Fetching membership details', { membershipId });

    const data = await whopApiRequest(`/memberships/${membershipId}`);

    const membership: MembershipDetails = {
      id: data.id,
      user_id: data.user_id,
      product_id: data.product_id,
      status: data.status,
      manage_url: data.manage_url,
      current_period_start: data.current_period_start,
      current_period_end: data.current_period_end,
      cancel_at_period_end: data.cancel_at_period_end,
    };

    logger.info('Membership details retrieved', {
      membershipId,
      status: membership.status,
      hasManageUrl: !!membership.manage_url,
    });

    return membership;
  } catch (error) {
    logger.error('Failed to get membership details', {
      membershipId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// Get manage URL for a membership (main use case for nudges)
export async function getMembershipManageUrl(
  membershipId: string
): Promise<string | null> {
  const result = await getMembershipManageUrlResult(membershipId);
  return result.success ? result.url || null : null;
}

// Get manage URL with structured error handling
export async function getMembershipManageUrlResult(
  membershipId: string
): Promise<MembershipManageUrlResult> {
  try {
    const membership = await getMembershipDetails(membershipId);
    if (!membership) {
      return {
        success: false,
        error: 'Membership not found or inaccessible'
      };
    }

    if (!membership.manage_url) {
      return {
        success: false,
        error: 'Membership does not have a manage URL'
      };
    }

    return {
      success: true,
      url: membership.manage_url
    };
  } catch (error) {
    logger.error('Failed to get membership manage URL', {
      membershipId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve manage URL'
    };
  }
}

// Add free days to a membership (incentive) with retry/backoff
export async function addMembershipFreeDays(
  membershipId: string,
  days: number
): Promise<MembershipOperationResult> {
  return await addMembershipFreeDaysWithRetry(membershipId, days);
}

// Add free days with retry/backoff and jitter
export async function addMembershipFreeDaysWithRetry(
  membershipId: string,
  days: number,
  maxRetries: number = 3
): Promise<MembershipOperationResult & { attempts: number }> {
  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info('Adding free days to membership (attempt ${attempt}/${maxRetries})', {
        membershipId,
        days,
        attempt,
        maxRetries
      });

      const data = await whopApiRequest(`/memberships/${membershipId}/add_free_days`, {
        method: 'POST',
        body: JSON.stringify({ days }),
      });

      logger.info('Free days added successfully', { membershipId, days, attempt });

      return {
        success: true,
        data,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      logger.warn('Failed to add free days (attempt ${attempt}/${maxRetries})', {
        membershipId,
        days,
        attempt,
        maxRetries,
        error: lastError,
      });

      // Don't retry on client errors (4xx) - these are permanent failures
      if (error instanceof Error && lastError.includes('Whop API error: 4')) {
        break;
      }

      // Wait with exponential backoff + jitter before retry
      if (attempt < maxRetries) {
        const baseDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        const jitter = Math.random() * 1000; // Up to 1s jitter
        const delay = baseDelay + jitter;

        logger.info('Retrying free days addition after delay', {
          membershipId,
          delay: Math.round(delay),
          attempt: attempt + 1,
          maxRetries
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error('Failed to add free days after all retries', {
    membershipId,
    days,
    attempts: maxRetries,
    finalError: lastError,
  });

  return {
    success: false,
    error: lastError || 'Failed to add free days after retries',
    attempts: maxRetries,
  };
}

// Cancel membership at period end
export async function cancelMembershipAtPeriodEnd(
  membershipId: string
): Promise<MembershipOperationResult> {
  try {
    logger.info('Cancelling membership at period end', { membershipId });

    const data = await whopApiRequest(`/memberships/${membershipId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ at_period_end: true }),
    });

    logger.info('Membership cancelled at period end', { membershipId });

    return {
      success: true,
      data,
    };
  } catch (error) {
    logger.error('Failed to cancel membership', {
      membershipId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel membership',
    };
  }
}

// Terminate membership immediately
export async function terminateMembership(
  membershipId: string
): Promise<MembershipOperationResult> {
  try {
    logger.info('Terminating membership immediately', { membershipId });

    const data = await whopApiRequest(`/memberships/${membershipId}/terminate`, {
      method: 'POST',
    });

    logger.info('Membership terminated', { membershipId });

    return {
      success: true,
      data,
    };
  } catch (error) {
    logger.error('Failed to terminate membership', {
      membershipId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to terminate membership',
    };
  }
}

// Check if membership is in grace period (for recovery logic)
export async function isMembershipInGracePeriod(
  membershipId: string
): Promise<boolean> {
  try {
    const membership = await getMembershipDetails(membershipId);
    if (!membership) return false;

    // Whop typically allows ~5 days grace period after payment failure
    // This is a simplified check - in production, you'd check payment status
    const now = new Date();
    const periodEnd = membership.current_period_end
      ? new Date(membership.current_period_end)
      : null;

    if (!periodEnd) return false;

    // Consider in grace period if within 7 days past period end
    const gracePeriodEnd = new Date(periodEnd.getTime() + (7 * 24 * 60 * 60 * 1000));

    return now <= gracePeriodEnd;
  } catch (error) {
    logger.error('Failed to check grace period', {
      membershipId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// Validate membership exists and is accessible
export async function validateMembershipAccess(
  membershipId: string
): Promise<boolean> {
  try {
    const membership = await getMembershipDetails(membershipId);
    return membership !== null;
  } catch (error) {
    return false;
  }
}

