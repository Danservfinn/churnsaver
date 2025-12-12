// Edge-safe Request Size Limit Middleware
//
// IMPORTANT:
// - This file must remain Edge-runtime compatible.
// - Do NOT import server-only modules (logger, db, securityMonitor, etc.).
//
// Purpose: Provide a lightweight request size guard for /api/* routes to prevent
// oversized payloads from reaching route handlers.

import { NextRequest, NextResponse } from 'next/server';

export interface RequestSizeLimits {
  default: number;
  webhook: number;
  upload: number;
}

// Default limits in bytes
const DEFAULT_LIMITS: RequestSizeLimits = {
  default: 10 * 1024 * 1024, // 10MB
  webhook: 1 * 1024 * 1024, // 1MB
  upload: 50 * 1024 * 1024, // 50MB
};

function getConfiguredLimits(): RequestSizeLimits {
  const limits = { ...DEFAULT_LIMITS };

  // Allow environment variable overrides (guardrails to avoid dangerous values)
  const defaultMb = process.env.MAX_REQUEST_SIZE_DEFAULT_MB;
  if (defaultMb) {
    const mb = Number.parseInt(defaultMb, 10);
    if (!Number.isNaN(mb) && mb > 0 && mb <= 100) limits.default = mb * 1024 * 1024;
  }

  const webhookMb = process.env.MAX_REQUEST_SIZE_WEBHOOK_MB;
  if (webhookMb) {
    const mb = Number.parseInt(webhookMb, 10);
    if (!Number.isNaN(mb) && mb > 0 && mb <= 10) limits.webhook = mb * 1024 * 1024;
  }

  const uploadMb = process.env.MAX_REQUEST_SIZE_UPLOAD_MB;
  if (uploadMb) {
    const mb = Number.parseInt(uploadMb, 10);
    if (!Number.isNaN(mb) && mb > 0 && mb <= 500) limits.upload = mb * 1024 * 1024;
  }

  return limits;
}

function getRequestType(pathname: string): keyof RequestSizeLimits {
  if (pathname.includes('/webhook')) return 'webhook';
  if (pathname.includes('/upload') || pathname.includes('/import')) return 'upload';
  return 'default';
}

function getContentLength(request: NextRequest): number | null {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return null;

  const length = Number.parseInt(contentLength, 10);
  return Number.isNaN(length) ? null : length;
}

export async function requestSizeLimitMiddleware(request: NextRequest): Promise<NextResponse | null> {
  // Only check size for API routes and methods that typically have bodies.
  if (!request.nextUrl.pathname.startsWith('/api')) return null;

  const method = request.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  const contentLength = getContentLength(request);
  if (contentLength === null) return null;

  const limits = getConfiguredLimits();
  const requestType = getRequestType(request.nextUrl.pathname);
  const limit = limits[requestType];

  if (contentLength <= limit) return null;

  return NextResponse.json(
    {
      error: 'Request payload too large',
      requestType,
      limitBytes: limit,
      actualBytes: contentLength,
    },
    { status: 413 }
  );
}
