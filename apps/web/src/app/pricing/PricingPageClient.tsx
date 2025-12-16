'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PricingCard } from '@/components/pricing/PricingCard';
import { BillingInterval, TierName } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import type { CheckoutUrls } from '@/lib/whop-checkout';

interface PricingPageClientProps {
  checkoutUrls: CheckoutUrls;
}

export function PricingPageClient({ checkoutUrls }: PricingPageClientProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const tiers: TierName[] = ['free', 'pro', 'max'];

  const getCheckoutUrl = (tier: TierName): string | null => {
    if (tier === 'free') return null;
    const key = `${tier}_${interval}` as keyof CheckoutUrls;
    return checkoutUrls[key];
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-6xl px-4 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4 gap-1">
            <Zap className="h-3 w-3" />
            Simple Pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start recovering failed payments today. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <button
            onClick={() => setInterval('monthly')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              interval === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('annual')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
              interval === 'annual'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Annual
            <Badge variant="secondary" className="text-xs">
              Save 20%
            </Badge>
          </button>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {tiers.map((tier) => (
            <PricingCard
              key={tier}
              tier={tier}
              interval={interval}
              checkoutUrl={getCheckoutUrl(tier)}
              isPopular={tier === 'pro'}
            />
          ))}
        </div>

        {/* FAQ / Additional Info */}
        <div className="mt-16 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Frequently Asked Questions
          </h2>
          <div className="max-w-2xl mx-auto space-y-6 text-left">
            <div>
              <h3 className="font-semibold mb-2">What counts as a recovery?</h3>
              <p className="text-muted-foreground text-sm">
                A recovery is counted when we successfully help you recover a failed payment
                within the attribution window (14 days by default).
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Can I change plans anytime?</h3>
              <p className="text-muted-foreground text-sm">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect
                immediately for upgrades, or at the end of your billing cycle for downgrades.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">What happens if I hit my recovery limit?</h3>
              <p className="text-muted-foreground text-sm">
                On Free and Pro plans, additional recoveries beyond your limit will be skipped
                until your next billing period. Upgrade to Max for unlimited recoveries.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Do you offer refunds?</h3>
              <p className="text-muted-foreground text-sm">
                We offer a 14-day money-back guarantee on all paid plans. If you&apos;re not satisfied,
                contact support for a full refund.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">
            Questions? We&apos;re here to help.
          </p>
          <Button variant="outline" asChild>
            <a href="mailto:support@churnsaver.com">
              Contact Support
            </a>
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-16">
        <div className="container mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} ChurnSaver. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
