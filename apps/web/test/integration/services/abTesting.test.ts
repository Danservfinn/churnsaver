// Integration tests for A/B testing
// Tests variant selection in reminder flow, usage/conversion tracking

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { abTesting, type ABVariant } from '@/server/services/abTesting';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

// Mock dependencies
vi.mock('@/lib/db');
vi.mock('@/lib/logger');

describe('A/B Testing Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Variant Selection in Reminder Flow', () => {
    test('should select variant and track usage when reminder sent', async () => {
      const companyId = 'company_ab_123';
      const userIdHash = 'user_hash_123';
      const variantId = 'variant_1';
      const caseId = 'case_ab_123';
      const membershipId = 'mem_ab_123';

      const variants: (ABVariant & { company_id: string })[] = [
        {
          id: variantId,
          name: 'Variant A',
          weight: 100,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          company_id: companyId,
        },
      ];

      vi.mocked(sql.select).mockResolvedValue(variants as any);
      vi.mocked(sql.execute).mockResolvedValue(1);

      // Load variants
      await abTesting.loadVariants(companyId);

      // Select variant
      const variant = abTesting.selectVariant(userIdHash, companyId);
      expect(variant).not.toBeNull();

      // Log usage
      await abTesting.logVariantUsage(variantId, caseId, 'push', companyId, membershipId);

      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ab_test_usage'),
        expect.arrayContaining([variantId, caseId, 'push', companyId, membershipId])
      );
    });

    test('should track variant conversion on case recovery', async () => {
      const variantId = 'variant_1';
      const caseId = 'case_recovery_123';

      vi.mocked(sql.execute).mockResolvedValue(1);

      await abTesting.logConversion(variantId, caseId, 'convert');

      expect(sql.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO ab_test_conversions'),
        expect.arrayContaining([variantId, caseId, 'convert'])
      );
    });
  });

  describe('Multi-Tenant Variant Isolation', () => {
    test('should ensure Company A variants do not affect Company B', async () => {
      const companyA = 'company_a_123';
      const companyB = 'company_b_123';
      const userIdHash = 'user_hash_123';

      const variantsA: (ABVariant & { company_id: string })[] = [
        {
          id: 'variant_a',
          name: 'Variant A',
          weight: 100,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          company_id: companyA,
        },
      ];

      const variantsB: (ABVariant & { company_id: string })[] = [
        {
          id: 'variant_b',
          name: 'Variant B',
          weight: 100,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          company_id: companyB,
        },
      ];

      vi.mocked(sql.select)
        .mockResolvedValueOnce(variantsA as any)
        .mockResolvedValueOnce(variantsB as any);

      await abTesting.loadVariants(companyA);
      const variantA = abTesting.selectVariant(userIdHash, companyA);

      await abTesting.loadVariants(companyB);
      const variantB = abTesting.selectVariant(userIdHash, companyB);

      expect(variantA?.id).toBe('variant_a');
      expect(variantB?.id).toBe('variant_b');
    });
  });

  describe('Variant Selection Persistence', () => {
    test('should select same variant for same user across reminder attempts', async () => {
      const companyId = 'company_persist_123';
      const userIdHash = 'user_hash_persist_123';

      const variants: (ABVariant & { company_id: string })[] = [
        {
          id: 'variant_1',
          name: 'Variant A',
          weight: 100,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          company_id: companyId,
        },
      ];

      vi.mocked(sql.select).mockResolvedValue(variants as any);
      await abTesting.loadVariants(companyId);

      const variant1 = abTesting.selectVariant(userIdHash, companyId);
      const variant2 = abTesting.selectVariant(userIdHash, companyId);

      expect(variant1?.id).toBe(variant2?.id);
    });
  });

  describe('Usage and Conversion Data Queryable for Analytics', () => {
    test('should calculate performance metrics correctly', async () => {
      const companyId = 'company_metrics_123';

      const mockRows = [
        {
          variant_id: 'variant_1',
          variant_name: 'Variant A',
          total_sent: '100',
          total_conversions: '10',
          last_updated: new Date().toISOString(),
        },
        {
          variant_id: 'variant_2',
          variant_name: 'Variant B',
          total_sent: '100',
          total_conversions: '15',
          last_updated: new Date().toISOString(),
        },
      ];

      vi.mocked(sql.select).mockResolvedValue(mockRows as any);

      const results = await abTesting.getPerformanceMetrics(companyId);

      expect(results).toHaveLength(2);
      expect(results[0].variantId).toBe('variant_1');
      expect(results[1].variantId).toBe('variant_2');
      expect(results[0].totalSent).toBe(100);
      expect(results[0].totalClicked).toBe(10);
      expect(results[1].totalClicked).toBe(15);
    });
  });
});

