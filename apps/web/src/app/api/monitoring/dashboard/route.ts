import { NextResponse } from 'next/server';

type MonitoringResponse =
  | { ok: true; timestamp: string }
  | { ok: false; error: string; timestamp: string };

export async function GET(): Promise<NextResponse> {
  return NextResponse.json<MonitoringResponse>({
    ok: true,
    timestamp: new Date().toISOString()
  });
}
