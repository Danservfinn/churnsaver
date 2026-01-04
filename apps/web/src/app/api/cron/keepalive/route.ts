import { NextRequest, NextResponse } from 'next/server';
import { initDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight database keepalive endpoint to prevent Supabase free tier from pausing.
 * Supabase pauses inactive projects after 7 days - this cron runs every 6 days to keep it active.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret for Vercel crons
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    await initDb();

    // Simple query to keep the database connection active
    const result = await sql.query<{ now: Date }>('SELECT NOW() as now');
    const dbTime = result.rows[0]?.now;

    const latencyMs = Date.now() - start;

    logger.info('Database keepalive ping successful', {
      latencyMs,
      dbTime: dbTime?.toISOString(),
    });

    return NextResponse.json({
      ok: true,
      latencyMs,
      dbTime: dbTime?.toISOString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - start;

    logger.error('Database keepalive ping failed', {
      error: error instanceof Error ? error.message : String(error),
      latencyMs,
    });

    return NextResponse.json(
      {
        ok: false,
        error: 'keepalive_failed',
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
