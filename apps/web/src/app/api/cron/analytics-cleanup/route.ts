/**
 * Analytics Cleanup Cron
 * Weekly job to remove analytics snapshots older than retention period (365 days)
 * Schedule: 0 1 * * 0 (Sunday at 1am UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { cleanupOldSnapshots } from '@/server/jobs/analyticsSnapshot';
import { ANALYTICS_RETENTION_DAYS } from '@/lib/tiers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute max

function requireAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const start = Date.now();

  if (!requireAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await initDb();

    // Use environment override if provided
    const retentionDays = parseInt(
      process.env.ANALYTICS_RETENTION_DAYS || String(ANALYTICS_RETENTION_DAYS),
      10
    );

    logger.info('Starting analytics cleanup cron job', { retentionDays });

    const deleted = await cleanupOldSnapshots(retentionDays);

    const durationMs = Date.now() - start;

    logger.info('Analytics cleanup cron job completed', {
      deleted,
      retentionDays,
      durationMs,
    });

    return NextResponse.json({
      status: 'ok',
      deleted,
      retentionDays,
      durationMs,
    });
  } catch (error) {
    logger.error('Analytics cleanup cron job failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    });

    return NextResponse.json(
      { error: 'Job failed' },
      { status: 500 }
    );
  }
}
