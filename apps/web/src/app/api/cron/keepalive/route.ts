import { NextResponse } from 'next/server';
import { initDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight database keepalive endpoint to prevent Supabase free tier from pausing.
 * Supabase pauses inactive projects after 7 days - this cron runs daily to keep it active.
 *
 * This endpoint is intentionally public as it only performs a simple SELECT query
 * and doesn't expose any sensitive data.
 */
export async function GET() {
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
