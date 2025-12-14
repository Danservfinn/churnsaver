import { NextResponse } from 'next/server';

const START_TIME = Date.now();

type Health =
  | { ok: true; uptimeSeconds: number; timestamp: string; version?: string; env: string }
  | { ok: false; error: string; timestamp: string };

export async function GET(): Promise<NextResponse> {
  const now = Date.now();
  return NextResponse.json<Health>({
    ok: true,
    uptimeSeconds: Math.floor((now - START_TIME) / 1000),
    timestamp: new Date(now).toISOString(),
    version: process.env.npm_package_version,
    env: process.env.NODE_ENV || 'development'
  });
}
