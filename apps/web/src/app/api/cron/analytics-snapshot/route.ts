/**
 * Analytics Snapshot Cron
 * Daily job to capture analytics snapshots for Pro/Max tier companies
 * Schedule: 0 0 * * * (midnight UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { captureAnalyticsSnapshots } from '@/server/jobs/analyticsSnapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

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

    logger.info('Starting analytics snapshot cron job');

    const result = await captureAnalyticsSnapshots();

    const durationMs = Date.now() - start;

    logger.info('Analytics snapshot cron job completed', {
      processed: result.processed,
      errors: result.errors,
      durationMs,
    });

    return NextResponse.json({
      status: 'ok',
      processed: result.processed,
      errors: result.errors,
      durationMs,
    });
  } catch (error) {
    logger.error('Analytics snapshot cron job failed', {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    });

    return NextResponse.json(
      { error: 'Job failed' },
      { status: 500 }
    );
  }
}
