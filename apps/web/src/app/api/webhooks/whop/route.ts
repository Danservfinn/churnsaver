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

    // Get raw body first for signature validation
    const body = await request.text();
    
    // === DEBUG LOGGING START ===
    console.log('[DEBUG_WEBHOOK] Body string length:', body.length);
    console.log('[DEBUG_WEBHOOK] Body string preview:', body.substring(0, 500));
    // === DEBUG LOGGING END ===
    
    // Create a new request with the body text since we already consumed it
    const newRequest = new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: body
    });
    
    // Process webhook first (includes signature validation and payload parsing)
    // Then apply rate limiting with the actual companyId from the payload
    // This ensures accurate per-company rate limiting instead of using "unknown"
    const webhookResult = await handleWhopWebhook(newRequest);
 31
 32     // If webhook processing failed due to signature validation or other security issues,
 33     // return the result immediately without rate limit check
 34     if (webhookResult.status !== 200) {
 35       return webhookResult;
 36     }
 37
 38     // For successful webhook processing, now apply rate limiting with the actual companyId
 39     // Extract company ID from the processed webhook data
 40     let companyId: string | undefined;
 41     try {
 42       const payload = JSON.parse(body);
 43       const headersObj: Record<string, string> = {};
 44       request.headers.forEach((value, key) => {
 45         headersObj[key] = value;
 46       });
 47       // Extract company ID from webhook payload for per-company rate limiting
 48       // This ensures fair usage across tenants and prevents one company's testing from affecting others
 49       companyId = getWebhookCompanyContext(headersObj, payload);
 50     } catch (e) {
 51       // If we can't parse the body or extract company ID, we'll use global rate limiting as fallback
 52       console.warn('Failed to extract company ID for rate limiting', {
 53         error: e instanceof Error ? e.message : String(e)
 54       });
 55     }
 56
 57     // Use per-company rate limit if company ID is available, otherwise fall back to global
 58     const rateLimitKey = companyId ? `webhook:company:${companyId}` : 'webhook:global';
 59     const rateLimitResult = await checkRateLimit(rateLimitKey, {
 60       ...RATE_LIMIT_CONFIGS.webhooks,
 61       maxRequests: companyId ? 100 : RATE_LIMIT_CONFIGS.webhooks.maxRequests // 100 req/min per company
 62     });
 63
 64     if (!rateLimitResult.allowed) {
 65       // Log rate limit violation for security monitoring
 66       const clientIP = request.headers.get('x-forwarded-for') ||
 67                        request.headers.get('x-real-ip') ||
 68                        'unknown';
 69
 70       // Use structured logging for security monitoring
 71       console.error('Rate limit exceeded', {
 72         endpoint: 'webhooks/whop',
 73         ip: clientIP,
 74         companyId: companyId || 'unknown',
 75         rateLimitKey,
 76         userAgent: request.headers.get('user-agent')?.substring(0, 200) || 'unknown',
 77         retryAfter: rateLimitResult.retryAfter,
 78         resetAt: rateLimitResult.resetAt.toISOString(),
 79         timestamp: new Date().toISOString(),
 80         isPerCompanyLimit: !!companyId
 81       });
 82
 83       return NextResponse.json(
 84         {
 85           error: 'Rate limit exceeded',
 86           retryAfter: rateLimitResult.retryAfter,
 87           resetAt: rateLimitResult.resetAt.toISOString(),
 88           companyId: companyId || 'unknown'
 89         },
 90         { status: 429 }
 91       );
 92     }
 93
 94     // Rate limit passed, return the successful webhook result
 95     return webhookResult;
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










