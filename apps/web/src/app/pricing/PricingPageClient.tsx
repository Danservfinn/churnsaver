'use client';

import { useState } from 'react';
import { Zap, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PricingCard } from '@/components/pricing/PricingCard';
import { BillingInterval, TierName } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import type { CheckoutUrls } from '@/lib/whop-checkout';

interface PricingPageClientProps {
  checkoutUrls: CheckoutUrls;
}

const faqs = [
  {
    question: 'What counts as a recovery?',
    answer:
      'A recovery is counted when we successfully help you recover a failed payment within the attribution window (14 days by default). You only pay for successful outcomes.',
  },
  {
    question: 'Can I change plans anytime?',
    answer:
      'Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately for upgrades, or at the end of your billing cycle for downgrades. No lock-in contracts.',
  },
  {
    question: 'What happens if I hit my recovery limit?',
    answer:
      'On Free and Pro plans, additional recoveries beyond your limit will be queued until your next billing period. Upgrade to Max for unlimited recoveries and never miss a recovery opportunity.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      "We offer a 14-day money-back guarantee on all paid plans. If you're not satisfied with ChurnSaver, contact support for a full refund—no questions asked.",
  },
  {
    question: 'How does the Whop integration work?',
    answer:
      'ChurnSaver integrates directly with Whop to monitor your subscription payments. When a payment fails, we automatically trigger your configured recovery flow. Setup takes less than 5 minutes.',
  },
];

export function PricingPageClient({ checkoutUrls }: PricingPageClientProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly');

  const tiers: TierName[] = ['free', 'pro', 'max'];

  const getCheckoutUrl = (tier: TierName): string | null => {
    if (tier === 'free') return null;
    const key = `${tier}_${interval}` as keyof CheckoutUrls;
    return checkoutUrls[key];
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-hero-gradient pointer-events-none" />
      <div className="fixed inset-0 bg-dot-pattern pointer-events-none opacity-50" />

      <main className="relative container mx-auto max-w-6xl px-4 py-20">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-primary/20 mb-6 animate-scale-in">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground/90">
              Simple, Transparent Pricing
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 animate-slide-up">
            Choose Your
            <span className="text-gradient"> Recovery Plan</span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
            Start recovering failed payments today. Upgrade or downgrade anytime.
            No lock-in contracts, cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl glass animate-slide-up"
            style={{ animationDelay: '200ms' }}
          >
            <button
              onClick={() => setInterval('monthly')}
              className={cn(
                'px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                interval === 'monthly'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('annual')}
              className={cn(
                'px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2',
                interval === 'annual'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Annual
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs',
                  interval === 'annual'
                    ? 'bg-white/20 text-white border-white/30'
                    : 'bg-success/10 text-success border-success/20'
                )}
              >
                Save 20%
              </Badge>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div
          className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-24 animate-slide-up"
          style={{ animationDelay: '300ms' }}
        >
          {tiers.map((tier, index) => (
            <div
              key={tier}
              className="animate-slide-up"
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              <PricingCard
                tier={tier}
                interval={interval}
                checkoutUrl={getCheckoutUrl(tier)}
                isPopular={tier === 'pro'}
              />
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted mb-4">
              <HelpCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">FAQ</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Frequently Asked
              <span className="text-gradient"> Questions</span>
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about ChurnSaver pricing
            </p>
          </div>

          <Accordion type="single" collapsible defaultValue="item-0" className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="card-premium rounded-xl px-6 border-none"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* CTA */}
        <div className="mt-20 text-center">
          <div className="card-premium rounded-2xl p-10 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold mb-3">
              Still have questions?
            </h3>
            <p className="text-muted-foreground mb-6">
              We&apos;re here to help. Reach out and we&apos;ll get back to you within 24 hours.
            </p>
            <Button size="lg" asChild className="gap-2">
              <a href="mailto:support@churnsaver.com">
                Contact Support
              </a>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
