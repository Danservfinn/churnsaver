import { NextRequest, NextResponse } from 'next/server';
import { enhancedJobQueue } from '@/server/services/enhancedJobQueue';
import { initDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  return !!secret && header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    await initDb();

    await enhancedJobQueue.init();
    const result = await enhancedJobQueue.cleanup();
    await enhancedJobQueue.shutdown();

    // Clean up old rate_limit buckets (2 hours by default)
    const RATE_LIMIT_RETENTION_MINUTES = 120;
    const { rowCount: rateLimitPruned } = await sql.execute(
      `DELETE FROM rate_limits WHERE window_bucket_start < (NOW() - ($1 * INTERVAL '1 minute'))`,
      [RATE_LIMIT_RETENTION_MINUTES]
    );

    logger.info('Queue maintenance completed', { ...result, rateLimitPruned });
    return NextResponse.json({ status: 'ok', ...result, rateLimitPruned });
  } catch (error) {
    logger.error('Queue maintenance failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json({ error: 'maintenance_failed' }, { status: 500 });
  }
}

