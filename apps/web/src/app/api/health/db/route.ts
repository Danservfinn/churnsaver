import { NextResponse } from 'next/server';
import { initDb, sql } from '@/lib/db';
import { logger } from '@/lib/logger';

type HealthResponse =
  | { ok: true; latencyMs: number; timestamp: string; version?: string }
  | { ok: false; error: string; latencyMs: number; timestamp: string };

export async function GET(): Promise<NextResponse> {
  const start = Date.now();

  try {
    await initDb();
    // Minimal liveness probe: verify DB responds without exposing metadata
    await sql.query('SELECT 1');

    const latencyMs = Date.now() - start;
    return NextResponse.json<HealthResponse>({
      ok: true,
      latencyMs,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : String(error),
      latencyMs
    });

    return NextResponse.json<HealthResponse>(
      {
        ok: false,
        error: 'db_unavailable',
        latencyMs,
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
