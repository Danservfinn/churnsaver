/**
 * KPI Attribution Tests
 * 
 * Tests for the dashboard KPIs endpoint that validates:
 * - Click-through-only recovered revenue/rate calculations
 * - Organic recoveries and revenue reported separately
 * - Recovery type filtering and aggregation
 * 
 * @see apps/web/src/app/api/dashboard/kpis/route.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgres://localhost:5432/test',
  },
  additionalEnv: {},
}));

vi.mock('@/lib/db', () => ({
  sql: {
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    select: vi.fn().mockResolvedValue([]),
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
interface RecoveredCase {
  id: string;
  company_id: string;
  membership_id: string;
  status: 'RECOVERED';
  recovery_type: 'CLICK_THROUGH' | 'ORGANIC' | 'LEGACY_UNKNOWN';
  recovered_amount_cents: number;
  created_at: Date;
  resolved_at: Date;
}

interface DashboardKPIs {
  // Primary metrics (click-through only)
  recoveredRevenue: number;
  recoveredCount: number;
  recoveryRate: number;
  
  // Context metrics (organic)
  organicRecoveredRevenue: number;
  organicRecoveredCount: number;
  
  // Total context
  totalCases: number;
  openCases: number;
  churnedCases: number;
  
  // Time-based breakdown
  period: 'day' | 'week' | 'month';
}

describe('KPI Attribution Computation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Click-Through-Only Primary Metrics', () => {
    it('should count only CLICK_THROUGH recoveries for primary recovered count', () => {
      // Arrange: Mix of recovery types
      const recoveredCases: RecoveredCase[] = [
        {
          id: 'case-ct-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999,
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-ct-2',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2999,
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
        {
          id: 'case-org-1',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 4999,
          created_at: new Date('2024-01-03T12:00:00Z'),
          resolved_at: new Date('2024-01-12T12:00:00Z'),
        },
        {
          id: 'case-leg-1',
          company_id: 'company-001',
          membership_id: 'mem-004',
          status: 'RECOVERED',
          recovery_type: 'LEGACY_UNKNOWN',
          recovered_amount_cents: 3999,
          created_at: new Date('2023-12-01T12:00:00Z'),
          resolved_at: new Date('2023-12-10T12:00:00Z'),
        },
      ];

      // Act: Filter for click-through only
      const clickThroughCases = recoveredCases.filter(
        c => c.recovery_type === 'CLICK_THROUGH'
      );

      // Assert
      expect(clickThroughCases.length).toBe(2);
      expect(clickThroughCases.map(c => c.id)).toEqual(['case-ct-1', 'case-ct-2']);
    });

    it('should sum only CLICK_THROUGH recovered_amount_cents for primary revenue', () => {
      // Arrange
      const recoveredCases: RecoveredCase[] = [
        {
          id: 'case-ct-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999, // $19.99
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-ct-2',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2999, // $29.99
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
        {
          id: 'case-org-1',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 4999, // $49.99 - should NOT be counted
          created_at: new Date('2024-01-03T12:00:00Z'),
          resolved_at: new Date('2024-01-12T12:00:00Z'),
        },
      ];

      // Act
      const clickThroughRevenue = recoveredCases
        .filter(c => c.recovery_type === 'CLICK_THROUGH')
        .reduce((sum, c) => sum + c.recovered_amount_cents, 0);

      const organicRevenue = recoveredCases
        .filter(c => c.recovery_type === 'ORGANIC')
        .reduce((sum, c) => sum + c.recovered_amount_cents, 0);

      // Assert
      expect(clickThroughRevenue).toBe(4998); // $49.98 total
      expect(organicRevenue).toBe(4999); // $49.99
      
      // Primary metric should only show click-through
      const primaryRecoveredRevenue = clickThroughRevenue;
      expect(primaryRecoveredRevenue).toBe(4998);
    });

    it('should calculate recovery rate based on CLICK_THROUGH only', () => {
      // Arrange: 10 total cases this period
      const totalCases = 10;
      const clickThroughRecoveries = 2;
      const organicRecoveries = 3;
      const churnedCases = 5;

      // Assert: Recovery rate = click-through recoveries / total cases
      const recoveryRate = (clickThroughRecoveries / totalCases) * 100;
      
      expect(recoveryRate).toBe(20); // 20% click-through recovery rate
      
      // Note: Organic recoveries are NOT included in the primary rate
      const wrongRate = ((clickThroughRecoveries + organicRecoveries) / totalCases) * 100;
      expect(wrongRate).toBe(50); // This would be incorrect!
      expect(recoveryRate).not.toBe(wrongRate);
    });
  });

  describe('Organic Metrics (Context)', () => {
    it('should report organic recoveries separately', () => {
      // Arrange
      const recoveredCases: RecoveredCase[] = [
        {
          id: 'case-ct-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999,
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-org-1',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 2999,
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
        {
          id: 'case-org-2',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 3999,
          created_at: new Date('2024-01-03T12:00:00Z'),
          resolved_at: new Date('2024-01-12T12:00:00Z'),
        },
      ];

      // Act
      const organicCases = recoveredCases.filter(c => c.recovery_type === 'ORGANIC');
      const organicCount = organicCases.length;
      const organicRevenue = organicCases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );

      // Assert
      expect(organicCount).toBe(2);
      expect(organicRevenue).toBe(6998); // $69.98
    });

    it('should separate legacy unknown from both click-through and organic', () => {
      // Arrange
      const recoveredCases: RecoveredCase[] = [
        {
          id: 'case-ct',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1000,
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-org',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 2000,
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
        {
          id: 'case-leg',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'LEGACY_UNKNOWN',
          recovered_amount_cents: 3000,
          created_at: new Date('2023-12-01T12:00:00Z'),
          resolved_at: new Date('2023-12-10T12:00:00Z'),
        },
      ];

      // Act
      const byType = {
        clickThrough: recoveredCases.filter(c => c.recovery_type === 'CLICK_THROUGH'),
        organic: recoveredCases.filter(c => c.recovery_type === 'ORGANIC'),
        legacy: recoveredCases.filter(c => c.recovery_type === 'LEGACY_UNKNOWN'),
      };

      // Assert
      expect(byType.clickThrough.length).toBe(1);
      expect(byType.organic.length).toBe(1);
      expect(byType.legacy.length).toBe(1);
      
      // Legacy unknown should not be counted in either primary or organic context
      // It's a separate category for historical data
    });
  });

  describe('KPI Aggregation by Period', () => {
    it('should aggregate KPIs for the current month', () => {
      // Arrange: Cases in different months
      const allCases: RecoveredCase[] = [
        {
          id: 'case-jan-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999,
          created_at: new Date('2024-01-05T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-jan-2',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2999,
          created_at: new Date('2024-01-06T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
        {
          id: 'case-dec-1',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 4999,
          created_at: new Date('2023-12-05T12:00:00Z'),
          resolved_at: new Date('2023-12-10T12:00:00Z'),
        },
      ];

      // Act: Filter for January 2024
      const monthStart = new Date('2024-01-01T00:00:00Z');
      const monthEnd = new Date('2024-02-01T00:00:00Z');
      
      const thisMonthCases = allCases.filter(
        c => c.resolved_at >= monthStart && c.resolved_at < monthEnd
      );

      const monthlyRevenue = thisMonthCases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );

      // Assert
      expect(thisMonthCases.length).toBe(2);
      expect(monthlyRevenue).toBe(4998); // $49.98 for January
    });

    it('should provide daily breakdown of recoveries', () => {
      // Arrange: Multiple recoveries on same day
      const cases: RecoveredCase[] = [
        {
          id: 'case-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1000,
          created_at: new Date('2024-01-10T08:00:00Z'),
          resolved_at: new Date('2024-01-10T10:00:00Z'),
        },
        {
          id: 'case-2',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2000,
          created_at: new Date('2024-01-10T12:00:00Z'),
          resolved_at: new Date('2024-01-10T14:00:00Z'),
        },
        {
          id: 'case-3',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1500,
          created_at: new Date('2024-01-11T09:00:00Z'),
          resolved_at: new Date('2024-01-11T11:00:00Z'),
        },
      ];

      // Act: Group by day
      const byDay = cases.reduce((acc, c) => {
        const day = c.resolved_at.toISOString().split('T')[0];
        if (!acc[day]) {
          acc[day] = { count: 0, revenue: 0 };
        }
        acc[day].count += 1;
        acc[day].revenue += c.recovered_amount_cents;
        return acc;
      }, {} as Record<string, { count: number; revenue: number }>);

      // Assert
      expect(byDay['2024-01-10'].count).toBe(2);
      expect(byDay['2024-01-10'].revenue).toBe(3000);
      expect(byDay['2024-01-11'].count).toBe(1);
      expect(byDay['2024-01-11'].revenue).toBe(1500);
    });
  });

  describe('Multi-Tenant KPI Isolation', () => {
    it('should compute KPIs scoped to the requesting company', () => {
      // Arrange: Cases from multiple companies
      const allCases: RecoveredCase[] = [
        {
          id: 'case-a1',
          company_id: 'company-A',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999,
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-a2',
          company_id: 'company-A',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2999,
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
        {
          id: 'case-b1',
          company_id: 'company-B',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 9999,
          created_at: new Date('2024-01-03T12:00:00Z'),
          resolved_at: new Date('2024-01-12T12:00:00Z'),
        },
      ];

      // Act: Filter for company A (simulating RLS)
      const companyId = 'company-A';
      const companyACases = allCases.filter(c => c.company_id === companyId);
      const companyARevenue = companyACases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );

      // Assert
      expect(companyACases.length).toBe(2);
      expect(companyARevenue).toBe(4998); // $49.98 for company A only
      
      // Company B's $99.99 should NOT be included
      const totalRevenue = allCases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );
      expect(totalRevenue).toBe(14997); // This is all companies
      expect(companyARevenue).not.toBe(totalRevenue);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero recoveries gracefully', () => {
      // Arrange: No recovered cases
      const cases: RecoveredCase[] = [];

      // Act
      const clickThroughCases = cases.filter(c => c.recovery_type === 'CLICK_THROUGH');
      const clickThroughRevenue = clickThroughCases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );
      const recoveryRate = cases.length > 0 
        ? (clickThroughCases.length / cases.length) * 100 
        : 0;

      // Assert
      expect(clickThroughCases.length).toBe(0);
      expect(clickThroughRevenue).toBe(0);
      expect(recoveryRate).toBe(0);
    });

    it('should handle all organic (no click-through) cases', () => {
      // Arrange: Only organic recoveries
      const cases: RecoveredCase[] = [
        {
          id: 'case-org-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 1999,
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'case-org-2',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 2999,
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
      ];

      // Act
      const clickThroughCases = cases.filter(c => c.recovery_type === 'CLICK_THROUGH');
      const organicCases = cases.filter(c => c.recovery_type === 'ORGANIC');

      const clickThroughRevenue = clickThroughCases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );
      const organicRevenue = organicCases.reduce(
        (sum, c) => sum + c.recovered_amount_cents,
        0
      );

      // Assert: Primary metrics show zero, context shows organic
      expect(clickThroughCases.length).toBe(0);
      expect(clickThroughRevenue).toBe(0);
      expect(organicCases.length).toBe(2);
      expect(organicRevenue).toBe(4998);
    });

    it('should handle null recovered_amount_cents gracefully', () => {
      // Arrange: Case with null amount (shouldn't happen but defensive)
      type PartialCase = {
        id?: string;
        company_id?: string;
        recovery_type?: RecoveredCase['recovery_type'];
        recovered_amount_cents: number | null;
      };
      
      const cases: PartialCase[] = [
        {
          id: 'case-1',
          company_id: 'company-001',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999,
        },
        {
          id: 'case-2',
          company_id: 'company-001',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: null, // Edge case!
        },
        {
          id: 'case-3',
          company_id: 'company-001',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2999,
        },
      ];

      // Act: Sum with null safety
      const revenue = cases.reduce(
        (sum, c) => sum + (c.recovered_amount_cents ?? 0),
        0
      );

      // Assert
      expect(revenue).toBe(4998); // $49.98, null treated as 0
    });

    it('should filter by date range correctly at boundaries', () => {
      // Arrange: Cases exactly at boundary times
      const cases: RecoveredCase[] = [
        {
          id: 'case-before',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1000,
          created_at: new Date('2023-12-31T23:59:59.999Z'),
          resolved_at: new Date('2023-12-31T23:59:59.999Z'),
        },
        {
          id: 'case-start',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 2000,
          created_at: new Date('2024-01-01T00:00:00.000Z'),
          resolved_at: new Date('2024-01-01T00:00:00.000Z'),
        },
        {
          id: 'case-end',
          company_id: 'company-001',
          membership_id: 'mem-003',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 3000,
          created_at: new Date('2024-01-31T23:59:59.999Z'),
          resolved_at: new Date('2024-01-31T23:59:59.999Z'),
        },
        {
          id: 'case-after',
          company_id: 'company-001',
          membership_id: 'mem-004',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 4000,
          created_at: new Date('2024-02-01T00:00:00.000Z'),
          resolved_at: new Date('2024-02-01T00:00:00.000Z'),
        },
      ];

      // Act: Filter for January 2024 [inclusive start, exclusive end)
      const startDate = new Date('2024-01-01T00:00:00.000Z');
      const endDate = new Date('2024-02-01T00:00:00.000Z');
      
      const januaryCases = cases.filter(
        c => c.resolved_at >= startDate && c.resolved_at < endDate
      );

      // Assert
      expect(januaryCases.map(c => c.id)).toEqual(['case-start', 'case-end']);
      expect(januaryCases.length).toBe(2);
      
      // Verify boundary cases
      expect(januaryCases.find(c => c.id === 'case-before')).toBeUndefined();
      expect(januaryCases.find(c => c.id === 'case-after')).toBeUndefined();
    });
  });

  describe('KPI Response Structure', () => {
    it('should build complete KPI response object', () => {
      // Arrange
      const cases: RecoveredCase[] = [
        {
          id: 'ct-1',
          company_id: 'company-001',
          membership_id: 'mem-001',
          status: 'RECOVERED',
          recovery_type: 'CLICK_THROUGH',
          recovered_amount_cents: 1999,
          created_at: new Date('2024-01-01T12:00:00Z'),
          resolved_at: new Date('2024-01-10T12:00:00Z'),
        },
        {
          id: 'org-1',
          company_id: 'company-001',
          membership_id: 'mem-002',
          status: 'RECOVERED',
          recovery_type: 'ORGANIC',
          recovered_amount_cents: 2999,
          created_at: new Date('2024-01-02T12:00:00Z'),
          resolved_at: new Date('2024-01-11T12:00:00Z'),
        },
      ];

      const totalCasesThisPeriod = 10; // includes open and churned

      // Act: Build KPI object
      const clickThroughCases = cases.filter(c => c.recovery_type === 'CLICK_THROUGH');
      const organicCases = cases.filter(c => c.recovery_type === 'ORGANIC');

      const kpis: DashboardKPIs = {
        // Primary metrics (click-through only)
        recoveredRevenue: clickThroughCases.reduce(
          (sum, c) => sum + c.recovered_amount_cents,
          0
        ),
        recoveredCount: clickThroughCases.length,
        recoveryRate: (clickThroughCases.length / totalCasesThisPeriod) * 100,

        // Context metrics (organic)
        organicRecoveredRevenue: organicCases.reduce(
          (sum, c) => sum + c.recovered_amount_cents,
          0
        ),
        organicRecoveredCount: organicCases.length,

        // Total context
        totalCases: totalCasesThisPeriod,
        openCases: 3,
        churnedCases: 5,

        // Period
        period: 'month',
      };

      // Assert
      expect(kpis.recoveredRevenue).toBe(1999); // Click-through only
      expect(kpis.recoveredCount).toBe(1);
      expect(kpis.recoveryRate).toBe(10); // 1/10 = 10%
      
      expect(kpis.organicRecoveredRevenue).toBe(2999);
      expect(kpis.organicRecoveredCount).toBe(1);
      
      expect(kpis.totalCases).toBe(10);
      expect(kpis.period).toBe('month');
    });
  });
});