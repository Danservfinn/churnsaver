// Test Notification API
// POST /api/settings/test-notification - Send a test notification to the authenticated user

import { NextRequest, NextResponse } from 'next/server';
import { initDbWithRLS } from '@/lib/db-rls';
import { logger } from '@/lib/logger';
import { requireAuthContext } from '@/lib/auth/requireAuth';
import { validateAndTransform, TestNotificationSchema } from '@/lib/validation';
import { sendWhopPushNotification, sendWhopDirectMessage } from '@/server/services/notifications/whop';
import { getSettingsForCompany } from '@/server/services/settings';

// In-memory rate limiting (simple implementation)
// In production, consider using Redis for distributed rate limiting
const testCooldowns = new Map<string, Date>();
const COOLDOWN_MS = 60000; // 60 seconds

function canSendTest(companyId: string, channel: string): { allowed: boolean; remainingSeconds?: number } {
  const key = `${companyId}:${channel}`;
  const lastTest = testCooldowns.get(key);

  if (!lastTest) {
    return { allowed: true };
  }

  const elapsed = Date.now() - lastTest.getTime();
  if (elapsed >= COOLDOWN_MS) {
    return { allowed: true };
  }

  return {
    allowed: false,
    remainingSeconds: Math.ceil((COOLDOWN_MS - elapsed) / 1000)
  };
}

function recordTest(companyId: string, channel: string): void {
  const key = `${companyId}:${channel}`;
  testCooldowns.set(key, new Date());

  // Clean up old entries (older than 5 minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of testCooldowns.entries()) {
    if (v.getTime() < fiveMinutesAgo) {
      testCooldowns.delete(k);
    }
  }
}

// Test message templates
function getTestPushContent(senderName: string): { title: string; body: string } {
  return {
    title: `Test Notification from ${senderName}`,
    body: "This is a test. Your customers will see similar messages when payment recovery is triggered. 🎉"
  };
}

function getTestDMContent(senderName: string): string {
  return `👋 **Test Message**

This is a test notification from ${senderName}.

Your customers will receive similar messages when their payment fails. The actual recovery message includes:
• Payment failure details
• One-click update link
• Incentive offer (if configured)

Everything is working correctly! ✅`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    // Initialize database connection
    await initDbWithRLS();

    // Require authentication
    const auth = await requireAuthContext(request);
    if (!auth.success || !auth.context) {
      return auth.response ?? NextResponse.json(
        { error: auth.error || 'Authentication required' },
        { status: auth.status || 401 }
      );
    }

    const { companyId, userId } = auth.context;

    if (!companyId) {
      return NextResponse.json({ error: 'Company context required' }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required. Please ensure you are properly authenticated through Whop.' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = validateAndTransform(TestNotificationSchema, body);

    if (!validation.success) {
      logger.warn('Test notification validation failed', { error: validation.error });
      return NextResponse.json(
        { error: `Invalid input: ${validation.error}` },
        { status: 400 }
      );
    }

    const { channel } = validation.data;

    // Check rate limiting
    const rateLimitCheck = canSendTest(companyId, channel);
    if (!rateLimitCheck.allowed) {
      logger.info('Test notification rate limited', {
        companyId,
        channel,
        remainingSeconds: rateLimitCheck.remainingSeconds
      });
      return NextResponse.json(
        {
          error: `Please wait ${rateLimitCheck.remainingSeconds} seconds before testing again`,
          retryAfter: rateLimitCheck.remainingSeconds
        },
        { status: 429 }
      );
    }

    // Load company settings to get sender identity
    let senderUserId: string | null = null;
    let senderName = 'ChurnSaver';

    try {
      const settings = await getSettingsForCompany(companyId);
      if (settings.sender_whop_user_id) {
        senderUserId = settings.sender_whop_user_id;
        senderName = 'Your Business'; // Generic since we don't have the actual business name
      }
    } catch (error) {
      logger.warn('Failed to load settings for test notification, using defaults', {
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    logger.info('Sending test notification', {
      companyId,
      userId,
      channel,
      hasSenderOverride: !!senderUserId
    });

    // Send the test notification
    let result: { success: boolean; messageId?: string; error?: string };

    if (channel === 'push') {
      const { title, body: pushBody } = getTestPushContent(senderName);
      result = await sendWhopPushNotification({
        userId,
        title,
        body: pushBody,
        senderUserId,
        data: {
          type: 'test_notification',
          companyId,
          timestamp: new Date().toISOString()
        }
      }, 2); // 2 retries for test
    } else {
      const message = getTestDMContent(senderName);
      result = await sendWhopDirectMessage({
        userId,
        message,
        senderUserId
      }, 2); // 2 retries for test
    }

    // Record the test for rate limiting
    recordTest(companyId, channel);

    if (result.success) {
      logger.info('Test notification sent successfully', {
        companyId,
        userId,
        channel,
        messageId: result.messageId,
        processingTimeMs: Date.now() - startTime
      });

      return NextResponse.json({
        success: true,
        messageId: result.messageId,
        message: `Test ${channel === 'push' ? 'push notification' : 'direct message'} sent! Check your Whop app.`
      });
    } else {
      logger.error('Test notification failed', {
        companyId,
        userId,
        channel,
        error: result.error,
        processingTimeMs: Date.now() - startTime
      });

      return NextResponse.json({
        success: false,
        error: result.error || `Failed to send test ${channel}`
      }, { status: 500 });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Test notification error', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: Date.now() - startTime
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send test notification',
        ...(process.env.NODE_ENV === 'development' && { details: errorMessage })
      },
      { status: 500 }
    );
  }
}
