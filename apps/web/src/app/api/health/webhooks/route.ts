import { NextResponse } from 'next/server';

type WebhookHealth =
  | { ok: true; timestamp: string }
  | { ok: false; error: string; timestamp: string };

export async function GET(): Promise<NextResponse> {
  return NextResponse.json<WebhookHealth>({
    ok: true,
    timestamp: new Date().toISOString()
  });
}
