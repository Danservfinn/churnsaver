// Whop webhook endpoint
// POST /api/webhooks/whop
import { NextRequest, NextResponse } from 'next/server';
import { handleWhopWebhook } from '@/server/webhooks/whop';
import { checkRateLimit, RATE_LIMIT_CONFIGS } from '@/server/middleware/rateLimit';
import { errors } from '@/lib/apiResponse';

// Only allow POST requests with rate limiting
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check rate limit before processing webhook
    const rateLimitResult = await checkRateLimit('webhook:global', RATE_LIMIT_CONFIGS.webhooks);

    if (!rateLimitResult.allowed) {
      // Log rate limit violation for security monitoring
      const clientIP = request.headers.get('x-forwarded-for') ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      
      // Use structured logging for security monitoring
      console.error('Rate limit exceeded', {
        endpoint: 'webhooks/whop',
        ip: clientIP,
        userAgent: request.headers.get('user-agent')?.substring(0, 200) || 'unknown',
        retryAfter: rateLimitResult.retryAfter,
        resetAt: rateLimitResult.resetAt.toISOString(),
        timestamp: new Date().toISOString()
      });

      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: rateLimitResult.retryAfter, resetAt: rateLimitResult.resetAt.toISOString() },
        { status: 429 }
      );
    }

    // Rate limit passed, process webhook
    return handleWhopWebhook(request);
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




