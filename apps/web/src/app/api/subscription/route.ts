import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import {
  getCompanySubscription,
  getTierLimits,
  getSubscriptionStatus,
} from '@/server/services/subscriptions';
import { getQaDemoSubscription, isQaDemoBypassEnabled } from '@/lib/qaDemo';
import { initDbWithRLS } from '@/lib/db-rls';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (isQaDemoBypassEnabled(request)) {
      logger.info('QA demo bypass: returning mock subscription');
      return NextResponse.json(getQaDemoSubscription());
    }

    await initDbWithRLS();

    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json({ error: auth.error || 'Authentication required' }, { status: auth.status || 401 });
    }
    const { companyId } = auth.context;
    if (!companyId) {
      logger.warn('Subscription request missing companyId in auth context');
      return NextResponse.json({ error: 'Company context is required' }, { status: 400 });
    }

    const rateLimitResult = await checkRateLimit(
      `subscription_read:${companyId}`,
      RATE_LIMIT_CONFIGS.apiRead
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter, resetAt: rateLimitResult.resetAt.toISOString() },
        { status: 422 }
      );
    }

    // Get both raw subscription and enhanced status
    const [subscription, status] = await Promise.all([
      getCompanySubscription(companyId),
      getSubscriptionStatus(companyId),
    ]);

    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const limits = await getTierLimits(subscription.tier);

    return NextResponse.json({
      // Legacy format (for backward compatibility)
      subscription,
      limits,
      // New format with features and usage tracking
      status,
    });
  } catch (error) {
    logger.error('Failed to fetch subscription', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 });
  }
}

