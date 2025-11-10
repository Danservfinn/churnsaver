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
    // === DEBUG LOGGING START ===
    console.log('[DEBUG_WEBHOOK] === Webhook Request Start ===');
    console.log('[DEBUG_WEBHOOK] Method:', request.method);
    console.log('[DEBUG_WEBHOOK] URL:', request.url);
    
    const headersObj: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    
    console.log('[DEBUG_WEBHOOK] Headers:', {
      'content-type': request.headers.get('content-type'),
      'user-agent': request.headers.get('user-agent'),
      'x-whop-signature': request.headers.get('x-whop-signature') ? '[PRESENT]' : '[MISSING]',
      'x-whop-timestamp': request.headers.get('x-whop-timestamp'),
      'x-whop-event-type': request.headers.get('x-whop-event-type'),
    });
    // === DEBUG LOGGING END ===

    // Get raw body first for rate limiting and signature validation
    const body = await request.text();
    
    // === DEBUG LOGGING START ===
    console.log('[DEBUG_WEBHOOK] Body string length:', body.length);
    console.log('[DEBUG_WEBHOOK] Body string preview:', body.substring(0, 500));
    // === DEBUG LOGGING END ===
    
    // Extract company ID from payload BEFORE processing webhook for rate limiting
    // This allows per-company rate limiting and prevents unnecessary processing
    let companyId: string | undefined;
    try {
      const payload = JSON.parse(body);
      // Extract company ID from webhook payload for per-company rate limiting
      // This ensures fair usage across tenants and prevents one company's testing from affecting others
      companyId = getWebhookCompanyContext(headersObj, payload);
      
      console.log('[DEBUG_WEBHOOK] CompanyId extraction result', {
        companyId: companyId || 'undefined',
        hasPayload: !!payload,
        payloadType: payload?.type,
        payloadKeys: payload ? Object.keys(payload) : [],
        dataKeys: payload?.data ? Object.keys(payload.data) : []
      });
    } catch (e) {
      // If we can't parse the body or extract company ID, we'll use IP-based rate limiting as fallback
      console.warn('[DEBUG_WEBHOOK] Failed to extract company ID for rate limiting', {
        error: e instanceof Error ? e.message : String(e),
        bodyPreview: body.substring(0, 200)
      });
    }

    // Use per-company rate limit if company ID is available, otherwise fall back to IP-based
    // This prevents global rate limit from being exhausted by testing from same IP
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    
    // Use IP-based rate limiting as fallback when companyId is not available
    const rateLimitKey = companyId 
      ? `webhook:company:${companyId}` 
      : `webhook:ip:${clientIP}`;
    
    // Apply rate limiting BEFORE webhook processing to prevent unnecessary work
    const rateLimitResult = await checkRateLimit(rateLimitKey, {
      ...RATE_LIMIT_CONFIGS.webhooks,
      // Per-company: 100 req/min, per-IP: 50 req/min (more lenient for testing)
      maxRequests: companyId ? 100 : 50
    });

    if (!rateLimitResult.allowed) {
      // Log rate limit violation for security monitoring
      console.error('[DEBUG_WEBHOOK] Rate limit exceeded', {
        endpoint: 'webhooks/whop',
        ip: clientIP,
        companyId: companyId || 'unknown',
        rateLimitKey,
        userAgent: request.headers.get('user-agent')?.substring(0, 200) || 'unknown',
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
        timestamp: new Date().toISOString(),
        isPerCompanyLimit: !!companyId,
        maxRequests: companyId ? 100 : 50
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

    // Rate limit passed, now process the webhook (includes signature validation)
    // Create a new request with the body text since we already consumed it
    const newRequest = new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: body
    });
    
    const webhookResult = await handleWhopWebhook(newRequest);
    
    // Return the webhook processing result
    return webhookResult;
  } catch (error) {
    // === DEBUG LOGGING START ===
    console.log('[DEBUG_WEBHOOK] === ERROR IN POST HANDLER ===');
    console.log('[DEBUG_WEBHOOK] Error message:', error instanceof Error ? error.message : String(error));
    console.log('[DEBUG_WEBHOOK] Error stack:', error instanceof Error ? error.stack : 'No stack');
    // === DEBUG LOGGING END ===

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
