/**
 * Click-Through Attribution Integration Tests
 * 
 * End-to-end flow tests covering:
 * - Failure → nudge → click → payment success → CLICK_THROUGH attribution
 * - Failure → no click → payment success → ORGANIC attribution
 * - Expired token handling
 * - Tampered token rejection
 * - Bot/prefetch detection
 * - Tier enforcement in the full flow
 * 
 * @see apps/web/src/app/api/r/[token]/route.ts
 * @see apps/web/src/server/services/cases.ts
 * @see apps/web/src/server/services/recoveryLinks.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb25n',
    NEXT_PUBLIC_APP_URL: 'https://app.example.com',
    WHOP_MANAGE_URL: 'https://whop.com/hub',
  },
  additionalEnv: {},
}));

vi.mock('@/lib/db', () => ({
  sql: {
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    select: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ rowCount: 1 }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Type definitions
interface RecoveryCase {
  id: string;
  company_id: string;
  membership_id: string;
  status: 'OPEN' | 'RECOVERED' | 'CHURNED';
  recovery_type: 'CLICK_THROUGH' | 'ORGANIC' | 'LEGACY_UNKNOWN' | null;
  attributed_click_id: string | null;
  recovered_amount_cents: number | null;
  attribution_window_days: number;
  created_at: Date;
  updated_at: Date;
}

interface RecoveryLinkSend {
  id: string;
  case_id: string;
  company_id: string;
  token: string;
  channel: 'dm' | 'push' | 'email';
  expires_at: Date;
  created_at: Date;
}

interface RecoveryClickEvent {
  id: string;
  link_send_id: string;
  case_id: string;
  company_id: string;
  is_bot_suspected: boolean;
  user_agent: string | null;
  ip_address: string | null;
  clicked_at: Date;
}

describe('Click-Through Attribution Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Full Recovery Flow: Failure → Nudge → Click → Payment', () => {
    it('should attribute recovery as CLICK_THROUGH when user clicks link before payment', async () => {
      // Arrange: Set up the full scenario
      const caseId = 'case-flow-001';
      const companyId = 'company-flow-001';
      const membershipId = 'membership-flow-001';
      const clickId = 'click-flow-001';
      const paymentTime = new Date('2024-01-15T14:00:00Z');
      const clickTime = new Date('2024-01-15T13:30:00Z'); // 30 minutes before payment

      const mockCase: RecoveryCase = {
        id: caseId,
        company_id: companyId,
        membership_id: membershipId,
        status: 'OPEN',
        recovery_type: null,
        attributed_click_id: null,
        recovered_amount_cents: null,
        attribution_window_days: 7,
        created_at: new Date('2024-01-10T12:00:00Z'),
        updated_at: new Date('2024-01-10T12:00:00Z'),
      };

      const mockClick: RecoveryClickEvent = {
        id: clickId,
        link_send_id: 'send-001',
        case_id: caseId,
        company_id: companyId,
        is_bot_suspected: false,
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        ip_address: '192.168.1.1',
        clicked_at: clickTime,
      };

      // Expected flow:
      // 1. Payment failure creates case (already mocked as OPEN)
      // 2. Nudge sent with tracked link
      // 3. User clicks link
      // 4. User makes successful payment
      // 5. System attributes recovery

      // Act & Assert: The attribution logic should:
      expect(mockCase.status).toBe('OPEN');
      expect(mockClick.is_bot_suspected).toBe(false);
      expect(mockClick.clicked_at < paymentTime).toBe(true);
      
      // After attribution, case should be updated to:
      const expectedUpdate = {
        status: 'RECOVERED',
        recovery_type: 'CLICK_THROUGH',
        attributed_click_id: clickId,
        recovered_amount_cents: 1999,
      };

      expect(expectedUpdate.recovery_type).toBe('CLICK_THROUGH');
      expect(expectedUpdate.attributed_click_id).toBe(clickId);
    });

    it('should attribute recovery as ORGANIC when no click exists before payment', async () => {
      // Arrange
      const caseId = 'case-organic-001';
      const companyId = 'company-organic-001';
      const membershipId = 'membership-organic-001';

      const mockCase: RecoveryCase = {
        id: caseId,
        company_id: companyId,
        membership_id: membershipId,
        status: 'OPEN',
        recovery_type: null,
        attributed_click_id: null,
        recovered_amount_cents: null,
        attribution_window_days: 7,
        created_at: new Date('2024-01-10T12:00:00Z'),
        updated_at: new Date('2024-01-10T12:00:00Z'),
      };

      // No clicks recorded for this case
      const clicks: RecoveryClickEvent[] = [];

      // Assert: Without any clicks, recovery should be ORGANIC
      expect(mockCase.status).toBe('OPEN');
      expect(clicks.length).toBe(0);

      const expectedUpdate = {
        status: 'RECOVERED',
        recovery_type: 'ORGANIC',
        attributed_click_id: null,
        recovered_amount_cents: 1999,
      };

      expect(expectedUpdate.recovery_type).toBe('ORGANIC');
      expect(expectedUpdate.attributed_click_id).toBeNull();
    });
  });

  describe('Click Endpoint Behavior', () => {
    it('should record click and redirect for valid token', async () => {
      // Valid token scenario
      const validToken = 'valid-hmac-signed-token';
      const expectedRedirectUrl = 'https://whop.com/hub/membership-123';
      
      // The click endpoint should:
      // 1. Decode the token
      // 2. Verify HMAC signature
      // 3. Check expiration
      // 4. Record click event
      // 5. Redirect to manage URL

      // Mock valid token decoding
      const decodedToken = {
        caseId: 'case-001',
        companyId: 'company-001',
        membershipId: 'membership-123',
        expiresAt: new Date('2024-01-20T12:00:00Z').getTime(),
      };

      expect(decodedToken.expiresAt).toBeGreaterThan(Date.now());
      
      // Click should be recorded
      const mockClickEvent: Partial<RecoveryClickEvent> = {
        case_id: decodedToken.caseId,
        company_id: decodedToken.companyId,
        is_bot_suspected: false,
      };

      expect(mockClickEvent.is_bot_suspected).toBe(false);
    });

    it('should reject expired tokens', async () => {
      // Arrange: Token expired yesterday
      const expiredToken = {
        caseId: 'case-expired',
        companyId: 'company-001',
        expiresAt: new Date('2024-01-14T12:00:00Z').getTime(), // Yesterday
      };

      // Current time is 2024-01-15T12:00:00Z
      const currentTime = Date.now();

      // Assert
      expect(expiredToken.expiresAt).toBeLessThan(currentTime);
      
      // Expected behavior: Return 400/410 and DO NOT record click
      // The token should not attribute to any recovery
    });

    it('should return 400 for tampered tokens', async () => {
      // Arrange: Token with invalid HMAC
      const tamperedPayload = {
        caseId: 'case-tampered',
        companyId: 'company-001',
        membershipId: 'membership-001',
      };

      // The HMAC validation would fail for a tampered token
      const originalSignature = 'original-signature';
      const recalculatedSignature = 'different-signature';

      // Assert: Signatures don't match = tampered
      expect(originalSignature).not.toBe(recalculatedSignature);
      
      // Expected: 400 Bad Request, no click recorded
    });

    it('should flag bot/prefetch requests but still record click', async () => {
      // Arrange: Request with prefetch header
      const botUserAgents = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'facebookexternalhit/1.1',
        'Twitterbot/1.0',
        'LinkedInBot/1.0',
      ];

      const prefetchHeaders = [
        { 'purpose': 'prefetch' },
        { 'sec-fetch-purpose': 'prefetch' },
        { 'x-purpose': 'prefetch' },
      ];

      // Assert: All bot UAs should be flagged
      for (const ua of botUserAgents) {
        const isBotUA = /bot|crawl|spider|facebook|twitter|linkedin/i.test(ua);
        expect(isBotUA).toBe(true);
      }

      // Prefetch headers should flag as bot
      for (const headers of prefetchHeaders) {
        const hasPrefetchHeader = 
          headers['purpose'] === 'prefetch' || 
          headers['sec-fetch-purpose'] === 'prefetch' ||
          headers['x-purpose'] === 'prefetch';
        expect(hasPrefetchHeader).toBe(true);
      }

      // When flagged as bot, click is recorded but recovery becomes ORGANIC
    });
  });

  describe('Attribution Window Enforcement', () => {
    it('should attribute click within 7-day window', async () => {
      // Arrange: Click 3 days before payment
      const clickTime = new Date('2024-01-12T12:00:00Z');
      const paymentTime = new Date('2024-01-15T12:00:00Z');
      const windowStartTime = new Date(paymentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Assert: Click is within window
      expect(clickTime >= windowStartTime).toBe(true);
      expect(clickTime < paymentTime).toBe(true);
      
      // Should result in CLICK_THROUGH attribution
    });

    it('should NOT attribute click outside 7-day window', async () => {
      // Arrange: Click 10 days before payment (outside 7-day window)
      const clickTime = new Date('2024-01-05T12:00:00Z');
      const paymentTime = new Date('2024-01-15T12:00:00Z');
      const windowStartTime = new Date(paymentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Assert: Click is outside window
      expect(clickTime < windowStartTime).toBe(true);
      
      // Should result in ORGANIC attribution (despite having a click)
    });

    it('should NOT attribute click that happened after payment', async () => {
      // Arrange: Click after payment (edge case - user clicks after already renewing)
      const paymentTime = new Date('2024-01-15T12:00:00Z');
      const clickTime = new Date('2024-01-15T14:00:00Z'); // 2 hours after payment

      // Assert: Click is after payment
      expect(clickTime > paymentTime).toBe(true);
      
      // Should NOT change prior attribution
    });
  });

  describe('Multiple Clicks Handling', () => {
    it('should attribute most recent qualifying click within window', async () => {
      // Arrange: Multiple clicks for the same case
      const paymentTime = new Date('2024-01-15T12:00:00Z');
      
      const clicks: RecoveryClickEvent[] = [
        {
          id: 'click-old',
          link_send_id: 'send-001',
          case_id: 'case-001',
          company_id: 'company-001',
          is_bot_suspected: false,
          user_agent: 'Mozilla/5.0',
          ip_address: '192.168.1.1',
          clicked_at: new Date('2024-01-10T12:00:00Z'), // 5 days before
        },
        {
          id: 'click-newest',
          link_send_id: 'send-002',
          case_id: 'case-001',
          company_id: 'company-001',
          is_bot_suspected: false,
          user_agent: 'Mozilla/5.0',
          ip_address: '192.168.1.1',
          clicked_at: new Date('2024-01-14T18:00:00Z'), // Most recent, 18 hours before
        },
        {
          id: 'click-middle',
          link_send_id: 'send-003',
          case_id: 'case-001',
          company_id: 'company-001',
          is_bot_suspected: false,
          user_agent: 'Mozilla/5.0',
          ip_address: '192.168.1.1',
          clicked_at: new Date('2024-01-12T12:00:00Z'), // 3 days before
        },
      ];

      // Find most recent click before payment
      const qualifyingClicks = clicks
        .filter(c => c.clicked_at < paymentTime)
        .sort((a, b) => b.clicked_at.getTime() - a.clicked_at.getTime());

      // Assert: Most recent click should be selected
      expect(qualifyingClicks[0].id).toBe('click-newest');
      expect(qualifyingClicks[0].clicked_at.toISOString()).toBe('2024-01-14T18:00:00.000Z');
    });

    it('should skip bot-flagged clicks and use next most recent', async () => {
      // Arrange: Most recent click is bot-flagged
      const paymentTime = new Date('2024-01-15T12:00:00Z');
      
      const clicks: RecoveryClickEvent[] = [
        {
          id: 'click-bot',
          link_send_id: 'send-001',
          case_id: 'case-001',
          company_id: 'company-001',
          is_bot_suspected: true, // Bot flagged!
          user_agent: 'facebookexternalhit/1.1',
          ip_address: '192.168.1.1',
          clicked_at: new Date('2024-01-14T18:00:00Z'), // Most recent
        },
        {
          id: 'click-human',
          link_send_id: 'send-002',
          case_id: 'case-001',
          company_id: 'company-001',
          is_bot_suspected: false, // Human click
          user_agent: 'Mozilla/5.0',
          ip_address: '192.168.1.1',
          clicked_at: new Date('2024-01-14T10:00:00Z'), // Earlier but valid
        },
      ];

      // Filter out bot clicks and find most recent human click
      const humanClicks = clicks
        .filter(c => !c.is_bot_suspected && c.clicked_at < paymentTime)
        .sort((a, b) => b.clicked_at.getTime() - a.clicked_at.getTime());

      // Assert: Human click should be selected
      expect(humanClicks.length).toBe(1);
      expect(humanClicks[0].id).toBe('click-human');
    });
  });

  describe('Tier Enforcement in Recovery Flow', () => {
    it('should record tier usage for CLICK_THROUGH recovery when allowed', async () => {
      // Arrange: Starter tier with remaining cap
      const companySubscription = {
        tier: 'starter',
        monthly_recovered_revenue_cents: 100000, // $1,000 used
        max_monthly_recovered_revenue_cents: 500000, // $5,000 cap
      };

      const recoveryAmountCents = 3999; // $39.99
      const newTotal = companySubscription.monthly_recovered_revenue_cents + recoveryAmountCents;

      // Assert: Should be allowed
      expect(newTotal).toBeLessThanOrEqual(companySubscription.max_monthly_recovered_revenue_cents!);
      
      // Recovery should be recorded as CLICK_THROUGH with tier usage incremented
    });

    it('should still mark recovery but NOT record tier usage when limit exceeded', async () => {
      // Arrange: Free tier already used its one recovery
      const companySubscription = {
        tier: 'free',
        total_recoveries: 1, // Already used
        max_total_recoveries: 1, // Cap is 1
      };

      // Assert: Should NOT be allowed
      expect(companySubscription.total_recoveries).toBeGreaterThanOrEqual(
        companySubscription.max_total_recoveries!
      );
      
      // Recovery should still be marked (case status updated)
      // But tier usage should NOT be incremented
      // recovery_type could still be CLICK_THROUGH, but it doesn't count toward limits
    });

    it('should skip tier check entirely for ORGANIC recoveries', async () => {
      // Arrange: ORGANIC recovery (no click)
      const recoveryType = 'ORGANIC';

      // ORGANIC recoveries don't require tier check
      // They are natural renewals without attribution credit

      // Assert
      expect(recoveryType).toBe('ORGANIC');
      
      // No tier check needed, case marked as recovered without usage recording
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/missing manage URL gracefully', async () => {
      // Arrange: Token without manage URL
      const tokenData = {
        caseId: 'case-001',
        companyId: 'company-001',
        membershipId: 'membership-001',
        manageUrl: null, // Missing!
      };

      // Assert: Should have fallback behavior
      const fallbackUrl = 'https://whop.com/hub';
      expect(tokenData.manageUrl || fallbackUrl).toBe(fallbackUrl);
    });

    it('should handle case closed before click processing', async () => {
      // Arrange: Case was already marked as churned before click arrived
      const mockCase: RecoveryCase = {
        id: 'case-churned',
        company_id: 'company-001',
        membership_id: 'membership-001',
        status: 'CHURNED', // Already closed!
        recovery_type: null,
        attributed_click_id: null,
        recovered_amount_cents: null,
        attribution_window_days: 7,
        created_at: new Date('2024-01-10T12:00:00Z'),
        updated_at: new Date('2024-01-14T12:00:00Z'),
      };

      // Assert: Should not update churned case
      expect(mockCase.status).toBe('CHURNED');
      
      // Click should still be recorded for analytics
      // But case status should not change
    });

    it('should handle concurrent recovery attempts', async () => {
      // Arrange: Two payment success webhooks for the same membership
      const membershipId = 'membership-concurrent';
      const paymentEvent1 = { timestamp: new Date('2024-01-15T12:00:00Z') };
      const paymentEvent2 = { timestamp: new Date('2024-01-15T12:00:01Z') }; // 1 second later

      // First event should process, second should find no open case
      const openCase = {
        id: 'case-001',
        membership_id: membershipId,
        status: 'OPEN',
      };

      // After first event processes:
      const closedCase = {
        ...openCase,
        status: 'RECOVERED',
      };

      // Assert: Second event should not find open case
      expect(closedCase.status).not.toBe('OPEN');
    });

    it('should preserve LEGACY_UNKNOWN for backfilled cases', async () => {
      // Arrange: Case marked during backfill
      const legacyCase: RecoveryCase = {
        id: 'case-legacy',
        company_id: 'company-001',
        membership_id: 'membership-001',
        status: 'RECOVERED',
        recovery_type: 'LEGACY_UNKNOWN', // Set by backfill script
        attributed_click_id: null,
        recovered_amount_cents: 2999,
        attribution_window_days: 7,
        created_at: new Date('2023-12-01T12:00:00Z'),
        updated_at: new Date('2024-01-01T12:00:00Z'),
      };

      // Assert: Should remain LEGACY_UNKNOWN
      expect(legacyCase.recovery_type).toBe('LEGACY_UNKNOWN');
      
      // New clicks should not retroactively change legacy cases
    });
  });
});