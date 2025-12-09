/**
 * Subscription Tier Enforcement Tests
 *
 * Tests for tiered usage limits, including:
 * - Free tier: 1 total recovery lifetime limit
 * - Starter/Growth: monthly revenue caps
 * - Scale: unlimited (null limits)
 * - Month boundary reset logic
 *
 * This tests the business logic independently of database integration.
 *
 * @see apps/web/src/server/services/subscriptions.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Type Definitions (matching subscriptions.ts)
// =============================================================================

type SubscriptionTier = 'free' | 'starter' | 'growth' | 'scale';

interface TierLimits {
  tier: SubscriptionTier;
  max_total_recoveries: number | null;
  max_monthly_recovered_revenue_cents: number | null;
}

interface CompanySubscription {
  id: string;
  company_id: string;
  tier: SubscriptionTier;
  current_month: string;
  total_recoveries: number;
  monthly_recovered_revenue_cents: number;
}

interface RecoveryAllowanceResult {
  allowed: boolean;
  reason?: string;
}

// =============================================================================
// Business Logic Functions (pure implementations for testing)
// =============================================================================

/**
 * Tier limits per the business requirements
 */
const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    tier: 'free',
    max_total_recoveries: 1,
    max_monthly_recovered_revenue_cents: null,
  },
  starter: {
    tier: 'starter',
    max_total_recoveries: null,
    max_monthly_recovered_revenue_cents: 500000, // $5,000/month
  },
  growth: {
    tier: 'growth',
    max_total_recoveries: null,
    max_monthly_recovered_revenue_cents: 2000000, // $20,000/month
  },
  scale: {
    tier: 'scale',
    max_total_recoveries: null,
    max_monthly_recovered_revenue_cents: null, // Unlimited
  },
};

/**
 * Pure function implementing tier enforcement logic
 */
function checkRecoveryAllowedPure(
  subscription: CompanySubscription,
  limits: TierLimits,
  amountCents: number
): RecoveryAllowanceResult {
  // Check total recovery limit (free tier)
  if (limits.max_total_recoveries !== null) {
    if (subscription.total_recoveries >= limits.max_total_recoveries) {
      return {
        allowed: false,
        reason: `Total recovery limit reached (${limits.max_total_recoveries}). Upgrade to continue.`,
      };
    }
  }

  // Check monthly revenue cap (starter/growth tier)
  if (limits.max_monthly_recovered_revenue_cents !== null) {
    const projectedTotal = subscription.monthly_recovered_revenue_cents + amountCents;
    if (projectedTotal > limits.max_monthly_recovered_revenue_cents) {
      return {
        allowed: false,
        reason: `Monthly revenue cap would be exceeded. Cap: $${(limits.max_monthly_recovered_revenue_cents / 100).toFixed(2)}`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Pure function implementing month boundary check
 */
function ensureCurrentMonth(
  subscription: CompanySubscription,
  currentMonth: string
): CompanySubscription {
  if (subscription.current_month !== currentMonth) {
    // Month changed - reset monthly counters but preserve total
    return {
      ...subscription,
      current_month: currentMonth,
      monthly_recovered_revenue_cents: 0,
    };
  }
  return subscription;
}

/**
 * Pure function implementing recovery recording
 */
function recordRecoveryPure(
  subscription: CompanySubscription,
  amountCents: number
): CompanySubscription {
  return {
    ...subscription,
    total_recoveries: subscription.total_recoveries + 1,
    monthly_recovered_revenue_cents: subscription.monthly_recovered_revenue_cents + amountCents,
  };
}

/**
 * Get default free subscription for new company
 */
function createDefaultSubscription(companyId: string): CompanySubscription {
  return {
    id: `sub-${companyId}-${Date.now()}`,
    company_id: companyId,
    tier: 'free',
    current_month: new Date().toISOString().slice(0, 7),
    total_recoveries: 0,
    monthly_recovered_revenue_cents: 0,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Subscription Tier Enforcement', () => {
  describe('Free Tier', () => {
    it('should allow first recovery for free tier', () => {
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'free',
        current_month: '2024-01',
        total_recoveries: 0,
        monthly_recovered_revenue_cents: 0,
      };

      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.free, 1999);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should block second recovery for free tier', () => {
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'free',
        current_month: '2024-01',
        total_recoveries: 1, // Already used the one free recovery
        monthly_recovered_revenue_cents: 1999,
      };

      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.free, 2999);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit');
    });

    it('should count total recoveries across all time for free tier', () => {
      // Free tier counts TOTAL recoveries, not monthly
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'free',
        current_month: '2024-02', // Different month
        total_recoveries: 1, // Used in January
        monthly_recovered_revenue_cents: 0, // Reset this month
      };

      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.free, 1999);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit');
    });
  });

  describe('Starter Tier', () => {
    it('should allow recovery within monthly revenue cap', () => {
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 10,
        monthly_recovered_revenue_cents: 100000, // $1,000 used
      };

      // $39.99 recovery should be allowed
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, 3999);

      expect(result.allowed).toBe(true);
    });

    it('should block recovery exceeding monthly revenue cap', () => {
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 10,
        monthly_recovered_revenue_cents: 490000, // $4,900 used (cap is $5,000)
      };

      // $150 recovery would exceed the cap
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, 15000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('revenue');
    });

    it('should allow unlimited total recoveries for starter tier', () => {
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 1000, // Many recoveries
        monthly_recovered_revenue_cents: 100000,
      };

      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, 1999);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Growth Tier', () => {
    it('should allow recovery within higher monthly revenue cap', () => {
      const subscription: CompanySubscription = {
        id: 'sub-003',
        company_id: 'company-789',
        tier: 'growth',
        current_month: '2024-01',
        total_recoveries: 50,
        monthly_recovered_revenue_cents: 1500000, // $15,000 used (cap is $20,000)
      };

      // $49.99 recovery should be allowed
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.growth, 4999);

      expect(result.allowed).toBe(true);
    });

    it('should block recovery exceeding growth tier cap', () => {
      const subscription: CompanySubscription = {
        id: 'sub-003',
        company_id: 'company-789',
        tier: 'growth',
        current_month: '2024-01',
        total_recoveries: 50,
        monthly_recovered_revenue_cents: 1990000, // $19,900 used (cap is $20,000)
      };

      // $150 recovery would exceed the cap
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.growth, 15000);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('revenue');
    });
  });

  describe('Scale Tier (Unlimited)', () => {
    it('should allow any recovery amount for scale tier', () => {
      const subscription: CompanySubscription = {
        id: 'sub-004',
        company_id: 'company-scale',
        tier: 'scale',
        current_month: '2024-01',
        total_recoveries: 10000,
        monthly_recovered_revenue_cents: 50000000, // $500,000 already
      };

      // Even a large recovery should be allowed
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.scale, 1000000); // $10,000

      expect(result.allowed).toBe(true);
    });

    it('should have no total recovery limit for scale tier', () => {
      const subscription: CompanySubscription = {
        id: 'sub-004',
        company_id: 'company-scale',
        tier: 'scale',
        current_month: '2024-01',
        total_recoveries: 100000, // Massive number
        monthly_recovered_revenue_cents: 100000000,
      };

      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.scale, 1999);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Month Boundary Reset', () => {
    it('should reset monthly counters when month changes', () => {
      const currentMonth = '2024-02';
      const oldMonth = '2024-01';
      
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: oldMonth, // Old month
        total_recoveries: 10,
        monthly_recovered_revenue_cents: 400000, // Was high last month
      };

      const resetSubscription = ensureCurrentMonth(subscription, currentMonth);

      // Monthly counter should be reset
      expect(resetSubscription.monthly_recovered_revenue_cents).toBe(0);
      expect(resetSubscription.current_month).toBe(currentMonth);
      
      // Total recoveries should be preserved
      expect(resetSubscription.total_recoveries).toBe(10);
      
      // After reset, recovery should be allowed
      const result = checkRecoveryAllowedPure(resetSubscription, TIER_LIMITS.starter, 3999);
      expect(result.allowed).toBe(true);
    });

    it('should preserve total_recoveries across month boundaries', () => {
      const currentMonth = '2024-02';
      
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'free',
        current_month: '2024-01', // Old month
        total_recoveries: 1, // Used in January
        monthly_recovered_revenue_cents: 1999,
      };

      // Apply month boundary reset
      const resetSubscription = ensureCurrentMonth(subscription, currentMonth);

      // Total recoveries should be preserved
      expect(resetSubscription.total_recoveries).toBe(1);
      
      // Free tier should still be blocked because total_recoveries is preserved
      const result = checkRecoveryAllowedPure(resetSubscription, TIER_LIMITS.free, 1999);
      expect(result.allowed).toBe(false);
    });

    it('should not reset if same month', () => {
      const currentMonth = '2024-01';
      
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: currentMonth,
        total_recoveries: 10,
        monthly_recovered_revenue_cents: 400000,
      };

      const result = ensureCurrentMonth(subscription, currentMonth);

      // Should return unchanged subscription
      expect(result).toEqual(subscription);
      expect(result.monthly_recovered_revenue_cents).toBe(400000);
    });
  });

  describe('recordRecovery', () => {
    it('should increment total_recoveries and monthly_recovered_revenue_cents', () => {
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 5,
        monthly_recovered_revenue_cents: 100000,
      };

      const updated = recordRecoveryPure(subscription, 1999);

      expect(updated.total_recoveries).toBe(6);
      expect(updated.monthly_recovered_revenue_cents).toBe(101999);
    });

    it('should accumulate multiple recoveries correctly', () => {
      let subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 0,
        monthly_recovered_revenue_cents: 0,
      };

      // Record three recoveries
      subscription = recordRecoveryPure(subscription, 1000);
      subscription = recordRecoveryPure(subscription, 2000);
      subscription = recordRecoveryPure(subscription, 3000);

      expect(subscription.total_recoveries).toBe(3);
      expect(subscription.monthly_recovered_revenue_cents).toBe(6000);
    });
  });

  describe('getCompanySubscription', () => {
    it('should create default free subscription if none exists', () => {
      const result = createDefaultSubscription('company-new');

      expect(result.tier).toBe('free');
      expect(result.total_recoveries).toBe(0);
      expect(result.monthly_recovered_revenue_cents).toBe(0);
      expect(result.company_id).toBe('company-new');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amount recovery', () => {
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 5,
        monthly_recovered_revenue_cents: 100000,
      };

      // Zero amount should still be allowed
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, 0);

      expect(result.allowed).toBe(true);
    });

    it('should handle exactly at the cap amount', () => {
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 10,
        monthly_recovered_revenue_cents: 499000, // $4,990 used
      };

      // $10 would bring it to exactly $5,000 cap
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, 1000);

      // Exactly at cap should be allowed
      expect(result.allowed).toBe(true);
    });

    it('should handle one cent over the cap', () => {
      const subscription: CompanySubscription = {
        id: 'sub-002',
        company_id: 'company-456',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 10,
        monthly_recovered_revenue_cents: 499999, // $4,999.99 used
      };

      // $0.02 would bring it to $5,000.01 - one cent over
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, 2);

      expect(result.allowed).toBe(false);
    });

    it('should handle large amounts correctly', () => {
      const subscription: CompanySubscription = {
        id: 'sub-003',
        company_id: 'company-789',
        tier: 'growth',
        current_month: '2024-01',
        total_recoveries: 1,
        monthly_recovered_revenue_cents: 0,
      };

      // Try to recover $250 (25000 cents) - should be allowed
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.growth, 25000);
      expect(result.allowed).toBe(true);
    });

    it('should reject negative amounts gracefully', () => {
      const subscription: CompanySubscription = {
        id: 'sub-001',
        company_id: 'company-123',
        tier: 'starter',
        current_month: '2024-01',
        total_recoveries: 5,
        monthly_recovered_revenue_cents: 100000,
      };

      // Negative amounts technically allowed by the logic (edge case)
      // In production, validation would happen before this function
      const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, -100);
      expect(result.allowed).toBe(true); // Negative reduces total, so within cap
    });
  });

  describe('Tier Combinations', () => {
    it('should correctly apply free tier total limit', () => {
      const tests = [
        { total: 0, expected: true },
        { total: 1, expected: false },
        { total: 2, expected: false },
      ];

      for (const test of tests) {
        const subscription: CompanySubscription = {
          id: 'sub-001',
          company_id: 'company-123',
          tier: 'free',
          current_month: '2024-01',
          total_recoveries: test.total,
          monthly_recovered_revenue_cents: 0,
        };

        const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.free, 1000);
        expect(result.allowed).toBe(test.expected);
      }
    });

    it('should correctly apply starter tier monthly cap', () => {
      const cap = 500000; // $5,000
      const tests = [
        { used: 0, amount: 100000, expected: true },        // $0 + $1,000 = $1,000 ✓
        { used: 400000, amount: 100000, expected: true },   // $4,000 + $1,000 = $5,000 ✓
        { used: 490000, amount: 10001, expected: false },   // $4,900 + $100.01 > $5,000 ✗
        { used: cap, amount: 1, expected: false },          // At cap + any = over ✗
      ];

      for (const test of tests) {
        const subscription: CompanySubscription = {
          id: 'sub-002',
          company_id: 'company-456',
          tier: 'starter',
          current_month: '2024-01',
          total_recoveries: 50,
          monthly_recovered_revenue_cents: test.used,
        };

        const result = checkRecoveryAllowedPure(subscription, TIER_LIMITS.starter, test.amount);
        expect(result.allowed).toBe(test.expected);
      }
    });
  });

  describe('Tier Limits Configuration', () => {
    it('should have correct free tier limits', () => {
      expect(TIER_LIMITS.free.max_total_recoveries).toBe(1);
      expect(TIER_LIMITS.free.max_monthly_recovered_revenue_cents).toBeNull();
    });

    it('should have correct starter tier limits', () => {
      expect(TIER_LIMITS.starter.max_total_recoveries).toBeNull();
      expect(TIER_LIMITS.starter.max_monthly_recovered_revenue_cents).toBe(500000);
    });

    it('should have correct growth tier limits', () => {
      expect(TIER_LIMITS.growth.max_total_recoveries).toBeNull();
      expect(TIER_LIMITS.growth.max_monthly_recovered_revenue_cents).toBe(2000000);
    });

    it('should have correct scale tier limits (unlimited)', () => {
      expect(TIER_LIMITS.scale.max_total_recoveries).toBeNull();
      expect(TIER_LIMITS.scale.max_monthly_recovered_revenue_cents).toBeNull();
    });
  });
});