// A/B Testing Framework for Message Copy Optimization
// Enables testing different nudge copy variants to optimize CTR
// Supports gradual rollout, variant tracking, and performance measurement

import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface ABVariant {
  id: string;
  name: string;
  description: string;
  pushTitle?: string;
  pushBody?: string;
  dmMessage?: string;
  weight: number; // Percentage of traffic (0-100)
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ABTestResult {
  variantId: string;
  totalSent: number;
  totalDelivered: number;
  totalClicked: number;
  clickThroughRate: number; // CTR = clicks/delivered
  lastUpdated: Date;
}

// Memoization cache for company variants
interface CompanyVariantsCache {
  companyId: string;
  variants: ABVariant[];
  lastUpdated: Date;
  isLoading: boolean;
}

class ABTestingService {
  private variantsCache = new Map<string, CompanyVariantsCache>();

  /**
   * Load A/B test variants from database with memoization
   */
  async loadVariants(companyId: string): Promise<void> {
    // Check if already loading or recently loaded
    const cached = this.variantsCache.get(companyId);
    const now = new Date();
    
    if (cached && cached.isLoading) {
      logger.debug('Variant load already in progress, skipping', { companyId });
      return;
    }
    
    // If recently loaded (within 5 seconds), skip reload
    if (cached && !cached.isLoading && (now.getTime() - cached.lastUpdated.getTime()) < 5000) {
      logger.debug('Using cached variants', { companyId, age: now.getTime() - cached.lastUpdated.getTime() });
      return;
    }

    // Set loading state to prevent concurrent loads
    if (cached) {
      cached.isLoading = true;
    } else {
      this.variantsCache.set(companyId, {
        companyId,
        variants: [],
        lastUpdated: new Date(0),
        isLoading: true
      });
    }

    try {
      const rows = await sql.select<ABVariant & { company_id: string }>(
        'SELECT * FROM ab_test_variants WHERE company_id = $1 AND active = true',
        [companyId]
      );

      // Update cache with loaded variants
      this.variantsCache.set(companyId, {
        companyId,
        variants: rows.map(row => {
          const { company_id, ...variant } = row;
          return variant;
        }),
        lastUpdated: now,
        isLoading: false
      });

      this.logVariantLoadSuccess(companyId);
    } catch (error) {
      this.logVariantLoadError(companyId, error);
      
      // Clear loading state on error
      const cached = this.variantsCache.get(companyId);
      if (cached) {
        cached.isLoading = false;
      }
    }
  }

  /**
   * Select a variant for a user using weighted random selection
   */
  selectVariant(userIdHash: string, companyId: string): ABVariant | null {
    // Ensure variants are loaded
    let cached = this.variantsCache.get(companyId);
    if (!cached || cached.isLoading) {
      // Load variants synchronously if not cached
      this.loadVariants(companyId);
      // Retry getting cache after load
      cached = this.variantsCache.get(companyId);
      if (!cached) {
        logger.error('Failed to load variants for selection', { companyId });
        return null;
      }
    }

    if (cached.isLoading) {
      logger.warn('Variants still loading, cannot select', { companyId });
      return null;
    }

    const activeVariants = cached.variants.filter(v => v.active);
    if (activeVariants.length === 0) {
      logger.warn('No active variants available', { companyId });
      return null;
    }

    return this.selectWeightedVariant(activeVariants, userIdHash);
  }

  // Helper methods for cleaner code organization
  private populateVariants(rows: (ABVariant & { company_id: string })[]): void {
    this.variantsCache.clear();
    rows.forEach(row => {
      const { company_id, ...variant } = row;
      this.variantsCache.set(company_id, {
        companyId: company_id,
        variants: [variant],
        lastUpdated: new Date(0),
        isLoading: false
      });
    });
  }

  private selectWeightedVariant(variants: ABVariant[], userIdHash: string): ABVariant | null {
    const hashValue = this.simpleHash(userIdHash);
    const randomValue = hashValue % 100;

    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (randomValue < cumulativeWeight) {
        return variant;
      }
    }

    return variants[0] || null;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private logVariantLoadSuccess(companyId: string): void {
    const cached = this.variantsCache.get(companyId);
    if (cached) {
      logger.info('A/B test variants loaded', {
        companyId,
        variantCount: cached.variants.length,
        variants: cached.variants.map(v => v.id)
      });
    }
  }

  private logVariantLoadError(companyId: string, error: unknown): void {
    logger.error('Failed to load A/B test variants', {
      companyId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  /**
   * Get push notification content for a variant
   */
  getPushContent(variant: ABVariant): { title: string; body: string } {
    return {
      title: variant.pushTitle || this.getDefaultPushTitle(),
      body: variant.pushBody || this.getDefaultPushBody()
    };
  }

  /**
   * Get DM message content for a variant
   */
  getDMContent(variant: ABVariant): string {
    return variant.dmMessage || this.getDefaultDMMessage();
  }

  /**
   * Log variant usage and performance
   */
  async logVariantUsage(
    variantId: string,
    caseId: string,
    channel: 'push' | 'dm',
    companyId: string,
    membershipId: string
  ) {
    try {
      await sql.execute(
        `INSERT INTO ab_test_usage (variant_id, case_id, channel, company_id, membership_id, sent_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [variantId, caseId, channel, companyId, membershipId]
      );

      logger.info('Variant usage logged', {
        variantId,
        caseId,
        channel,
        companyId
      });
    } catch (error) {
      logger.error('Failed to log variant usage', {
        variantId,
        caseId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Log click/conversion events
   */
  async logConversion(variantId: string, caseId: string, eventType: 'click' | 'convert') {
    try {
      await sql.execute(
        `INSERT INTO ab_test_conversions (variant_id, case_id, event_type, occurred_at)
         VALUES ($1, $2, $3, NOW())`,
        [variantId, caseId, eventType]
      );

      // Update performance metrics
      await this.updatePerformanceMetrics(variantId);

      logger.info('Conversion logged', {
        variantId,
        caseId,
        eventType
      });
    } catch (error) {
      logger.error('Failed to log conversion', {
        variantId,
        caseId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get performance metrics for all active variants in a company
   */
  async getPerformanceMetrics(companyId: string): Promise<ABTestResult[]> {
    try {
      const rows = await sql.select<{
        variant_id: string;
        variant_name: string;
        total_sent: string;
        total_conversions: string;
        last_updated: string;
      }>(
        `SELECT
           v.id as variant_id,
           v.name as variant_name,
           COUNT(DISTINCT u.case_id) as total_sent,
           COUNT(DISTINCT CASE WHEN c.event_type IN ('click', 'convert') THEN u.case_id END) as total_conversions,
           MAX(u.sent_at) as last_updated
         FROM ab_test_variants v
         LEFT JOIN ab_test_usage u ON v.id = u.variant_id
         LEFT JOIN ab_test_conversions c ON v.id = c.variant_id
         WHERE v.company_id = $1 AND v.active = true
         GROUP BY v.id, v.name
         ORDER BY total_conversions DESC`,
        [companyId]
      );

      return rows.map(row => ({
        variantId: row.variant_id,
        totalSent: parseInt(row.total_sent) || 0,
        totalDelivered: parseInt(row.total_sent) || 0, // Approximate delivered as sent
        totalClicked: parseInt(row.total_conversions) || 0,
        clickThroughRate: parseInt(row.total_sent) > 0 ?
          (parseInt(row.total_conversions) / parseInt(row.total_sent)) * 100 : 0,
        lastUpdated: new Date(row.last_updated || Date.now())
      }));
    } catch (error) {
      logger.error('Failed to get performance metrics', {
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Admin functions for managing variants
   */
  async createVariant(companyId: string, variant: Partial<ABVariant>): Promise<string> {
    const variantId = `variant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      await sql.execute(
        `INSERT INTO ab_test_variants (
           id, name, description, push_title, push_body, dm_message,
           weight, active, company_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          variantId,
          variant.name || 'Unnamed Variant',
          variant.description || '',
          variant.pushTitle || null,
          variant.pushBody || null,
          variant.dmMessage || null,
          variant.weight || 0,
          variant.active !== false,
          companyId
        ]
      );

      // Invalidate cache for this company
      this.variantsCache.delete(companyId);

      logger.info('A/B test variant created', { variantId, companyId });
      return variantId;
    } catch (error) {
      logger.error('Failed to create variant', {
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async updateVariantWeights(companyId: string, variantWeights: Record<string, number>) {
    try {
      for (const [variantId, weight] of Object.entries(variantWeights)) {
        await sql.execute(
          'UPDATE ab_test_variants SET weight = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3',
          [weight, variantId, companyId]
        );
      }

      // Invalidate cache for this company
      this.variantsCache.delete(companyId);

      logger.info('Variant weights updated', { companyId, variantWeights });
    } catch (error) {
      logger.error('Failed to update variant weights', {
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // Pure helper methods for default content
  private getDefaultPushTitle(): string {
    return "Payment Issue Detected";
  }

  private getDefaultPushBody(): string {
    return "We noticed an issue with your recent payment. Click here to resolve and avoid service interruption.";
  }

  private getDefaultDMMessage(): string {
    return `Hi! We noticed an issue with your recent payment. Please check your billing details here: [Manage Subscription Link]

Your subscription will be automatically canceled if the issue persists. We're here to help!`;
  }

  private async updatePerformanceMetrics(variantId: string): Promise<void> {
    // Performance metrics are calculated on-demand in getPerformanceMetrics
    // This is a placeholder for future optimization
    logger.debug('Performance metrics update requested', { variantId });
  }
}

// Singleton instance
export const abTesting = new ABTestingService();