/**
 * Analytics Trends API
 * GET /api/analytics/trends - Get analytics trends (Pro/Max tier only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { getSubscriptionStatus } from '@/server/services/subscriptions';
import {
  getAnalyticsTrends,
  getAnalyticsSummary,
} from '@/server/jobs/analyticsSnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await initDb();

    const auth = await requireAuthContext(req);
    if (!auth.success || !auth.context?.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const companyId = auth.context.companyId;

    // Check tier access
    const subscription = await getSubscriptionStatus(companyId);

    if (!subscription.features.basicAnalytics) {
      return NextResponse.json(
        { error: 'Analytics requires Pro or Max tier subscription' },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const validDays = Math.min(Math.max(days, 7), 365); // Clamp between 7 and 365

    // Get trends and summary
    const [trends, summary] = await Promise.all([
      getAnalyticsTrends(companyId, validDays),
      getAnalyticsSummary(companyId),
    ]);

    return NextResponse.json({
      trends,
      summary,
      period: {
        days: validDays,
        startDate: new Date(Date.now() - validDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
      },
    });
  } catch (error) {
    logger.error('GET /api/analytics/trends failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
