// Whop webhook endpoint
// POST /api/webhooks/whop
import { NextRequest, NextResponse } from 'next/server';
import { handleWhopWebhook } from '@/server/webhooks/whop';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';
import { getWebhookCompanyContext } from '@/lib/whop-sdk';

// Disable middleware for this route
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only allow POST requests with rate limiting
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Get raw body first to extract company ID for per-company rate limiting
    const body = await request.text();
    let companyId: string | undefined;
    
    try {
      const payload = JSON.parse(body);
      // Extract company ID from webhook payload for per-company rate limiting
      // This ensures fair usage across tenants and prevents one company's testing from affecting others
      const headersObj: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      companyId = getWebhookCompanyContext(headersObj);
    } catch (e) {
      // If we can't parse the body or extract company ID, we'll use global rate limiting as fallback
      console.warn('Failed to extract company ID for rate limiting', {
        error: e instanceof Error ? e.message : String(e)
      });
    }

    // Use per-company rate limit if company ID is available, otherwise fall back to global
    const rateLimitKey = companyId ? `webhook:company:${companyId}` : 'webhook:global';
    const rateLimitResult = await checkRateLimit(rateLimitKey, {
      ...RATE_LIMIT_CONFIGS.webhooks,
      maxRequests: companyId ? 100 : RATE_LIMIT_CONFIGS.webhooks.maxRequests // 100 req/min per company
    });

    if (!rateLimitResult.allowed) {
      // Log rate limit violation for security monitoring
      const clientIP = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      
      // Use structured logging for security monitoring
      console.error('Rate limit exceeded', {
        endpoint: 'webhooks/whop',
        ip: clientIP,
        companyId: companyId || 'unknown',
        rateLimitKey,
        userAgent: request.headers.get('user-agent')?.substring(0, 200) || 'unknown',
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
        timestamp: new Date().toISOString(),
        isPerCompanyLimit: !!companyId
      });

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          resetAt: rateLimitResult.resetAt.toISOString(),
          companyId: companyId || 'unknown'
        },
        { status: 429 }
      );
    }

    // Rate limit passed, process webhook
    // Create a new request with the body text since we already consumed it
    const newRequest = new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: body
    });
    
    return handleWhopWebhook(newRequest);
  } catch (error) {
    // In production, fail-closed for security
    if (process.env.NODE_ENV === 'production') {
      const clientIP = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      
      console.error('Rate limiting service error - blocking request', {
        endpoint: 'webhooks/whop',
        ip: clientIP,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });

      return NextResponse.json(
        { error: 'Rate limiting service temporarily unavailable' },
        { status: 503 }
      );
    }

    // In development, allow the request but log the error
    console.error('Rate limiting error in development - allowing request', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    return handleWhopWebhook(request);
  }
}

// Handle unsupported methods (no rate limiting needed)
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}










